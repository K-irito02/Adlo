import { makePersistedWriter, readJson } from '@stores/storageHelpers';

/**
 * 按**标签 id** 持久化「历史分段索引」：该标签历次 PTY 会话的 sessionId 列表（旧 → 新）。
 *
 * 为什么按标签而不是按会话：应用重启后旧会话已被 kill、会话 id 会变，而标签 id 稳定不变。
 * 每段终端内容本身由 `terminalOutputStore` 按 sessionId 保存；本索引只记录
 * 「该标签下有过哪些段、顺序如何、何时归档」，供历史视图按序回放。
 *
 * 与旧实现的区别：以前历史是「注入到实时终端缓冲区里」才得以跨重启累积；
 * 那正是坐标系错位的根因。现在历史只读、独立渲染，累积靠本索引显式串联。
 */
export const TERMINAL_HISTORY_INDEX_KEY = 'adl-terminal:history-index';

/** 一段历史：一次已结束的 PTY 会话 */
export interface TerminalHistorySegment {
  sessionId: string;
  /** 归档时间：下次启动时把该段并入历史的那一刻，用于分隔条时间戳 */
  archivedAt: number;
}

/** 最多保留的历史段数（越多则重启时要加载/回放的段越多，旧段会被裁剪并删除快照） */
export const MAX_HISTORY_SEGMENTS = 5;

const scheduleWrite = makePersistedWriter(TERMINAL_HISTORY_INDEX_KEY);

/**
 * 归一化持久化读出的索引：丢弃结构非法的标签条目与段条目。
 *
 * 索引来自 localStorage，可能被手改/损坏；`archivedAt` 非有限数字会让
 * 分隔条渲染成 `NaN:NaN:NaN`，`sessionId` 非字符串则会打错快照 —— 一律在边界挡掉。
 */
export function normalizeHistoryIndex(raw: unknown): Record<string, TerminalHistorySegment[]> {
  const source = (raw ?? {}) as Record<string, unknown>;
  const result: Record<string, TerminalHistorySegment[]> = {};
  for (const [tabId, value] of Object.entries(source)) {
    if (!Array.isArray(value)) {
      continue;
    }
    const segments = value.filter(
      (segment): segment is TerminalHistorySegment =>
        !!segment &&
        typeof segment === 'object' &&
        typeof (segment as TerminalHistorySegment).sessionId === 'string' &&
        typeof (segment as TerminalHistorySegment).archivedAt === 'number' &&
        Number.isFinite((segment as TerminalHistorySegment).archivedAt),
    );
    if (segments.length > 0) {
      result[tabId] = segments;
    }
  }
  return result;
}

export const terminalHistoryStore = {
  loadAll(): Record<string, TerminalHistorySegment[]> {
    return normalizeHistoryIndex(readJson<unknown>(TERMINAL_HISTORY_INDEX_KEY, {}));
  },
  saveAll(map: Record<string, TerminalHistorySegment[]>): void {
    scheduleWrite(map);
  },
};
