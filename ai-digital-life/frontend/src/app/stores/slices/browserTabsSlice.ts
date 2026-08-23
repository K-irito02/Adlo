import type { StoreState } from '../StoreState';
import { createUiId, makePersistedWriter } from '../shared';
import {
  BROWSER_TABS_KEY,
  BROWSER_ACTIVE_TAB_KEY,
  BROWSER_TAB_FOLDERS_KEY,
  BROWSER_BOOKMARK_TABID_URL_MAP_KEY,
} from './browserSliceShared';
import type { BrowserTabState, BrowserTabStateUpdate } from './browserSliceShared';
import { historyDedupKey } from '@utils/browserDisplayUtils';

// Re-export the tab state types from the shared leaf module so existing
// consumers (e.g. tests, browserSlice, browserFoldersUtils) keep working
// without import-source churn. The canonical definitions live in
// `./browserSliceShared` to break the cross-slice type import cycle.
export type { BrowserTabState, BrowserTabStateUpdate } from './browserSliceShared';

const writeTabFolders = makePersistedWriter(BROWSER_TAB_FOLDERS_KEY);
const writeBookmarkTabIdUrlMap = makePersistedWriter(BROWSER_BOOKMARK_TABID_URL_MAP_KEY);
const writeTabs = makePersistedWriter(BROWSER_TABS_KEY);
const writeActiveTab = makePersistedWriter(BROWSER_ACTIVE_TAB_KEY);

function sortTabs(tabs: BrowserTabState[]): BrowserTabState[] {
  return [...tabs].sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    return a.sortOrder - b.sortOrder;
  });
}

function buildTabsById(tabs: BrowserTabState[]): Record<string, BrowserTabState> {
  const result: Record<string, BrowserTabState> = {};
  for (const tab of tabs) {
    result[tab.id] = tab;
  }
  return result;
}

export const BROWSER_TABS_STORAGE_KEY = BROWSER_TABS_KEY;
export const BROWSER_ACTIVE_TAB_STORAGE_KEY = BROWSER_ACTIVE_TAB_KEY;

export interface BrowserTabsSlice {
  browserTabs: BrowserTabState[];
  browserTabsById: Record<string, BrowserTabState>;
  browserActiveTabId: string;

  browserOpenTab: (url?: string, title?: string, workspaceId?: string, folderId?: string) => void;
  browserSelectTab: (tabId: string) => void;
  browserCloseTab: (tabId: string) => void;
  browserUpdateTab: (tabId: string, patch: Partial<BrowserTabStateUpdate>) => void;
  browserTogglePin: (tabId: string) => void;
  browserReorderTabs: (newOrder: BrowserTabState[]) => void;
  browserCloseAllTabs: (workspaceId?: string) => void;
  browserUpdateTabAudioState: (tabId: string, isPlaying?: boolean, isMuted?: boolean) => void;
  browserToggleTabMute: (tabId: string) => void;
}

export const createBrowserTabsSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState,
): BrowserTabsSlice => ({
  browserTabs: [],
  browserTabsById: {},
  browserActiveTabId: '',

  browserOpenTab: (url?: string, title?: string, workspaceId?: string, folderId?: string) => {
    set((state) => {
      const maxSortOrder =
        state.browserTabs.length > 0 ? Math.max(...state.browserTabs.map((t) => t.sortOrder)) : 0;
      const tab: BrowserTabState = {
        id: createUiId('browser'),
        workspaceId: workspaceId ?? '',
        title: title?.trim() || '',
        url: url?.trim() || '',
        titleResolved: false,
        isPinned: false,
        sortOrder: maxSortOrder + 1,
        isPlayingAudio: false,
        isAudioMuted: false,
      };
      const nextTabs = sortTabs([...state.browserTabs, tab]);
      let nextFolders = state.browserTabFolders;
      let nextTabIdUrlMap = state.browserBookmarkTabIdUrlMap;
      if (folderId) {
        nextFolders = nextFolders.map((f) => {
          if (f.id === folderId) {
            const existingTabs = f.tabs || [];
            const tabTitle = tab.title?.trim() || tab.url?.trim() || '';
            // 归一化去重（剥离跟踪参数/尾斜杠/www）：URL 变体不产生重复快照条目
            // （2026-08-21 事项 7 审查 A2-6 预存问题）。
            const entryKey = historyDedupKey(tab.url || '');
            if (
              !existingTabs.some(
                (item) => historyDedupKey(item.url || '') === entryKey && item.title === tabTitle,
              )
            ) {
              return {
                ...f,
                tabs: [...existingTabs, { tabId: tab.id, url: tab.url || '', title: tabTitle }],
              };
            }
          }
          return f;
        });
        writeTabFolders(nextFolders);
        if (tab.url && !nextTabIdUrlMap[tab.id]) {
          nextTabIdUrlMap = { ...nextTabIdUrlMap, [tab.id]: tab.url };
          writeBookmarkTabIdUrlMap(nextTabIdUrlMap);
        }
      }
      writeTabs(nextTabs);
      writeActiveTab(tab.id);
      return {
        browserTabs: nextTabs,
        browserTabsById: buildTabsById(nextTabs),
        browserActiveTabId: tab.id,
        browserTabFolders: nextFolders,
        browserBookmarkTabIdUrlMap: nextTabIdUrlMap,
        browserBookmarks: state.browserBookmarks,
      };
    });
    // Chrome/Edge 语义：显式打开一个 URL（书签/快捷站点/右键新标签/文件夹恢复）即一次
    // 导航，应记录历史。browserOpenTab 预置 tab.url 后，导航完成时 onUrlChanged 的
    // urlChanged 判定为 false（tab 已在该 URL），历史写入不能依赖该事件，必须在打开
    // 入口同步写入（与地址栏提交 browserAddToHistory 语义一致；browserAddToHistory 的
    // 同日同 dedupKey 去重保证恢复/重复打开不产生重复条目）。
    const trimmedUrl = url?.trim();
    if (trimmedUrl) {
      get().browserAddToHistory(trimmedUrl, title?.trim() || trimmedUrl);
    }
  },

  browserSelectTab: (tabId) => {
    writeActiveTab(tabId);
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

      writeTabs(nextTabs);
      writeActiveTab(nextActive);
      return {
        browserTabs: nextTabs,
        browserTabsById: buildTabsById(nextTabs),
        browserActiveTabId: nextActive,
      };
    }),

  browserUpdateTab: (tabId, patch) =>
    set((state) => {
      const nextTabs = sortTabs(
        state.browserTabs.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)),
      );
      writeTabs(nextTabs);
      return { browserTabs: nextTabs, browserTabsById: buildTabsById(nextTabs) };
    }),

  browserUpdateTabAudioState: (tabId, isPlaying, isMuted) =>
    set((state) => {
      const nextTabs = state.browserTabs.map((tab) => {
        if (tab.id !== tabId) {
          return tab;
        }
        const next = { ...tab };
        if (isPlaying !== undefined) {
          next.isPlayingAudio = isPlaying;
        }
        if (isMuted !== undefined) {
          next.isAudioMuted = isMuted;
        }
        return next;
      });
      const hasMuteChange = isMuted !== undefined;
      if (hasMuteChange) {
        writeTabs(nextTabs);
      }
      return { browserTabs: nextTabs, browserTabsById: buildTabsById(nextTabs) };
    }),

  browserToggleTabMute: (tabId) =>
    set((state) => {
      const nextTabs = state.browserTabs.map((tab) =>
        tab.id === tabId ? { ...tab, isAudioMuted: !tab.isAudioMuted } : tab,
      );
      writeTabs(nextTabs);
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
        }),
      );
      writeTabs(nextTabs);
      return { browserTabs: nextTabs, browserTabsById: buildTabsById(nextTabs) };
    }),

  browserReorderTabs: (newOrder) =>
    set((state) => {
      if (state.browserTabs === newOrder) {
        return state;
      }

      const pinnedTabs = newOrder.filter((t) => t.isPinned);
      const unpinnedTabs = newOrder.filter((t) => !t.isPinned);

      const reorderedWithSort = [...pinnedTabs, ...unpinnedTabs].map((tab, index) => ({
        ...tab,
        sortOrder: index,
      }));

      writeTabs(reorderedWithSort);
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
      writeTabs(nextTabs);
      writeActiveTab(nextActive);
      return {
        browserTabs: nextTabs,
        browserTabsById: buildTabsById(nextTabs),
        browserActiveTabId: nextActive,
      };
    });
  },
});
