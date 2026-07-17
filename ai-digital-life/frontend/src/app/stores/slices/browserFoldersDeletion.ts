/**
 * Browser Folders 删除操作纯函数
 * 从 browserFoldersSlice.ts 提取的删除计算逻辑（无 store 访问、无副作用、无持久化）。
 *
 * Slice 仅负责调用 set() 与 scheduleWrite()；本模块只接收状态切片与参数，
 * 返回下一状态切片及变更标志，便于 slice 决定持久化范围。
 */
import type { BrowserTabState } from './browserSliceShared';
import type { TabFolderState } from './browserFoldersTypes';
import type { BrowserHistoryState } from './browserHistorySlice';
import type { WorkspaceBookmarkEntry } from './browserTypes';
import {
  findFolderById,
  collectAllDescendantFolderIds,
  collectAllDescendantTabIds,
  collectAllFolderTabIds,
  buildTabsById,
} from './browserFoldersUtils';

/** Subset of StoreState needed by folder deletion helpers. */
export interface BrowserFoldersDeletionState {
  browserTabs: BrowserTabState[];
  browserActiveTabId: string;
  browserTabFolders: TabFolderState[];
  browserWorkspaceBookmarks: Record<string, WorkspaceBookmarkEntry[]>;
  browserHistory: BrowserHistoryState[];
}

/** Computed outcome of a delete operation. */
export interface DeleteTabsOutcome {
  /**
   * Partial state to merge via set(). `null` means no change — slice should
   * return state unchanged.
   */
  partial: Partial<{
    browserTabs: BrowserTabState[];
    browserTabsById: Record<string, BrowserTabState>;
    browserActiveTabId: string;
    browserWorkspaceBookmarks: Record<string, WorkspaceBookmarkEntry[]>;
    browserTabFolders: TabFolderState[];
    browserHistory: BrowserHistoryState[];
  }> | null;
  /** Whether browserWorkspaceBookmarks changed and needs persistence. */
  wsChanged: boolean;
  /** Whether browserTabFolders changed and needs persistence. */
  foldersChanged: boolean;
  /** Whether browserTabs / browserActiveTabId need persistence. */
  tabsChanged: boolean;
  /** Whether browserHistory changed and needs persistence. */
  historyChanged: boolean;
}

/** Compute tab ids belonging to a specific history day (YYYY-MM-DD). */
function computeHistoryDayTabIds(history: BrowserHistoryState[], dayDate: string): string[] {
  return history
    .filter((h) => {
      const d = new Date(h.visitedAt);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dy = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dy}` === dayDate;
    })
    .map((h) => h.id);
}

/**
 * Compute the next state for `browserDeleteAllTabsInNode`.
 *
 * Pure: does not touch the store, call any persistence layer, or generate
 * non-deterministic values.
 */
export function computeDeleteAllTabsOutcome(
  state: BrowserFoldersDeletionState,
  nodePath: string
): DeleteTabsOutcome {
  let tabIdsToDelete: string[] = [];
  const folderIdsToClear: string[] = [];

  if (nodePath.startsWith('workspace:')) {
    const wsId = nodePath.slice('workspace:'.length);
    tabIdsToDelete = state.browserTabs.filter((t) => t.workspaceId === wsId).map((t) => t.id);
    const wsRootFolders = state.browserTabFolders.filter(
      (f) => f.parentType === 'workspace' && f.parentId === wsId
    );
    for (const rootFolder of wsRootFolders) {
      folderIdsToClear.push(
        rootFolder.id,
        ...collectAllDescendantFolderIds(state.browserTabFolders, rootFolder.id)
      );
    }
  } else if (nodePath.startsWith('folder:')) {
    const folderId = nodePath.slice('folder:'.length);
    const folder = findFolderById(state.browserTabFolders, folderId);
    if (folder) {
      const descendantTabIds = collectAllDescendantTabIds(state.browserTabFolders, folderId);
      tabIdsToDelete = [...(folder.tabs ?? []).map((item) => item.tabId), ...descendantTabIds];
      folderIdsToClear.push(
        folderId,
        ...collectAllDescendantFolderIds(state.browserTabFolders, folderId)
      );
    }
  } else if (nodePath.startsWith('history:day:')) {
    const dayDate = nodePath.slice('history:day:'.length);
    tabIdsToDelete = computeHistoryDayTabIds(state.browserHistory, dayDate);
  }

  // Workspace bookmark deletion must happen even when there are no open tabs
  // or folder structures — workspace-level bookmarks are removed unconditionally.
  let nextWorkspaceBookmarks = state.browserWorkspaceBookmarks;
  let wsChanged = false;
  if (nodePath.startsWith('workspace:')) {
    const wsId = nodePath.slice('workspace:'.length);
    if (nextWorkspaceBookmarks[wsId]) {
      nextWorkspaceBookmarks = { ...nextWorkspaceBookmarks };
      delete nextWorkspaceBookmarks[wsId];
      wsChanged = true;
    }
  }

  if (tabIdsToDelete.length === 0 && folderIdsToClear.length === 0) {
    if (wsChanged) {
      return {
        partial: { browserWorkspaceBookmarks: nextWorkspaceBookmarks },
        wsChanged,
        foldersChanged: false,
        tabsChanged: false,
        historyChanged: false,
      };
    }
    return {
      partial: null,
      wsChanged: false,
      foldersChanged: false,
      tabsChanged: false,
      historyChanged: false,
    };
  }

  if (nodePath.startsWith('history:')) {
    const nextHistory = state.browserHistory.filter((h) => !tabIdsToDelete.includes(h.id));
    return {
      partial: { browserHistory: nextHistory },
      wsChanged: false,
      foldersChanged: false,
      tabsChanged: false,
      historyChanged: true,
    };
  }

  const isFolderPath = nodePath.startsWith('folder:');
  const nextTabs = isFolderPath
    ? state.browserTabs
    : state.browserTabs.filter((t) => !tabIdsToDelete.includes(t.id));
  const nextActive = isFolderPath
    ? state.browserActiveTabId
    : tabIdsToDelete.includes(state.browserActiveTabId)
      ? (nextTabs[nextTabs.length - 1]?.id ?? state.browserActiveTabId)
      : state.browserActiveTabId;

  let nextFolders = state.browserTabFolders;
  let foldersChanged = false;
  if (folderIdsToClear.length > 0) {
    nextFolders = nextFolders.map((f) =>
      folderIdsToClear.includes(f.id) && f.tabs ? { ...f, tabs: [] } : f
    );
    foldersChanged = true;
  }

  return {
    partial: {
      browserTabs: nextTabs,
      browserTabsById: buildTabsById(nextTabs),
      browserActiveTabId: nextActive,
      browserWorkspaceBookmarks: nextWorkspaceBookmarks,
      browserTabFolders: nextFolders,
    },
    wsChanged,
    foldersChanged,
    tabsChanged: true,
    historyChanged: false,
  };
}

/**
 * Compute the next state for `browserDeleteOwnTabsInNode`.
 *
 * Pure: does not touch the store, call any persistence layer, or generate
 * non-deterministic values.
 */
export function computeDeleteOwnTabsOutcome(
  state: BrowserFoldersDeletionState,
  nodePath: string
): DeleteTabsOutcome {
  let tabIdsToDelete: string[] = [];
  let wsBookmarkTabIds: string[] | null = null;

  if (nodePath.startsWith('workspace:')) {
    const wsId = nodePath.slice('workspace:'.length);
    const allWsTabIds = state.browserTabs.filter((t) => t.workspaceId === wsId).map((t) => t.id);
    const folderTabIds = collectAllFolderTabIds(state.browserTabFolders, wsId);
    tabIdsToDelete = allWsTabIds.filter((id) => !folderTabIds.includes(id));
    // Collect workspace bookmark tabIds separately — they must NOT be in tabIdsToDelete
    // (which is used to filter browserTabs), because a bookmark entry may share the
    // same tabId as an open tab that is still active.
    const wsBookmarks = state.browserWorkspaceBookmarks[wsId];
    if (wsBookmarks) {
      wsBookmarkTabIds = [];
      for (const entry of wsBookmarks) {
        if (!tabIdsToDelete.includes(entry.tabId)) {
          wsBookmarkTabIds.push(entry.tabId);
        }
      }
    }
  } else if (nodePath.startsWith('folder:')) {
    const folderId = nodePath.slice('folder:'.length);
    const folder = findFolderById(state.browserTabFolders, folderId);
    if (folder) {
      tabIdsToDelete = [...(folder.tabs ?? []).map((item) => item.tabId)];
    }
  } else if (nodePath.startsWith('history:day:')) {
    const dayDate = nodePath.slice('history:day:'.length);
    tabIdsToDelete = computeHistoryDayTabIds(state.browserHistory, dayDate);
  }

  if (tabIdsToDelete.length === 0 && (!wsBookmarkTabIds || wsBookmarkTabIds.length === 0)) {
    return {
      partial: null,
      wsChanged: false,
      foldersChanged: false,
      tabsChanged: false,
      historyChanged: false,
    };
  }

  if (nodePath.startsWith('history:')) {
    const nextHistory = state.browserHistory.filter((h) => !tabIdsToDelete.includes(h.id));
    return {
      partial: { browserHistory: nextHistory },
      wsChanged: false,
      foldersChanged: false,
      tabsChanged: false,
      historyChanged: true,
    };
  }

  const isFolderPath = nodePath.startsWith('folder:');
  const nextTabs = isFolderPath
    ? state.browserTabs
    : state.browserTabs.filter((t) => !tabIdsToDelete.includes(t.id));
  const nextActive = isFolderPath
    ? state.browserActiveTabId
    : tabIdsToDelete.includes(state.browserActiveTabId)
      ? (nextTabs[nextTabs.length - 1]?.id ?? state.browserActiveTabId)
      : state.browserActiveTabId;

  let nextWorkspaceBookmarks = state.browserWorkspaceBookmarks;
  let wsChanged = false;
  if (nodePath.startsWith('workspace:')) {
    const wsId = nodePath.slice('workspace:'.length);
    const bookmarkedEntries = nextWorkspaceBookmarks[wsId];
    if (bookmarkedEntries) {
      // Filter using BOTH browser tab tabIds and workspace bookmark tabIds
      const allTabIds = wsBookmarkTabIds
        ? [...tabIdsToDelete, ...wsBookmarkTabIds]
        : tabIdsToDelete;
      const remaining = bookmarkedEntries.filter((entry) => !allTabIds.includes(entry.tabId));
      nextWorkspaceBookmarks = { ...nextWorkspaceBookmarks };
      if (remaining.length === 0) {
        delete nextWorkspaceBookmarks[wsId];
      } else {
        nextWorkspaceBookmarks[wsId] = remaining;
      }
      wsChanged = true;
    }
  }

  let nextFolders = state.browserTabFolders;
  let foldersChanged = false;
  if (isFolderPath) {
    const folderId = nodePath.slice('folder:'.length);
    nextFolders = nextFolders.map((f) => {
      if (f.id === folderId && f.tabs) {
        return { ...f, tabs: [] };
      }
      return f;
    });
    foldersChanged = true;
  }

  return {
    partial: {
      browserTabs: nextTabs,
      browserTabsById: buildTabsById(nextTabs),
      browserActiveTabId: nextActive,
      browserWorkspaceBookmarks: nextWorkspaceBookmarks,
      browserTabFolders: nextFolders,
    },
    wsChanged,
    foldersChanged,
    tabsChanged: true,
    historyChanged: false,
  };
}
