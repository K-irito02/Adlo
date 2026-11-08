/**
 * 浏览器清理辅助函数
 * 从 workspaceActions.ts 提取的纯函数和类型
 */
import type { BrowserTabState, BookmarkFolder } from '../slices/browserSlice';

export interface BrowserCleanupResult {
  browserTabs: BrowserTabState[];
  browserTabsById: Record<string, BrowserTabState>;
  browserBookmarkFolders: BookmarkFolder[];
  browserActiveTabId: string;
}

/**
 * Pure helper: drop a workspace from the in-memory browser state. Used both
 * by `cleanupRemovedWorkspaceTree` and by tests. No localStorage writes
 * here — callers handle persistence.
 *
 * 按工作区隔离的收藏（browserWorkspaceBookmarks）不在此处处理 —— 归
 * `applyWorkspaceRemoved` 统一剔除（内存 + 落盘），此处不得重复写。
 */
export function stripWorkspaceFromBrowserState(
  workspaceId: string,
  currentTabs: BrowserTabState[],
  currentFolders: BookmarkFolder[],
  currentActiveTabId: string,
): BrowserCleanupResult {
  // 中心标签不受面板「移除工作区」影响：只移除该工作区的面板标签。
  const browserTabs = currentTabs.filter(
    (t) => t.location === 'center' || t.workspaceId !== workspaceId,
  );
  const browserBookmarkFolders = currentFolders.filter(
    (f) => !(f.parentType === 'workspace' && f.parentId === workspaceId),
  );

  const browserTabsById: Record<string, BrowserTabState> = {};
  for (const t of browserTabs) {
    browserTabsById[t.id] = t;
  }

  const browserActiveTabId = browserTabs.find((t) => t.id === currentActiveTabId)
    ? currentActiveTabId
    : (browserTabs[browserTabs.length - 1]?.id ?? '');

  return {
    browserTabs,
    browserTabsById,
    browserBookmarkFolders,
    browserActiveTabId,
  };
}
