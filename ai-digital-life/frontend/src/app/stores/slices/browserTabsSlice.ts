import type { StoreState } from '../StoreState';
import { createUiId, createDebouncedWrite } from '../shared';

export interface BrowserTabState {
  id: string;
  workspaceId: string;
  title: string;
  url: string;
  isPinned: boolean;
  pinnedAt?: number;
  sortOrder: number;
  isPlayingAudio: boolean;
  isAudioMuted: boolean;
}

export interface BrowserTabStateUpdate {
  workspaceId?: string;
  title?: string;
  url?: string;
  isPinned?: boolean;
  pinnedAt?: number;
  sortOrder?: number;
  isPlayingAudio?: boolean;
  isAudioMuted?: boolean;
}

const BROWSER_TABS_KEY = 'adl-ui:browser-tabs';
const BROWSER_ACTIVE_TAB_KEY = 'adl-ui:browser-active-tab';
const BROWSER_TAB_FOLDERS_KEY = 'adl-ui:browser-tab-folders';

const { scheduleWrite } = createDebouncedWrite(50);

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
  _get: () => StoreState
): BrowserTabsSlice => ({
  browserTabs: [],
  browserTabsById: {},
  browserActiveTabId: '',

  browserOpenTab: (url?: string, title?: string, workspaceId?: string, folderId?: string) =>
    set((state) => {
      const maxSortOrder =
        state.browserTabs.length > 0 ? Math.max(...state.browserTabs.map((t) => t.sortOrder)) : 0;
      const tab: BrowserTabState = {
        id: createUiId('browser'),
        workspaceId: workspaceId ?? '',
        title: title?.trim() || '',
        url: url?.trim() || '',
        isPinned: false,
        sortOrder: maxSortOrder + 1,
        isPlayingAudio: false,
        isAudioMuted: false,
      };
      const nextTabs = sortTabs([...state.browserTabs, tab]);
      let nextFolders = state.browserTabFolders;
      if (folderId) {
        nextFolders = nextFolders.map((f) => {
          if (f.id === folderId) {
            const existingTabs = f.tabs || [];
            if (!existingTabs.includes(tab.id)) {
              return { ...f, tabs: [...existingTabs, tab.id] };
            }
          }
          return f;
        });
        scheduleWrite(BROWSER_TAB_FOLDERS_KEY, nextFolders);
      }
      scheduleWrite(BROWSER_TABS_KEY, nextTabs);
      scheduleWrite(BROWSER_ACTIVE_TAB_KEY, tab.id);
      return {
        browserTabs: nextTabs,
        browserTabsById: buildTabsById(nextTabs),
        browserActiveTabId: tab.id,
        browserTabFolders: nextFolders,
      };
    }),

  browserSelectTab: (tabId) => {
    scheduleWrite(BROWSER_ACTIVE_TAB_KEY, tabId);
    set((state) => {
      if (state.browserActiveTabId === tabId && state.showLandingPage) {
        return { browserActiveTabId: tabId, showLandingPage: false };
      }
      return { browserActiveTabId: tabId };
    });
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
        scheduleWrite(BROWSER_TABS_KEY, nextTabs);
      }
      return { browserTabs: nextTabs, browserTabsById: buildTabsById(nextTabs) };
    }),

  browserToggleTabMute: (tabId) =>
    set((state) => {
      const nextTabs = state.browserTabs.map((tab) =>
        tab.id === tabId ? { ...tab, isAudioMuted: !tab.isAudioMuted } : tab
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
      if (state.browserTabs === newOrder) {
        return state;
      }

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
});
