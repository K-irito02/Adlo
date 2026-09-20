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

/**
 * 单次返回的默认上限（首屏与"加载更多"的步长）。
 *
 * **跨语言契约**：必须与后端 `crates/workspace/src/search.rs` 的
 * `MAX_SEARCH_RESULTS` 同值；两侧单测均把该值钉到 200，任一侧单独改动都会失败。
 */
export const SEARCH_PAGE_SIZE = 200;
/**
 * "显示全部"的默认目标：单次请求可返回的最大命中数（用户未自定义时）。
 *
 * **跨语言契约**：必须与后端 `search.rs` 的 `MAX_SEARCH_RESULTS_UNLIMITED` 同值
 * （前端于 `normalizeSearchWindow` 钳制、后端于 `SearchWindow::clamped` 钳制）。
 */
export const SEARCH_MAX_RESULTS = 5000;
/**
 * 硬上限：用户自定义也不得超过的值（>5000 时 UI 出卡顿警告）。
 *
 * **跨语言契约**：必须与后端 `search.rs` 的 `MAX_SEARCH_RESULTS_HARD_CAP` 同值；
 * 两侧单测均把该值钉到 20000。
 */
export const SEARCH_HARD_MAX_RESULTS = 20000;
/** 步长/上限输入框的合法区间（步长至少 50，避免无意义小步进）。 */
export const SEARCH_PAGE_SIZE_MIN = 50;
export const SEARCH_PAGE_SIZE_MAX = 1000;

export interface NormalizedSearchWindow {
  offset: number;
  limit: number;
}

/** 钳制到合法区间：`limit = 0` 视为 1，超过硬上限即夹到硬上限。 */
export function normalizeSearchWindow(window?: WorkspaceSearchWindow): NormalizedSearchWindow {
  const rawOffset = Math.floor(window?.offset ?? 0);
  const rawLimit = Math.floor(window?.limit ?? SEARCH_PAGE_SIZE);
  return {
    offset: Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0,
    limit: Number.isFinite(rawLimit)
      ? Math.min(SEARCH_HARD_MAX_RESULTS, Math.max(1, rawLimit))
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
