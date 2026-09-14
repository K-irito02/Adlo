// src/app/features/terminal/terminalHistoryBudget.ts
import type { TerminalHistorySegment } from './terminalHistoryStore';

export const TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES = 1 << 30;
export const TERMINAL_HISTORY_BUDGET_FOLLOW_DISK = 0;
export const TERMINAL_HISTORY_DISK_RESERVE_BYTES = 1 << 30;
export const TERMINAL_HISTORY_MIN_SEGMENTS_KEPT = 20;

export function segmentLines(seg: TerminalHistorySegment): number {
  return seg.chunks.reduce((sum, c) => sum + c.lines, 0);
}

export function segmentBytes(seg: TerminalHistorySegment): number {
  return seg.chunks.reduce((sum, c) => sum + c.size, 0);
}

/**
 * 有效预算。
 * settingBytes === 0 表示「跟随磁盘剩余空间」：预算 = 磁盘可用 − 1 GiB 安全余量，下限 0。
 * 拿不到磁盘信息（null）时回退默认预算，不阻塞结算。
 */
export function effectiveBudgetBytes(
  settingBytes: number,
  diskAvailableBytes: number | null,
): number {
  if (settingBytes !== TERMINAL_HISTORY_BUDGET_FOLLOW_DISK) {
    return settingBytes;
  }
  if (diskAvailableBytes === null) {
    return TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES;
  }
  return Math.max(0, diskAvailableBytes - TERMINAL_HISTORY_DISK_RESERVE_BYTES);
}

/**
 * 一级淘汰：按 endedAt 升序（最旧优先）逐段删除，直到剩余总量 ≤ 预算。
 * 只作用于已结束的段；**总是跳过最近 20 段**（安全阀，避免磁盘将满时清空历史）。
 *
 * 为什么按段而不是按块：按块淘汰会让「一段历史只剩后半截」变成常态，
 * 而这正是本次要消除的现象形态。
 */
export function selectSegmentsToEvict(
  segments: { tabId: string; seg: TerminalHistorySegment }[],
  budgetBytes: number,
): { tabId: string; sessionId: string }[] {
  const ended = segments
    .filter((s) => !s.seg.live)
    .slice()
    .sort((a, b) => a.seg.endedAt - b.seg.endedAt);
  const evictable = ended.slice(0, Math.max(0, ended.length - TERMINAL_HISTORY_MIN_SEGMENTS_KEPT));

  let total = segments.reduce((sum, s) => sum + segmentBytes(s.seg), 0);
  const out: { tabId: string; sessionId: string }[] = [];
  for (const entry of evictable) {
    if (total <= budgetBytes) {
      break;
    }
    total -= segmentBytes(entry.seg);
    out.push({ tabId: entry.tabId, sessionId: entry.seg.sessionId });
  }
  return out;
}

/**
 * 二级淘汰（最后手段）：一级淘汰后仍超预算（单段自身就很大），
 * 对最旧段从头部丢弃若干块。**至少保留最后一块**，不允许把一段清空成零块。
 */
export function selectLeadingChunksToEvict(
  oldest: TerminalHistorySegment,
  overflowBytes: number,
): number {
  let freed = 0;
  let dropped = 0;
  const max = Math.max(0, oldest.chunks.length - 1);
  while (dropped < max && freed < overflowBytes) {
    freed += oldest.chunks[dropped].size;
    dropped += 1;
  }
  return dropped;
}
