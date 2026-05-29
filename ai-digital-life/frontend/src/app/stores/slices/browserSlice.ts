
/**
 * 浏览器标签切片
 * 管理浏览器标签页等状态
 */
import type { StoreState } from "../StoreState";
import type { ToolId } from "../../ui-store";

export interface BrowserTabState {
  id: string;
  workspaceId: string;
  title: string;
  url: string;
  isPinned: boolean;
  pinnedAt?: number;
  sortOrder: number;
}

export interface TabFolderState {
  id: string;
  name: string;
  createdAt: number;
  isUserCreated?: boolean;
  tabs?: string[]; // 存储该工作区下的标签 ID
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
const BROWSER_TABS_KEY = "adl-ui:browser-tabs";
const BROWSER_ACTIVE_TAB_KEY = "adl-ui:browser-active-tab";
const BROWSER_NAVIGATOR_WIDTH_KEY = "adl-ui:browser-navigator-width";
const BROWSER_NAVIGATOR_COLLAPSED_KEY = "adl-ui:navigator-collapsed";
const BROWSER_WORKSPACE_EXPANDED_KEY = "adl-ui:browser-workspace-expanded";
const BROWSER_TAB_FOLDERS_KEY = "adl-ui:browser-tab-folders";
const BROWSER_VIEW_MODE_KEY = "adl-ui:browser-view-mode";
const BROWSER_SHOW_TAB_BUTTONS_KEY = "adl-ui:browser-show-tab-buttons";
const BROWSER_HISTORY_KEY = "adl-ui:browser-history";
const BROWSER_BOOKMARKS_KEY = "adl-ui:browser-bookmarks";

// Constants
const BROWSER_NAVIGATOR_WIDTH_MIN = 180;
const BROWSER_NAVIGATOR_WIDTH_MAX = 300;
const DEFAULT_BROWSER_NAVIGATOR_WIDTH = 240;

// Helper functions
function createUiId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      return JSON.parse(raw) as T;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function readNumber(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = Number(window.localStorage.getItem(key));
    if (Number.isFinite(raw)) {
      return clamp(raw, min, max);
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

function writeNumber(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
}

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

function defaultNavigatorCollapsed(): Record<ToolId, boolean> {
  return {
    files: false,
    changes: false,
    browser: false,
    terminal: false,
    audit: false,
    settings: false,
    models: false
  };
}

// Batch write scheduler — coalesces multiple localStorage writes into one
const pendingWrites = new Map<string, unknown>();
const pendingNumberWrites = new Map<string, number>();
let writeScheduled = false;

function scheduleWrite(key: string, value: unknown): void {
  pendingWrites.set(key, value);
  scheduleFlush();
}

function scheduleNumberWrite(key: string, value: number): void {
  pendingNumberWrites.set(key, value);
  scheduleFlush();
}

function scheduleFlush(): void {
  if (writeScheduled) return;
  writeScheduled = true;
  const flush = () => {
    writeScheduled = false;
    for (const [key, value] of pendingWrites) {
      writeJson(key, value);
    }
    pendingWrites.clear();
    for (const [key, value] of pendingNumberWrites) {
      writeNumber(key, value);
    }
    pendingNumberWrites.clear();
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(flush, { timeout: 500 });
  } else {
    setTimeout(flush, 50);
  }
}

// Lazy localStorage hydration — reads persisted values in idle time
let _defaultsHydrated = false;

function hydrateBrowserDefaults(get: () => StoreState, set: (partial: Partial<StoreState>) => void): void {
  if (_defaultsHydrated) return;
  _defaultsHydrated = true;
  const doHydrate = () => {
    const state = get();

    const width = readNumber(BROWSER_NAVIGATOR_WIDTH_KEY, DEFAULT_BROWSER_NAVIGATOR_WIDTH, BROWSER_NAVIGATOR_WIDTH_MIN, BROWSER_NAVIGATOR_WIDTH_MAX);
    const collapsed = {
      ...defaultNavigatorCollapsed(),
      ...readJson<Record<ToolId, boolean>>(BROWSER_NAVIGATOR_COLLAPSED_KEY, defaultNavigatorCollapsed())
    };
    const workspaceExpanded = readJson<Record<string, boolean>>(BROWSER_WORKSPACE_EXPANDED_KEY, {});
    const persistedTabFolders = readJson<TabFolderState[]>(BROWSER_TAB_FOLDERS_KEY, []);

    const tabsModified = state.browserTabs.length !== 1 ||
      state.browserTabs[0]?.id !== defaultTab.id ||
      state.browserTabs[0]?.url !== "about:blank";

    let finalTabs = state.browserTabs;
    let finalActiveTabId = state.browserActiveTabId;

    if (!tabsModified) {
      const persistedTabs = readJson<BrowserTabState[]>(BROWSER_TABS_KEY, []);
      if (persistedTabs.length > 0) {
        finalTabs = persistedTabs;
        finalActiveTabId = readJson<string>(BROWSER_ACTIVE_TAB_KEY, "");
        if (!finalTabs.find(t => t.id === finalActiveTabId)) {
          finalActiveTabId = finalTabs[finalTabs.length - 1]?.id ?? defaultTab.id;
        }
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

    const viewMode = readJson<"default" | "tree" | "list" | "all">(BROWSER_VIEW_MODE_KEY, "default");
    const showTabButtons = readJson<boolean>(BROWSER_SHOW_TAB_BUTTONS_KEY, false);

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
    });
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(doHydrate, { timeout: 1000 });
  } else {
    setTimeout(doHydrate, 200);
  }
}

function createDefaultBrowserTab(): BrowserTabState {
  return {
    id: createUiId("browser"),
    workspaceId: "",
    title: "Start Page",
    url: "about:blank",
    isPinned: false,
    sortOrder: 0,
  };
}

const defaultTab = createDefaultBrowserTab();
const initialBrowserTabs: BrowserTabState[] = [defaultTab];

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
  browserViewMode: "default" | "tree" | "list" | "all";
  browserShowTabButtons: boolean;

  browserOpenTab: (url?: string, title?: string, workspaceId?: string) => void;
  browserSelectTab: (tabId: string) => void;
  browserCloseTab: (tabId: string) => void;
  browserUpdateTab: (tabId: string, patch: Partial<Omit<BrowserTabState, "id">>) => void;
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
  browserCreateTabFolder: (name?: string) => void;
  browserUpdateTabFolder: (folderId: string, patch: Partial<Omit<TabFolderState, "id">>) => void;
  browserDeleteTabFolder: (folderId: string) => void;
  browserAddToHistory: (url: string, title: string) => void;
  browserClearHistory: () => void;
  browserToggleBookmark: (input?: { url?: string; title?: string }) => void;
  setBrowserViewMode: (mode: "default" | "tree" | "list" | "all") => void;
  setBrowserShowTabButtons: (show: boolean) => void;
  browserBookmarkTab: (tabId: string, folderId?: string, newFolderName?: string) => void;
  browserAddToFolder: (tabId: string, folderId: string) => void;
}

export const createBrowserSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState
): BrowserSlice => {
  hydrateBrowserDefaults(get, set);
  return {
    browserTabs: initialBrowserTabs,
    browserTabsById: { [defaultTab.id]: defaultTab },
    browserActiveTabId: defaultTab.id,
    browserNavigatorWidth: DEFAULT_BROWSER_NAVIGATOR_WIDTH,
    navigatorCollapsedByTool: defaultNavigatorCollapsed(),
    browserWorkspaceExpanded: {},
    browserPersisted: false,
    browserWorkspaceId: "",
    browserTabFolders: [],
    browserHistory: [],
    browserBookmarks: [],
    browserViewMode: "default",
    browserShowTabButtons: false,

    browserOpenTab: (url?: string, title?: string, workspaceId: string = "") =>
      set((state) => {
        const maxSortOrder = state.browserTabs.length > 0 ? Math.max(...state.browserTabs.map(t => t.sortOrder)) : 0;
        const tab: BrowserTabState = {
          id: createUiId("browser"),
          workspaceId,
          title: title?.trim() || "新标签页",
          url: url?.trim() || "about:blank",
          isPinned: false,
          sortOrder: maxSortOrder + 1
        };
        const nextTabs = sortTabs([...state.browserTabs, tab]);
        scheduleWrite(BROWSER_TABS_KEY, nextTabs);
        scheduleWrite(BROWSER_ACTIVE_TAB_KEY, tab.id);
        return { browserTabs: nextTabs, browserTabsById: buildTabsById(nextTabs), browserActiveTabId: tab.id };
      }),

    browserSelectTab: (tabId) => {
      scheduleWrite(BROWSER_ACTIVE_TAB_KEY, tabId);
      set({ browserActiveTabId: tabId });
    },

    browserCloseTab: (tabId) =>
      set((state) => {
        const filtered = state.browserTabs.filter((tab) => tab.id !== tabId);
        let nextTabs = sortTabs(filtered);
        let nextActive =
          state.browserActiveTabId === tabId
            ? nextTabs[nextTabs.length - 1]?.id ?? ""
            : state.browserActiveTabId;
        
        if (nextTabs.length === 0) {
          const defaultTab: BrowserTabState = {
            id: createUiId("browser"),
            workspaceId: "",
            title: "Start Page",
            url: "about:blank",
            isPinned: false,
            sortOrder: 0,
          };
          nextTabs = [defaultTab];
          nextActive = defaultTab.id;
        }
        
        scheduleWrite(BROWSER_TABS_KEY, nextTabs);
        scheduleWrite(BROWSER_ACTIVE_TAB_KEY, nextActive);
        return {
          browserTabs: nextTabs,
          browserTabsById: buildTabsById(nextTabs),
          browserActiveTabId: nextActive
        };
      }),

    browserUpdateTab: (tabId, patch) =>
      set((state) => {
        const nextTabs = sortTabs(state.browserTabs.map((tab) =>
          tab.id === tabId ? { ...tab, ...patch } : tab
        ));
        scheduleWrite(BROWSER_TABS_KEY, nextTabs);
        return { browserTabs: nextTabs, browserTabsById: buildTabsById(nextTabs) };
      }),

    browserTogglePin: (tabId) =>
      set((state) => {
        const nextTabs = sortTabs(state.browserTabs.map((tab) => {
          if (tab.id === tabId) {
            return {
              ...tab,
              isPinned: !tab.isPinned,
              pinnedAt: !tab.isPinned ? Date.now() : undefined
            };
          }
          return tab;
        }));
        scheduleWrite(BROWSER_TABS_KEY, nextTabs);
        return { browserTabs: nextTabs, browserTabsById: buildTabsById(nextTabs) };
      }),

    browserReorderTabs: (newOrder) =>
      set((state) => {
        if (state.browserTabs === newOrder) return state;

        const pinnedTabs = newOrder.filter(t => t.isPinned);
        const unpinnedTabs = newOrder.filter(t => !t.isPinned);

        const reorderedWithSort = [...pinnedTabs, ...unpinnedTabs].map((tab, index) => ({
          ...tab,
          sortOrder: index
        }));

        scheduleWrite(BROWSER_TABS_KEY, reorderedWithSort);
        return { browserTabs: reorderedWithSort, browserTabsById: buildTabsById(reorderedWithSort) };
      }),

    browserCloseAllTabs: (workspaceId) => {
      set((state) => {
        let nextTabs: BrowserTabState[];
        if (workspaceId) {
          nextTabs = state.browserTabs.filter(tab => tab.workspaceId !== workspaceId);
        } else {
          nextTabs = [];
        }
        const nextActive = nextTabs.length > 0 ? nextTabs[nextTabs.length - 1].id : "";
        scheduleWrite(BROWSER_TABS_KEY, nextTabs);
        scheduleWrite(BROWSER_ACTIVE_TAB_KEY, nextActive);
        return { browserTabs: nextTabs, browserTabsById: buildTabsById(nextTabs), browserActiveTabId: nextActive };
      });
    },

    browserNavigateActiveTab: (url: string, title?: string) => {
      set((state) => {
        const activeTab = state.browserTabs.find(tab => tab.id === state.browserActiveTabId);
        if (!activeTab) {
          return state;
        }
        const nextTabs = state.browserTabs.map(tab => {
          if (tab.id === state.browserActiveTabId) {
            return {
              ...tab,
              url,
              title: title || tab.title
            };
          }
          return tab;
        });
        
        // 添加到历史记录
        const newHistoryItem: BrowserHistoryState = {
          id: createUiId("history"),
          url,
          title: title || url,
          visitedAt: Date.now()
        };
        
        // 避免重复的历史记录
        const filteredHistory = state.browserHistory.filter(item => item.url !== url);
        const nextHistory = [newHistoryItem, ...filteredHistory].slice(0, 100); // 最多保留 100 条历史记录
        
        scheduleWrite(BROWSER_TABS_KEY, nextTabs);
        scheduleWrite(BROWSER_HISTORY_KEY, nextHistory);
        return { 
          browserTabs: nextTabs, 
          browserTabsById: buildTabsById(nextTabs),
          browserHistory: nextHistory
        };
      });
    },
    
    browserAddToHistory: (url: string, title: string) => {
      set((state) => {
        // 避免重复的历史记录
        const filteredHistory = state.browserHistory.filter(item => item.url !== url);
        const newHistoryItem: BrowserHistoryState = {
          id: createUiId("history"),
          url,
          title: title || url,
          visitedAt: Date.now()
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

    browserToggleBookmark: (input?: { url?: string; title?: string }) => {
      set((state) => {
        const active = state.browserTabs.find((tab) => tab.id === state.browserActiveTabId) ?? state.browserTabs[0];
        const url = input?.url?.trim() || active?.url || "about:blank";
        const title = input?.title?.trim() || active?.title || url;
        const exists = state.browserBookmarks.some((bookmark) => bookmark.url === url);
        const nextBookmarks = exists
          ? state.browserBookmarks.filter((bookmark) => bookmark.url !== url)
          : [...state.browserBookmarks, { url, title }];
        scheduleWrite(BROWSER_BOOKMARKS_KEY, nextBookmarks);
        return { browserBookmarks: nextBookmarks };
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
          browser: !(state.navigatorCollapsedByTool.browser ?? false)
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

    setBrowserPersisted: (persisted) =>
      set({ browserPersisted: persisted }),

    setBrowserWorkspaceId: (workspaceId) =>
      set({ browserWorkspaceId: workspaceId }),

    browserCreateTabFolder: (name) =>
      set((state) => {
        const folderCount = state.browserTabFolders.length;
        const folderName = name?.trim() || `新建目录${folderCount + 1}`;
        const newFolder: TabFolderState = {
          id: createUiId("tab-folder"),
          name: folderName,
          createdAt: Date.now(),
          isUserCreated: true,
        };
        const nextFolders = [...state.browserTabFolders, newFolder];
        scheduleWrite(BROWSER_TAB_FOLDERS_KEY, nextFolders);
        return { browserTabFolders: nextFolders };
      }),

    browserUpdateTabFolder: (folderId, patch) =>
      set((state) => {
        const nextFolders = state.browserTabFolders.map((folder) =>
          folder.id === folderId ? { ...folder, ...patch } : folder
        );
        scheduleWrite(BROWSER_TAB_FOLDERS_KEY, nextFolders);
        return { browserTabFolders: nextFolders };
      }),

    browserDeleteTabFolder: (folderId) =>
      set((state) => {
        const nextFolders = state.browserTabFolders.filter((folder) => folder.id !== folderId);
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
        const nextFolders = state.browserTabFolders.map(folder => {
          if (folder.id === folderId) {
            const existingTabs = folder.tabs || [];
            if (!existingTabs.includes(tabId)) {
              return {
                ...folder,
                tabs: [...existingTabs, tabId]
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
        let nextFolders = [...state.browserTabFolders];
        let targetFolderId = folderId;
        
        // 如果没有指定 folderId 但提供了 newFolderName，则创建新文件夹
        if (!targetFolderId && newFolderName) {
          const folderCount = nextFolders.length;
          const folderName = newFolderName.trim() || `新建目录${folderCount + 1}`;
          const newFolder: TabFolderState = {
            id: createUiId("tab-folder"),
            name: folderName,
            createdAt: Date.now(),
            isUserCreated: true,
            tabs: [tabId]
          };
          nextFolders = [...nextFolders, newFolder];
          targetFolderId = newFolder.id;
        } else if (targetFolderId) {
          // 否则添加到现有文件夹
          nextFolders = nextFolders.map(folder => {
            if (folder.id === targetFolderId) {
              const existingTabs = folder.tabs || [];
              if (!existingTabs.includes(tabId)) {
                return {
                  ...folder,
                  tabs: [...existingTabs, tabId]
                };
              }
            }
            return folder;
          });
        }
        
        scheduleWrite(BROWSER_TAB_FOLDERS_KEY, nextFolders);
        return { browserTabFolders: nextFolders };
      });
    },
  };
};
