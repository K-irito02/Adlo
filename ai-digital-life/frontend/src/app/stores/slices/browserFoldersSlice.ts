import type { StoreState } from '../StoreState';
import { createUiId, createDebouncedWrite } from '../shared';
import { formatNewFolderNameByLocale } from '@i18n';
import type { TabFolderState, TabFolderStateUpdate } from './browserFoldersTypes';
import {
  findFolderById,
  collectAllDescendantFolderIds,
  collectAllDescendantTabIds,
  collectAllFolderTabIds,
  buildTabsById,
  BROWSER_TAB_FOLDERS_KEY,
  BROWSER_TREE_EXPANDED_KEY,
  BROWSER_WORKSPACE_EXPANDED_KEY,
  BROWSER_TABS_KEY,
  BROWSER_ACTIVE_TAB_KEY,
  BROWSER_HISTORY_KEY,
  BROWSER_WORKSPACE_BOOKMARKS_KEY,
} from './browserFoldersUtils';
import {
  BROWSER_BOOKMARKS_STORAGE_KEY,
  BROWSER_BOOKMARK_TABID_URL_MAP_KEY,
} from './browserSliceShared';

// Re-export types and public storage keys to preserve the public API
export type {
  BookmarkTabItem,
  TabFolderState,
  TabFolderStateUpdate,
} from './browserFoldersTypes';
export {
  BROWSER_TAB_FOLDERS_STORAGE_KEY,
  BROWSER_TREE_EXPANDED_STORAGE_KEY,
  BROWSER_WORKSPACE_EXPANDED_STORAGE_KEY,
} from './browserFoldersUtils';

const { scheduleWrite } = createDebouncedWrite(50);

export interface BrowserFoldersSlice {
  browserTabFolders: TabFolderState[];
  browserTabTreeExpanded: Record<string, boolean>;
  browserWorkspaceExpanded: Record<string, boolean>;

  browserCreateTabFolder: (
    name?: string,
    parentId?: string,
    parentType?: 'workspace' | 'folder'
  ) => void;
  browserUpdateTabFolder: (folderId: string, patch: Partial<TabFolderStateUpdate>) => void;
  browserDeleteTabFolder: (folderId: string) => void;
  browserAddToFolder: (tabId: string, folderId: string) => void;
  browserToggleTabTreePath: (path: string) => void;
  browserCollapseAllTreePaths: () => void;
  browserExpandAllTreePaths: (paths: string[]) => void;
  browserDeleteAllTabsInNode: (nodePath: string) => void;
  browserDeleteOwnTabsInNode: (nodePath: string) => void;
  browserClearAllFolderTabs: () => void;
  setBrowserWorkspaceExpanded: (expanded: Record<string, boolean>) => void;
}

export const createBrowserFoldersSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): BrowserFoldersSlice => ({
  browserTabFolders: [],
  browserTabTreeExpanded: {},
  browserWorkspaceExpanded: {},

  browserCreateTabFolder: (name?: string, parentId?: string, parentType?: 'workspace' | 'folder') =>
    set((state) => {
      const folderCount = state.browserTabFolders.length;
      const locale = state.appInfo?.config.language === 'en-US' ? 'en-US' : 'zh-CN';
      const folderName = name?.trim() || formatNewFolderNameByLocale(locale, folderCount + 1);
      const newFolder: TabFolderState = {
        id: createUiId('tab-folder'),
        name: folderName,
        createdAt: Date.now(),
        isUserCreated: true,
        parentId: parentId,
        parentType: parentType as 'workspace' | 'folder' | undefined,
      };
      const resultFolders = [...state.browserTabFolders, newFolder];
      scheduleWrite(BROWSER_TAB_FOLDERS_KEY, resultFolders);
      return { browserTabFolders: resultFolders };
    }),

  browserUpdateTabFolder: (folderId, patch) =>
    set((state) => {
      const nextFolders = state.browserTabFolders.map((folder) => {
        if (folder.id === folderId) {
          return { ...folder, ...patch };
        }
        return folder;
      });
      scheduleWrite(BROWSER_TAB_FOLDERS_KEY, nextFolders);
      return { browserTabFolders: nextFolders };
    }),

  browserDeleteTabFolder: (folderId) =>
    set((state) => {
      const idsToDelete = [
        folderId,
        ...collectAllDescendantFolderIds(state.browserTabFolders, folderId),
      ];
      const nextFolders = state.browserTabFolders.filter(
        (folder) => !idsToDelete.includes(folder.id)
      );
      scheduleWrite(BROWSER_TAB_FOLDERS_KEY, nextFolders);
      return { browserTabFolders: nextFolders };
    }),

  browserAddToFolder: (tabId, folderId) => {
    set((state) => {
      const tab = state.browserTabs.find((t) => t.id === tabId);
      const url = tab?.url || '';
      const title = tab?.title || url;
      const nextFolders = state.browserTabFolders.map((folder) => {
        if (folder.id === folderId) {
          const existingTabs = folder.tabs || [];
          if (!existingTabs.some((item) => item.tabId === tabId)) {
            return {
              ...folder,
              tabs: [...existingTabs, { tabId, url, title }],
            };
          }
        }
        return folder;
      });
      scheduleWrite(BROWSER_TAB_FOLDERS_KEY, nextFolders);
      return { browserTabFolders: nextFolders };
    });
  },

  browserToggleTabTreePath: (path) =>
    set((state) => {
      const next = {
        ...state.browserTabTreeExpanded,
        [path]: !(state.browserTabTreeExpanded[path] ?? false),
      };
      scheduleWrite(BROWSER_TREE_EXPANDED_KEY, next);
      return { browserTabTreeExpanded: next };
    }),

  browserCollapseAllTreePaths: () =>
    set((_state) => {
      scheduleWrite(BROWSER_TREE_EXPANDED_KEY, {});
      return { browserTabTreeExpanded: {} };
    }),

  browserExpandAllTreePaths: (paths) =>
    set((_state) => {
      const next: Record<string, boolean> = {};
      for (const p of paths) {
        next[p] = true;
      }
      scheduleWrite(BROWSER_TREE_EXPANDED_KEY, next);
      return { browserTabTreeExpanded: next };
    }),

  browserDeleteAllTabsInNode: (nodePath) =>
    set((state) => {
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
        tabIdsToDelete = state.browserHistory
          .filter((h) => {
            const d = new Date(h.visitedAt);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dy = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${dy}` === dayDate;
          })
          .map((h) => h.id);
      }

      // Handle workspace bookmark deletion before early return — even when there are
      // no open tabs or folder structures, workspace-level bookmarks must be removed.
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
          scheduleWrite(BROWSER_WORKSPACE_BOOKMARKS_KEY, nextWorkspaceBookmarks);
          return { browserWorkspaceBookmarks: nextWorkspaceBookmarks };
        }
        return state;
      }

      if (nodePath.startsWith('history:')) {
        const nextHistory = state.browserHistory.filter((h) => !tabIdsToDelete.includes(h.id));
        scheduleWrite(BROWSER_HISTORY_KEY, nextHistory);
        return { browserHistory: nextHistory };
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
      if (folderIdsToClear.length > 0) {
        nextFolders = nextFolders.map((f) =>
          folderIdsToClear.includes(f.id) && f.tabs ? { ...f, tabs: [] } : f
        );
        scheduleWrite(BROWSER_TAB_FOLDERS_KEY, nextFolders);
      }

      if (wsChanged) {
        scheduleWrite(BROWSER_WORKSPACE_BOOKMARKS_KEY, nextWorkspaceBookmarks);
      }
      scheduleWrite(BROWSER_TABS_KEY, nextTabs);
      scheduleWrite(BROWSER_ACTIVE_TAB_KEY, nextActive);
      return {
        browserTabs: nextTabs,
        browserTabsById: buildTabsById(nextTabs),
        browserActiveTabId: nextActive,
        browserWorkspaceBookmarks: nextWorkspaceBookmarks,
        browserTabFolders: nextFolders,
      };
    }),

  browserDeleteOwnTabsInNode: (nodePath) =>
    set((state) => {
      let tabIdsToDelete: string[] = [];
      let wsBookmarkTabIds: string[] | null = null;

      if (nodePath.startsWith('workspace:')) {
        const wsId = nodePath.slice('workspace:'.length);
        const allWsTabIds = state.browserTabs
          .filter((t) => t.workspaceId === wsId)
          .map((t) => t.id);
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
        tabIdsToDelete = state.browserHistory
          .filter((h) => {
            const d = new Date(h.visitedAt);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dy = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${dy}` === dayDate;
          })
          .map((h) => h.id);
      }

      if (tabIdsToDelete.length === 0 && (!wsBookmarkTabIds || wsBookmarkTabIds.length === 0)) {
        return state;
      }

      if (nodePath.startsWith('history:')) {
        const nextHistory = state.browserHistory.filter((h) => !tabIdsToDelete.includes(h.id));
        scheduleWrite(BROWSER_HISTORY_KEY, nextHistory);
        return { browserHistory: nextHistory };
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
          scheduleWrite(BROWSER_WORKSPACE_BOOKMARKS_KEY, nextWorkspaceBookmarks);
        }
      }

      let nextFolders = state.browserTabFolders;
      if (isFolderPath) {
        const folderId = nodePath.slice('folder:'.length);
        nextFolders = nextFolders.map((f) => {
          if (f.id === folderId && f.tabs) {
            return { ...f, tabs: [] };
          }
          return f;
        });
        scheduleWrite(BROWSER_TAB_FOLDERS_KEY, nextFolders);
      }

      scheduleWrite(BROWSER_TABS_KEY, nextTabs);
      scheduleWrite(BROWSER_ACTIVE_TAB_KEY, nextActive);
      return {
        browserTabs: nextTabs,
        browserTabsById: buildTabsById(nextTabs),
        browserActiveTabId: nextActive,
        browserWorkspaceBookmarks: nextWorkspaceBookmarks,
        browserTabFolders: nextFolders,
      };
    }),

  browserClearAllFolderTabs: () => {
    set((state) => {
      const allTabIds: string[] = [];
      const allUrls: string[] = [];
      for (const folder of state.browserTabFolders) {
        if (folder.tabs) {
          for (const item of folder.tabs) {
            allTabIds.push(item.tabId);
            if (item.url && !allUrls.includes(item.url)) {
              allUrls.push(item.url);
            }
          }
        }
      }

      let nextBookmarks = state.browserBookmarks;
      let nextWorkspaceBookmarks = state.browserWorkspaceBookmarks;
      let nextTabIdUrlMap = state.browserBookmarkTabIdUrlMap;

      const urlSet = new Set(allUrls);
      nextBookmarks = nextBookmarks.filter((b) => !urlSet.has(b.url));

      const tabIdSet = new Set(allTabIds);
      nextTabIdUrlMap = { ...nextTabIdUrlMap };
      for (const tid of allTabIds) {
        delete nextTabIdUrlMap[tid];
      }

      nextWorkspaceBookmarks = { ...nextWorkspaceBookmarks };
      for (const wsId of Object.keys(nextWorkspaceBookmarks)) {
        const entries = nextWorkspaceBookmarks[wsId];
        const remaining = entries.filter((entry) => !tabIdSet.has(entry.tabId));
        if (remaining.length === 0) {
          delete nextWorkspaceBookmarks[wsId];
        } else {
          nextWorkspaceBookmarks[wsId] = remaining;
        }
      }

      const nextFolders = state.browserTabFolders.map((f) => {
        if (f.tabs && f.tabs.length > 0) {
          return { ...f, tabs: [] };
        }
        return f;
      });

      scheduleWrite(BROWSER_TAB_FOLDERS_KEY, nextFolders);
      scheduleWrite(BROWSER_BOOKMARKS_STORAGE_KEY, nextBookmarks);
      scheduleWrite(BROWSER_BOOKMARK_TABID_URL_MAP_KEY, nextTabIdUrlMap);
      scheduleWrite(BROWSER_WORKSPACE_BOOKMARKS_KEY, nextWorkspaceBookmarks);
      return {
        browserTabFolders: nextFolders,
        browserBookmarks: nextBookmarks,
        browserBookmarkTabIdUrlMap: nextTabIdUrlMap,
        browserWorkspaceBookmarks: nextWorkspaceBookmarks,
      };
    });
  },

  setBrowserWorkspaceExpanded: (expanded) => {
    scheduleWrite(BROWSER_WORKSPACE_EXPANDED_KEY, expanded);
    set({ browserWorkspaceExpanded: expanded });
  },
});
