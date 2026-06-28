/**
 * 浏览器清理辅助函数
 * 从 workspaceActions.ts 提取的纯函数和类型
 */
import type {
  BrowserTabState,
  TabFolderState,
  WorkspaceBookmarkEntry,
} from '../slices/browserSlice';

export interface BrowserCleanupResult {
  browserTabs: BrowserTabState[];
  browserTabsById: Record<string, BrowserTabState>;
  browserTabFolders: TabFolderState[];
  browserWorkspaceExpanded: Record<string, boolean>;
  browserWorkspaceBookmarks: Record<string, WorkspaceBookmarkEntry[]>;
  browserActiveTabId: string;
}

/**
 * Pure helper: drop a workspace from the in-memory browser state. Used both
 * by `cleanupRemovedWorkspaceTree` and by tests. No localStorage writes
 * here — callers handle persistence.
 */
export function stripWorkspaceFromBrowserState(
  workspaceId: string,
  currentTabs: BrowserTabState[],
  currentFolders: TabFolderState[],
  currentExpanded: Record<string, boolean>,
  currentWorkspaceBookmarks: Record<string, WorkspaceBookmarkEntry[]>,
  currentActiveTabId: string
): BrowserCleanupResult {
  const browserTabs = currentTabs.filter((t) => t.workspaceId !== workspaceId);
  const browserTabFolders = currentFolders.filter(
    (f) => !(f.parentType === 'workspace' && f.parentId === workspaceId)
  );
  const browserWorkspaceExpanded: Record<string, boolean> = { ...currentExpanded };
  delete browserWorkspaceExpanded[workspaceId];

  const { [workspaceId]: _omit, ...browserWorkspaceBookmarks } = currentWorkspaceBookmarks;

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
    browserTabFolders,
    browserWorkspaceExpanded,
    browserWorkspaceBookmarks,
    browserActiveTabId,
  };
}
