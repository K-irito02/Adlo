import { useAppStore } from '@stores/slicedStore';
import type { TerminalProfile } from '@stores/types';
import { terminalOutputStore } from './terminalOutputStore';
import { normalizeReportedCwd, scanOsc99 } from './terminalCwdOsc';
import { terminalCwdStore } from './terminalCwdStore';
import { terminalXtermPool, readTerminalFontFamily, TERMINAL_FONT_SIZE } from './terminalXtermPool';
import {
  terminalHistoryStore,
  chunkKey,
  staleChunkRange,
  type TerminalHistoryChunkMeta,
  type TerminalHistorySegment,
} from './terminalHistoryStore';
import { TerminalHistoryCollector, TERMINAL_CAPTURE_THROTTLE_MS } from './terminalHistoryCollector';
import {
  selectSegmentsToEvict,
  effectiveBudgetBytes,
  diskAvailableBytesFrom,
  TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES,
  TERMINAL_HISTORY_BUDGET_FOLLOW_DISK,
} from './terminalHistoryBudget';
import type { ExtractLine } from './historyModel';
import { isTauriShell } from '@shared/env';
import { flushCrossSliceWrites } from '@stores/storageHelpers';

/** 关闭时等待历史落盘的总超时：IPC 挂起也不能卡死窗口关闭 */
const CLOSE_FLUSH_TIMEOUT_MS = 5000;

const SHELL_MAP: Record<TerminalProfile, string> = {
  powershell: 'powershell',
  bash: 'bash',
  cmd: 'cmd',
};

/** 空历史数组的稳定引用：无标签/无历史时避免每次渲染返回新数组 */
const EMPTY_HISTORY: TerminalHistorySegment[] = [];

/**
 * 按标签归属（`location`）在**所属宿主**容器内查找实时终端画布。
 *
 * 面板与中心终端并存时页面里有两个 `.adl-terminal-canvas`；全局
 * `document.querySelector` 会命中 DOM 顺序靠前者，导致 attachSession 量错容器、
 * 初始 cols/rows 偏差。限定宿主后查即可消除歧义。
 */
export function findTerminalCanvasForHost(
  location: 'panel' | 'center' | undefined,
): Element | null {
  const hostSelector =
    location === 'center'
      ? '.adl-center-terminal'
      : '.adl-tool-panel--terminal:not(.adl-center-terminal)';
  return document.querySelector(hostSelector)?.querySelector('.adl-terminal-canvas') ?? null;
}

/**
 * 节流执行器：**替代原来的尾去抖**。
 *
 * 为什么必须换：尾去抖在持续输出时每来一个事件就重置定时器，定时器永不触发，
 * 只能靠 30 秒周期兜底 —— 那 30 秒里的输出可能已超出 xterm scrollback 环而从源头丢失。
 * 节流保证「输出期间最多每 intervalMs 采一次」，把积压行数压到远小于环容量。
 */
export function createThrottledRunner(run: () => void, intervalMs: number): () => void {
  let lastRanAt = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    const now = Date.now();
    const elapsed = now - lastRanAt;
    if (elapsed >= intervalMs) {
      lastRanAt = now;
      run();
      return;
    }
    if (timer) {
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      lastRanAt = Date.now();
      run();
    }, intervalMs - elapsed);
  };
}

/**
 * 批量关闭时选出应清理的标签：限定工作区（可选）且**跳过中心标签**。
 * 中心标签的 PTY / xterm 池 / 历史由中心宿主自行管理，不受面板批量关闭影响。
 */
export function selectTerminalTabsToClose<
  T extends { workspaceId?: string; location?: 'panel' | 'center' },
>(tabs: T[], workspaceId?: string): T[] {
  const scoped =
    workspaceId !== undefined ? tabs.filter((tab) => tab.workspaceId === workspaceId) : tabs;
  return scoped.filter((tab) => tab.location !== 'center');
}

interface ActiveTerminalTab {
  id: string;
  sessionId?: string;
}

/**
 * 终端 PTY「运行时」——**应用级单例**。
 *
 * 为什么必须是单例：输出订阅、历史采集、30s 检查点、beforeunload、Tauri
 * onCloseRequested 都是与「哪个视图正在渲染」无关的全局工作。右面板与中心会各挂载
 * 一次 `useTerminalPtyLifecycle`；若这些全局工作按实例各做一遍，就会输出双写、
 * 历史重复采集、关闭路径重复 flush/close。因此把所有跨实例共享状态与全局副作用
 * 收敛到本单例，实例只负责「渲染 xterm + 转发输入 + 触发激活」。
 *
 * 所有共享状态（live/created session、collectors、throttle、pendingInput、
 * activating、ptyDims、tabCwds、oscCarry、historyIndex）都由本类拥有；全局回调
 * 只读写这里的字段，第二个实例不再持有空 refs。
 */
export class TerminalPtyRuntime {
  /** sessionId → 只读历史采集器 */
  private collectors = new Map<string, TerminalHistoryCollector>();
  /** sessionId → 输出节流触发线 */
  private throttled = new Map<string, () => void>();
  /** 本次运行中新建的会话（用于区分「重启恢复的标签」与「新建标签」） */
  private createdSessionIds = new Set<string>();
  /** 当前仍然存活的 PTY 会话（应用重启后恢复的标签不在其中 → 需要重建） */
  private liveSessionIds = new Set<string>();
  /** tabId → 重建期间缓冲的用户输入（PTY 就绪后补发） */
  private pendingInput = new Map<string, string>();
  /** tabId → 进行中的激活 promise（并发激活汇流成一次） */
  private activating = new Map<string, Promise<void>>();
  /** sessionId → 已上报 PTY 的尺寸（同尺寸 resize 去重） */
  private ptyDims = new Map<string, { cols: number; rows: number }>();
  /** tabId → 上次所在目录（OSC 9;9 上报，按标签持久化） */
  private tabCwds = new Map<string, string>();
  private tabCwdsLoaded = false;
  /** sessionId → OSC 9;9 跨块尾部片段 */
  private oscCarry = new Map<string, string>();
  /** tabId → 历史分段索引（旧 → 新） */
  private historyIndex = new Map<string, TerminalHistorySegment[]>();
  private historyIndexLoaded = false;

  // 索引是 Map（便于在回调里同步读写）；用版本号 + 监听器驱动两个实例重渲染。
  private historyVersion = 0;
  private historyListeners = new Set<() => void>();

  // 全局副作用只启动一次
  private started = false;
  private unsubPtyOutput: (() => void) | null = null;
  private checkpointTimer: ReturnType<typeof setInterval> | null = null;
  private beforeUnloadHandler: (() => void) | null = null;
  private tauriCleanup: (() => void) | null = null;

  // ---------------------------------------------------------------- history 订阅

  subscribeHistory = (listener: () => void): (() => void) => {
    this.historyListeners.add(listener);
    return () => {
      this.historyListeners.delete(listener);
    };
  };

  getHistoryVersion = (): number => this.historyVersion;

  private bumpHistory = (): void => {
    this.historyVersion += 1;
    for (const listener of this.historyListeners) {
      listener();
    }
  };

  /** 当前活动标签的「只读历史段」列表（旧 → 新，已过滤正在进行的 live 段） */
  historySegmentsFor = (tabId: string | undefined): TerminalHistorySegment[] => {
    if (!tabId) {
      return EMPTY_HISTORY;
    }
    this.ensureHistoryIndexLoaded();
    // 已过滤正在进行的段：只读历史区绝不能把「实时终端当前内容」再渲染一遍。
    const all = this.historyIndex.get(tabId) ?? EMPTY_HISTORY;
    return all.filter((s) => !s.live);
  };

  isCreatedSession = (sessionId: string): boolean => this.createdSessionIds.has(sessionId);

  hasLiveSession = (sessionId: string): boolean => this.liveSessionIds.has(sessionId);

  // ---------------------------------------------------------------- 全局副作用启动

  ensureStarted = (): void => {
    if (this.started) {
      return;
    }
    this.started = true;
    this.startOutputSubscription();
    this.startCheckpoint();
    this.startBeforeUnload();
    this.startTauriClose();
    // 启动定稿：残留的 live 段其 PTY 必然已随进程退出而死 → 定稿；空段直接剪枝。
    this.finalizeStaleSegments();
  };

  private startOutputSubscription = (): void => {
    if (this.unsubPtyOutput || !window.digitalLife?.subscribePtyOutput) {
      return;
    }
    const unsub = window.digitalLife.subscribePtyOutput((event) => {
      if (event.terminated) {
        this.liveSessionIds.delete(event.sessionId);
        this.ptyDims.delete(event.sessionId);
        const tabs = useAppStore.getState().terminalTabs;
        const tab = tabs.find((t) => t.sessionId === event.sessionId);
        if (tab) {
          useAppStore.getState().terminalUpdateTab(tab.id, { status: 'terminated' });
        }
        // 会话结束即定稿（flush 封块 + live=false）：历史无需等到应用重启才可见。
        void this.finalizeSegment(event.sessionId);
        return;
      }

      // OSC 9;9: 按标签记住 shell 上报的当前目录
      const oscScan = scanOsc99((this.oscCarry.get(event.sessionId) ?? '') + event.data);
      if (oscScan.carry) {
        this.oscCarry.set(event.sessionId, oscScan.carry);
      } else {
        this.oscCarry.delete(event.sessionId);
      }
      if (oscScan.cwds.length > 0) {
        const ownerTab = useAppStore
          .getState()
          .terminalTabs.find((t) => t.sessionId === event.sessionId);
        if (ownerTab) {
          const latestCwd = oscScan.cwds[oscScan.cwds.length - 1];
          const normalized = normalizeReportedCwd(latestCwd, { msys: ownerTab.profile === 'bash' });
          if (normalized && this.tabCwds.get(ownerTab.id) !== normalized) {
            this.tabCwds.set(ownerTab.id, normalized);
            this.persistTabCwds();
          }
        }
      }

      // 原样写入 pool 中该会话的 xterm（所有会话，不仅限活动标签）。
      // 单例保证这里对每个输出事件只写一次。
      const pooled = terminalXtermPool.get(event.sessionId);
      if (pooled) {
        pooled.terminal.write(event.data);
      }

      // 节流采集：输出期间最多每 TERMINAL_CAPTURE_THROTTLE_MS 采一次。
      this.collectThrottled(event.sessionId);
    });
    this.unsubPtyOutput = unsub;
  };

  private startCheckpoint = (): void => {
    if (this.checkpointTimer) {
      return;
    }
    this.checkpointTimer = setInterval(() => {
      const sessionIds = new Set(
        useAppStore
          .getState()
          .terminalTabs.map((tab) => tab.sessionId)
          .filter((id): id is string => Boolean(id)),
      );
      for (const sessionId of sessionIds) {
        if (!this.liveSessionIds.has(sessionId)) {
          continue;
        }
        void this.persistCheckpoint(sessionId);
      }
    }, 30_000);
  };

  private startBeforeUnload = (): void => {
    if (this.beforeUnloadHandler) {
      return;
    }
    this.beforeUnloadHandler = () => {
      // 同关闭路径：两处都跳过预算结算（结算先删块再写索引，被进程退出截断会留下
      // 指向已删块的索引），淘汰交给下次启动的 finalizeStaleSegments。
      this.collectors.forEach((collector, sessionId) => {
        this.upsertHistoryEntry(sessionId, collector.getWrittenChunks(), { skipBudget: true });
        void this.finalizeSegment(sessionId, { skipBudget: true });
      });
      // 同步落盘去抖中的 localStorage 写入（标签、历史索引等），否则重启后丢失。
      flushCrossSliceWrites();
    };
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  };

  private startTauriClose = (): void => {
    if (!isTauriShell()) {
      return;
    }
    let active = true;
    let unlisten: (() => void) | undefined;
    // 关闭处理只能跑一次：短时间内重复关闭请求会并发触发两轮「hide → flush → destroy」。
    let closing = false;
    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => {
        if (!active) {
          return;
        }
        void getCurrentWindow()
          .onCloseRequested(async (event) => {
            event.preventDefault();
            if (closing) {
              return;
            }
            closing = true;
            const win = getCurrentWindow();
            try {
              await win.hide();
            } catch (err) {
              console.error('terminal history close hide failed', { error: String(err) });
            }
            try {
              let timedOut = false;
              await Promise.race([
                this.flushAllHistories(),
                new Promise((resolve) => {
                  setTimeout(() => {
                    timedOut = true;
                    resolve(undefined);
                  }, CLOSE_FLUSH_TIMEOUT_MS);
                }),
              ]);
              if (timedOut) {
                console.error('terminal history close flush timed out', {
                  timeoutMs: CLOSE_FLUSH_TIMEOUT_MS,
                });
              }
            } finally {
              flushCrossSliceWrites();
              try {
                await win.destroy();
              } catch (err) {
                console.error('terminal history close destroy failed', { error: String(err) });
                closing = false;
                try {
                  await win.show();
                } catch (showErr) {
                  console.error('terminal history close restore failed', {
                    error: String(showErr),
                  });
                }
              }
            }
          })
          .then((ul) => {
            if (active) {
              unlisten = ul;
            } else {
              ul();
            }
          });
      })
      .catch(() => {});
    this.tauriCleanup = () => {
      active = false;
      unlisten?.();
    };
  };

  /** 停止全局副作用并清空共享状态（仅供测试隔离使用） */
  reset = (): void => {
    this.unsubPtyOutput?.();
    this.unsubPtyOutput = null;
    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer);
      this.checkpointTimer = null;
    }
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }
    this.tauriCleanup?.();
    this.tauriCleanup = null;
    this.started = false;
    this.collectors.clear();
    this.throttled.clear();
    this.createdSessionIds.clear();
    this.liveSessionIds.clear();
    this.pendingInput.clear();
    this.activating.clear();
    this.ptyDims.clear();
    this.tabCwds.clear();
    this.tabCwdsLoaded = false;
    this.oscCarry.clear();
    this.historyIndex.clear();
    this.historyIndexLoaded = false;
    this.historyVersion = 0;
    this.historyListeners.clear();
  };

  // ---------------------------------------------------------------- 历史索引

  private ensureHistoryIndexLoaded = (): void => {
    if (this.historyIndexLoaded) {
      return;
    }
    this.historyIndexLoaded = true;
    for (const [tabId, segments] of Object.entries(terminalHistoryStore.loadAll())) {
      this.historyIndex.set(tabId, segments);
    }
  };

  private persistHistoryIndex = (): void => {
    const snapshot: Record<string, TerminalHistorySegment[]> = {};
    this.historyIndex.forEach((segments, tabId) => {
      snapshot[tabId] = segments;
    });
    terminalHistoryStore.saveAll(snapshot);
    this.bumpHistory();
  };

  private collectorFor = (sessionId: string): TerminalHistoryCollector => {
    let collector = this.collectors.get(sessionId);
    if (!collector) {
      collector = new TerminalHistoryCollector({
        readBuffer: () => {
          const entry = terminalXtermPool.get(sessionId);
          const buffer = entry?.terminal.buffer;
          return {
            length: buffer?.active.length ?? 0,
            baseY: buffer?.active.baseY ?? 0,
            activeType: buffer?.active.type === 'alternate' ? 'alternate' : 'normal',
            getLine: (y) => buffer?.active.getLine(y) as unknown as ExtractLine | undefined,
          };
        },
        cols: () => terminalXtermPool.get(sessionId)?.terminal.cols ?? 80,
        write: (key, payload) => terminalOutputStore.save(key, payload),
      });
      collector.setSessionId(sessionId);
      this.collectors.set(sessionId, collector);
    }
    return collector;
  };

  private deleteChunksForSession = async (
    sessionId: string,
    start: number,
    count: number,
  ): Promise<void> => {
    const DELETE_BATCH = 4;
    for (let offset = 0; offset < count; offset += DELETE_BATCH) {
      const batch = Math.min(DELETE_BATCH, count - offset);
      await Promise.all(
        Array.from({ length: batch }, (_unused, index) =>
          terminalOutputStore.delete(chunkKey(sessionId, start + offset + index)),
        ),
      );
    }
  };

  private evictStaleChunksForRebuild = async (
    sessionId: string,
    nextCount: number,
  ): Promise<void> => {
    const tabId = useAppStore.getState().terminalTabs.find((t) => t.sessionId === sessionId)?.id;
    if (!tabId) {
      return;
    }
    const segment = (this.historyIndex.get(tabId) ?? []).find((s) => s.sessionId === sessionId);
    if (!segment) {
      return;
    }
    const { start, count } = staleChunkRange(segment.chunks.length, nextCount);
    if (count > 0) {
      await this.deleteChunksForSession(sessionId, start, count);
    }
  };

  deleteHistoryForTab = async (tabId: string): Promise<void> => {
    // 先确保索引已加载：否则「启动后立刻关闭上次遗留标签」时 Map 还是空的。
    this.ensureHistoryIndexLoaded();
    const segments = this.historyIndex.get(tabId) ?? [];
    for (const segment of segments) {
      await this.deleteChunksForSession(segment.sessionId, 0, segment.chunks.length);
      this.collectors.delete(segment.sessionId);
      this.throttled.delete(segment.sessionId);
    }
    this.historyIndex.delete(tabId);
    this.persistHistoryIndex();
  };

  private deleteSegmentRecords = async (segment: TerminalHistorySegment): Promise<void> => {
    await this.deleteChunksForSession(segment.sessionId, 0, segment.chunks.length);
    this.collectors.delete(segment.sessionId);
    this.throttled.delete(segment.sessionId);
  };

  private settleHistoryBudget = async (): Promise<void> => {
    const all: { tabId: string; seg: TerminalHistorySegment }[] = [];
    this.historyIndex.forEach((segments, tabId) => {
      segments.forEach((seg) => all.push({ tabId, seg }));
    });

    const settingBytes =
      useAppStore.getState().appInfo?.config?.terminalHistoryBudgetBytes ??
      TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES;

    let diskAvailableBytes: number | null = null;
    if (settingBytes === TERMINAL_HISTORY_BUDGET_FOLLOW_DISK) {
      try {
        const result = await window.digitalLife.systemMonitor.snapshot();
        if (result.ok) {
          diskAvailableBytes = diskAvailableBytesFrom(result.data?.disks);
        }
      } catch {
        diskAvailableBytes = null;
      }
    }

    const budget = effectiveBudgetBytes(settingBytes, diskAvailableBytes);
    const doomed = selectSegmentsToEvict(all, budget);
    if (doomed.length === 0) {
      return;
    }
    const doomedByTab = new Map<string, Set<string>>();
    for (const { tabId, sessionId } of doomed) {
      const set = doomedByTab.get(tabId) ?? new Set<string>();
      set.add(sessionId);
      doomedByTab.set(tabId, set);
      const segment = all.find((e) => e.tabId === tabId && e.seg.sessionId === sessionId)?.seg;
      if (segment) {
        await this.deleteSegmentRecords(segment);
      }
    }
    for (const [tabId, sessionIds] of doomedByTab) {
      const segments = this.historyIndex.get(tabId) ?? [];
      const kept = segments.filter((s) => !sessionIds.has(s.sessionId));
      if (kept.length > 0) {
        this.historyIndex.set(tabId, kept);
      } else {
        this.historyIndex.delete(tabId);
      }
    }
    this.persistHistoryIndex();
  };

  private upsertHistoryEntry = (
    sessionId: string,
    written: TerminalHistoryChunkMeta[],
    options?: { ownerTabId?: string; skipBudget?: boolean },
  ): void => {
    if (written.length === 0) {
      return;
    }
    this.ensureHistoryIndexLoaded();
    const tabId =
      options?.ownerTabId ??
      useAppStore.getState().terminalTabs.find((t) => t.sessionId === sessionId)?.id;
    if (!tabId) {
      return;
    }
    const segments = this.historyIndex.get(tabId) ?? [];
    const at = segments.findIndex((s) => s.sessionId === sessionId);
    const existing = segments[at];
    const next: TerminalHistorySegment = {
      sessionId,
      endedAt: existing?.live === false ? existing.endedAt : Date.now(),
      live: existing?.live === false ? false : true,
      chunks: written,
    };
    if (at >= 0) {
      segments[at] = next;
    } else {
      segments.push(next);
    }
    this.historyIndex.set(tabId, segments);
    this.persistHistoryIndex();
    if (!options?.skipBudget) {
      void this.settleHistoryBudget();
    }
  };

  private persistCollectedTail = async (
    sessionId: string,
    collector: TerminalHistoryCollector,
    before: number,
  ): Promise<void> => {
    const written = collector.getWrittenChunks();
    const rebuilt = collector.consumeRebuild();
    if (written.length === before && !rebuilt) {
      return;
    }
    if (rebuilt) {
      await this.evictStaleChunksForRebuild(sessionId, written.length);
    }
    this.upsertHistoryEntry(sessionId, written);
  };

  private persistCollectedChunks = async (sessionId: string): Promise<void> => {
    const collector = this.collectorFor(sessionId);
    const before = collector.getWrittenChunks().length;
    const ok = await collector.collect();
    if (!ok) {
      return;
    }
    await this.persistCollectedTail(sessionId, collector, before);
  };

  private persistCheckpoint = async (sessionId: string): Promise<void> => {
    const collector = this.collectorFor(sessionId);
    const before = collector.getWrittenChunks().length;
    const ok = await collector.checkpoint();
    if (!ok) {
      return;
    }
    await this.persistCollectedTail(sessionId, collector, before);
  };

  private collectThrottled = (sessionId: string): void => {
    let trigger = this.throttled.get(sessionId);
    if (!trigger) {
      trigger = createThrottledRunner(
        () => void this.persistCollectedChunks(sessionId),
        TERMINAL_CAPTURE_THROTTLE_MS,
      );
      this.throttled.set(sessionId, trigger);
    }
    trigger();
  };

  private finalizeSegment = async (
    sessionId: string,
    options?: { skipBudget?: boolean },
  ): Promise<void> => {
    this.ensureHistoryIndexLoaded();
    let ownerTabId: string | null = null;
    for (const [tabId, segments] of this.historyIndex) {
      if (segments.some((s) => s.sessionId === sessionId)) {
        ownerTabId = tabId;
        break;
      }
    }
    ownerTabId ??=
      useAppStore.getState().terminalTabs.find((t) => t.sessionId === sessionId)?.id ?? null;
    if (!ownerTabId) {
      this.collectors.delete(sessionId);
      this.throttled.delete(sessionId);
      return;
    }
    const previousSegments = this.historyIndex.get(ownerTabId) ?? [];
    const previousSegment = previousSegments.find((s) => s.sessionId === sessionId);
    const segmentExistedBefore = previousSegment !== undefined;
    const collector = this.collectorFor(sessionId);
    const flushed = await collector.flush();
    const written = collector.getWrittenChunks();
    const segments = this.historyIndex.get(ownerTabId) ?? [];
    const at = segments.findIndex((s) => s.sessionId === sessionId);
    const tabStillExists = useAppStore.getState().terminalTabs.some((t) => t.id === ownerTabId);
    if (!tabStillExists || (segmentExistedBefore && at < 0)) {
      await this.deleteChunksForSession(
        sessionId,
        0,
        Math.max(previousSegment?.chunks.length ?? 0, written.length),
      );
      this.collectors.delete(sessionId);
      this.throttled.delete(sessionId);
      return;
    }
    if (!flushed) {
      if (at >= 0 && segments[at].live) {
        const retry = segments.slice();
        retry[at] = {
          ...retry[at],
          endedAt: Date.now(),
          chunks: written.length > 0 ? written : segments[at].chunks,
        };
        this.historyIndex.set(ownerTabId, retry);
        this.persistHistoryIndex();
      } else if (at < 0) {
        this.upsertHistoryEntry(sessionId, written, {
          ownerTabId,
          skipBudget: options?.skipBudget,
        });
      }
      return;
    }
    if (written.length === 0) {
      if (at >= 0) {
        await this.deleteChunksForSession(sessionId, 0, segments[at].chunks.length);
        const latest = this.historyIndex.get(ownerTabId) ?? [];
        const latestAt = latest.findIndex((s) => s.sessionId === sessionId);
        if (latestAt >= 0) {
          const next = latest.filter((_, i) => i !== latestAt);
          if (next.length > 0) {
            this.historyIndex.set(ownerTabId, next);
          } else {
            this.historyIndex.delete(ownerTabId);
          }
          this.persistHistoryIndex();
        }
      }
      return;
    }
    const existingSegment = segments[at];
    const next: TerminalHistorySegment = {
      sessionId,
      endedAt:
        existingSegment?.live === false
          ? existingSegment.endedAt
          : Math.max(existingSegment?.endedAt ?? 0, Date.now()),
      live: false,
      chunks: written,
    };
    const updated = segments.slice();
    if (at >= 0) {
      updated[at] = next;
    } else {
      updated.push(next);
    }
    this.historyIndex.set(ownerTabId, updated);
    this.persistHistoryIndex();
    if (!options?.skipBudget) {
      void this.settleHistoryBudget();
    }
  };

  private finalizeStaleSegments = (): void => {
    this.ensureHistoryIndexLoaded();
    let changed = false;
    for (const [tabId, segments] of this.historyIndex) {
      const next = segments
        .filter((s) => s.chunks.length > 0)
        .map((s) => (s.live ? { ...s, live: false } : s));
      if (next.length !== segments.length || next.some((s, i) => s !== segments[i])) {
        if (next.length > 0) {
          this.historyIndex.set(tabId, next);
        } else {
          this.historyIndex.delete(tabId);
        }
        changed = true;
      }
    }
    if (changed) {
      this.persistHistoryIndex();
    }
    void this.settleHistoryBudget();
  };

  // ---------------------------------------------------------------- 目录

  private ensureTabCwdsLoaded = (): void => {
    if (this.tabCwdsLoaded) {
      return;
    }
    this.tabCwdsLoaded = true;
    const stored = terminalCwdStore.loadAll();
    for (const [tabId, cwd] of Object.entries(stored)) {
      this.tabCwds.set(tabId, cwd);
    }
  };

  private persistTabCwds = (): void => {
    const snapshot: Record<string, string> = {};
    this.tabCwds.forEach((cwd, tabId) => {
      snapshot[tabId] = cwd;
    });
    terminalCwdStore.saveAll(snapshot);
  };

  // ---------------------------------------------------------------- PTY 会话

  private applySessionSize = (sessionId: string, cols: number, rows: number): void => {
    if (cols <= 0 || rows <= 0) {
      return;
    }
    const effective = this.ptyDims.get(sessionId);
    if (effective && effective.cols === cols && effective.rows === rows) {
      return;
    }
    this.ptyDims.set(sessionId, { cols, rows });
    window.digitalLife.pty.resize(sessionId, cols, rows);
  };

  private attachSession = async (
    tabId: string,
    profile: TerminalProfile,
    workspaceId: string,
    options?: { cwdOverride?: string },
  ): Promise<void> => {
    const cwdOverride = options?.cwdOverride;
    const recentWorkspaces = useAppStore.getState().recentWorkspaces;
    const workspace = workspaceId ? recentWorkspaces.find((w) => w.id === workspaceId) : undefined;
    this.ensureTabCwdsLoaded();
    const cwd = cwdOverride ?? (workspaceId ? (workspace?.path ?? undefined) : undefined);

    // 双保险：activateTab 已用 activating Map 汇流并发激活，这里再拦一次
    // 「该标签已有存活 PTY」的调用（attachSession 也可能被 handleCreateTab 等路径直接调用）。
    const existingTab = useAppStore.getState().terminalTabs.find((t) => t.id === tabId);
    if (!existingTab) {
      return;
    }
    if (existingTab.sessionId && this.liveSessionIds.has(existingTab.sessionId)) {
      return;
    }

    try {
      // 等待容器出现且完成布局：React batching 可能导致 XtermTerminal 尚未 mount
      // （querySelector 返回 null），或已挂载但尚未布局（零尺寸，量出的列数极小）。
      // 帧数 + 墙钟双上限：面板隐藏/窗口最小化时 rAF 会被节流甚至暂停。
      const deadline = performance.now() + 1000;
      // 面板与中心终端并存时页面里有两个 `.adl-terminal-canvas`，全局 querySelector
      // 会量错宿主容器导致初始 cols/rows 偏差。按标签归属（location）限定到所属宿主后再查。
      let container: HTMLElement | null = null;
      for (let frame = 0; frame < 60; frame++) {
        const candidate = findTerminalCanvasForHost(existingTab.location);
        if (
          candidate instanceof HTMLElement &&
          candidate.clientWidth > 0 &&
          candidate.clientHeight > 0
        ) {
          container = candidate;
          break;
        }
        if (performance.now() >= deadline) {
          break;
        }
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 100);
          requestAnimationFrame(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }

      let cols = 80;
      let rows = 24;
      if (container) {
        // 直接测量容器尺寸，不创建临时 pool entry（临时 entry 会导致 DOM 中有两个
        // 重叠的 hostEl，干扰布局）。
        const tempDiv = document.createElement('div');
        tempDiv.style.cssText =
          'position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;visibility:hidden;';
        container.appendChild(tempDiv);

        const { Terminal } = await import('@xterm/xterm');
        const { FitAddon } = await import('@xterm/addon-fit');
        const tempTerminal = new Terminal({
          fontSize: TERMINAL_FONT_SIZE,
          fontFamily: readTerminalFontFamily(),
          rows: 24,
          cols: 80,
        });
        const tempFit = new FitAddon();
        tempTerminal.loadAddon(tempFit);
        tempTerminal.open(tempDiv);
        tempFit.fit();
        const dims = tempFit.proposeDimensions();
        if (dims && dims.cols > 0 && dims.rows > 0) {
          cols = dims.cols;
          rows = dims.rows;
        }
        tempTerminal.dispose();
        tempDiv.remove();
      }

      const result = await window.digitalLife.pty.create({
        shell: SHELL_MAP[profile],
        cwd,
        cols,
        rows,
      });
      if (!result.ok) {
        const errorMsg = result.error?.message || 'Unknown error';
        console.error('Terminal creation failed:', errorMsg);
        useAppStore.getState().terminalUpdateTab(tabId, { status: 'terminated' });
        return;
      }

      const sessionId = result.data.sessionId;
      // PTY 创建期间标签可能已被关闭：此时这个 PTY 已成孤儿，立即回收。
      if (!useAppStore.getState().terminalTabs.some((t) => t.id === tabId)) {
        void window.digitalLife.pty.kill(sessionId);
        return;
      }
      this.createdSessionIds.add(sessionId);
      this.liveSessionIds.add(sessionId);
      this.ptyDims.set(sessionId, { cols, rows });
      // 出生尺寸同步给池：XtermTerminal 挂载时 acquire 消费。
      terminalXtermPool.setBirthDims(sessionId, cols, rows);
      useAppStore.getState().terminalUpdateTab(tabId, { sessionId, status: 'running' });
    } catch (err) {
      console.error('Terminal creation error:', err);
      useAppStore.getState().terminalUpdateTab(tabId, { status: 'terminated' });
    }
  };

  activateTab = (tabId: string): Promise<void> => {
    const inFlight = this.activating.get(tabId);
    if (inFlight) {
      return inFlight;
    }

    const run = (async () => {
      try {
        const tab = useAppStore.getState().terminalTabs.find((t) => t.id === tabId);
        if (!tab) {
          return;
        }
        const sessionId = tab.sessionId;
        if (sessionId && this.liveSessionIds.has(sessionId)) {
          // PTY 存活：pool entry 已有完整 buffer，只需 fit 和 focus。
          const pooled = terminalXtermPool.get(sessionId);
          if (pooled) {
            pooled.fitAddon.fit();
            pooled.terminal.focus();
          }
          return;
        }

        this.ensureTabCwdsLoaded();
        const rememberedCwd = this.tabCwds.get(tabId);

        await this.attachSession(tabId, tab.profile, tab.workspaceId, {
          cwdOverride: rememberedCwd,
        });

        // 补发 PTY 创建前缓冲的输入。只补发给「本次新建、且确实存活」的会话。
        const pending = this.pendingInput.get(tabId) ?? '';
        this.pendingInput.delete(tabId);
        const liveSessionId = useAppStore
          .getState()
          .terminalTabs.find((t) => t.id === tabId)?.sessionId;
        if (pending && liveSessionId && this.liveSessionIds.has(liveSessionId)) {
          window.digitalLife.pty.input(liveSessionId, pending);
        }
      } catch (err) {
        console.error('Terminal activation failed:', err);
      }
    })();

    this.activating.set(tabId, run);
    void run.then(() => {
      if (this.activating.get(tabId) === run) {
        this.activating.delete(tabId);
      }
    });
    return run;
  };

  // ---------------------------------------------------------------- 实例动作

  handleXtermData = (activeTab: ActiveTerminalTab | undefined, data: string): void => {
    if (!activeTab) {
      return;
    }
    const sessionId = activeTab.sessionId;
    if (!sessionId || !this.liveSessionIds.has(sessionId)) {
      // PTY 尚未就绪：缓冲输入并触发激活。xterm 焦点上报的 \x1b[I/\x1b[O 不算用户输入。
      // eslint-disable-next-line no-control-regex
      const userInput = data.replace(/\x1b\[[IO]/g, '');
      if (userInput) {
        const buffered = this.pendingInput.get(activeTab.id) ?? '';
        this.pendingInput.set(activeTab.id, buffered + userInput);
      }
      void this.activateTab(activeTab.id);
      return;
    }
    window.digitalLife.pty.input(sessionId, data);
  };

  handleXtermResize = (
    activeTab: ActiveTerminalTab | undefined,
    cols: number,
    rows: number,
  ): void => {
    const targetSession = activeTab?.sessionId;
    if (!targetSession || !this.liveSessionIds.has(targetSession)) {
      return;
    }
    this.applySessionSize(targetSession, cols, rows);
  };

  handleKill = (activeTab: ActiveTerminalTab | undefined): void => {
    const sessionId = activeTab?.sessionId;
    if (sessionId) {
      window.digitalLife.pty.kill(sessionId);
      this.liveSessionIds.delete(sessionId);
      // 按标签更新：中心标签不是面板的 terminalActiveTabId，必须用 per-tab setter。
      useAppStore.getState().terminalUpdateTab(activeTab.id, { status: 'terminated' });
    }
  };

  handleCreateTab = async (profile?: TerminalProfile, workspaceId?: string): Promise<void> => {
    const { defaultTerminalProfile: currentDefault, workspaceDefaultProfiles: currentProfiles } =
      useAppStore.getState();

    let finalProfile: TerminalProfile;
    if (profile) {
      finalProfile = profile;
    } else if (workspaceId && currentProfiles[workspaceId]) {
      finalProfile = currentProfiles[workspaceId];
    } else {
      finalProfile = currentDefault;
    }

    useAppStore.getState().terminalCreateTab(finalProfile, workspaceId ?? '');
    const createdTabId = useAppStore.getState().terminalActiveTabId;
    await this.attachSession(createdTabId, finalProfile, workspaceId ?? '');
  };

  handleSelectTab = (tabId: string): void => {
    const currentActiveTabId = useAppStore.getState().terminalActiveTabId;
    if (tabId === currentActiveTabId) {
      return;
    }
    useAppStore.getState().terminalSelectTab(tabId);
    void this.activateTab(tabId);
  };

  handleCloseTab = (tabId: string): void => {
    const tabs = useAppStore.getState().terminalTabs;
    const tab = tabs.find((t) => t.id === tabId);
    if (tab?.sessionId) {
      // kill 失败仅日志：标签关闭流程（store / xterm 池 / 历史）不受影响。
      void window.digitalLife.pty
        .kill(tab.sessionId)
        .catch((e) => console.warn('[pty] kill on tab close failed:', e));
      terminalXtermPool.release(tab.sessionId);
      this.liveSessionIds.delete(tab.sessionId);
      this.ptyDims.delete(tab.sessionId);
      this.createdSessionIds.delete(tab.sessionId);
      this.oscCarry.delete(tab.sessionId);
      void terminalOutputStore.delete(tab.sessionId);
    }
    this.pendingInput.delete(tabId);
    void this.deleteHistoryForTab(tabId);
    if (this.tabCwds.delete(tabId)) {
      this.persistTabCwds();
    }
    useAppStore.getState().terminalCloseTab(tabId);
  };

  handleCloseAllTabs = (workspaceId?: string): void => {
    const tabs = useAppStore.getState().terminalTabs;
    const tabsToClose = selectTerminalTabsToClose(tabs, workspaceId);
    tabsToClose.forEach((tab) => {
      void this.deleteHistoryForTab(tab.id);
      this.tabCwds.delete(tab.id);
      this.pendingInput.delete(tab.id);
      if (tab.sessionId) {
        void window.digitalLife.pty
          .kill(tab.sessionId)
          .catch((e) => console.warn('[pty] kill on close-all failed:', e));
        terminalXtermPool.release(tab.sessionId);
        this.liveSessionIds.delete(tab.sessionId);
        this.ptyDims.delete(tab.sessionId);
        this.createdSessionIds.delete(tab.sessionId);
        this.oscCarry.delete(tab.sessionId);
        void terminalOutputStore.delete(tab.sessionId);
      }
    });
    this.persistTabCwds();
    useAppStore.getState().terminalCloseAllTabs(workspaceId);
  };

  private flushAllHistories = async (): Promise<void> => {
    this.ensureHistoryIndexLoaded();
    const pending = new Set<string>();
    this.historyIndex.forEach((segments) => {
      segments.forEach((s) => {
        if (s.live) {
          pending.add(s.sessionId);
        }
      });
    });
    const ownedSessionIds = new Set(
      useAppStore
        .getState()
        .terminalTabs.map((t) => t.sessionId)
        .filter((id): id is string => Boolean(id)),
    );
    this.collectors.forEach((_collector, sessionId) => {
      if (ownedSessionIds.has(sessionId)) {
        pending.add(sessionId);
      }
    });
    for (const sessionId of pending) {
      try {
        await this.finalizeSegment(sessionId, { skipBudget: true });
      } catch (err) {
        console.error('terminal history close flush failed', {
          sessionId,
          error: String(err),
        });
      }
    }
  };
}

/** 应用级单例：所有终端 PTY 运行时状态与全局副作用的唯一归属。 */
export const terminalPtyRuntime = new TerminalPtyRuntime();
