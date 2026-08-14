import type { StoreState } from '../StoreState';
import { createUiId, makePersistedWriter } from '../shared';
import {
  BROWSER_BOOKMARKS_KEY,
  BROWSER_TAB_FOLDERS_KEY,
  BROWSER_WORKSPACE_BOOKMARKS_KEY,
  BROWSER_BOOKMARK_TABID_URL_MAP_KEY,
} from './browserSliceShared';
import { formatNewFolderNameByLocale } from '@i18n';
import type {
  BrowserTabState,
  BrowserBookmark as _BrowserBookmark,
  WorkspaceBookmarkEntry as _WorkspaceBookmarkEntry,
  TabFolderState,
  BookmarkTabItem,
} from './browserTypes';
import { hostnameFromUrl } from '@utils/browserDisplayUtils';

export type BrowserBookmark = _BrowserBookmark;
export type WorkspaceBookmarkEntry = _WorkspaceBookmarkEntry;

const writeBookmarks = makePersistedWriter(BROWSER_BOOKMARKS_KEY);
const writeTabFolders = makePersistedWriter(BROWSER_TAB_FOLDERS_KEY);
const writeWorkspaceBookmarks = makePersistedWriter(BROWSER_WORKSPACE_BOOKMARKS_KEY);
const writeBookmarkTabIdUrlMap = makePersistedWriter(BROWSER_BOOKMARK_TABID_URL_MAP_KEY);

export const BROWSER_WORKSPACE_BOOKMARKS_STORAGE_KEY = BROWSER_WORKSPACE_BOOKMARKS_KEY;

interface BrowserBookmarkHelpersState {
  browserTabs: BrowserTabState[];
  browserActiveTabId: string;
  browserBookmarks: _BrowserBookmark[];
  browserTabFolders: TabFolderState[];
  browserWorkspaceBookmarks: Record<string, _WorkspaceBookmarkEntry[]>;
  browserBookmarkTabIdUrlMap: Record<string, string>;
}

interface BookmarkOutcome {
  partial: Partial<{
    browserBookmarks: _BrowserBookmark[];
    browserTabFolders: TabFolderState[];
    browserWorkspaceBookmarks: Record<string, _WorkspaceBookmarkEntry[]>;
    browserBookmarkTabIdUrlMap: Record<string, string>;
  }> | null;
  bookmarksChanged: boolean;
  foldersChanged: boolean;
  wsBookmarksChanged: boolean;
  tabIdUrlMapChanged: boolean;
}

interface BookmarkTabParams {
  tabId: string;
  folderId?: string;
  newFolderName?: string;
  workspaceId?: string;
  newFolderId: string;
  now: number;
  locale: 'en-US' | 'zh-CN';
}

function computeToggleBookmarkOutcome(
  state: BrowserBookmarkHelpersState,
  input?: { url?: string; title?: string },
): BookmarkOutcome {
  const active =
    state.browserTabs.find((tab) => tab.id === state.browserActiveTabId) ?? state.browserTabs[0];
  const url = input?.url?.trim() ?? active?.url ?? 'about:blank';
  const rawTitle = input?.title?.trim() || active?.title || url;
  const title = rawTitle || hostnameFromUrl(url) || url;
  const exists = state.browserBookmarks.some((bookmark) => bookmark.url === url);
  const nextBookmarks = exists
    ? state.browserBookmarks.filter((bookmark) => bookmark.url !== url)
    : [...state.browserBookmarks, { url, title }];

  let nextFolders = state.browserTabFolders;
  let nextWorkspaceBookmarks = state.browserWorkspaceBookmarks;

  let nextTabIdUrlMap = state.browserBookmarkTabIdUrlMap;
  if (exists) {
    const tabIdsForUrl = new Set(
      state.browserTabs.filter((tab) => tab.url === url).map((tab) => tab.id),
    );
    if (tabIdsForUrl.size > 0) {
      nextTabIdUrlMap = { ...nextTabIdUrlMap };
      for (const tid of tabIdsForUrl) {
        delete nextTabIdUrlMap[tid];
      }
    }
  } else if (active?.id) {
    nextTabIdUrlMap = {
      ...(nextTabIdUrlMap !== undefined ? nextTabIdUrlMap : {}),
      [active.id]: url,
    };
  }

  let foldersChanged = false;
  let wsBookmarksChanged = false;

  if (exists) {
    const tabIdsForUrl = new Set(
      state.browserTabs.filter((tab) => tab.url === url).map((tab) => tab.id),
    );

    if (tabIdsForUrl.size > 0) {
      nextFolders = state.browserTabFolders.map((folder) => {
        if (
          folder.tabs &&
          folder.tabs.some((item) => tabIdsForUrl.has(item.tabId) && item.url === url)
        ) {
          return {
            ...folder,
            tabs: folder.tabs.filter((item) => !(tabIdsForUrl.has(item.tabId) && item.url === url)),
          };
        }
        return folder;
      });
      foldersChanged = true;

      nextWorkspaceBookmarks = { ...state.browserWorkspaceBookmarks };
      for (const wsId of Object.keys(nextWorkspaceBookmarks)) {
        if (
          nextWorkspaceBookmarks[wsId].some(
            (entry) => tabIdsForUrl.has(entry.tabId) && entry.url === url,
          )
        ) {
          nextWorkspaceBookmarks[wsId] = nextWorkspaceBookmarks[wsId].filter(
            (entry) => !(tabIdsForUrl.has(entry.tabId) && entry.url === url),
          );
          if (nextWorkspaceBookmarks[wsId].length === 0) {
            delete nextWorkspaceBookmarks[wsId];
          }
        }
      }
      wsBookmarksChanged = true;
    }
  }

  return {
    partial: {
      browserBookmarks: nextBookmarks,
      browserTabFolders: nextFolders,
      browserWorkspaceBookmarks: nextWorkspaceBookmarks,
      browserBookmarkTabIdUrlMap: nextTabIdUrlMap,
    },
    bookmarksChanged: true,
    foldersChanged,
    wsBookmarksChanged,
    tabIdUrlMapChanged: true,
  };
}

function computeBookmarkTabOutcome(
  state: BrowserBookmarkHelpersState,
  params: BookmarkTabParams,
): BookmarkOutcome {
  const { tabId, folderId, newFolderName, workspaceId, newFolderId, now } = params;
  const tab = state.browserTabs.find((t) => t.id === tabId);
  if (!tab || !tab.url) {
    return {
      partial: null,
      bookmarksChanged: false,
      foldersChanged: false,
      wsBookmarksChanged: false,
      tabIdUrlMapChanged: false,
    };
  }

  const url = tab.url;
  const rawTitle = tab.title;
  const title = rawTitle || hostnameFromUrl(url) || url;

  const existsInBookmarks = state.browserBookmarks.some((b) => b.url === url);
  let nextBookmarks = state.browserBookmarks;

  if (!existsInBookmarks) {
    nextBookmarks = [...state.browserBookmarks, { url, title }];
  }

  let nextFolders = [...state.browserTabFolders];
  let targetFolderId = folderId;

  if (!targetFolderId && newFolderName) {
    const folderCount = nextFolders.length;
    const folderName = newFolderName.trim() || `New Folder ${folderCount + 1}`;
    const newFolder: TabFolderState = {
      id: newFolderId,
      name: folderName,
      createdAt: now,
      isUserCreated: true,
      tabs: [{ tabId, url, title }],
    };
    nextFolders = [...nextFolders, newFolder];
    targetFolderId = newFolder.id;
  } else if (targetFolderId) {
    nextFolders = nextFolders.map((folder) => {
      if (folder.id === targetFolderId) {
        const existingTabs: BookmarkTabItem[] = folder.tabs || [];
        const existing = existingTabs.find((item) => item.tabId === tabId && item.url === url);
        if (existing) {
          if (existing.title !== title) {
            return {
              ...folder,
              tabs: existingTabs.map((item) =>
                item.tabId === tabId && item.url === url ? { tabId, url, title } : item,
              ),
            };
          }
        } else {
          return {
            ...folder,
            tabs: [...existingTabs, { tabId, url, title }],
          };
        }
      }
      return folder;
    });
  }

  let nextTabIdUrlMap = state.browserBookmarkTabIdUrlMap;
  nextTabIdUrlMap = { ...nextTabIdUrlMap, [tabId]: url };

  let nextWorkspaceBookmarks = state.browserWorkspaceBookmarks;
  let wsBookmarksChanged = false;
  if (workspaceId) {
    const existingWsTabs = state.browserWorkspaceBookmarks[workspaceId] || [];
    const existingIdx = existingWsTabs.findIndex(
      (entry) => entry.tabId === tabId && entry.url === url,
    );
    if (existingIdx >= 0) {
      const updated = [...existingWsTabs];
      updated[existingIdx] = { tabId, url, title };
      nextWorkspaceBookmarks = {
        ...state.browserWorkspaceBookmarks,
        [workspaceId]: updated,
      };
    } else {
      nextWorkspaceBookmarks = {
        ...state.browserWorkspaceBookmarks,
        [workspaceId]: [...existingWsTabs, { tabId, url, title }],
      };
    }
    wsBookmarksChanged = true;
  }

  return {
    partial: {
      browserTabFolders: nextFolders,
      browserBookmarks: nextBookmarks,
      browserWorkspaceBookmarks: nextWorkspaceBookmarks,
      browserBookmarkTabIdUrlMap: nextTabIdUrlMap,
    },
    bookmarksChanged: true,
    foldersChanged: true,
    wsBookmarksChanged,
    tabIdUrlMapChanged: true,
  };
}

export interface BrowserBookmarkSlice {
  browserBookmarks: _BrowserBookmark[];
  browserWorkspaceBookmarks: Record<string, _WorkspaceBookmarkEntry[]>;
  browserBookmarkTabIdUrlMap: Record<string, string>;
  browserPendingBookmark: { url: string; title: string; tabId?: string } | null;

  browserToggleBookmark: (input?: { url?: string; title?: string }) => void;
  browserCreateBookmarkEntry: (input: {
    url: string;
    title: string;
    workspaceId?: string;
    folderId?: string;
  }) => void;
  browserBookmarkTab: (
    tabId: string,
    folderId?: string,
    newFolderName?: string,
    workspaceId?: string,
  ) => void;
  browserUpdateBookmarkTitle: (url: string, title: string) => void;
  browserRemoveTabBookmarks: (tabId: string, url: string, scopeFolderId?: string) => void;
  browserRemoveOrphanedBookmarks: () => void;
  browserClearAllWorkspaceBookmarks: () => void;
  browserSetPendingBookmark: (data: { url: string; title: string; tabId?: string } | null) => void;
}

export const createBrowserBookmarkSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): BrowserBookmarkSlice => ({
  browserBookmarks: [],
  browserWorkspaceBookmarks: {},
  browserBookmarkTabIdUrlMap: {},
  browserPendingBookmark: null,

  browserToggleBookmark: (input?: { url?: string; title?: string }) => {
    set((state) => {
      const outcome = computeToggleBookmarkOutcome(state, input);
      if (outcome.partial === null) {
        return state;
      }
      if (outcome.bookmarksChanged) {
        writeBookmarks(outcome.partial.browserBookmarks);
      }
      if (outcome.foldersChanged) {
        writeTabFolders(outcome.partial.browserTabFolders);
      }
      if (outcome.wsBookmarksChanged) {
        writeWorkspaceBookmarks(outcome.partial.browserWorkspaceBookmarks);
      }
      if (outcome.tabIdUrlMapChanged) {
        writeBookmarkTabIdUrlMap(outcome.partial.browserBookmarkTabIdUrlMap);
      }
      return outcome.partial;
    });
  },

  browserCreateBookmarkEntry: (input) => {
    set((state) => {
      const url = input.url.trim();
      const title = input.title.trim() || hostnameFromUrl(url) || url;
      if (!url) {
        return state;
      }
      const syntheticTabId = createUiId('bookmark');
      const exists = state.browserBookmarks.some((b) => b.url === url);
      const nextBookmarks = exists
        ? state.browserBookmarks
        : [...state.browserBookmarks, { url, title }];

      let nextFolders = state.browserTabFolders;
      let foldersChanged = false;
      if (input.folderId) {
        nextFolders = state.browserTabFolders.map((folder) => {
          if (folder.id !== input.folderId) {
            return folder;
          }
          const existingTabs = folder.tabs || [];
          if (existingTabs.some((item) => item.url === url)) {
            return folder;
          }
          foldersChanged = true;
          return { ...folder, tabs: [...existingTabs, { tabId: syntheticTabId, url, title }] };
        });
      }

      let nextWorkspaceBookmarks = state.browserWorkspaceBookmarks;
      let wsChanged = false;
      if (input.workspaceId) {
        const existing = state.browserWorkspaceBookmarks[input.workspaceId] || [];
        if (!existing.some((entry) => entry.url === url)) {
          nextWorkspaceBookmarks = {
            ...state.browserWorkspaceBookmarks,
            [input.workspaceId]: [...existing, { tabId: syntheticTabId, url, title }],
          };
          wsChanged = true;
        }
      }

      let nextTabIdUrlMap = state.browserBookmarkTabIdUrlMap;
      if (input.folderId && foldersChanged) {
        nextTabIdUrlMap = { ...nextTabIdUrlMap, [syntheticTabId]: url };
      }

      if (!exists) {
        writeBookmarks(nextBookmarks);
      }
      if (foldersChanged) {
        writeTabFolders(nextFolders);
      }
      if (wsChanged) {
        writeWorkspaceBookmarks(nextWorkspaceBookmarks);
      }
      if (input.folderId && foldersChanged) {
        writeBookmarkTabIdUrlMap(nextTabIdUrlMap);
      }

      return {
        browserBookmarks: nextBookmarks,
        browserTabFolders: nextFolders,
        browserWorkspaceBookmarks: nextWorkspaceBookmarks,
        browserBookmarkTabIdUrlMap: nextTabIdUrlMap,
      };
    });
  },

  browserBookmarkTab: async (tabId, folderId, newFolderName, workspaceId) => {
    const locale = (_get().appInfo?.config.language ?? 'zh-CN') as 'zh-CN' | 'en-US';
    const folders = _get().browserTabFolders;
    const resolvedName =
      newFolderName != null
        ? newFolderName.trim() || (await formatNewFolderNameByLocale(locale, folders.length + 1))
        : undefined;
    set((state) => {
      const outcome = computeBookmarkTabOutcome(state, {
        tabId,
        folderId,
        newFolderName: resolvedName,
        workspaceId,
        newFolderId: createUiId('tab-folder'),
        now: Date.now(),
        locale,
      });
      if (outcome.partial === null) {
        return state;
      }
      if (outcome.foldersChanged) {
        writeTabFolders(outcome.partial.browserTabFolders);
      }
      if (outcome.bookmarksChanged) {
        writeBookmarks(outcome.partial.browserBookmarks);
      }
      if (outcome.wsBookmarksChanged) {
        writeWorkspaceBookmarks(outcome.partial.browserWorkspaceBookmarks);
      }
      if (outcome.tabIdUrlMapChanged) {
        writeBookmarkTabIdUrlMap(outcome.partial.browserBookmarkTabIdUrlMap);
      }
      return outcome.partial;
    });
  },

  browserUpdateBookmarkTitle: (url: string, title: string) => {
    set((state) => {
      const exists = state.browserBookmarks.some((b) => b.url === url && b.title !== title);
      if (!exists) {
        return state;
      }
      const nextBookmarks = state.browserBookmarks.map((b) =>
        b.url === url ? { ...b, title } : b,
      );
      writeBookmarks(nextBookmarks);
      return { browserBookmarks: nextBookmarks };
    });
  },

  browserRemoveTabBookmarks: (tabId: string, url: string, scopeFolderId?: string) => {
    set((state) => {
      const nextTabIdUrlMap = { ...state.browserBookmarkTabIdUrlMap };
      delete nextTabIdUrlMap[tabId];

      const nextWorkspaceBookmarks = { ...state.browserWorkspaceBookmarks };
      let wsChanged = false;
      for (const wsId of Object.keys(nextWorkspaceBookmarks)) {
        if (
          nextWorkspaceBookmarks[wsId].some((entry) => entry.tabId === tabId && entry.url === url)
        ) {
          nextWorkspaceBookmarks[wsId] = nextWorkspaceBookmarks[wsId].filter(
            (entry) => !(entry.tabId === tabId && entry.url === url),
          );
          if (nextWorkspaceBookmarks[wsId].length === 0) {
            delete nextWorkspaceBookmarks[wsId];
          }
          wsChanged = true;
        }
      }
      if (wsChanged) {
        writeWorkspaceBookmarks(nextWorkspaceBookmarks);
      }

      const nextFolders = scopeFolderId
        ? state.browserTabFolders.map((folder) => {
            if (
              folder.id === scopeFolderId &&
              folder.tabs?.some((item) => item.tabId === tabId && item.url === url)
            ) {
              return {
                ...folder,
                tabs: folder.tabs.filter((item) => !(item.tabId === tabId && item.url === url)),
              };
            }
            return folder;
          })
        : state.browserTabFolders.map((folder) => {
            if (
              folder.tabs &&
              folder.tabs.some((item) => item.tabId === tabId && item.url === url)
            ) {
              return {
                ...folder,
                tabs: folder.tabs.filter((item) => !(item.tabId === tabId && item.url === url)),
              };
            }
            return folder;
          });
      if (nextFolders !== state.browserTabFolders) {
        writeTabFolders(nextFolders);
      }

      const urlStillExists =
        Object.values(nextWorkspaceBookmarks).some((entries) =>
          entries.some((e) => e.url === url),
        ) || nextFolders.some((f) => f.tabs?.some((t) => t.url === url));
      const nextBookmarks = urlStillExists
        ? state.browserBookmarks
        : state.browserBookmarks.filter((b) => b.url !== url);
      if (!urlStillExists) {
        writeBookmarks(nextBookmarks);
      }

      writeBookmarkTabIdUrlMap(nextTabIdUrlMap);
      return {
        browserBookmarks: nextBookmarks,
        browserWorkspaceBookmarks: nextWorkspaceBookmarks,
        browserTabFolders: nextFolders,
        browserBookmarkTabIdUrlMap: nextTabIdUrlMap,
      };
    });
  },

  browserRemoveOrphanedBookmarks: () =>
    set((state) => {
      const referenced = new Set<string>();
      for (const entries of Object.values(state.browserWorkspaceBookmarks)) {
        for (const entry of entries) {
          if (entry.url) {
            referenced.add(entry.url);
          }
        }
      }
      for (const folder of state.browserTabFolders) {
        if (folder.tabs) {
          for (const tab of folder.tabs) {
            if (tab.url) {
              referenced.add(tab.url);
            }
          }
        }
      }
      const nextBookmarks = state.browserBookmarks.filter((b) => !b.url || referenced.has(b.url));
      if (nextBookmarks.length === state.browserBookmarks.length) {
        return state;
      }
      writeBookmarks(nextBookmarks);
      return { browserBookmarks: nextBookmarks };
    }),

  browserClearAllWorkspaceBookmarks: () => {
    writeWorkspaceBookmarks({});
    writeBookmarkTabIdUrlMap({});
    set({
      browserWorkspaceBookmarks: {},
      browserBookmarkTabIdUrlMap: {},
    });
  },

  browserSetPendingBookmark: (data) => {
    set({ browserPendingBookmark: data });
  },
});
