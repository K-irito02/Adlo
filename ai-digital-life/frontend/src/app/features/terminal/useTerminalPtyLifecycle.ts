import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { terminalSelectors } from '@stores/selectors';
import type { TerminalProfile } from '@stores/types';
import type { XtermTerminalHandle } from '@components/terminal/XtermTerminal';
import { terminalOutputStore } from './terminalOutputStore';
import { normalizeReportedCwd, scanOsc99 } from './terminalCwdOsc';
import { terminalCwdStore } from './terminalCwdStore';
import { terminalXtermPool, readTerminalFontFamily } from './terminalXtermPool';
import {
  terminalHistoryStore,
  chunkKey,
  type TerminalHistorySegment,
} from './terminalHistoryStore';
import {
  TerminalHistoryCollector,
  TERMINAL_CAPTURE_THROTTLE_MS,
} from './terminalHistoryCollector';
import {
  selectSegmentsToEvict,
  effectiveBudgetBytes,
  diskAvailableBytesFrom,
  TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES,
  TERMINAL_HISTORY_BUDGET_FOLLOW_DISK,
} from './terminalHistoryBudget';
import type { ExtractLine } from './historyModel';

const SHELL_MAP: Record<TerminalProfile, string> = {
  powershell: 'powershell',
  bash: 'bash',
  cmd: 'cmd',
};

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

interface PtyLifecycleParams {
  activeTab: { id: string; sessionId?: string } | undefined;
}

export function useTerminalPtyLifecycle({ activeTab }: PtyLifecycleParams) {
  const xtermRef = useRef<XtermTerminalHandle | null>(null);
  // 每个会话一个采集器（只读历史行块的状态机）与一条节流触发线。
  const collectorsRef = useRef<Map<string, TerminalHistoryCollector>>(new Map());
  const throttledRef = useRef<Map<string, () => void>>(new Map());

  // 本次运行中新建的会话（用于区分「重启恢复的标签」与「新建标签」）
  const createdSessionIdsRef = useRef<Set<string>>(new Set());
  // 当前仍然存活的 PTY 会话（应用重启后恢复的标签不在其中 → 需要重建）
  const liveSessionIdsRef = useRef<Set<string>>(new Set());
  // 重建期间缓冲的用户输入（PTY 创建前收到的按键，PTY 就绪后补发）。
  // 按「标签」隔离：并发激活多个标签时，各标签的按键不得串到别的标签。
  const pendingInputRef = useRef<Map<string, string>>(new Map());
  // 每个标签「正在进行的激活」：并发触发（启动效应 + 键入补触发 + 聚焦上报）必须汇流成一次，
  // 否则会为同一标签创建多个 PTY（已被日志证实过）。
  const activatingRef = useRef<Map<string, Promise<void>>>(new Map());
  // 每个会话当前实际生效的 PTY 尺寸：同尺寸的 resize 直接跳过，
  // 否则 ConPTY 每次都会重发整屏（约 250 字节的 `\x1b[K\r\n` 片段）污染输出缓冲。
  const ptyDimsRef = useRef<Map<string, { cols: number; rows: number }>>(new Map());
  // 每个标签的「上次所在目录」（由 shell 通过 OSC 9;9 上报，按标签持久化）
  const tabCwdRef = useRef<Map<string, string>>(new Map());
  const tabCwdsLoadedRef = useRef(false);
  // OSC 9;9 可能跨块截断：保留各会话的尾部片段用于拼接
  const oscCarryRef = useRef<Map<string, string>>(new Map());
  // 每个标签的「历史分段索引」：历次 PTY 会话的 sessionId（旧 → 新）。
  // 历史内容按 sessionId 由 terminalOutputStore 保存，这里只管顺序与归档时间。
  const historyIndexRef = useRef<Map<string, TerminalHistorySegment[]>>(new Map());
  const historyIndexLoadedRef = useRef(false);
  // 索引是 ref（便于在回调里同步读写），用一个版本号驱动渲染
  const [historyIndexVersion, setHistoryIndexVersion] = useState(0);

  /** 懒加载持久化的「标签 → 历史分段」索引（只需一次） */
  const ensureHistoryIndexLoaded = useCallback(() => {
    if (historyIndexLoadedRef.current) {
      return;
    }
    historyIndexLoadedRef.current = true;
    for (const [tabId, segments] of Object.entries(terminalHistoryStore.loadAll())) {
      historyIndexRef.current.set(tabId, segments);
    }
  }, []);

  /** 持久化整个「标签 → 历史分段」索引，并触发一次渲染 */
  const persistHistoryIndex = useCallback(() => {
    const snapshot: Record<string, TerminalHistorySegment[]> = {};
    historyIndexRef.current.forEach((segments, tabId) => {
      snapshot[tabId] = segments;
    });
    terminalHistoryStore.saveAll(snapshot);
    setHistoryIndexVersion((v) => v + 1);
  }, []);

  /** 每会话一个采集器：从 xterm pool 读屏幕、按块落盘写入 terminalOutputStore */
  const collectorFor = useCallback((sessionId: string) => {
    let collector = collectorsRef.current.get(sessionId);
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
      collectorsRef.current.set(sessionId, collector);
    }
    return collector;
  }, []);

  /** 删除某标签的全部历史：段记录 + 每段 seq = 0..chunks.length-1 的全部块 */
  const deleteHistoryForTab = useCallback(
    async (tabId: string) => {
      // 先确保索引已加载：否则「启动后立刻关闭上次遗留标签」时 ref 还是空的，
      // 会提前 return，持久化里的索引与各段快照就成了孤儿数据。
      ensureHistoryIndexLoaded();
      const segments = historyIndexRef.current.get(tabId) ?? [];
      for (const segment of segments) {
        for (let seq = 0; seq < segment.chunks.length; seq += 1) {
          await terminalOutputStore.delete(chunkKey(segment.sessionId, seq));
        }
        collectorsRef.current.delete(segment.sessionId);
        throttledRef.current.delete(segment.sessionId);
      }
      historyIndexRef.current.delete(tabId);
      persistHistoryIndex();
    },
    [ensureHistoryIndexLoaded, persistHistoryIndex],
  );

  /** 删除单个段及其全部块记录（预算淘汰用；不影响同标签其它段） */
  const deleteSegmentRecords = useCallback(
    async (tabId: string, segment: TerminalHistorySegment) => {
      for (let seq = 0; seq < segment.chunks.length; seq += 1) {
        await terminalOutputStore.delete(chunkKey(segment.sessionId, seq));
      }
      collectorsRef.current.delete(segment.sessionId);
      throttledRef.current.delete(segment.sessionId);
    },
    [],
  );

  /** 预算结算：超出有效预算时按最旧优先淘汰整段历史 */
  const settleHistoryBudget = useCallback(async () => {
    const all: { tabId: string; seg: TerminalHistorySegment }[] = [];
    historyIndexRef.current.forEach((segments, tabId) => {
      segments.forEach((seg) => all.push({ tabId, seg }));
    });

    // 读用户偏好：undefined（尚未加载）回退默认预算；等于 FOLLOW_DISK 哨兵时取磁盘可用空间，
    // 否则按固定设定值执行。读磁盘失败/拿不到快照 → diskAvailableBytes 为 null，由
    // effectiveBudgetBytes 回退到默认预算，绝不阻塞结算。
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
    // 必须**逐段**删除：deleteHistoryForTab 会清掉该标签的全部段，
    // 用它来淘汰一段会连带毁掉同标签其它段的落盘数据（索引却还在 → 显示「内容不可用」）。
    const doomedByTab = new Map<string, Set<string>>();
    for (const { tabId, sessionId } of doomed) {
      const set = doomedByTab.get(tabId) ?? new Set<string>();
      set.add(sessionId);
      doomedByTab.set(tabId, set);
      const segment = all.find((e) => e.tabId === tabId && e.seg.sessionId === sessionId)?.seg;
      if (segment) {
        await deleteSegmentRecords(tabId, segment);
      }
    }
    for (const [tabId, sessionIds] of doomedByTab) {
      const segments = historyIndexRef.current.get(tabId) ?? [];
      const kept = segments.filter((s) => !sessionIds.has(s.sessionId));
      if (kept.length > 0) {
        historyIndexRef.current.set(tabId, kept);
      } else {
        historyIndexRef.current.delete(tabId);
      }
    }
    persistHistoryIndex();
  }, [deleteSegmentRecords, persistHistoryIndex]);

  /** 采集一次 → 把块的元信息写回索引 → 结算预算 */
  const persistCollectedChunks = useCallback(
    async (sessionId: string) => {
      const collector = collectorFor(sessionId);
      const ok = await collector.collect();
      if (!ok) {
        return; // 失败：水位未推进，未满块保留，下一次采集重试
      }
      ensureHistoryIndexLoaded();
      const tab = useAppStore.getState().terminalTabs.find((t) => t.sessionId === sessionId);
      if (!tab) {
        return;
      }
      const segments = historyIndexRef.current.get(tab.id) ?? [];
      const at = segments.findIndex((s) => s.sessionId === sessionId);
      const next: TerminalHistorySegment = {
        sessionId,
        endedAt: Date.now(),
        live: true,
        chunks: collector.getWrittenChunks(),
      };
      if (at >= 0) {
        segments[at] = next;
      } else {
        segments.push(next);
      }
      historyIndexRef.current.set(tab.id, segments);
      persistHistoryIndex();
      void settleHistoryBudget();
    },
    [collectorFor, ensureHistoryIndexLoaded, persistHistoryIndex, settleHistoryBudget],
  );

  /** 输出驱动的采集入口（节流） */
  const collectThrottled = useCallback(
    (sessionId: string) => {
      let trigger = throttledRef.current.get(sessionId);
      if (!trigger) {
        trigger = createThrottledRunner(
          () => void persistCollectedChunks(sessionId),
          TERMINAL_CAPTURE_THROTTLE_MS,
        );
        throttledRef.current.set(sessionId, trigger);
      }
      trigger();
    },
    [persistCollectedChunks],
  );

  /** 段定稿：live 置 false、endedAt 冻结在最后一次采集时刻 */
  const finalizeSegment = useCallback(
    (sessionId: string) => {
      ensureHistoryIndexLoaded();
      for (const [tabId, segments] of historyIndexRef.current) {
        const at = segments.findIndex((s) => s.sessionId === sessionId);
        if (at >= 0) {
          segments[at] = {
            ...segments[at],
            live: false,
            chunks: collectorFor(sessionId).getWrittenChunks(),
          };
          historyIndexRef.current.set(tabId, segments);
        }
      }
      persistHistoryIndex();
      // 段定稿后按用户偏好重新结算预算（fire-and-forget；不阻塞 beforeunload / 关闭路径）。
      void settleHistoryBudget();
    },
    [collectorFor, ensureHistoryIndexLoaded, persistHistoryIndex, settleHistoryBudget],
  );

  /** 应用启动：残留的 live 段其 PTY 必然已随进程退出而死 → 定稿 */
  const finalizeStaleSegments = useCallback(() => {
    ensureHistoryIndexLoaded();
    let changed = false;
    for (const [tabId, segments] of historyIndexRef.current) {
      const next = segments.map((s) => (s.live ? { ...s, live: false } : s));
      if (next.some((s, i) => s !== segments[i])) {
        historyIndexRef.current.set(tabId, next);
        changed = true;
      }
    }
    if (changed) {
      persistHistoryIndex();
    }
    // 启动定稿后按用户偏好结算预算，确保在首段新输出前就执行了上限（fire-and-forget）。
    void settleHistoryBudget();
  }, [ensureHistoryIndexLoaded, persistHistoryIndex, settleHistoryBudget]);

  /** 懒加载持久化的「标签 → 目录」映射（只需一次） */
  const ensureTabCwdsLoaded = useCallback(() => {
    if (tabCwdsLoadedRef.current) {
      return;
    }
    tabCwdsLoadedRef.current = true;
    const stored = terminalCwdStore.loadAll();
    for (const [tabId, cwd] of Object.entries(stored)) {
      tabCwdRef.current.set(tabId, cwd);
    }
  }, []);

  /** 持久化整个「标签 → 目录」映射（写入在 store 内去抖） */
  const persistTabCwds = useCallback(() => {
    const snapshot: Record<string, string> = {};
    tabCwdRef.current.forEach((cwd, tabId) => {
      snapshot[tabId] = cwd;
    });
    terminalCwdStore.saveAll(snapshot);
  }, []);

  const terminalTabs = terminalSelectors.useTerminalTabs();
  const sessionIdsKey = useMemo(
    () =>
      Array.from(
        new Set(terminalTabs.map((tab) => tab.sessionId).filter((id): id is string => Boolean(id))),
      )
        .sort()
        .join('|'),
    [terminalTabs],
  );

  const {
    terminalCreateTab,
    terminalSelectTab,
    terminalCloseTab,
    terminalUpdateActiveTab,
    terminalUpdateTab,
    terminalCloseAllTabs,
    recentWorkspaces,
    activeRightTool,
  } = useAppStore(
    useShallow((state) => ({
      terminalCreateTab: state.terminalCreateTab,
      terminalSelectTab: state.terminalSelectTab,
      terminalCloseTab: state.terminalCloseTab,
      terminalUpdateActiveTab: state.terminalUpdateActiveTab,
      terminalUpdateTab: state.terminalUpdateTab,
      terminalCloseAllTabs: state.terminalCloseAllTabs,
      recentWorkspaces: state.recentWorkspaces,
      activeRightTool: state.activeRightTool,
    })),
  );

  /**
   * 把某会话的尺寸上报给 PTY（同尺寸去重）。
   * ConPTY 每次收到 resize 都会重发整屏，因此只有尺寸真实变化时才上报。
   */
  const applySessionSize = useCallback((sessionId: string, cols: number, rows: number) => {
    if (cols <= 0 || rows <= 0) {
      return;
    }
    const effective = ptyDimsRef.current.get(sessionId);
    if (effective && effective.cols === cols && effective.rows === rows) {
      return;
    }
    ptyDimsRef.current.set(sessionId, { cols, rows });
    window.digitalLife.pty.resize(sessionId, cols, rows);
  }, []);

  /**
   * 为指定标签创建一个 PTY 会话并挂到该标签上。
   * xterm 实例由调用方通过 pool 管理，本函数仅负责 PTY 创建。
   */
  const attachSession = useCallback(
    async (
      tabId: string,
      profile: TerminalProfile,
      workspaceId: string,
      options?: { cwdOverride?: string },
    ): Promise<void> => {
      const cwdOverride = options?.cwdOverride;
      const workspace = workspaceId
        ? recentWorkspaces.find((w) => w.id === workspaceId)
        : undefined;
      ensureTabCwdsLoaded();
      const cwd = cwdOverride ?? (workspaceId ? (workspace?.path ?? undefined) : undefined);

      // 双保险：activateTab 已用 activatingRef 汇流并发激活，这里再拦一次
      // 「该标签已有存活 PTY」的调用（attachSession 也可能被 handleCreateTab 等路径直接调用）。
      const existingTab = useAppStore.getState().terminalTabs.find((t) => t.id === tabId);
      if (!existingTab) {
        // 标签已被关闭（关闭 × 激活并发的竞态）：不再为其创建 PTY
        return;
      }
      if (existingTab.sessionId && liveSessionIdsRef.current.has(existingTab.sessionId)) {
        return;
      }

      try {
        // 等待容器出现：React batching 可能导致 XtermTerminal 尚未 mount，
        // document.querySelector 返回 null。轮询最多等 30 帧（~500ms）。
        let container: HTMLElement | null = null;
        for (let frame = 0; frame < 30; frame++) {
          container = document.querySelector('.adl-terminal-canvas');
          if (container) {
            break;
          }
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
        }

        let cols = 80;
        let rows = 24;
        if (container) {
          // 直接测量容器尺寸，不创建临时 pool entry
          // （临时 entry 会导致 DOM 中有两个重叠的 hostEl，干扰布局）
          const tempDiv = document.createElement('div');
          tempDiv.style.cssText =
            'position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;visibility:hidden;';
          container.appendChild(tempDiv);

          const { Terminal } = await import('@xterm/xterm');
          const { FitAddon } = await import('@xterm/addon-fit');
          const tempTerminal = new Terminal({
            fontSize: 13,
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
          // 失败反馈由 TerminalPanel 的 .adl-terminal-error-note 呈现
          terminalUpdateTab(tabId, { status: 'terminated' });
          return;
        }

        const sessionId = result.data.sessionId;
        // PTY 创建期间标签可能已被关闭：此时这个 PTY 已成孤儿，立即回收，
        // 不写入任何 ref / store（否则会残留一个占用 shell 进程的会话）。
        if (!useAppStore.getState().terminalTabs.some((t) => t.id === tabId)) {
          void window.digitalLife.pty.kill(sessionId);
          return;
        }
        createdSessionIdsRef.current.add(sessionId);
        liveSessionIdsRef.current.add(sessionId);
        ptyDimsRef.current.set(sessionId, { cols, rows });
        terminalUpdateTab(tabId, { sessionId, status: 'running' });
      } catch (err) {
        console.error('Terminal creation error:', err);
        // 失败反馈由 TerminalPanel 的 .adl-terminal-error-note 呈现
        terminalUpdateTab(tabId, { status: 'terminated' });
      }
    },
    [ensureTabCwdsLoaded, recentWorkspaces, terminalUpdateTab],
  );

  /**
   * 激活某个标签：会话存活则只做 fit/focus；会话已消失（应用重启后恢复的标签）则
   * 把旧会话归档为「只读历史段」、再创建一个全新的 PTY。
   *
   * 并发调用（启动效应 + 键入补触发 + 聚焦上报）会汇流到同一个 promise，
   * 保证每个标签最多只创建一个 PTY。
   */
  const activateTab = useCallback(
    (tabId: string): Promise<void> => {
      const inFlight = activatingRef.current.get(tabId);
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
          if (sessionId && liveSessionIdsRef.current.has(sessionId)) {
            // PTY 存活：pool entry 已有完整 buffer（PTY 输出持续写入），只需 fit 和 focus
            const pooled = terminalXtermPool.get(sessionId);
            if (pooled) {
              pooled.fitAddon.fit();
              pooled.terminal.focus();
            }
            return;
          }

          ensureTabCwdsLoaded();
          const rememberedCwd = tabCwdRef.current.get(tabId);

          // 旧会话已结束（或无会话）：启动效应走激活即可；历史段会在 PTY 生命周期里
          // 由采集器建立，并随会话结束/退出定稿。绝不把历史写进实时终端，否则 ConPTY
          // 的光标坐标系会被历史顶偏（这就是「输出跳回顶部」的根因）。

          await attachSession(tabId, tab.profile, tab.workspaceId, {
            cwdOverride: rememberedCwd,
          });

          // 补发 PTY 创建前缓冲的输入。
          // 只补发给「本次新建、且确实存活」的会话：attachSession 失败时 tab.sessionId
          // 仍是恢复前的旧（已死）会话 id，向它补发既无效又有误导性。
          const pending = pendingInputRef.current.get(tabId) ?? '';
          pendingInputRef.current.delete(tabId);
          const liveSessionId = useAppStore
            .getState()
            .terminalTabs.find((t) => t.id === tabId)?.sessionId;
          if (pending && liveSessionId && liveSessionIdsRef.current.has(liveSessionId)) {
            window.digitalLife.pty.input(liveSessionId, pending);
          }
        } catch (err) {
          console.error('Terminal activation failed:', err);
        }
      })();

      activatingRef.current.set(tabId, run);
      void run.then(() => {
        if (activatingRef.current.get(tabId) === run) {
          activatingRef.current.delete(tabId);
        }
      });
      return run;
    },
    [attachSession, ensureTabCwdsLoaded],
  );

  // 30 秒周期兜底：即使长时间无新输出也至少落盘一次（节流无法覆盖「安静」期的最后一次采集）。
  useEffect(() => {
    const interval = setInterval(() => {
      const sessionIds = sessionIdsKey ? sessionIdsKey.split('|') : [];
      for (const sessionId of sessionIds) {
        void persistCollectedChunks(sessionId);
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [sessionIdsKey, persistCollectedChunks]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      collectorsRef.current.forEach((collector, sessionId) => {
        void collector.flush().then((ok) => {
          if (ok) {
            finalizeSegment(sessionId);
          }
        });
      });
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [finalizeSegment]);

  // 启动激活：恢复的标签其会话必然已不存在（应用退出时会话被 kill），
  // 因此在启动时对「上一次运行遗留的活动标签」走一次激活（重建会话），
  // 并先把残留的 live 段定稿（其 PTY 已随进程退出而死）。
  const startupHandledRef = useRef(false);
  useEffect(() => {
    if (startupHandledRef.current) {
      return;
    }
    startupHandledRef.current = true;
    finalizeStaleSegments();
    const tabId = activeTab?.id;
    if (!tabId) {
      return;
    }
    const sessionId = activeTab?.sessionId;
    // 本次运行已建过的会话无需再激活；无会话的标签（例如上次建会话中途退出）也要补建
    if (sessionId && createdSessionIdsRef.current.has(sessionId)) {
      return;
    }
    void activateTab(tabId);
  }, [activeTab, activateTab, finalizeStaleSegments]);

  const handleXtermData = useCallback(
    (data: string) => {
      const tab = activeTab;
      if (!tab) {
        return;
      }
      const sessionId = tab.sessionId;
      if (!sessionId || !liveSessionIdsRef.current.has(sessionId)) {
        // PTY 尚未就绪：缓冲输入并触发激活。
        // xterm 在获得/失去焦点时会自动上报 \x1b[I / \x1b[O（shell 请求的 focus reporting），
        // 那不是用户输入，不该混进待补发内容。
        // eslint-disable-next-line no-control-regex
        const userInput = data.replace(/\x1b\[[IO]/g, '');
        if (userInput) {
          const buffered = pendingInputRef.current.get(tab.id) ?? '';
          pendingInputRef.current.set(tab.id, buffered + userInput);
        }
        void activateTab(tab.id);
        return;
      }
      window.digitalLife.pty.input(sessionId, data);
    },
    [activeTab, activateTab],
  );

  const handleXtermResize = useCallback(
    (cols: number, rows: number) => {
      const targetSession = activeTab?.sessionId;
      if (!targetSession || !liveSessionIdsRef.current.has(targetSession)) {
        return;
      }
      applySessionSize(targetSession, cols, rows);
    },
    [activeTab?.sessionId, applySessionSize],
  );

  const handleCreateTab = useCallback(
    async (profile?: TerminalProfile, workspaceId?: string) => {
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

      terminalCreateTab(finalProfile, workspaceId ?? '');
      const createdTabId = useAppStore.getState().terminalActiveTabId;
      // attachSession now measures dimensions directly via a temporary pool entry,
      // so no setTimeout or waitForTerminal is needed here.
      await attachSession(createdTabId, finalProfile, workspaceId ?? '');
    },
    [attachSession, terminalCreateTab],
  );

  const handleSelectTab = useCallback(
    (tabId: string) => {
      const currentActiveTabId = useAppStore.getState().terminalActiveTabId;
      if (tabId === currentActiveTabId) {
        return;
      }
      terminalSelectTab(tabId);
      void activateTab(tabId);
    },
    [activateTab, terminalSelectTab],
  );

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const tabs = useAppStore.getState().terminalTabs;
      const tab = tabs.find((t) => t.id === tabId);
      if (tab?.sessionId) {
        window.digitalLife.pty.kill(tab.sessionId);
        terminalXtermPool.release(tab.sessionId);
        liveSessionIdsRef.current.delete(tab.sessionId);
        ptyDimsRef.current.delete(tab.sessionId);
        createdSessionIdsRef.current.delete(tab.sessionId);
        oscCarryRef.current.delete(tab.sessionId);
        terminalOutputStore.delete(tab.sessionId);
      }
      // 历史与待发输入的清理不依赖 sessionId 是否存在（与 handleCloseAllTabs 保持对称），
      // 避免「有历史却无存活会话」的边界（如 PTY 创建失败前已归档）留下孤儿索引与快照。
      pendingInputRef.current.delete(tabId);
      void deleteHistoryForTab(tabId);
      if (tabCwdRef.current.delete(tabId)) {
        persistTabCwds();
      }
      terminalCloseTab(tabId);
    },
    [deleteHistoryForTab, persistTabCwds, terminalCloseTab],
  );

  const handleCloseAllTabs = useCallback(
    (workspaceId?: string) => {
      const tabs = useAppStore.getState().terminalTabs;
      const tabsToClose =
        workspaceId !== undefined ? tabs.filter((tab) => tab.workspaceId === workspaceId) : tabs;
      tabsToClose.forEach((tab) => {
        void deleteHistoryForTab(tab.id);
        tabCwdRef.current.delete(tab.id);
        pendingInputRef.current.delete(tab.id);
        if (tab.sessionId) {
          window.digitalLife.pty.kill(tab.sessionId);
          terminalXtermPool.release(tab.sessionId);
          liveSessionIdsRef.current.delete(tab.sessionId);
          ptyDimsRef.current.delete(tab.sessionId);
          createdSessionIdsRef.current.delete(tab.sessionId);
          oscCarryRef.current.delete(tab.sessionId);
          terminalOutputStore.delete(tab.sessionId);
        }
      });
      persistTabCwds();
      terminalCloseAllTabs(workspaceId);
    },
    [deleteHistoryForTab, persistTabCwds, terminalCloseAllTabs],
  );

  const handleKill = useCallback(() => {
    const sessionId = activeTab?.sessionId;
    if (sessionId) {
      window.digitalLife.pty.kill(sessionId);
      liveSessionIdsRef.current.delete(sessionId);
      terminalUpdateActiveTab({ status: 'terminated' });
    }
  }, [activeTab?.sessionId, terminalUpdateActiveTab]);

  useEffect(() => {
    if (activeRightTool !== 'terminal') {
      return;
    }

    const unsub = window.digitalLife.subscribePtyOutput((event) => {
      if (event.terminated) {
        liveSessionIdsRef.current.delete(event.sessionId);
        ptyDimsRef.current.delete(event.sessionId);
        const tabs = useAppStore.getState().terminalTabs;
        const tab = tabs.find((t) => t.sessionId === event.sessionId);
        if (tab) {
          terminalUpdateTab(tab.id, { status: 'terminated' });
        }
        return;
      }

      // OSC 9;9: 按标签记住 shell 上报的当前目录
      const oscScan = scanOsc99((oscCarryRef.current.get(event.sessionId) ?? '') + event.data);
      if (oscScan.carry) {
        oscCarryRef.current.set(event.sessionId, oscScan.carry);
      } else {
        oscCarryRef.current.delete(event.sessionId);
      }
      if (oscScan.cwds.length > 0) {
        const ownerTab = useAppStore
          .getState()
          .terminalTabs.find((t) => t.sessionId === event.sessionId);
        if (ownerTab) {
          const latestCwd = oscScan.cwds[oscScan.cwds.length - 1];
          const normalized = normalizeReportedCwd(latestCwd, { msys: ownerTab.profile === 'bash' });
          if (normalized && tabCwdRef.current.get(ownerTab.id) !== normalized) {
            tabCwdRef.current.set(ownerTab.id, normalized);
            persistTabCwds();
          }
        }
      }

      // 原样写入 pool 中该会话的 xterm（所有会话，不仅限活动标签）。
      // 不再做任何 ANSI 过滤：实时终端里只有本次会话的内容，ConPTY 的光标坐标系
      // 与 xterm 完全一致，清屏/归位/绝对定位全部可以正常放行。
      const pooled = terminalXtermPool.get(event.sessionId);
      if (pooled) {
        pooled.terminal.write(event.data);
      }

      // 节流采集：输出期间最多每 TERMINAL_CAPTURE_THROTTLE_MS 采一次（替代原尾去抖），
      // 把积压行数压到远小于 xterm scrollback 环容量，避免采集间隙的输出从源头丢失。
      collectThrottled(event.sessionId);
    });
    return () => unsub();
  }, [activeRightTool, persistTabCwds, collectThrottled, terminalUpdateTab]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      terminalXtermPool.syncTheme();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  /** 当前活动标签的「只读历史段」列表（旧 → 新）；没有历史时为空数组 */
  const historySegments = useMemo(() => {
    const tabId = activeTab?.id;
    if (!tabId) {
      return [];
    }
    ensureHistoryIndexLoaded();
    // 已过滤正在进行的段：只读历史区绝不能把「实时终端当前内容」再渲染一遍，
    // 否则 ConPTY 光标坐标系被历史顶偏（「输出跳回顶部」根因）。
    return (historyIndexRef.current.get(tabId) ?? []).filter((s) => !s.live);
    // historyIndexVersion 只是「索引已变化」的渲染触发器，本身不参与计算：
    // 索引存在 ref 里以便在回调中同步读写，这里靠版本号驱动重新取值。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.id, historyIndexVersion, ensureHistoryIndexLoaded]);

  return {
    xtermRef,
    historySegments,
    deleteHistoryForTab,
    handleXtermData,
    handleXtermResize,
    handleCreateTab,
    handleSelectTab,
    handleCloseTab,
    handleCloseAllTabs,
    handleKill,
  };
}
