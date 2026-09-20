import type { StoreState } from '../StoreState';
import { createUiId, makePersistedWriter } from '../shared';
import { persist } from '../persisted/persist';
import { formatNewFolderNameByLocale } from '@i18n';
import type { TabFolderState, TabFolderStateUpdate } from './browserFoldersTypes';
import {
  collectAllDescendantFolderIds,
  BROWSER_WORKSPACE_EXPANDED_KEY,
} from './browserFoldersUtils';
import { computeDeleteAllTabsOutcome, computeDeleteOwnTabsOutcome } from './browserFoldersDeletion';

// Re-export types and the still-legacy storage key to preserve the public API.
// 注意（Task 9）：除 `browser-workspace-expanded` 外的浏览器持久化键均已迁移到
// persisted/registry（`adl:browser.*`），其遗留常量与 STORAGE_KEY 别名已删除。
export type { BookmarkTabItem, TabFolderState, TabFolderStateUpdate } from './browserFoldersTypes';
export { BROWSER_WORKSPACE_EXPANDED_STORAGE_KEY } from './browserFoldersUtils';

// 死状态（无消费者，Task 20 删除）：尚未登记，暂保留遗留写盘通道与字面量，
// 其键由 PERSIST_KEEP_KEYS 保护。迁移完成前不得改道 persist()（未登记键无登记表类型）。
const writeWorkspaceExpanded = makePersistedWriter(BROWSER_WORKSPACE_EXPANDED_KEY);

export interface BrowserFoldersSlice {
  browserTabFolders: TabFolderState[];
  browserTabTreeExpanded: Record<string, boolean>;
  browserWorkspaceExpanded: Record<string, boolean>;

  browserCreateTabFolder: (
    name?: string,
    parentId?: string,
    parentType?: 'workspace' | 'folder',
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
  _get: () => StoreState,
): BrowserFoldersSlice => ({
  browserTabFolders: [],
  browserTabTreeExpanded: {},
  browserWorkspaceExpanded: {},

  browserCreateTabFolder: async (
    name?: string,
    parentId?: string,
    parentType?: 'workspace' | 'folder',
  ) => {
    const folderCount = _get().browserTabFolders.length;
    const locale = (_get().appInfo?.config.language ?? 'zh-CN') as 'zh-CN' | 'en-US';
    const folderName = name?.trim() || (await formatNewFolderNameByLocale(locale, folderCount + 1));
    set((state) => {
      const newFolder: TabFolderState = {
        id: createUiId('tab-folder'),
        name: folderName,
        createdAt: Date.now(),
        isUserCreated: true,
        parentId: parentId,
        parentType: parentType as 'workspace' | 'folder' | undefined,
      };
      const resultFolders = [...state.browserTabFolders, newFolder];
      persist('adl:browser.tabFolders', resultFolders);
      return { browserTabFolders: resultFolders };
    });
  },

  browserUpdateTabFolder: (folderId, patch) =>
    set((state) => {
      const nextFolders = state.browserTabFolders.map((folder) => {
        if (folder.id === folderId) {
          return { ...folder, ...patch };
        }
        return folder;
      });
      persist('adl:browser.tabFolders', nextFolders);
      return { browserTabFolders: nextFolders };
    }),

  browserDeleteTabFolder: (folderId) =>
    set((state) => {
      const idsToDelete = [
        folderId,
        ...collectAllDescendantFolderIds(state.browserTabFolders, folderId),
      ];
      const nextFolders = state.browserTabFolders.filter(
        (folder) => !idsToDelete.includes(folder.id),
      );
      persist('adl:browser.tabFolders', nextFolders);
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
      persist('adl:browser.tabFolders', nextFolders);
      return { browserTabFolders: nextFolders };
    });
  },

  browserToggleTabTreePath: (path) =>
    set((state) => {
      const next = {
        ...state.browserTabTreeExpanded,
        [path]: !(state.browserTabTreeExpanded[path] ?? false),
      };
      persist('adl:browser.tabTreeExpanded', next);
      return { browserTabTreeExpanded: next };
    }),

  browserCollapseAllTreePaths: () =>
    set((_state) => {
      persist('adl:browser.tabTreeExpanded', {});
      return { browserTabTreeExpanded: {} };
    }),

  browserExpandAllTreePaths: (paths) =>
    set((_state) => {
      const next: Record<string, boolean> = {};
      for (const p of paths) {
        next[p] = true;
      }
      persist('adl:browser.tabTreeExpanded', next);
      return { browserTabTreeExpanded: next };
    }),

  browserDeleteAllTabsInNode: (nodePath) =>
    set((state) => {
      const outcome = computeDeleteAllTabsOutcome(state, nodePath);
      if (outcome.partial === null) {
        return state;
      }
      if (outcome.wsChanged) {
        persist('adl:browser.workspaceBookmarks', outcome.partial.browserWorkspaceBookmarks!);
      }
      if (outcome.foldersChanged) {
        persist('adl:browser.tabFolders', outcome.partial.browserTabFolders!);
      }
      if (outcome.tabsChanged) {
        persist('adl:browser.tabs', outcome.partial.browserTabs!);
        persist('adl:browser.activeTabId', outcome.partial.browserActiveTabId!);
      }
      if (outcome.historyChanged) {
        persist('adl:browser.history', outcome.partial.browserHistory!);
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
        persist('adl:browser.workspaceBookmarks', outcome.partial.browserWorkspaceBookmarks!);
      }
      if (outcome.foldersChanged) {
        persist('adl:browser.tabFolders', outcome.partial.browserTabFolders!);
      }
      if (outcome.tabsChanged) {
        persist('adl:browser.tabs', outcome.partial.browserTabs!);
        persist('adl:browser.activeTabId', outcome.partial.browserActiveTabId!);
      }
      if (outcome.historyChanged) {
        persist('adl:browser.history', outcome.partial.browserHistory!);
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

      persist('adl:browser.tabFolders', nextFolders);
      persist('adl:browser.bookmarks', nextBookmarks);
      persist('adl:browser.tabIdUrlMap', nextTabIdUrlMap);
      persist('adl:browser.workspaceBookmarks', nextWorkspaceBookmarks);
      return {
        browserTabFolders: nextFolders,
        browserBookmarks: nextBookmarks,
        browserBookmarkTabIdUrlMap: nextTabIdUrlMap,
        browserWorkspaceBookmarks: nextWorkspaceBookmarks,
      };
    });
  },

  setBrowserWorkspaceExpanded: (expanded) => {
    writeWorkspaceExpanded(expanded);
    set({ browserWorkspaceExpanded: expanded });
  },
});
