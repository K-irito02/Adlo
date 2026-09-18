import type {
  WorkspaceSearchHit,
  WorkspaceSearchPage,
  WorkspaceSearchWindow,
} from '@ai-digital-life/kernel';

/**
 * 检索分页的**前端单一来源**：窗口默认值、安全阀与切片语义都收在这里，
 * 供桥接端（mock / 浏览器预览）与 store 共用 —— 与后端 `adl_workspace::SearchWindow`
 * 保持同语义（跳过 offset、收 limit、多探一条判定 hasMore），避免各端各写一套而漂移。
 */

/** 单次返回的默认上限（首屏与"加载更多"的步长）。 */
export const SEARCH_PAGE_SIZE = 200;
/** "显示全部"的安全阀：单次请求可返回的最大命中数，与后端常量对齐。 */
export const SEARCH_MAX_RESULTS = 5000;

export interface NormalizedSearchWindow {
  offset: number;
  limit: number;
}

/** 钳制到合法区间：`limit = 0` 视为 1，超过安全阀即夹到安全阀。 */
export function normalizeSearchWindow(window?: WorkspaceSearchWindow): NormalizedSearchWindow {
  const rawOffset = Math.floor(window?.offset ?? 0);
  const rawLimit = Math.floor(window?.limit ?? SEARCH_PAGE_SIZE);
  return {
    offset: Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0,
    limit: Number.isFinite(rawLimit)
      ? Math.min(SEARCH_MAX_RESULTS, Math.max(1, rawLimit))
      : SEARCH_PAGE_SIZE,
  };
}

/** 按窗口切片：多取一条判定 `hasMore`（"恰好等于上限"不算被截断）。 */
export function paginateSearchHits(
  hits: WorkspaceSearchHit[],
  window?: WorkspaceSearchWindow,
): WorkspaceSearchPage {
  const { offset, limit } = normalizeSearchWindow(window);
  const page = hits.slice(offset, offset + limit);
  return { hits: page, hasMore: hits.length > offset + page.length };
}
