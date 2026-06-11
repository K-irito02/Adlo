import type { StoreState } from '../StoreState';
import { createUiId, createDebouncedWrite } from '../shared';
import { formatNewFolderNameByLocale } from '../../i18n';
import type { TabFolderState } from './browserFoldersSlice';

export interface BrowserBookmark {
  url: string;
  title: string;
}

const BROWSER_BOOKMARKS_KEY = 'adl-ui:browser-bookmarks';
const BROWSER_TAB_FOLDERS_KEY = 'adl-ui:browser-tab-folders';

const { scheduleWrite } = createDebouncedWrite(50);

export const BROWSER_BOOKMARKS_STORAGE_KEY = BROWSER_BOOKMARKS_KEY;

export interface BrowserBookmarkSlice {
  browserBookmarks: BrowserBookmark[];

  browserToggleBookmark: (input?: { url?: string; title?: string }) => void;
  browserBookmarkTab: (tabId: string, folderId?: string, newFolderName?: string) => void;
}

export const createBrowserBookmarkSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): BrowserBookmarkSlice => ({
  browserBookmarks: [],

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

  browserBookmarkTab: (tabId, folderId, newFolderName) => {
    set((state) => {
      const tab = state.browserTabs.find((t) => t.id === tabId);
      if (!tab) {
        return {};
      }

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
});
