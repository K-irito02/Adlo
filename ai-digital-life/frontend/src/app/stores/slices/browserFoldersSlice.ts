import type { StoreState } from '../StoreState';
import { createUiId, createDebouncedWrite } from '../shared';
import { formatNewFolderNameByLocale } from '../../i18n';
import type { BrowserTabState } from './browserTabsSlice';

export interface TabFolderState {
  id: string;
  name: string;
  createdAt: number;
  isUserCreated?: boolean;
  tabs?: string[];
  children?: TabFolderState[];
  parentId?: string;
  parentType?: 'workspace' | 'folder';
}

export interface TabFolderStateUpdate {
  name?: string;
  tabs?: string[];
}

const BROWSER_TAB_FOLDERS_KEY = 'adl-ui:browser-tab-folders';
const BROWSER_TREE_EXPANDED_KEY = 'adl-ui:browser-tab-tree-expanded';
const BROWSER_WORKSPACE_EXPANDED_KEY = 'adl-ui:browser-workspace-expanded';
const BROWSER_TABS_KEY = 'adl-ui:browser-tabs';
const BROWSER_ACTIVE_TAB_KEY = 'adl-ui:browser-active-tab';
const BROWSER_HISTORY_KEY = 'adl-ui:browser-history';
const BROWSER_WORKSPACE_BOOKMARKS_KEY = 'adl-ui:browser-workspace-bookmarks';

const { scheduleWrite } = createDebouncedWrite(50);

function findFolderById(folders: TabFolderState[], folderId: string): TabFolderState | null {
  return folders.find((folder) => folder.id === folderId) || null;
}

function collectAllDescendantFolderIds(folders: TabFolderState[], parentId: string): string[] {
  const result: string[] = [];
  const directChildren = folders.filter((f) => f.parentId === parentId);
  for (const child of directChildren) {
    result.push(child.id);
    result.push(...collectAllDescendantFolderIds(folders, child.id));
  }
  return result;
}

function buildTabsById(tabs: BrowserTabState[]): Record<string, BrowserTabState> {
  const result: Record<string, BrowserTabState> = {};
  for (const tab of tabs) {
    result[tab.id] = tab;
  }
  return result;
}

export const BROWSER_TAB_FOLDERS_STORAGE_KEY = BROWSER_TAB_FOLDERS_KEY;
export const BROWSER_TREE_EXPANDED_STORAGE_KEY = BROWSER_TREE_EXPANDED_KEY;
export const BROWSER_WORKSPACE_EXPANDED_STORAGE_KEY = BROWSER_WORKSPACE_EXPANDED_KEY;

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
      const nextFolders = state.browserTabFolders.map((folder) => {
        if (folder.id === folderId) {
          const existingTabs = folder.tabs || [];
          if (!existingTabs.includes(tabId)) {
            return {
              ...folder,
              tabs: [...existingTabs, tabId],
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

      if (nodePath.startsWith('workspace:')) {
        const wsId = nodePath.slice('workspace:'.length);
        tabIdsToDelete = state.browserTabs.filter((t) => t.workspaceId === wsId).map((t) => t.id);
      } else if (nodePath.startsWith('folder:')) {
        const folderId = nodePath.slice('folder:'.length);
        const folder = findFolderById(state.browserTabFolders, folderId);
        if (folder) {
          tabIdsToDelete = folder.tabs ?? [];
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

      if (tabIdsToDelete.length === 0) {
        return state;
      }

      if (nodePath.startsWith('history:')) {
        const nextHistory = state.browserHistory.filter((h) => !tabIdsToDelete.includes(h.id));
        scheduleWrite(BROWSER_HISTORY_KEY, nextHistory);
        return { browserHistory: nextHistory };
      }

      const nextTabs = state.browserTabs.filter((t) => !tabIdsToDelete.includes(t.id));
      const nextActive = tabIdsToDelete.includes(state.browserActiveTabId)
        ? (nextTabs[nextTabs.length - 1]?.id ?? state.browserActiveTabId)
        : state.browserActiveTabId;

      let nextWorkspaceBookmarks = state.browserWorkspaceBookmarks;
      if (nodePath.startsWith('workspace:')) {
        const wsId = nodePath.slice('workspace:'.length);
        if (nextWorkspaceBookmarks[wsId]) {
          nextWorkspaceBookmarks = { ...nextWorkspaceBookmarks };
          delete nextWorkspaceBookmarks[wsId];
          scheduleWrite(BROWSER_WORKSPACE_BOOKMARKS_KEY, nextWorkspaceBookmarks);
        }
      }

      let nextFolders = state.browserTabFolders;
      if (nodePath.startsWith('folder:')) {
        const folderId = nodePath.slice('folder:'.length);
        nextFolders = nextFolders.map((f) => (f.id === folderId ? { ...f, tabs: [] } : f));
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

  setBrowserWorkspaceExpanded: (expanded) => {
    scheduleWrite(BROWSER_WORKSPACE_EXPANDED_KEY, expanded);
    set({ browserWorkspaceExpanded: expanded });
  },
});
