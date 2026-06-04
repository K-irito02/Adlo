/**
 * 浏览器标签切片
 * 管理浏览器标签页等状态
 */
import type { StoreState } from '../StoreState';
import type { ToolId } from '../types';

export interface BrowserTabState {
  id: string;
  workspaceId: string;
  title: string;
  url: string;
  isPinned: boolean;
  pinnedAt?: number;
  sortOrder: number;
}

export interface BrowserTabStateUpdate {
  workspaceId?: string;
  title?: string;
  url?: string;
  isPinned?: boolean;
  pinnedAt?: number;
  sortOrder?: number;
}

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

export interface BrowserHistoryState {
  id: string;
  title: string;
  url: string;
  visitedAt: number;
}

export interface BrowserBookmark {
  url: string;
  title: string;
}

// Local storage keys
const BROWSER_TABS_KEY = 'adl-ui:browser-tabs';
const BROWSER_ACTIVE_TAB_KEY = 'adl-ui:browser-active-tab';
const BROWSER_NAVIGATOR_WIDTH_KEY = 'adl-ui:browser-navigator-width';
const BROWSER_NAVIGATOR_COLLAPSED_KEY = 'adl-ui:navigator-collapsed';
const BROWSER_WORKSPACE_EXPANDED_KEY = 'adl-ui:browser-workspace-expanded';
const BROWSER_TAB_FOLDERS_KEY = 'adl-ui:browser-tab-folders';
const BROWSER_VIEW_MODE_KEY = 'adl-ui:browser-view-mode';
const BROWSER_SHOW_TAB_BUTTONS_KEY = 'adl-ui:browser-show-tab-buttons';
const BROWSER_HISTORY_KEY = 'adl-ui:browser-history';
const BROWSER_BOOKMARKS_KEY = 'adl-ui:browser-bookmarks';
const BROWSER_TREE_EXPANDED_KEY = 'adl-ui:browser-tab-tree-expanded';

// Constants
const BROWSER_NAVIGATOR_WIDTH_MIN = 180;
const BROWSER_NAVIGATOR_WIDTH_MAX = 300;
const DEFAULT_BROWSER_NAVIGATOR_WIDTH = 240;

// Helper functions
import {
  clamp,
  readJson,
  writeJson,
  readNumber,
  writeNumber,
  createUiId,
  createDebouncedWrite,
} from '../shared';
import { formatNewFolderNameByLocale, getAppCopy } from '../../i18n';

function sortTabs(tabs: BrowserTabState[]): BrowserTabState[] {
  return [...tabs].sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    return a.sortOrder - b.sortOrder;
  });
}

function normalizeBrowserTabs(tabs: BrowserTabState[]): BrowserTabState[] {
  return tabs;
}

function buildTabsById(tabs: BrowserTabState[]): Record<string, BrowserTabState> {
  const result: Record<string, BrowserTabState> = {};
  for (const tab of tabs) {
    result[tab.id] = tab;
  }
  return result;
}

// 查找目录（扁平化存储）
function findFolderById(folders: TabFolderState[], folderId: string): TabFolderState | null {
  return folders.find((folder) => folder.id === folderId) || null;
}

// 收集所有子孙文件夹的 ID（用于级联删除）
function collectAllDescendantFolderIds(folders: TabFolderState[], parentId: string): string[] {
  const result: string[] = [];
  // 直接子文件夹
  const directChildren = folders.filter((f) => f.parentId === parentId);
  for (const child of directChildren) {
    result.push(child.id);
    // 递归收集孙子文件夹
    result.push(...collectAllDescendantFolderIds(folders, child.id));
  }
  return result;
}

function defaultNavigatorCollapsed(): Record<ToolId, boolean> {
  return {
    files: false,
    changes: false,
    browser: false,
    terminal: false,
    audit: false,
    settings: false,
    models: false,
  };
}

// Batch write scheduler — coalesces multiple localStorage writes into one
const { scheduleWrite, scheduleNumberWrite } = createDebouncedWrite(50);

// Lazy localStorage hydration — reads persisted values in idle time
let _defaultsHydrated = false;

function hydrateBrowserDefaults(
  get: () => StoreState,
  set: (partial: Partial<StoreState>) => void
): void {
  if (_defaultsHydrated) return;
  _defaultsHydrated = true;
  const doHydrate = () => {
    const state = get();

    const width = readNumber(
      BROWSER_NAVIGATOR_WIDTH_KEY,
      DEFAULT_BROWSER_NAVIGATOR_WIDTH,
      BROWSER_NAVIGATOR_WIDTH_MIN,
      BROWSER_NAVIGATOR_WIDTH_MAX
    );
    const collapsed = {
      ...defaultNavigatorCollapsed(),
      ...readJson<Record<ToolId, boolean>>(
        BROWSER_NAVIGATOR_COLLAPSED_KEY,
        defaultNavigatorCollapsed()
      ),
    };
    const workspaceExpanded = readJson<Record<string, boolean>>(BROWSER_WORKSPACE_EXPANDED_KEY, {});
    const persistedTabFolders = readJson<TabFolderState[]>(BROWSER_TAB_FOLDERS_KEY, []);

    let finalTabs = state.browserTabs;
    let finalActiveTabId = state.browserActiveTabId;

    const persistedTabs = readJson<BrowserTabState[]>(BROWSER_TABS_KEY, []);
    if (persistedTabs.length > 0) {
      finalTabs = persistedTabs;
      finalActiveTabId = readJson<string>(BROWSER_ACTIVE_TAB_KEY, '');
      if (!finalTabs.find((t) => t.id === finalActiveTabId)) {
        finalActiveTabId = finalTabs.length > 0 ? finalTabs[finalTabs.length - 1].id : '';
      }
    }

    const historyModified = state.browserHistory.length > 0;
    const finalHistory = historyModified
      ? state.browserHistory
      : readJson<BrowserHistoryState[]>(BROWSER_HISTORY_KEY, []);

    const bookmarksModified = state.browserBookmarks.length > 0;
    const finalBookmarks = bookmarksModified
      ? state.browserBookmarks
      : readJson<BrowserBookmark[]>(BROWSER_BOOKMARKS_KEY, []);

    const viewMode = readJson<'default' | 'tree' | 'list' | 'all'>(
      BROWSER_VIEW_MODE_KEY,
      'default'
    );
    const showTabButtons = readJson<boolean>(BROWSER_SHOW_TAB_BUTTONS_KEY, false);
    const persistedTabTreeExpanded = readJson<Record<string, boolean>>(
      BROWSER_TREE_EXPANDED_KEY,
      {}
    );

    set({
      browserNavigatorWidth: width,
      navigatorCollapsedByTool: collapsed,
      browserWorkspaceExpanded: workspaceExpanded,
      browserTabFolders: persistedTabFolders,
      browserHistory: finalHistory,
      browserBookmarks: finalBookmarks,
      browserTabs: finalTabs,
      browserTabsById: buildTabsById(finalTabs),
      browserActiveTabId: finalActiveTabId,
      browserViewMode: viewMode,
      browserShowTabButtons: showTabButtons,
      browserTabTreeExpanded: persistedTabTreeExpanded,
    });
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(doHydrate, { timeout: 1000 });
  } else {
    setTimeout(doHydrate, 200);
  }
}

// Type and slice definition
export interface BrowserSlice {
  browserTabs: BrowserTabState[];
  browserTabsById: Record<string, BrowserTabState>;
  browserActiveTabId: string;
  browserNavigatorWidth: number;
  navigatorCollapsedByTool: Record<ToolId, boolean>;
  browserWorkspaceExpanded: Record<string, boolean>;
  browserPersisted: boolean;
  browserWorkspaceId: string;
  browserTabFolders: TabFolderState[];
  browserHistory: BrowserHistoryState[];
  browserBookmarks: BrowserBookmark[];
  browserViewMode: 'default' | 'tree' | 'list' | 'all';
  browserShowTabButtons: boolean;
  browserTabTreeExpanded: Record<string, boolean>;

  browserOpenTab: (url?: string, title?: string, workspaceId?: string) => void;
  browserSelectTab: (tabId: string) => void;
  browserCloseTab: (tabId: string) => void;
  browserUpdateTab: (tabId: string, patch: Partial<BrowserTabStateUpdate>) => void;
  browserTogglePin: (tabId: string) => void;
  browserReorderTabs: (newOrder: BrowserTabState[]) => void;
  browserCloseAllTabs: (workspaceId?: string) => void;
  browserNavigateActiveTab: (url: string, title?: string) => void;
  setBrowserNavigatorWidth: (width: number) => void;
  toggleBrowserNavigator: () => void;
  setBrowserNavigatorCollapsed: (collapsed: boolean) => void;
  setBrowserWorkspaceExpanded: (expanded: Record<string, boolean>) => void;
  setBrowserPersisted: (persisted: boolean) => void;
  setBrowserWorkspaceId: (workspaceId: string) => void;
  browserCreateTabFolder: (
    name?: string,
    parentId?: string,
    parentType?: 'workspace' | 'folder'
  ) => void;
  browserUpdateTabFolder: (folderId: string, patch: Partial<TabFolderStateUpdate>) => void;
  browserDeleteTabFolder: (folderId: string) => void;
  browserAddToHistory: (url: string, title: string) => void;
  browserClearHistory: () => void;
  browserDeleteHistoryByLevel: (
    level: 'label' | 'year' | 'month' | 'day',
    nodePath: string
  ) => void;
  browserToggleBookmark: (input?: { url?: string; title?: string }) => void;
  setBrowserViewMode: (mode: 'default' | 'tree' | 'list' | 'all') => void;
  setBrowserShowTabButtons: (show: boolean) => void;
  browserBookmarkTab: (tabId: string, folderId?: string, newFolderName?: string) => void;
  browserAddToFolder: (tabId: string, folderId: string) => void;
  browserToggleTabTreePath: (path: string) => void;
  browserCollapseAllTreePaths: () => void;
  browserExpandAllTreePaths: (paths: string[]) => void;
  browserDeleteAllTabsInNode: (nodePath: string) => void;
}

export const createBrowserSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState
): BrowserSlice => {
  hydrateBrowserDefaults(get, set);
  return {
    browserTabs: [],
    browserTabsById: {},
    browserActiveTabId: '',
    browserNavigatorWidth: DEFAULT_BROWSER_NAVIGATOR_WIDTH,
    navigatorCollapsedByTool: defaultNavigatorCollapsed(),
    browserWorkspaceExpanded: {},
    browserPersisted: false,
    browserWorkspaceId: '',
    browserTabFolders: [],
    browserHistory: [],
    browserBookmarks: [],
    browserViewMode: 'default',
    browserShowTabButtons: false,
    browserTabTreeExpanded: {},

    browserOpenTab: (url?: string, title?: string, workspaceId: string = '') =>
      set((state) => {
        const maxSortOrder =
          state.browserTabs.length > 0 ? Math.max(...state.browserTabs.map((t) => t.sortOrder)) : 0;
        const tab: BrowserTabState = {
          id: createUiId('browser'),
          workspaceId,
          title: title?.trim() || getAppCopy(state.appInfo).browserDefaultTabTitle,
          url: url?.trim() || '',
          isPinned: false,
          sortOrder: maxSortOrder + 1,
        };
        const nextTabs = sortTabs([...state.browserTabs, tab]);
        scheduleWrite(BROWSER_TABS_KEY, nextTabs);
        scheduleWrite(BROWSER_ACTIVE_TAB_KEY, tab.id);
        return {
          browserTabs: nextTabs,
          browserTabsById: buildTabsById(nextTabs),
          browserActiveTabId: tab.id,
        };
      }),

    browserSelectTab: (tabId) => {
      scheduleWrite(BROWSER_ACTIVE_TAB_KEY, tabId);
      set({ browserActiveTabId: tabId });
    },

    browserCloseTab: (tabId) =>
      set((state) => {
        const filtered = state.browserTabs.filter((tab) => tab.id !== tabId);
        const nextTabs = sortTabs(filtered);
        const nextActive =
          state.browserActiveTabId === tabId
            ? (nextTabs[nextTabs.length - 1]?.id ?? '')
            : state.browserActiveTabId;

        scheduleWrite(BROWSER_TABS_KEY, nextTabs);
        scheduleWrite(BROWSER_ACTIVE_TAB_KEY, nextActive);
        return {
          browserTabs: nextTabs,
          browserTabsById: buildTabsById(nextTabs),
          browserActiveTabId: nextActive,
        };
      }),

    browserUpdateTab: (tabId, patch) =>
      set((state) => {
        const nextTabs = sortTabs(
          state.browserTabs.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab))
        );
        scheduleWrite(BROWSER_TABS_KEY, nextTabs);
        return { browserTabs: nextTabs, browserTabsById: buildTabsById(nextTabs) };
      }),

    browserTogglePin: (tabId) =>
      set((state) => {
        const nextTabs = sortTabs(
          state.browserTabs.map((tab) => {
            if (tab.id === tabId) {
              return {
                ...tab,
                isPinned: !tab.isPinned,
                pinnedAt: !tab.isPinned ? Date.now() : undefined,
              };
            }
            return tab;
          })
        );
        scheduleWrite(BROWSER_TABS_KEY, nextTabs);
        return { browserTabs: nextTabs, browserTabsById: buildTabsById(nextTabs) };
      }),

    browserReorderTabs: (newOrder) =>
      set((state) => {
        if (state.browserTabs === newOrder) return state;

        const pinnedTabs = newOrder.filter((t) => t.isPinned);
        const unpinnedTabs = newOrder.filter((t) => !t.isPinned);

        const reorderedWithSort = [...pinnedTabs, ...unpinnedTabs].map((tab, index) => ({
          ...tab,
          sortOrder: index,
        }));

        scheduleWrite(BROWSER_TABS_KEY, reorderedWithSort);
        return {
          browserTabs: reorderedWithSort,
          browserTabsById: buildTabsById(reorderedWithSort),
        };
      }),

    browserCloseAllTabs: (workspaceId) => {
      set((state) => {
        let nextTabs: BrowserTabState[];
        if (workspaceId) {
          nextTabs = state.browserTabs.filter((tab) => tab.workspaceId !== workspaceId);
        } else {
          nextTabs = [];
        }
        const nextActive = nextTabs.length > 0 ? nextTabs[nextTabs.length - 1].id : '';
        scheduleWrite(BROWSER_TABS_KEY, nextTabs);
        scheduleWrite(BROWSER_ACTIVE_TAB_KEY, nextActive);
        return {
          browserTabs: nextTabs,
          browserTabsById: buildTabsById(nextTabs),
          browserActiveTabId: nextActive,
        };
      });
    },

    browserNavigateActiveTab: (url: string, title?: string) => {
      set((state) => {
        let activeTab = state.browserTabs.find((tab) => tab.id === state.browserActiveTabId);
        let nextTabs = state.browserTabs;
        let nextActiveTabId = state.browserActiveTabId;

        if (!activeTab || nextTabs.length === 0) {
          // 如果没有活动标签页或没有标签页，创建一个新标签页
          const maxSortOrder =
            nextTabs.length > 0 ? Math.max(...nextTabs.map((t) => t.sortOrder)) : 0;
          const newTab: BrowserTabState = {
            id: createUiId('browser'),
            workspaceId: '',
            title: title?.trim() || url,
            url,
            isPinned: false,
            sortOrder: maxSortOrder + 1,
          };
          nextTabs = sortTabs([...nextTabs, newTab]);
          nextActiveTabId = newTab.id;
          activeTab = newTab;
          scheduleWrite(BROWSER_TABS_KEY, nextTabs);
          scheduleWrite(BROWSER_ACTIVE_TAB_KEY, nextActiveTabId);
        } else {
          // 更新现有标签页
          nextTabs = nextTabs.map((tab) => {
            if (tab.id === state.browserActiveTabId) {
              return {
                ...tab,
                url,
                title: title || tab.title,
              };
            }
            return tab;
          });
          scheduleWrite(BROWSER_TABS_KEY, nextTabs);
        }

        // 添加到历史记录
        const newHistoryItem: BrowserHistoryState = {
          id: createUiId('history'),
          url,
          title: title || url,
          visitedAt: Date.now(),
        };

        // 避免重复的历史记录
        const filteredHistory = state.browserHistory.filter((item) => item.url !== url);
        const nextHistory = [newHistoryItem, ...filteredHistory].slice(0, 100); // 最多保留 100 条历史记录

        scheduleWrite(BROWSER_HISTORY_KEY, nextHistory);

        return {
          browserTabs: nextTabs,
          browserTabsById: buildTabsById(nextTabs),
          browserActiveTabId: nextActiveTabId,
          browserHistory: nextHistory,
        };
      });
    },

    browserAddToHistory: (url: string, title: string) => {
      set((state) => {
        // 避免重复的历史记录
        const filteredHistory = state.browserHistory.filter((item) => item.url !== url);
        const newHistoryItem: BrowserHistoryState = {
          id: createUiId('history'),
          url,
          title: title || url,
          visitedAt: Date.now(),
        };
        const nextHistory = [newHistoryItem, ...filteredHistory].slice(0, 100); // 最多保留 100 条历史记录
        scheduleWrite(BROWSER_HISTORY_KEY, nextHistory);
        return { browserHistory: nextHistory };
      });
    },

    browserClearHistory: () => {
      scheduleWrite(BROWSER_HISTORY_KEY, []);
      set({ browserHistory: [] });
    },

    browserDeleteHistoryByLevel: (level, nodePath) => {
      set((state) => {
        let filtered: BrowserHistoryState[];
        if (level === 'label') {
          filtered = [];
        } else if (level === 'year') {
          const year = nodePath.replace('history:year:', '');
          filtered = state.browserHistory.filter((h) => {
            const d = new Date(h.visitedAt);
            return String(d.getFullYear()) !== year;
          });
        } else if (level === 'month') {
          const monthKey = nodePath.replace('history:month:', '');
          filtered = state.browserHistory.filter((h) => {
            const d = new Date(h.visitedAt);
            const y = String(d.getFullYear());
            const m = String(d.getMonth() + 1).padStart(2, '0');
            return `${y}-${m}` !== monthKey;
          });
        } else {
          const dayKey = nodePath.replace('history:day:', '');
          filtered = state.browserHistory.filter((h) => {
            const d = new Date(h.visitedAt);
            const y = String(d.getFullYear());
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dy = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${dy}` !== dayKey;
          });
        }
        scheduleWrite(BROWSER_HISTORY_KEY, filtered);
        return { browserHistory: filtered };
      });
    },

    browserToggleBookmark: (input?: { url?: string; title?: string }) => {
      set((state) => {
        const active =
          state.browserTabs.find((tab) => tab.id === state.browserActiveTabId) ??
          state.browserTabs[0];
        const url = input?.url?.trim() || active?.url || 'about:blank';
        const title = input?.title?.trim() || active?.title || url;
        const exists = state.browserBookmarks.some((bookmark) => bookmark.url === url);
        const nextBookmarks = exists
          ? state.browserBookmarks.filter((bookmark) => bookmark.url !== url)
          : [...state.browserBookmarks, { url, title }];

        // 如果是取消收藏，同时从所有文件夹中移除该标签
        let nextFolders = state.browserTabFolders;
        if (exists && active) {
          nextFolders = state.browserTabFolders.map((folder) => {
            if (folder.tabs && folder.tabs.includes(active.id)) {
              return {
                ...folder,
                tabs: folder.tabs.filter((tabId) => tabId !== active.id),
              };
            }
            return folder;
          });
          scheduleWrite(BROWSER_TAB_FOLDERS_KEY, nextFolders);
        }

        scheduleWrite(BROWSER_BOOKMARKS_KEY, nextBookmarks);
        return { browserBookmarks: nextBookmarks, browserTabFolders: nextFolders };
      });
    },

    setBrowserNavigatorWidth: (width) => {
      const next = clamp(width, BROWSER_NAVIGATOR_WIDTH_MIN, BROWSER_NAVIGATOR_WIDTH_MAX);
      scheduleNumberWrite(BROWSER_NAVIGATOR_WIDTH_KEY, next);
      set({ browserNavigatorWidth: next });
    },

    toggleBrowserNavigator: () =>
      set((state) => {
        const next = {
          ...state.navigatorCollapsedByTool,
          browser: !(state.navigatorCollapsedByTool.browser ?? false),
        };
        scheduleWrite(BROWSER_NAVIGATOR_COLLAPSED_KEY, next);
        return { navigatorCollapsedByTool: next };
      }),

    setBrowserNavigatorCollapsed: (collapsed) =>
      set((state) => {
        const next = { ...state.navigatorCollapsedByTool, browser: collapsed };
        scheduleWrite(BROWSER_NAVIGATOR_COLLAPSED_KEY, next);
        return { navigatorCollapsedByTool: next };
      }),

    setBrowserWorkspaceExpanded: (expanded) => {
      scheduleWrite(BROWSER_WORKSPACE_EXPANDED_KEY, expanded);
      set({ browserWorkspaceExpanded: expanded });
    },

    setBrowserPersisted: (persisted) => set({ browserPersisted: persisted }),

    setBrowserWorkspaceId: (workspaceId) => set({ browserWorkspaceId: workspaceId }),

    browserCreateTabFolder: (
      name?: string,
      parentId?: string,
      parentType?: 'workspace' | 'folder'
    ) =>
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
        // 收集需要删除的文件夹 ID（包括当前文件夹及其所有子孙文件夹）
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

    setBrowserViewMode: (mode) => {
      scheduleWrite(BROWSER_VIEW_MODE_KEY, mode);
      set({ browserViewMode: mode });
    },

    setBrowserShowTabButtons: (show) => {
      scheduleWrite(BROWSER_SHOW_TAB_BUTTONS_KEY, show);
      set({ browserShowTabButtons: show });
    },

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

    browserBookmarkTab: (tabId, folderId, newFolderName) => {
      set((state) => {
        const tab = state.browserTabs.find((t) => t.id === tabId);
        if (!tab) return {};

        const url = tab.url;
        const title = tab.title;
        const existsInBookmarks = state.browserBookmarks.some((b) => b.url === url);
        let nextBookmarks = state.browserBookmarks;

        if (!existsInBookmarks) {
          nextBookmarks = [...state.browserBookmarks, { url, title }];
        }

        let nextFolders = [...state.browserTabFolders];
        let targetFolderId = folderId;

        if (!targetFolderId && newFolderName) {
          const folderCount = nextFolders.length;
          const locale = state.appInfo?.config.language === 'en-US' ? 'en-US' : 'zh-CN';
          const folderName =
            newFolderName.trim() || formatNewFolderNameByLocale(locale, folderCount + 1);
          const newFolder: TabFolderState = {
            id: createUiId('tab-folder'),
            name: folderName,
            createdAt: Date.now(),
            isUserCreated: true,
            tabs: [tabId],
          };
          nextFolders = [...nextFolders, newFolder];
          targetFolderId = newFolder.id;
        } else if (targetFolderId) {
          nextFolders = nextFolders.map((folder) => {
            if (folder.id === targetFolderId) {
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
        }

        scheduleWrite(BROWSER_TAB_FOLDERS_KEY, nextFolders);
        scheduleWrite(BROWSER_BOOKMARKS_KEY, nextBookmarks);
        return { browserTabFolders: nextFolders, browserBookmarks: nextBookmarks };
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
      set((state) => {
        scheduleWrite(BROWSER_TREE_EXPANDED_KEY, {});
        return { browserTabTreeExpanded: {} };
      }),

    browserExpandAllTreePaths: (paths) =>
      set((state) => {
        const next: Record<string, boolean> = {};
        for (const p of paths) {
          next[p] = true;
        }
        scheduleWrite(BROWSER_TREE_EXPANDED_KEY, next);
        return { browserTabTreeExpanded: next };
      }),

    browserDeleteAllTabsInNode: (nodePath) =>
      set((state) => {
        // nodePath format: "workspace:{id}" | "folder:{id}" | "history:day:{date}"
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

        if (tabIdsToDelete.length === 0) return state;

        if (nodePath.startsWith('history:')) {
          const nextHistory = state.browserHistory.filter((h) => !tabIdsToDelete.includes(h.id));
          scheduleWrite(BROWSER_HISTORY_KEY, nextHistory);
          return { browserHistory: nextHistory };
        }

        const nextTabs = state.browserTabs.filter((t) => !tabIdsToDelete.includes(t.id));
        const nextActive = tabIdsToDelete.includes(state.browserActiveTabId)
          ? (nextTabs[nextTabs.length - 1]?.id ?? state.browserActiveTabId)
          : state.browserActiveTabId;
        scheduleWrite(BROWSER_TABS_KEY, nextTabs);
        scheduleWrite(BROWSER_ACTIVE_TAB_KEY, nextActive);
        return {
          browserTabs: nextTabs,
          browserTabsById: buildTabsById(nextTabs),
          browserActiveTabId: nextActive,
        };
      }),
  };
};
