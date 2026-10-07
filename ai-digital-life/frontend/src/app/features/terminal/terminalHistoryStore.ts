import { readJson } from '@stores/storageHelpers';

/**
 * 按**标签 id** 持久化「历史分段索引」：该标签历次 PTY 会话的 sessionId 列表（旧 → 新）。
 * 每段的行内容按**行块**存储，键为 `${sessionId}#${seq}`，值为 `HistoryChunk` 的 JSON。
 * 本索引只记录「有过哪些段、顺序如何、何时结束、每块的体积与行数」。
 */
export const TERMINAL_HISTORY_INDEX_KEY = 'adl:terminal.historyIndex';

/** 单个行块的元信息 */
export interface TerminalHistoryChunkMeta {
  /** 该块采集时的屏幕行数 */
  lines: number;
  /** 该块 JSON 的 UTF-8 字节数 */
  size: number;
}

/** 一段历史：一次已结束的 PTY 会话 */
export interface TerminalHistorySegment {
  sessionId: string;
  /** 该会话最后一次有活动的时刻；分隔符显示它 */
  endedAt: number;
  /** true = 会话仍在进行中 → 只读历史区不渲染它 */
  live: boolean;
  /** 每块的元信息，**下标即 seq**；段的总行数与总体积都是它的聚合值 */
  chunks: TerminalHistoryChunkMeta[];
}

/** 块级存储键：复用既有 `terminalOutput` 的 `sessionId: string` 契约，不新增 IPC */
export function chunkKey(sessionId: string, seq: number): string {
  return `${sessionId}#${seq}`;
}

/**
 * 回卷（scrollback 溢出）后需要清理的「陈旧块」区间。
 *
 * 回卷时采集器把 `seq` 归零并从当前缓冲重采，磁盘键 `[0, nextCount)` 被新内容覆盖；
 * 上一代若更长（`previousCount > nextCount`），`[nextCount, previousCount)` 就没有任何
 * 索引引用它了——只能在这里删掉，否则是预算统计不到、删除路径也碰不到的磁盘孤儿。
 */
export function staleChunkRange(
  previousCount: number,
  nextCount: number,
): { start: number; count: number } {
  return { start: nextCount, count: Math.max(0, previousCount - nextCount) };
}

function isChunkMeta(value: unknown): value is TerminalHistoryChunkMeta {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const meta = value as TerminalHistoryChunkMeta;
  return (
    typeof meta.lines === 'number' &&
    Number.isFinite(meta.lines) &&
    typeof meta.size === 'number' &&
    Number.isFinite(meta.size)
  );
}

/**
 * 归一化持久化读出的索引：丢弃结构非法的标签条目与段条目。
 * 只做**边界校验**，不做旧格式迁移（项目规则：未发布产品禁止兼容层）。
 */
export function normalizeHistoryIndex(raw: unknown): Record<string, TerminalHistorySegment[]> {
  const source = (raw ?? {}) as Record<string, unknown>;
  const result: Record<string, TerminalHistorySegment[]> = {};
  for (const [tabId, value] of Object.entries(source)) {
    if (!Array.isArray(value)) {
      continue;
    }
    const segments = value.filter((segment): segment is TerminalHistorySegment => {
      if (!segment || typeof segment !== 'object') {
        return false;
      }
      const s = segment as TerminalHistorySegment;
      return (
        typeof s.sessionId === 'string' &&
        typeof s.endedAt === 'number' &&
        Number.isFinite(s.endedAt) &&
        typeof s.live === 'boolean' &&
        Array.isArray(s.chunks) &&
        // 空段无任何可渲染行，只会产出孤立日期分隔符，直接丢弃
        s.chunks.length > 0 &&
        s.chunks.every(isChunkMeta)
      );
    });
    if (segments.length > 0) {
      result[tabId] = segments;
    }
  }
  return result;
}

// 模块级缓存：historyIndex 登记项已随本批次移除，hydrateAll 不再接入本模块，
// 缓存可能始终为空。loadAll 必须按需读一次存储再返回缓存（沿用 ensureHistoryIndexLoaded 思路），
// 否则 TerminalHistoryBudgetSection 的 useMemo 统计已用字节会显示 0。
// （本模块整体在后续任务中删除。）
let cache: Record<string, TerminalHistorySegment[]> = {};
let loaded = false;

export const terminalHistoryStore = {
  loadAll(): Record<string, TerminalHistorySegment[]> {
    if (!loaded) {
      cache = normalizeHistoryIndex(readJson<unknown>(TERMINAL_HISTORY_INDEX_KEY, {}));
      loaded = true;
    }
    return cache;
  },
  /** 构造期水合汇聚器 */
  apply(value: Record<string, TerminalHistorySegment[]>): void {
    cache = value;
    loaded = true;
  },
};
