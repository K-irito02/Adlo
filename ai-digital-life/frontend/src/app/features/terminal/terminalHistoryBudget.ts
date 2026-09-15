// src/app/features/terminal/terminalHistoryBudget.ts
import type { TerminalHistorySegment } from './terminalHistoryStore';

// 与 shared/defaultPreferences.ts 的 DEFAULT_TERMINAL_HISTORY_BUDGET_BYTES 是同一默认值，
// 但 shared/ 不能 import app/features/，故在此重复定义。改动默认值时两处必须同步。
export const TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES = 1 << 30;
export const TERMINAL_HISTORY_BUDGET_FOLLOW_DISK = 0;
export const TERMINAL_HISTORY_DISK_RESERVE_BYTES = 1 << 30;
export const TERMINAL_HISTORY_MIN_SEGMENTS_KEPT = 20;

// 设置界面（存储组内的「终端历史磁盘预算」）的预设档位与换算。1 GiB = 1 << 30，
// 与偏好默认值口径一致；放在本模块而非组件文件，避免 Fast Refresh 的「组件文件只导出组件」限制。
export const budgetOptionsGb = [1, 2, 5, 10, 20];

export function budgetBytesFromGb(gb: number): number {
  return gb * (1 << 30);
}

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
 * 从磁盘快照里取「可用空间」字节数：优先系统盘（Windows 的 C:），取不到回退第一块盘；无快照返回 null。
 * 用结构类型而非导入 SystemSnapshot，避免 shared/ 与 app/features/ 的耦合。
 */
export function diskAvailableBytesFrom(
  disks?: { mount: string; available: number }[],
): number | null {
  if (!disks || disks.length === 0) {
    return null;
  }
  const system = disks.find((d) => /^C:/i.test(d.mount.trim()));
  const chosen = system ?? disks[0];
  return chosen.available;
}

/**
 * 淘汰：按 endedAt 升序（最旧优先）逐段删除，直到剩余总量 ≤ 预算。
 * 只作用于已结束的段；**总是跳过最近 20 段**（安全阀，避免磁盘将满时清空历史）。
 *
 * 为什么按段而不是按块：按块淘汰会让「一段历史只剩后半截」变成常态，
 * 而这正是本次要消除的现象形态。
 *
 * 为什么不需要「单段自身超预算就丢头部块」的二级淘汰：单段被索引引用的内容
 * 结构性地被 xterm 的 scrollback 环封顶（`TERMINAL_CAPTURE_SCROLLBACK_LINES` 行；
 * 每次回卷都整体重采并覆盖 `seq` 从 0 起），实测约 0.5–5 MB/段 —— 要顶破 1 GiB
 * 默认预算（或 FOLLOW_DISK 的剩余空间预算）需要几百个段，那已由上面的按段淘汰覆盖。
 * 如果将来放宽「单段上限」（例如允许不设环的连续采集），需要重新引入按块淘汰，
 * 并同步改造块键（键由数组下标推导，丢头部块会让下标与 seq 错位，需引入首块偏移）。
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
