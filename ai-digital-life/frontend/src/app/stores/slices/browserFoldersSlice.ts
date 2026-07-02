import type { StoreState } from '../StoreState';
import { createUiId, createDebouncedWrite } from '../shared';
import { formatNewFolderNameByLocale } from '@i18n';
import type { TabFolderState, TabFolderStateUpdate } from './browserFoldersTypes';
import {
  collectAllDescendantFolderIds,
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
import { computeDeleteAllTabsOutcome, computeDeleteOwnTabsOutcome } from './browserFoldersDeletion';

// Re-export types and public storage keys to preserve the public API
export type { BookmarkTabItem, TabFolderState, TabFolderStateUpdate } from './browserFoldersTypes';
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
      const outcome = computeDeleteAllTabsOutcome(state, nodePath);
      if (outcome.partial === null) {
        return state;
      }
      if (outcome.wsChanged) {
        scheduleWrite(BROWSER_WORKSPACE_BOOKMARKS_KEY, outcome.partial.browserWorkspaceBookmarks);
      }
      if (outcome.foldersChanged) {
        scheduleWrite(BROWSER_TAB_FOLDERS_KEY, outcome.partial.browserTabFolders);
      }
      if (outcome.tabsChanged) {
        scheduleWrite(BROWSER_TABS_KEY, outcome.partial.browserTabs);
        scheduleWrite(BROWSER_ACTIVE_TAB_KEY, outcome.partial.browserActiveTabId);
      }
      if (outcome.historyChanged) {
        scheduleWrite(BROWSER_HISTORY_KEY, outcome.partial.browserHistory);
      }
      return outcome.partial;
    }),

  browserDeleteOwnTabsInNode: (nodePath) =>
    set((state) => {
      const outcome = computeDeleteOwnTabsOutcome(state, nodePath);
      if (outcome.partial === null) {
        return state;
      }
      if (outcome.wsChanged) {
        scheduleWrite(BROWSER_WORKSPACE_BOOKMARKS_KEY, outcome.partial.browserWorkspaceBookmarks);
      }
      if (outcome.foldersChanged) {
        scheduleWrite(BROWSER_TAB_FOLDERS_KEY, outcome.partial.browserTabFolders);
      }
      if (outcome.tabsChanged) {
        scheduleWrite(BROWSER_TABS_KEY, outcome.partial.browserTabs);
        scheduleWrite(BROWSER_ACTIVE_TAB_KEY, outcome.partial.browserActiveTabId);
      }
      if (outcome.historyChanged) {
        scheduleWrite(BROWSER_HISTORY_KEY, outcome.partial.browserHistory);
      }
      return outcome.partial;
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
