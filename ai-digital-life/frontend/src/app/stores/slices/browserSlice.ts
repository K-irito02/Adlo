/**
 * 浏览器切片（精简核心层）
 * 包含：核心导航状态、持久化标志、工作区ID
 *
 * 子切片在 slicedStore.ts 中独立注册，本切片不内部组合。
 * BrowserSlice 类型定义自身字段，所有子切片类型单独注册。
 */
import type { StoreState } from '../StoreState';
import { clamp, readJson, readNumber, createUiId, createDebouncedWrite } from '../shared';
import { BROWSER_NAVIGATOR_COLLAPSED_KEY } from '../constants';

import type { BrowserTabState } from './browserTabsSlice';
import type { BrowserBookmark } from './browserBookmarkSlice';
import { BROWSER_WORKSPACE_BOOKMARKS_STORAGE_KEY } from './browserBookmarkSlice';
import type { BrowserHistoryState } from './browserHistorySlice';
import { hostnameFromUrl } from '../../utils/browserDisplayUtils';
import type { TabFolderState } from './browserFoldersSlice';
import type { ShortcutSite, LocalPort, BackgroundConfig } from './browserLandingSlice';

export type { BrowserTabState, BrowserTabStateUpdate } from './browserTabsSlice';
export type { BrowserBookmark } from './browserBookmarkSlice';
export type { BrowserHistoryState } from './browserHistorySlice';
export type { TabFolderState } from './browserFoldersSlice';
export type {
  ShortcutSite,
  LocalPort,
  BackgroundConfig,
  BackgroundMode,
  BackgroundFit,
} from './browserLandingSlice';

const BROWSER_TABS_KEY = 'adl-ui:browser-tabs';
const BROWSER_ACTIVE_TAB_KEY = 'adl-ui:browser-active-tab';
const BROWSER_NAVIGATOR_WIDTH_KEY = 'adl-ui:browser-navigator-width';
const BROWSER_WORKSPACE_EXPANDED_KEY = 'adl-ui:browser-workspace-expanded';
const BROWSER_TAB_FOLDERS_KEY = 'adl-ui:browser-tab-folders';
const BROWSER_HISTORY_KEY = 'adl-ui:browser-history';
const BROWSER_BOOKMARKS_KEY = 'adl-ui:browser-bookmarks';
const BROWSER_SHORTCUTS_KEY = 'adl-ui:browser-shortcuts';
const BROWSER_LOCAL_PORTS_KEY = 'adl-ui:browser-local-ports';
const BROWSER_BG_CONFIG_KEY = 'adl-ui:browser-bg-config';
const BROWSER_TREE_EXPANDED_KEY = 'adl-ui:browser-tab-tree-expanded';
const BROWSER_NAVIGATE_IN_PLACE_KEY = 'adl-ui:browser-navigate-in-place';

const BROWSER_NAVIGATOR_WIDTH_MIN = 180;
const BROWSER_NAVIGATOR_WIDTH_MAX = 300;
const DEFAULT_BROWSER_NAVIGATOR_WIDTH = 240;

const { scheduleWrite, scheduleNumberWrite } = createDebouncedWrite(50);

function buildTabsById(tabs: BrowserTabState[]): Record<string, BrowserTabState> {
  const result: Record<string, BrowserTabState> = {};
  for (const tab of tabs) {
    result[tab.id] = tab;
  }
  return result;
}

let _defaultsHydrated = false;

function hydrateBrowserDefaults(
  get: () => StoreState,
  set: (partial: Partial<StoreState>) => void
): void {
  if (_defaultsHydrated) {
    return;
  }
  _defaultsHydrated = true;
  const doHydrate = () => {
    const state = get();

    const width = readNumber(
      BROWSER_NAVIGATOR_WIDTH_KEY,
      DEFAULT_BROWSER_NAVIGATOR_WIDTH,
      BROWSER_NAVIGATOR_WIDTH_MIN,
      BROWSER_NAVIGATOR_WIDTH_MAX
    );
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

    const workspaceBookmarksModified = Object.keys(state.browserWorkspaceBookmarks).length > 0;
    const finalWorkspaceBookmarks = workspaceBookmarksModified
      ? state.browserWorkspaceBookmarks
      : readJson<Record<string, string[]>>(BROWSER_WORKSPACE_BOOKMARKS_STORAGE_KEY, {});

    const persistedTabTreeExpanded = readJson<Record<string, boolean>>(
      BROWSER_TREE_EXPANDED_KEY,
      {}
    );
    const navigateInPlace = readJson<boolean>(BROWSER_NAVIGATE_IN_PLACE_KEY, false);

    const shortcuts = readJson<ShortcutSite[]>(BROWSER_SHORTCUTS_KEY, []);
    const localPorts = readJson<LocalPort[]>(BROWSER_LOCAL_PORTS_KEY, []);
    const bgConfig = readJson<BackgroundConfig>(BROWSER_BG_CONFIG_KEY, {
      mode: 'default',
      fit: 'cover',
    });

    set({
      browserNavigatorWidth: width,
      browserWorkspaceExpanded: workspaceExpanded,
      browserTabFolders: persistedTabFolders,
      browserHistory: finalHistory,
      browserBookmarks: finalBookmarks,
      browserWorkspaceBookmarks: finalWorkspaceBookmarks,
      browserTabs: finalTabs,
      browserTabsById: buildTabsById(finalTabs),
      browserActiveTabId: finalActiveTabId,
      browserNavigateInPlace: navigateInPlace,
      browserTabTreeExpanded: persistedTabTreeExpanded,
      browserShortcuts: shortcuts,
      browserLocalPorts: localPorts,
      browserBgConfig: bgConfig,
      browserPortScanning: false,
    });
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(doHydrate, { timeout: 1000 });
  } else {
    setTimeout(doHydrate, 200);
  }
}

export interface BrowserSlice {
  browserNavigatorWidth: number;
  browserPersisted: boolean;
  browserWorkspaceId: string;

  browserNavigateInPlace: boolean;
  showLandingPage: boolean;
  browserNavigateActiveTab: (url: string, title?: string) => void;
  setBrowserNavigateInPlace: (value: boolean) => void;
  setShowLandingPage: (value: boolean) => void;
  setBrowserNavigatorWidth: (width: number) => void;
  toggleBrowserNavigator: () => void;
  setBrowserNavigatorCollapsed: (collapsed: boolean) => void;
  setBrowserPersisted: (persisted: boolean) => void;
  setBrowserWorkspaceId: (workspaceId: string) => void;
}

export const createBrowserSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState
): BrowserSlice => {
  hydrateBrowserDefaults(get, set);
  return {
    browserNavigatorWidth: DEFAULT_BROWSER_NAVIGATOR_WIDTH,
    browserPersisted: false,
    browserWorkspaceId: '',
    browserNavigateInPlace: false,
    showLandingPage: false,

    browserNavigateActiveTab: (url: string, title?: string) => {
      set((state) => {
        let activeTab = state.browserTabs.find((tab) => tab.id === state.browserActiveTabId);
        let nextTabs = state.browserTabs;
        let nextActiveTabId = state.browserActiveTabId;

        if (!activeTab || nextTabs.length === 0) {
          const maxSortOrder =
            nextTabs.length > 0 ? Math.max(...nextTabs.map((t) => t.sortOrder)) : 0;
          const tabTitle = title?.trim() || hostnameFromUrl(url) || url;
          const newTab: BrowserTabState = {
            id: createUiId('browser'),
            workspaceId: '',
            title: tabTitle,
            url,
            isPinned: false,
            sortOrder: maxSortOrder + 1,
          };
          nextTabs = [...nextTabs, newTab];
          nextActiveTabId = newTab.id;
          activeTab = newTab;
          scheduleWrite(BROWSER_TABS_KEY, nextTabs);
          scheduleWrite(BROWSER_ACTIVE_TAB_KEY, nextActiveTabId);
        } else {
          const oldUrl = activeTab.url;
          const oldTitle = activeTab.title;
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
          if (oldUrl !== url || (title && title !== oldTitle)) {
            const isBookmarked = state.browserBookmarks.some((b) => b.url === oldUrl);
            console.log('[ADL-DEBUG] browserNavigateActiveTab: tab updated', {
              tabId: activeTab.id,
              oldUrl,
              newUrl: url,
              oldTitle,
              newTitle: title || oldTitle,
              isBookmarked,
            });
          }
          scheduleWrite(BROWSER_TABS_KEY, nextTabs);
        }

        const historyTitle = title || hostnameFromUrl(url) || url;
        const newHistoryItem: BrowserHistoryState = {
          id: createUiId('history'),
          url,
          title: historyTitle,
          visitedAt: Date.now(),
        };

        const filteredHistory = state.browserHistory.filter((item) => item.url !== url);
        const nextHistory = [newHistoryItem, ...filteredHistory].slice(0, 100);

        scheduleWrite(BROWSER_HISTORY_KEY, nextHistory);

        return {
          browserTabs: nextTabs,
          browserTabsById: buildTabsById(nextTabs),
          browserActiveTabId: nextActiveTabId,
          browserHistory: nextHistory,
        };
      });
    },

    setBrowserNavigatorWidth: (width) => {
      const next = clamp(width, BROWSER_NAVIGATOR_WIDTH_MIN, BROWSER_NAVIGATOR_WIDTH_MAX);
      scheduleNumberWrite(BROWSER_NAVIGATOR_WIDTH_KEY, next);
      set({ browserNavigatorWidth: next });
    },

    setBrowserNavigateInPlace: (value: boolean) => {
      scheduleWrite(BROWSER_NAVIGATE_IN_PLACE_KEY, value);
      set({ browserNavigateInPlace: value });
    },

    setShowLandingPage: (value: boolean) => {
      set({ showLandingPage: value });
    },

    toggleBrowserNavigator: () =>
      set((state) => {
        const next = {
          ...state.navigatorCollapsedByTool,
          browser: !(state.navigatorCollapsedByTool?.browser ?? false),
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

    setBrowserPersisted: (persisted) => set({ browserPersisted: persisted }),

    setBrowserWorkspaceId: (workspaceId) => set({ browserWorkspaceId: workspaceId }),
  };
};
