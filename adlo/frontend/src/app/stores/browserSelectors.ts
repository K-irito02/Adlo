/**
 * 浏览器相关的选择器
 * 覆盖 6 个浏览器子切片的状态选择
 */
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from './slicedStore';
import type { StoreState } from './StoreState';

export const browserSelectors = {
  // --- BrowserSlice (UI 布局) ---
  getBrowserNavigatorWidth: (state: StoreState) => state.browserNavigatorWidth,
  useBrowserNavigatorWidth: () => useAppStore((s) => s.browserNavigatorWidth),

  // --- BrowserTabsSlice (标签页) ---
  getBrowserTabs: (state: StoreState) => state.browserTabs,
  useBrowserTabs: () => useAppStore(useShallow((s) => s.browserTabs)),

  getBrowserTabsById: (state: StoreState) => state.browserTabsById,
  useBrowserTabsById: () => useAppStore(useShallow((s) => s.browserTabsById)),

  getBrowserActiveTabId: (state: StoreState) => state.browserActiveTabId,
  useBrowserActiveTabId: () => useAppStore((s) => s.browserActiveTabId),

  getBrowserTabCount: (state: StoreState) => state.browserTabs.length,
  useBrowserTabCount: () => useAppStore((s) => s.browserTabs.length),

  getBrowserActiveTab: (state: StoreState) => {
    const id = state.browserActiveTabId;
    if (!id) {
      return undefined;
    }
    return state.browserTabsById[id] ?? state.browserTabs.find((t) => t.id === id);
  },
  useBrowserActiveTab: () =>
    useAppStore(
      useShallow((s) => {
        const id = s.browserActiveTabId;
        if (!id) {
          return undefined;
        }
        return s.browserTabsById[id] ?? s.browserTabs.find((t) => t.id === id);
      }),
    ),

  getBrowserTabById: (state: StoreState, id: string) => {
    return state.browserTabsById?.[id] ?? state.browserTabs.find((t) => t.id === id);
  },

  hasBrowserActiveTab: (state: StoreState) =>
    Boolean(state.browserActiveTabId && state.browserTabsById[state.browserActiveTabId]),
  useHasBrowserActiveTab: () =>
    useAppStore((s) => Boolean(s.browserActiveTabId && s.browserTabsById[s.browserActiveTabId])),

  // --- BrowserBookmarkSlice (书签) ---
  getBrowserBookmarks: (state: StoreState) => state.browserBookmarks,
  useBrowserBookmarks: () => useAppStore(useShallow((s) => s.browserBookmarks)),

  getBrowserWorkspaceBookmarks: (state: StoreState) => state.browserWorkspaceBookmarks,
  useBrowserWorkspaceBookmarks: () => useAppStore(useShallow((s) => s.browserWorkspaceBookmarks)),

  hasBrowserBookmarks: (state: StoreState) => state.browserBookmarks.length > 0,
  useHasBrowserBookmarks: () => useAppStore((s) => s.browserBookmarks.length > 0),

  // --- BrowserHistorySlice (历史记录) ---
  getBrowserHistory: (state: StoreState) => state.browserHistory,
  useBrowserHistory: () => useAppStore(useShallow((s) => s.browserHistory)),

  hasBrowserHistory: (state: StoreState) => state.browserHistory.length > 0,
  useHasBrowserHistory: () => useAppStore((s) => s.browserHistory.length > 0),

  // --- BrowserBookmarkFoldersSlice (书签文件夹 / 树) ---
  getBrowserBookmarkFolders: (state: StoreState) => state.browserBookmarkFolders,
  useBrowserBookmarkFolders: () => useAppStore(useShallow((s) => s.browserBookmarkFolders)),

  getBrowserTabTreeExpanded: (state: StoreState) => state.browserTabTreeExpanded,
  useBrowserTabTreeExpanded: () => useAppStore(useShallow((s) => s.browserTabTreeExpanded)),

  // --- BrowserLandingSlice (着陆页) ---
  getBrowserShortcuts: (state: StoreState) => state.browserShortcuts,
  useBrowserShortcuts: () => useAppStore(useShallow((s) => s.browserShortcuts)),

  getBrowserLocalPorts: (state: StoreState) => state.browserLocalPorts,
  useBrowserLocalPorts: () => useAppStore(useShallow((s) => s.browserLocalPorts)),

  getBrowserPortScanning: (state: StoreState) => state.browserPortScanning,
  useBrowserPortScanning: () => useAppStore((s) => s.browserPortScanning),

  getBrowserBgConfig: (state: StoreState) => state.browserBgConfig,
  useBrowserBgConfig: () => useAppStore(useShallow((s) => s.browserBgConfig)),
};
