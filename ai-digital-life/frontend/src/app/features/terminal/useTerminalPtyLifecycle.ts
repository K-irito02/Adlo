import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { terminalSelectors } from '@stores/selectors';
import type { TerminalProfile } from '@stores/types';
import type { XtermTerminalHandle } from '@components/terminal/XtermTerminal';
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

  /**
   * 删除某会话的 `[0, count)` 号块记录。
   * 调用方的 await 链必须覆盖删除（否则关闭路径的 destroy 会抢在删除完成前
   * 杀死渲染进程）；按小批并发而非全量并发：后端连接池 max_size=8 且 acquire 有超时，
   * 一次性发几十个删除请求会排队超时，而 `terminalOutputStore.delete` 吞掉失败 →
   * 静默留下孤儿块。小批既快于串行，也不会打满连接池。
   */
  const deleteChunksForSession = useCallback(
    async (sessionId: string, start: number, count: number) => {
      const DELETE_BATCH = 4;
      for (let offset = 0; offset < count; offset += DELETE_BATCH) {
        const batch = Math.min(DELETE_BATCH, count - offset);
        await Promise.all(
          Array.from({ length: batch }, (_unused, index) =>
            terminalOutputStore.delete(chunkKey(sessionId, start + offset + index)),
          ),
        );
      }
    },
    [],
  );

  /**
   * 回卷（scrollback 溢出）后清理陈旧块：采集器把 `seq` 归零并整体重采，
   * 上一代比新代多出来的尾部键已无索引引用（预算统计与删除路径都碰不到），
   * 必须显式删除，否则成为永久磁盘孤儿。
   */
  const evictStaleChunksForRebuild = useCallback(
    async (sessionId: string, nextCount: number) => {
      const tabId = useAppStore.getState().terminalTabs.find((t) => t.sessionId === sessionId)?.id;
      if (!tabId) {
        return;
      }
      const segment = (historyIndexRef.current.get(tabId) ?? []).find(
        (s) => s.sessionId === sessionId,
      );
      if (!segment) {
        return;
      }
      const { start, count } = staleChunkRange(segment.chunks.length, nextCount);
      if (count > 0) {
        await deleteChunksForSession(sessionId, start, count);
      }
    },
    [deleteChunksForSession],
  );

  /** 删除某标签的全部历史：段记录 + 每段 seq = 0..chunks.length-1 的全部块 */
  const deleteHistoryForTab = useCallback(
    async (tabId: string) => {
      // 先确保索引已加载：否则「启动后立刻关闭上次遗留标签」时 ref 还是空的，
      // 会提前 return，持久化里的索引与各段快照就成了孤儿数据。
      ensureHistoryIndexLoaded();
      const segments = historyIndexRef.current.get(tabId) ?? [];
      for (const segment of segments) {
        await deleteChunksForSession(segment.sessionId, 0, segment.chunks.length);
        collectorsRef.current.delete(segment.sessionId);
        throttledRef.current.delete(segment.sessionId);
      }
      historyIndexRef.current.delete(tabId);
      persistHistoryIndex();
    },
    [deleteChunksForSession, ensureHistoryIndexLoaded, persistHistoryIndex],
  );

  /** 删除单个段及其全部块记录（预算淘汰用；同标签其它段不受影响） */
  const deleteSegmentRecords = useCallback(
    async (segment: TerminalHistorySegment) => {
      await deleteChunksForSession(segment.sessionId, 0, segment.chunks.length);
      collectorsRef.current.delete(segment.sessionId);
      throttledRef.current.delete(segment.sessionId);
    },
    [deleteChunksForSession],
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
        await deleteSegmentRecords(segment);
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

  /**
   * 把采集器已落盘块的元信息写回索引 → 结算预算。
   * 空段（written 为空）不入索引：它无任何可渲染行，只会产出孤立日期分隔符。
   * ownerTabId 可选：调用方已解析归属标签时透传，避免按 sessionId 重查
   * （标签已关闭但历史保留在索引中时，重查会早退丢更新）。
   */
  const upsertHistoryEntry = useCallback(
    (
      sessionId: string,
      written: TerminalHistoryChunkMeta[],
      options?: { ownerTabId?: string; skipBudget?: boolean },
    ) => {
      if (written.length === 0) {
        return;
      }
      ensureHistoryIndexLoaded();
      const tabId =
        options?.ownerTabId ??
        useAppStore.getState().terminalTabs.find((t) => t.sessionId === sessionId)?.id;
      if (!tabId) {
        return;
      }
      const segments = historyIndexRef.current.get(tabId) ?? [];
      const at = segments.findIndex((s) => s.sessionId === sessionId);
      // 已定稿条目（live:false）只刷新 chunks，不翻回 live、也不后推 endedAt：
      // 关闭被拦等异常路径下会话仍存活，后续 persist 不能把历史从只读区抹掉，
      // 也不该让分隔符时间从“真实结束时刻”漂移到“迟到采集时刻”。
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
      historyIndexRef.current.set(tabId, segments);
      persistHistoryIndex();
      // 关闭/卸载窗口传 skipBudget：结算先删块再写索引，被进程退出截断会留下
      // 指向已删块的索引（下次启动显示「内容不可用」），淘汰交给下次启动统一处理。
      if (!options?.skipBudget) {
        void settleHistoryBudget();
      }
    },
    [ensureHistoryIndexLoaded, persistHistoryIndex, settleHistoryBudget],
  );

  /**
   * 两条采集路径（节流 collect / 30s 检查点）共用的收尾：块数未变且未发生回卷时
   * 跳过 upsert —— 空闲期无意义的索引写、版本 bump（重渲染）与预算结算都不做。
   * 共用一份实现是为了让守卫口径不会在两条路径间漂移。
   */
  const persistCollectedTail = useCallback(
    async (sessionId: string, collector: TerminalHistoryCollector, before: number) => {
      const written = collector.getWrittenChunks();
      // 回卷重建后块数可能恰好与 before 相同，但磁盘 seq 键已被新内容覆盖，
      // 必须更新索引 meta。consumeRebuild 必须**无条件**调用（不能进 && 短路），
      // 否则长度变化时标志不被消费、残留到下一次触发，多出一次无意义 upsert。
      const rebuilt = collector.consumeRebuild();
      if (written.length === before && !rebuilt) {
        return;
      }
      if (rebuilt) {
        // 回卷已让磁盘块整体换代：先清掉上一代多出来的尾部键，再写索引
        await evictStaleChunksForRebuild(sessionId, written.length);
      }
      upsertHistoryEntry(sessionId, written);
    },
    [evictStaleChunksForRebuild, upsertHistoryEntry],
  );

  /**
   * 采集一次（节流路径，collect-only：不封未满块）→ 收尾写索引。
   * 失败时水位未推进，未满块保留，下一次采集重试。
   */
  const persistCollectedChunks = useCallback(
    async (sessionId: string) => {
      const collector = collectorFor(sessionId);
      const before = collector.getWrittenChunks().length;
      const ok = await collector.collect();
      if (!ok) {
        return;
      }
      await persistCollectedTail(sessionId, collector, before);
    },
    [collectorFor, persistCollectedTail],
  );

  /**
   * 检查点持久化（30 秒周期用）：收集冻结行后把未满块也封块落盘，
   * 小会话无需等 64KiB 上限。节流路径保持 collect-only，避免高频碎块。
   */
  const persistCheckpoint = useCallback(
    async (sessionId: string) => {
      const collector = collectorFor(sessionId);
      const before = collector.getWrittenChunks().length;
      const ok = await collector.checkpoint();
      if (!ok) {
        return;
      }
      await persistCollectedTail(sessionId, collector, before);
    },
    [collectorFor, persistCollectedTail],
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

  /**
   * 段定稿：先 flush 把视口区也封入最后一块（会话已结束，视口不再变化），
   * 再把 live 置 false。零输出会话（written 为空）不留索引，不产出孤立分隔符。
   * 只作用于拥有该会话的标签；索引中找不到时回退按 sessionId 找归属标签
   * （小会话可能从未 persist 过，索引里还没有它 —— 这正是纯分隔符 bug 的另一半）。
   * 无归属（标签已删）时直接返回：flush 的落盘 IO 在此之前绝不执行，
   * 否则写出的块无索引可达、无预算可淘汰、无删除可清理，成为永久孤儿。
   */
  const finalizeSegment = useCallback(
    async (sessionId: string, options?: { skipBudget?: boolean }) => {
      ensureHistoryIndexLoaded();
      let ownerTabId: string | null = null;
      for (const [tabId, segments] of historyIndexRef.current) {
        if (segments.some((s) => s.sessionId === sessionId)) {
          ownerTabId = tabId;
          break;
        }
      }
      ownerTabId ??=
        useAppStore.getState().terminalTabs.find((t) => t.sessionId === sessionId)?.id ?? null;
      if (!ownerTabId) {
        collectorsRef.current.delete(sessionId);
        throttledRef.current.delete(sessionId);
        return;
      }
      // flush 是异步 IPC，等待期间索引可能被改写：用户删整个标签历史、标签被关闭、
      // 或预算结算淘汰了「该会话这一段」（标签仍有其它段）。await 后必须重新校验，
      // 否则会把刚被删除的段“复活”成引用已删块的孤儿（无 UI 可达、无删除入口、仍占预算）。
      // 判据用「该段定稿前是否已入索引」而非「tab key 是否存在」——后者漏掉单段淘汰。
      const previousSegments = historyIndexRef.current.get(ownerTabId) ?? [];
      const previousSegment = previousSegments.find((s) => s.sessionId === sessionId);
      const segmentExistedBefore = previousSegment !== undefined;
      const collector = collectorFor(sessionId);
      const flushed = await collector.flush();
      const written = collector.getWrittenChunks();
      const segments = historyIndexRef.current.get(ownerTabId) ?? [];
      const at = segments.findIndex((s) => s.sessionId === sessionId);
      const tabStillExists = useAppStore.getState().terminalTabs.some((t) => t.id === ownerTabId);
      if (!tabStillExists || (segmentExistedBefore && at < 0)) {
        // 归属标签已关闭，或该段在等待期间被删除/淘汰：
        // 本次落盘的块已无归属，逐块删除（await 完成，关闭路径的 await 链需覆盖它，
        // 否则 destroy 可能抢在删除完成前退出）后放弃写入索引。
        // 删除范围取「原段记录数」与「本次 written 数」的较大者：回卷（scrollback 溢出）
        // 后 seq 会归零重写，仅按 written.length 删会漏掉更高 seq 的旧块（磁盘孤儿）。
        await deleteChunksForSession(
          sessionId,
          0,
          Math.max(previousSegment?.chunks.length ?? 0, written.length),
        );
        // 连同采集器一起丢弃：其 written 元信息现已悬空（指向刚删的块），
        // 会话若仍在输出，下一次采集会以全新采集器从当前缓冲重新封块。
        collectorsRef.current.delete(sessionId);
        throttledRef.current.delete(sessionId);
        return;
      }
      if (!flushed) {
        // 落盘失败：水位未推进，保留 live 让 30s 检查点/下次关闭重试；
        // 已定稿条目（live:false）则原样不动，避免把“已完成”翻回进行中。
        if (at >= 0 && segments[at].live) {
          const retry = segments.slice();
          // 失败时 written 可能为空（例如采集器刚被重建且尚未封块）：
          // 此时保留既有 chunks meta，避免把元信息抹空（重启剪枝会让磁盘块成孤儿）。
          retry[at] = {
            ...retry[at],
            endedAt: Date.now(),
            chunks: written.length > 0 ? written : segments[at].chunks,
          };
          historyIndexRef.current.set(ownerTabId, retry);
          persistHistoryIndex();
        } else if (at < 0) {
          upsertHistoryEntry(sessionId, written, {
            ownerTabId,
            skipBudget: options?.skipBudget,
          });
        }
        return;
      }
      if (written.length === 0) {
        if (at >= 0) {
          // 该会话本次没有任何可落盘内容（如采集器被重建且缓冲为空），
          // 段被丢弃前先删掉它记录的块，避免无索引可达的磁盘孤儿。
          await deleteChunksForSession(sessionId, 0, segments[at].chunks.length);
          // 删除是异步 IPC：期间索引可能被并发改写（结算删段 / 检查点追加），
          // 必须重新取一次再改，否则会把这期间的更新整体覆盖掉。
          const latest = historyIndexRef.current.get(ownerTabId) ?? [];
          const latestAt = latest.findIndex((s) => s.sessionId === sessionId);
          if (latestAt >= 0) {
            const next = latest.filter((_, i) => i !== latestAt);
            if (next.length > 0) {
              historyIndexRef.current.set(ownerTabId, next);
            } else {
              historyIndexRef.current.delete(ownerTabId);
            }
            persistHistoryIndex();
          }
        }
        return;
      }
      // endedAt：live 段在定稿时冻结为当前时刻（Math.max 防时钟回拨）；
      // 已定稿段（live:false）必须保留原结束时间——关闭路径的 flushAllHistories
      // 会把本次运行内所有已结束会话再走一遍 finalize（采集器与 sessionId 都还在），
      // 若无条件取 Date.now()，所有历史分隔条都会被改写成应用关闭时刻。
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
      historyIndexRef.current.set(ownerTabId, updated);
      persistHistoryIndex();
      // 段定稿后按用户偏好重新结算预算（fire-and-forget；不阻塞 beforeunload / 关闭路径）。
      // 关闭/卸载路径传 skipBudget 跳过结算（见下文 flushAllHistories 的说明）。
      if (!options?.skipBudget) {
        void settleHistoryBudget();
      }
    },
    [
      collectorFor,
      deleteChunksForSession,
      ensureHistoryIndexLoaded,
      persistHistoryIndex,
      settleHistoryBudget,
      upsertHistoryEntry,
    ],
  );

  /** 应用启动：残留的 live 段其 PTY 必然已随进程退出而死 → 定稿；空段直接剪枝 */
  const finalizeStaleSegments = useCallback(() => {
    ensureHistoryIndexLoaded();
    let changed = false;
    for (const [tabId, segments] of historyIndexRef.current) {
      const next = segments
        .filter((s) => s.chunks.length > 0)
        .map((s) => (s.live ? { ...s, live: false } : s));
      if (next.length !== segments.length || next.some((s, i) => s !== segments[i])) {
        if (next.length > 0) {
          historyIndexRef.current.set(tabId, next);
        } else {
          historyIndexRef.current.delete(tabId);
        }
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
        // 等待容器出现且完成布局：React batching 可能导致 XtermTerminal 尚未 mount
        // （querySelector 返回 null），或已挂载但尚未布局（零尺寸，此时量出的
        // 列数极小，会 baked 进 shell 排版与采集快照，且事后无法修复）。
        // 帧数 + 墙钟双上限：面板隐藏/窗口最小化时 rAF 会被节流甚至暂停，
        // 只数帧会让本函数长时间挂起；超时即回退 80×24（后续 fit→PTY resize 会纠正）。
        const deadline = performance.now() + 1000;
        let container: HTMLElement | null = null;
        for (let frame = 0; frame < 60; frame++) {
          const candidate = document.querySelector('.adl-terminal-canvas');
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
          // rAF 与定时器赛跑：窗口被系统暂停时 rAF 完全不触发，
          // 只等 rAF 会让这个 await 永久挂起（墙钟 deadline 也就永远检查不到）。
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
          // 直接测量容器尺寸，不创建临时 pool entry
          // （临时 entry 会导致 DOM 中有两个重叠的 hostEl，干扰布局）
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
        // 出生尺寸同步给池：XtermTerminal 挂载时 acquire 消费，保证池几何
        // 与 PTY 从出生就一致（采集读池 buffer，shell 按 PTY 排版）。
        terminalXtermPool.setBirthDims(sessionId, cols, rows);
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

  // 30 秒周期检查点：收集冻结行并把未满块也封块落盘（小会话无需等 64KiB 上限；
  // 节流路径保持 collect-only，避免高频碎块；安静期至少落盘一次）。
  // 只轮询**仍在存活**的会话：已结束会话的标签仍持有 sessionId 且 xterm 缓冲还在池里，
  // 若继续检查点，其采集器可能已被预算淘汰删掉 → 新建采集器从缓冲 row 0 重封 →
  // push 出一个 live 段（live 段永不参与淘汰）→ 已淘汰的历史被"复活"、预算失效。
  useEffect(() => {
    const interval = setInterval(() => {
      const sessionIds = sessionIdsKey ? sessionIdsKey.split('|') : [];
      for (const sessionId of sessionIds) {
        if (!liveSessionIdsRef.current.has(sessionId)) {
          continue;
        }
        void persistCheckpoint(sessionId);
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [sessionIdsKey, persistCheckpoint]);

  /**
   * 关闭前把全部未定稿会话 flush+定稿（视口尾部也落盘）。
   * 候选 = 索引中 live 段 ∪ 归属标签仍在但从未入索引的采集器会话（小会话可能一次都没 persist 过）。
   */
  const flushAllHistories = useCallback(async () => {
    ensureHistoryIndexLoaded();
    const pending = new Set<string>();
    historyIndexRef.current.forEach((segments) => {
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
    collectorsRef.current.forEach((_collector, sessionId) => {
      if (ownedSessionIds.has(sessionId)) {
        pending.add(sessionId);
      }
    });
    for (const sessionId of pending) {
      try {
        // 逐会话跳过预算结算：关闭路径只有 5s 预算，且结算一旦被 destroy 截断会留下
        // 指向已删块的索引；淘汰统一交给下次启动的 finalizeStaleSegments。
        await finalizeSegment(sessionId, { skipBudget: true });
      } catch (err) {
        // 关闭定稿失败即尾部丢失：记一条生产错误日志（常驻，非临时调试日志），
        // 单会话失败不阻断其余会话，5s 超时兜底防卡死。
        console.error('terminal history close flush failed', {
          sessionId,
          error: String(err),
        });
      }
    }
    // 关闭路径不做预算结算（逐会话 skipBudget + 此处不再统一结算）：
    // 结算先删块、再写索引，被紧随其后的 destroy 截断会让索引指向已删块
    // （下次启动显示「内容不可用」）。超预算的淘汰交给下次启动时
    // finalizeStaleSegments 的那次结算（应用正在运行，不会被截断）。
  }, [ensureHistoryIndexLoaded, finalizeSegment]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      // fire-and-forget 的 finalize 未必赶得上（save 是异步 IPC），但已落盘块的
      // 元信息必须先进索引：先同步 upsert 当前 written，再同步落盘去抖写入，
      // 重启后索引与已封块一致。视口尾部与本次未封块仍是 best-effort：
      // 浏览器无异步等待 API，尾部丢失是已知限制，由 30s 检查点兜底
      // （最多丢 30s 输出 + 视口尾；Tauri 走 onCloseRequested 可靠路径，不受此限）。
      collectorsRef.current.forEach((collector, sessionId) => {
        // 同关闭路径：两处都跳过预算结算（结算先删块再写索引，被进程退出截断会留下
        // 指向已删块的索引），淘汰交给下次启动的 finalizeStaleSegments。
        upsertHistoryEntry(sessionId, collector.getWrittenChunks(), { skipBudget: true });
        void finalizeSegment(sessionId, { skipBudget: true });
      });
      // 同步落盘去抖中的 localStorage 写入（标签、历史索引等），
      // 否则重启后标签与历史索引丢失。
      flushCrossSliceWrites();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [finalizeSegment, upsertHistoryEntry]);

  // Tauri 可靠关闭：拦截关闭后先 hide() 让窗口瞬间消失（WebView JS 继续运行），
  // 后台 await 历史落盘完成再 destroy() 彻底退出（超时兜底防卡死）。
  // 用 destroy() 而非 close()：前者不再触发 closeRequested（无重入），且 capabilities 已配 allow-destroy。
  // 浏览器无异步等待 API，保持 beforeunload best-effort + 30s 检查点兜底（行为一致，实现不同）。
  useEffect(() => {
    if (!isTauriShell()) {
      return;
    }
    let active = true;
    let unlisten: (() => void) | undefined;
    // 关闭处理只能跑一次：短时间内重复关闭请求（连按 Alt+F4/关闭按钮）会并发
    // 触发两轮「hide → flush → destroy」，重复落盘且可能与 destroy 交错。
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
              // 隐藏失败则降级为冻结等待落盘（体验退化但功能仍成）：记生产错误日志。
              console.error('terminal history close hide failed', {
                error: String(err),
              });
            }
            try {
              // 超时兜底：到点即放行退出。命中超时说明仍有会话未落盘（尾部会丢），
              // 必须留下日志，否则只能靠用户事后发现历史缺尾。
              let timedOut = false;
              await Promise.race([
                flushAllHistories(),
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
              // 同步落盘去抖中的 localStorage 写入（历史索引、标签等），再彻底退出；
              // 否则 destroy 会抢在 idle 回调前杀死渲染进程，重启后历史全空。
              flushCrossSliceWrites();
              try {
                await win.destroy();
              } catch (err) {
                // destroy 失败：窗口已被 hide 且 closeRequested 已 preventDefault，
                // 若不恢复可见性用户只能从任务管理器结束进程 —— 回退 show()，
                // 并复位 closing 标志，否则后续关闭请求会被重入守卫吞掉，应用再也关不上。
                console.error('terminal history close destroy failed', {
                  error: String(err),
                });
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
    return () => {
      active = false;
      unlisten?.();
    };
  }, [flushAllHistories]);

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
        // 会话结束即定稿（flush 封块 + live=false）：历史无需等到应用重启才可见。
        void finalizeSegment(event.sessionId);
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
  }, [activeRightTool, persistTabCwds, collectThrottled, terminalUpdateTab, finalizeSegment]);

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
    const all = historyIndexRef.current.get(tabId) ?? [];
    return all.filter((s) => !s.live);
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
