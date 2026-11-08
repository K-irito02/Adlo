/**
 * 浏览器书签删除操作纯函数
 * 从 browserFoldersSlice.ts 提取的删除计算逻辑（无 store 访问、无副作用、无持久化）。
 *
 * Slice 仅负责调用 set() 与 scheduleWrite()；本模块只接收状态切片与参数，
 * 返回下一状态切片及变更标志，便于 slice 决定持久化范围。
 *
 * 语义边界：书签是独立实体，删除书签**不会**删除浏览标签页；只有删除工作区节点
 * 时才会连带关闭该工作区的打开标签页。
 */
import type { BrowserTabState } from './browserSliceShared';
import type { BookmarkFolder, BookmarkEntry } from './browserFoldersTypes';
import type { BrowserHistoryState } from './browserHistorySlice';
import {
  findFolderById,
  collectAllDescendantFolderIds,
  collectWorkspaceFolderEntryIds,
  buildTabsById,
} from './browserFoldersUtils';

/** Subset of StoreState needed by folder deletion helpers. */
export interface BrowserBookmarksDeletionState {
  browserTabs: BrowserTabState[];
  browserActiveTabId: string;
  browserBookmarkFolders: BookmarkFolder[];
  browserWorkspaceBookmarks: Record<string, BookmarkEntry[]>;
  browserHistory: BrowserHistoryState[];
}

/** Computed outcome of a delete operation. */
export interface DeleteBookmarksOutcome {
  /**
   * Partial state to merge via set(). `null` means no change — slice should
   * return state unchanged.
   */
  partial: Partial<{
    browserTabs: BrowserTabState[];
    browserTabsById: Record<string, BrowserTabState>;
    browserActiveTabId: string;
    browserWorkspaceBookmarks: Record<string, BookmarkEntry[]>;
    browserBookmarkFolders: BookmarkFolder[];
    browserHistory: BrowserHistoryState[];
  }> | null;
  /** Whether browserWorkspaceBookmarks changed and needs persistence. */
  wsChanged: boolean;
  /** Whether browserBookmarkFolders changed and needs persistence. */
  foldersChanged: boolean;
  /** Whether browserTabs / browserActiveTabId need persistence. */
  tabsChanged: boolean;
  /** Whether browserHistory changed and needs persistence. */
  historyChanged: boolean;
}

const NOTHING_TRUNCATED = {
  foldersChanged: false,
  tabsChanged: false,
  historyChanged: false,
} as const;

/** Compute tab ids belonging to a specific history day (YYYY-MM-DD). */
function computeHistoryDayEntryIds(history: BrowserHistoryState[], dayDate: string): string[] {
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

/** 清空指定文件夹集合里的书签条目（保留目录本身）。 */
function clearFolderEntries(
  folders: BookmarkFolder[],
  folderIds: string[],
): { nextFolders: BookmarkFolder[]; changed: boolean } {
  let changed = false;
  const nextFolders = folders.map((folder) => {
    if (folderIds.includes(folder.id) && folder.entries && folder.entries.length > 0) {
      changed = true;
      return { ...folder, entries: [] };
    }
    return folder;
  });
  return { nextFolders, changed };
}

/** 删除工作区节点下的全部内容（打开标签页 + 工作区书签 + 目录内书签）。 */
export function computeDeleteAllBookmarksOutcome(
  state: BrowserBookmarksDeletionState,
  nodePath: string,
): DeleteBookmarksOutcome {
  if (nodePath.startsWith('history:day:')) {
    const dayDate = nodePath.slice('history:day:'.length);
    const removedIds = computeHistoryDayEntryIds(state.browserHistory, dayDate);
    if (removedIds.length === 0) {
      return { partial: null, wsChanged: false, ...NOTHING_TRUNCATED };
    }
    return {
      partial: { browserHistory: state.browserHistory.filter((h) => !removedIds.includes(h.id)) },
      wsChanged: false,
      foldersChanged: false,
      tabsChanged: false,
      historyChanged: true,
    };
  }

  if (nodePath.startsWith('folder:')) {
    const folderId = nodePath.slice('folder:'.length);
    const folder = findFolderById(state.browserBookmarkFolders, folderId);
    if (!folder) {
      return { partial: null, wsChanged: false, ...NOTHING_TRUNCATED };
    }
    const targetIds = [
      folderId,
      ...collectAllDescendantFolderIds(state.browserBookmarkFolders, folderId),
    ];
    const { nextFolders, changed } = clearFolderEntries(state.browserBookmarkFolders, targetIds);
    if (!changed) {
      return { partial: null, wsChanged: false, ...NOTHING_TRUNCATED };
    }
    return {
      partial: { browserBookmarkFolders: nextFolders },
      wsChanged: false,
      foldersChanged: true,
      tabsChanged: false,
      historyChanged: false,
    };
  }

  if (!nodePath.startsWith('workspace:')) {
    return { partial: null, wsChanged: false, ...NOTHING_TRUNCATED };
  }

  const wsId = nodePath.slice('workspace:'.length);
  const tabIdsToClose = state.browserTabs
    .filter((t) => t.workspaceId === wsId && t.location !== 'center')
    .map((t) => t.id);

  const wsRootFolderIds = state.browserBookmarkFolders
    .filter((f) => f.parentType === 'workspace' && f.parentId === wsId)
    .flatMap((root) => [
      root.id,
      ...collectAllDescendantFolderIds(state.browserBookmarkFolders, root.id),
    ]);
  const { nextFolders, changed: foldersChanged } = clearFolderEntries(
    state.browserBookmarkFolders,
    wsRootFolderIds,
  );

  let nextWorkspaceBookmarks = state.browserWorkspaceBookmarks;
  let wsChanged = false;
  if (nextWorkspaceBookmarks[wsId]) {
    nextWorkspaceBookmarks = { ...nextWorkspaceBookmarks };
    delete nextWorkspaceBookmarks[wsId];
    wsChanged = true;
  }

  if (tabIdsToClose.length === 0 && !wsChanged && !foldersChanged) {
    return { partial: null, wsChanged: false, ...NOTHING_TRUNCATED };
  }

  const nextTabs = state.browserTabs.filter((t) => !tabIdsToClose.includes(t.id));
  const nextActive = tabIdsToClose.includes(state.browserActiveTabId)
    ? (nextTabs[nextTabs.length - 1]?.id ?? state.browserActiveTabId)
    : state.browserActiveTabId;

  return {
    partial: {
      browserTabs: nextTabs,
      browserTabsById: buildTabsById(nextTabs),
      browserActiveTabId: nextActive,
      browserWorkspaceBookmarks: nextWorkspaceBookmarks,
      browserBookmarkFolders: nextFolders,
    },
    wsChanged,
    foldersChanged,
    tabsChanged: tabIdsToClose.length > 0,
    historyChanged: false,
  };
}

/** 只删除节点自身的直接子项，不递归到更深层目录。 */
export function computeDeleteOwnBookmarksOutcome(
  state: BrowserBookmarksDeletionState,
  nodePath: string,
): DeleteBookmarksOutcome {
  if (nodePath.startsWith('history:day:')) {
    const dayDate = nodePath.slice('history:day:'.length);
    const removedIds = computeHistoryDayEntryIds(state.browserHistory, dayDate);
    if (removedIds.length === 0) {
      return { partial: null, wsChanged: false, ...NOTHING_TRUNCATED };
    }
    return {
      partial: { browserHistory: state.browserHistory.filter((h) => !removedIds.includes(h.id)) },
      wsChanged: false,
      foldersChanged: false,
      tabsChanged: false,
      historyChanged: true,
    };
  }

  if (nodePath.startsWith('folder:')) {
    const folderId = nodePath.slice('folder:'.length);
    const folder = findFolderById(state.browserBookmarkFolders, folderId);
    if (!folder || !folder.entries || folder.entries.length === 0) {
      return { partial: null, wsChanged: false, ...NOTHING_TRUNCATED };
    }
    const { nextFolders } = clearFolderEntries(state.browserBookmarkFolders, [folderId]);
    return {
      partial: { browserBookmarkFolders: nextFolders },
      wsChanged: false,
      foldersChanged: true,
      tabsChanged: false,
      historyChanged: false,
    };
  }

  if (!nodePath.startsWith('workspace:')) {
    return { partial: null, wsChanged: false, ...NOTHING_TRUNCATED };
  }

  const wsId = nodePath.slice('workspace:'.length);
  // 「删除自己的子项」= 直接挂在工作区下的打开标签页与工作区书签，
  // 不含已经收进目录的部分。
  const folderEntryIds = new Set(
    collectWorkspaceFolderEntryIds(state.browserBookmarkFolders, wsId),
  );
  const directTabIds = state.browserTabs
    .filter((t) => t.workspaceId === wsId && t.location !== 'center')
    .map((t) => t.id);

  let nextWorkspaceBookmarks = state.browserWorkspaceBookmarks;
  let wsChanged = false;
  const bookmarkedEntries = nextWorkspaceBookmarks[wsId];
  if (bookmarkedEntries && bookmarkedEntries.length > 0) {
    const remaining = bookmarkedEntries.filter((entry) => !folderEntryIds.has(entry.id));
    nextWorkspaceBookmarks = { ...nextWorkspaceBookmarks };
    if (remaining.length === 0) {
      delete nextWorkspaceBookmarks[wsId];
    } else {
      nextWorkspaceBookmarks[wsId] = remaining;
    }
    wsChanged = remaining.length !== bookmarkedEntries.length;
    if (!wsChanged) {
      nextWorkspaceBookmarks = state.browserWorkspaceBookmarks;
    }
  }

  if (directTabIds.length === 0 && !wsChanged) {
    return { partial: null, wsChanged: false, ...NOTHING_TRUNCATED };
  }

  const nextTabs = state.browserTabs.filter((t) => !directTabIds.includes(t.id));
  const nextActive = directTabIds.includes(state.browserActiveTabId)
    ? (nextTabs[nextTabs.length - 1]?.id ?? state.browserActiveTabId)
    : state.browserActiveTabId;

  return {
    partial: {
      browserTabs: nextTabs,
      browserTabsById: buildTabsById(nextTabs),
      browserActiveTabId: nextActive,
      browserWorkspaceBookmarks: nextWorkspaceBookmarks,
    },
    wsChanged,
    foldersChanged: false,
    tabsChanged: directTabIds.length > 0,
    historyChanged: false,
  };
}
