import type { StoreState } from '../StoreState';
import { createUiId, createDebouncedWrite } from '../shared';
import { formatNewFolderNameByLocale } from '../../i18n';
import type { TabFolderState } from './browserFoldersSlice';
import { hostnameFromUrl } from '../../utils/browserDisplayUtils';

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

const BROWSER_BOOKMARKS_KEY = 'adl-ui:browser-bookmarks';
const BROWSER_TAB_FOLDERS_KEY = 'adl-ui:browser-tab-folders';
const BROWSER_WORKSPACE_BOOKMARKS_KEY = 'adl-ui:browser-workspace-bookmarks';

const { scheduleWrite } = createDebouncedWrite(50);

export const BROWSER_BOOKMARKS_STORAGE_KEY = BROWSER_BOOKMARKS_KEY;
export const BROWSER_WORKSPACE_BOOKMARKS_STORAGE_KEY = BROWSER_WORKSPACE_BOOKMARKS_KEY;
export const BROWSER_BOOKMARK_TABID_URL_MAP_KEY = 'adl-ui:browser-bookmark-tabid-url-map';

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
  browserRemoveTabBookmarks: (tabId: string, url: string) => void;
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
      const active =
        state.browserTabs.find((tab) => tab.id === state.browserActiveTabId) ??
        state.browserTabs[0];
      const url = input?.url?.trim() ?? active?.url ?? 'about:blank';
      const rawTitle = input?.title?.trim() || active?.title || url;
      const title = rawTitle || hostnameFromUrl(url) || url;
      const exists = state.browserBookmarks.some((bookmark) => bookmark.url === url);
      const nextBookmarks = exists
        ? state.browserBookmarks.filter((bookmark) => bookmark.url !== url)
        : [...state.browserBookmarks, { url, title }];

      let nextFolders = state.browserTabFolders;
      let nextWorkspaceBookmarks = state.browserWorkspaceBookmarks;

      // 维护 tabId→URL 映射
      let nextTabIdUrlMap = state.browserBookmarkTabIdUrlMap;
      if (exists) {
        // 取消收藏 — 移除对应 tabId 的映射
        const tabIdsForUrl = new Set(
          state.browserTabs.filter((tab) => tab.url === url).map((tab) => tab.id)
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

      if (exists) {
        const tabIdsForUrl = new Set(
          state.browserTabs.filter((tab) => tab.url === url).map((tab) => tab.id)
        );

        if (tabIdsForUrl.size > 0) {
          nextFolders = state.browserTabFolders.map((folder) => {
            if (
              folder.tabs &&
              folder.tabs.some((item) => tabIdsForUrl.has(item.tabId) && item.url === url)
            ) {
              return {
                ...folder,
                tabs: folder.tabs.filter(
                  (item) => !(tabIdsForUrl.has(item.tabId) && item.url === url)
                ),
              };
            }
            return folder;
          });
          scheduleWrite(BROWSER_TAB_FOLDERS_KEY, nextFolders);

          nextWorkspaceBookmarks = { ...state.browserWorkspaceBookmarks };
          for (const wsId of Object.keys(nextWorkspaceBookmarks)) {
            if (
              nextWorkspaceBookmarks[wsId].some(
                (entry) => tabIdsForUrl.has(entry.tabId) && entry.url === url
              )
            ) {
              nextWorkspaceBookmarks[wsId] = nextWorkspaceBookmarks[wsId].filter(
                (entry) => !(tabIdsForUrl.has(entry.tabId) && entry.url === url)
              );
              if (nextWorkspaceBookmarks[wsId].length === 0) {
                delete nextWorkspaceBookmarks[wsId];
              }
            }
          }
          scheduleWrite(BROWSER_WORKSPACE_BOOKMARKS_KEY, nextWorkspaceBookmarks);
        }
      }

      scheduleWrite(BROWSER_BOOKMARKS_KEY, nextBookmarks);
      scheduleWrite(BROWSER_BOOKMARK_TABID_URL_MAP_KEY, nextTabIdUrlMap);
      return {
        browserBookmarks: nextBookmarks,
        browserTabFolders: nextFolders,
        browserWorkspaceBookmarks: nextWorkspaceBookmarks,
        browserBookmarkTabIdUrlMap: nextTabIdUrlMap,
      };
    });
  },

  browserBookmarkTab: (tabId, folderId, newFolderName, workspaceId) => {
    set((state) => {
      const tab = state.browserTabs.find((t) => t.id === tabId);
      if (!tab || !tab.url) {
        return {};
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
        const locale = state.appInfo?.config.language === 'en-US' ? 'en-US' : 'zh-CN';
        const folderName =
          newFolderName.trim() || formatNewFolderNameByLocale(locale, folderCount + 1);
        const newFolder: TabFolderState = {
          id: createUiId('tab-folder'),
          name: folderName,
          createdAt: Date.now(),
          isUserCreated: true,
          tabs: [{ tabId, url, title }],
        };
        nextFolders = [...nextFolders, newFolder];
        targetFolderId = newFolder.id;
      } else if (targetFolderId) {
        nextFolders = nextFolders.map((folder) => {
          if (folder.id === targetFolderId) {
            const existingTabs = folder.tabs || [];
            // Dedup by (tabId + url) — same tab with different URL appends, same URL updates title
            const existing = existingTabs.find((item) => item.tabId === tabId && item.url === url);
            if (existing) {
              if (existing.title !== title) {
                return {
                  ...folder,
                  tabs: existingTabs.map((item) =>
                    item.tabId === tabId && item.url === url ? { tabId, url, title } : item
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

      // 维护 tabId→URL 映射
      let nextTabIdUrlMap = state.browserBookmarkTabIdUrlMap;
      nextTabIdUrlMap = { ...nextTabIdUrlMap, [tabId]: url };

      // 如果指定了 workspaceId，将标签添加到工作区级别的书签中（含 URL/title 快照）
      let nextWorkspaceBookmarks = state.browserWorkspaceBookmarks;
      if (workspaceId) {
        const existingWsTabs = state.browserWorkspaceBookmarks[workspaceId] || [];
        const existingIdx = existingWsTabs.findIndex(
          (entry) => entry.tabId === tabId && entry.url === url
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
        scheduleWrite(BROWSER_WORKSPACE_BOOKMARKS_KEY, nextWorkspaceBookmarks);
      }

      scheduleWrite(BROWSER_TAB_FOLDERS_KEY, nextFolders);
      scheduleWrite(BROWSER_BOOKMARKS_KEY, nextBookmarks);
      scheduleWrite(BROWSER_BOOKMARK_TABID_URL_MAP_KEY, nextTabIdUrlMap);
      return {
        browserTabFolders: nextFolders,
        browserBookmarks: nextBookmarks,
        browserWorkspaceBookmarks: nextWorkspaceBookmarks,
        browserBookmarkTabIdUrlMap: nextTabIdUrlMap,
      };
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

  browserRemoveTabBookmarks: (tabId: string, url: string) => {
    set((state) => {
      const nextBookmarks = state.browserBookmarks.filter((b) => b.url !== url);
      scheduleWrite(BROWSER_BOOKMARKS_KEY, nextBookmarks);

      // 清除 tabId→URL 映射
      const nextTabIdUrlMap = { ...state.browserBookmarkTabIdUrlMap };
      delete nextTabIdUrlMap[tabId];

      // Remove from workspace bookmarks
      const nextWorkspaceBookmarks = { ...state.browserWorkspaceBookmarks };
      let wsChanged = false;
      for (const wsId of Object.keys(nextWorkspaceBookmarks)) {
        if (nextWorkspaceBookmarks[wsId].some((entry) => entry.tabId === tabId)) {
          nextWorkspaceBookmarks[wsId] = nextWorkspaceBookmarks[wsId].filter(
            (entry) => entry.tabId !== tabId
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

      // Remove from folders (match by both tabId and url to avoid removing other folders' entries)
      const nextFolders = state.browserTabFolders.map((folder) => {
        if (folder.tabs && folder.tabs.some((item) => item.tabId === tabId && item.url === url)) {
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

      scheduleWrite(BROWSER_BOOKMARK_TABID_URL_MAP_KEY, nextTabIdUrlMap);
      return {
        browserBookmarks: nextBookmarks,
        browserWorkspaceBookmarks: nextWorkspaceBookmarks,
        browserTabFolders: nextFolders,
        browserBookmarkTabIdUrlMap: nextTabIdUrlMap,
      };
    });
  },

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
