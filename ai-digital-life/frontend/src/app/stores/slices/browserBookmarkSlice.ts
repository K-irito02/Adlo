import type { StoreState } from '../StoreState';
import { createUiId, createDebouncedWrite } from '../shared';
// Cross-slice constants centralized in the shared leaf module to break the
// foldersSlice <-> bookmarkSlice import cycle. Re-imported here because this
// slice writes to them internally (see scheduleWrite calls below).
import {
  BROWSER_BOOKMARKS_KEY,
  BROWSER_TAB_FOLDERS_KEY,
  BROWSER_WORKSPACE_BOOKMARKS_KEY,
  BROWSER_BOOKMARK_TABID_URL_MAP_KEY,
} from './browserSliceShared';
import { computeToggleBookmarkOutcome, computeBookmarkTabOutcome } from './browserBookmarkHelpers';

export interface BrowserBookmark {
  url: string;
  title: string;
}

/** Workspace bookmark entry — stores tabId + snapshot of URL/title at bookmark time. */
export interface WorkspaceBookmarkEntry {
  tabId: string;
  url: string;
  title: string;
}

const { scheduleWrite } = createDebouncedWrite(50);

export const BROWSER_WORKSPACE_BOOKMARKS_STORAGE_KEY = BROWSER_WORKSPACE_BOOKMARKS_KEY;
// `BROWSER_BOOKMARKS_STORAGE_KEY` and `BROWSER_BOOKMARK_TABID_URL_MAP_KEY` now
// live in `./browserSliceShared` to break the cross-slice import cycle.
// `BROWSER_BOOKMARK_TABID_URL_MAP_KEY` is re-imported above for internal use.

export interface BrowserBookmarkSlice {
  browserBookmarks: BrowserBookmark[];
  /** Workspace ID → list of bookmark entries (each stores tabId + URL/title snapshot). */
  browserWorkspaceBookmarks: Record<string, WorkspaceBookmarkEntry[]>;

  /** tabId → original bookmarked URL — enables snapshot lookup after tab navigation */
  browserBookmarkTabIdUrlMap: Record<string, string>;

  /** Pending bookmark to be confirmed via dialog (set by context menu) */
  browserPendingBookmark: { url: string; title: string; tabId?: string } | null;

  browserToggleBookmark: (input?: { url?: string; title?: string }) => void;
  browserBookmarkTab: (
    tabId: string,
    folderId?: string,
    newFolderName?: string,
    workspaceId?: string
  ) => void;
  browserUpdateBookmarkTitle: (url: string, title: string) => void;
  browserRemoveTabBookmarks: (tabId: string, url: string, scopeFolderId?: string) => void;
  browserRemoveOrphanedBookmarks: () => void;
  browserClearAllWorkspaceBookmarks: () => void;
  browserSetPendingBookmark: (data: { url: string; title: string; tabId?: string } | null) => void;
}

export const createBrowserBookmarkSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
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
        scheduleWrite(BROWSER_BOOKMARKS_KEY, outcome.partial.browserBookmarks);
      }
      if (outcome.foldersChanged) {
        scheduleWrite(BROWSER_TAB_FOLDERS_KEY, outcome.partial.browserTabFolders);
      }
      if (outcome.wsBookmarksChanged) {
        scheduleWrite(BROWSER_WORKSPACE_BOOKMARKS_KEY, outcome.partial.browserWorkspaceBookmarks);
      }
      if (outcome.tabIdUrlMapChanged) {
        scheduleWrite(
          BROWSER_BOOKMARK_TABID_URL_MAP_KEY,
          outcome.partial.browserBookmarkTabIdUrlMap
        );
      }
      return outcome.partial;
    });
  },

  browserBookmarkTab: (tabId, folderId, newFolderName, workspaceId) => {
    set((state) => {
      const locale = state.appInfo?.config.language === 'en-US' ? 'en-US' : 'zh-CN';
      const outcome = computeBookmarkTabOutcome(state, {
        tabId,
        folderId,
        newFolderName,
        workspaceId,
        newFolderId: createUiId('tab-folder'),
        now: Date.now(),
        locale,
      });
      if (outcome.partial === null) {
        return state;
      }
      if (outcome.foldersChanged) {
        scheduleWrite(BROWSER_TAB_FOLDERS_KEY, outcome.partial.browserTabFolders);
      }
      if (outcome.bookmarksChanged) {
        scheduleWrite(BROWSER_BOOKMARKS_KEY, outcome.partial.browserBookmarks);
      }
      if (outcome.wsBookmarksChanged) {
        scheduleWrite(BROWSER_WORKSPACE_BOOKMARKS_KEY, outcome.partial.browserWorkspaceBookmarks);
      }
      if (outcome.tabIdUrlMapChanged) {
        scheduleWrite(
          BROWSER_BOOKMARK_TABID_URL_MAP_KEY,
          outcome.partial.browserBookmarkTabIdUrlMap
        );
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
        b.url === url ? { ...b, title } : b
      );
      scheduleWrite(BROWSER_BOOKMARKS_KEY, nextBookmarks);
      return { browserBookmarks: nextBookmarks };
    });
  },

  browserRemoveTabBookmarks: (tabId: string, url: string, scopeFolderId?: string) => {
    set((state) => {
      // 清除 tabId→URL 映射
      const nextTabIdUrlMap = { ...state.browserBookmarkTabIdUrlMap };
      delete nextTabIdUrlMap[tabId];

      // Remove from workspace bookmarks (match by both tabId and url to avoid removing other URLs' entries)
      const nextWorkspaceBookmarks = { ...state.browserWorkspaceBookmarks };
      let wsChanged = false;
      for (const wsId of Object.keys(nextWorkspaceBookmarks)) {
        if (
          nextWorkspaceBookmarks[wsId].some((entry) => entry.tabId === tabId && entry.url === url)
        ) {
          nextWorkspaceBookmarks[wsId] = nextWorkspaceBookmarks[wsId].filter(
            (entry) => !(entry.tabId === tabId && entry.url === url)
          );
          if (nextWorkspaceBookmarks[wsId].length === 0) {
            delete nextWorkspaceBookmarks[wsId];
          }
          wsChanged = true;
        }
      }
      if (wsChanged) {
        scheduleWrite(BROWSER_WORKSPACE_BOOKMARKS_KEY, nextWorkspaceBookmarks);
      }

      // Remove from folders — when scopeFolderId is provided, only remove from that specific folder
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
        scheduleWrite(BROWSER_TAB_FOLDERS_KEY, nextFolders);
      }

      // Only remove from global bookmarks if this URL no longer exists in any folder or workspace
      const urlStillExists =
        Object.values(nextWorkspaceBookmarks).some((entries) =>
          entries.some((e) => e.url === url)
        ) || nextFolders.some((f) => f.tabs?.some((t) => t.url === url));
      const nextBookmarks = urlStillExists
        ? state.browserBookmarks
        : state.browserBookmarks.filter((b) => b.url !== url);
      if (!urlStillExists) {
        scheduleWrite(BROWSER_BOOKMARKS_KEY, nextBookmarks);
      }

      scheduleWrite(BROWSER_BOOKMARK_TABID_URL_MAP_KEY, nextTabIdUrlMap);
      return {
        browserBookmarks: nextBookmarks,
        browserWorkspaceBookmarks: nextWorkspaceBookmarks,
        browserTabFolders: nextFolders,
        browserBookmarkTabIdUrlMap: nextTabIdUrlMap,
      };
    });
  },

  /** Remove browserBookmarks entries whose URL no longer exists in any workspace bookmark or folder. */
  browserRemoveOrphanedBookmarks: () =>
    set((state) => {
      // Build the set of URLs still referenced across ALL workspaces and folders
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
      scheduleWrite(BROWSER_BOOKMARKS_KEY, nextBookmarks);
      return { browserBookmarks: nextBookmarks };
    }),

  browserClearAllWorkspaceBookmarks: () => {
    scheduleWrite(BROWSER_WORKSPACE_BOOKMARKS_KEY, {});
    scheduleWrite(BROWSER_BOOKMARK_TABID_URL_MAP_KEY, {});
    set({
      browserWorkspaceBookmarks: {},
      browserBookmarkTabIdUrlMap: {},
    });
  },

  browserSetPendingBookmark: (data) => {
    set({ browserPendingBookmark: data });
  },
});
