import type { BrowserHistoryState } from './slices/browserTypes';

/** 历史保留上限：与 UI 手册「最多 1000 条」保持一致。 */
export const HISTORY_MAX_ENTRIES = 1000;
/** 历史保留天数：超过该天数的条目在启动/新增时自动清理。 */
export const HISTORY_RETENTION_DAYS = 180;
export const HISTORY_RETENTION_MS = HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * 历史保留策略（读写两侧共用）：先按 180 天窗口过滤，再截断到 1000 条。
 * 输入/输出均按「最新在前」；调用方负责维护顺序。
 */
export function pruneBrowserHistory(
  history: BrowserHistoryState[],
  now: number = Date.now(),
): BrowserHistoryState[] {
  const cutoff = now - HISTORY_RETENTION_MS;
  return history.filter((item) => item.visitedAt >= cutoff).slice(0, HISTORY_MAX_ENTRIES);
}
