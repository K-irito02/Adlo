import type { StoreState } from '../StoreState';
import { createUiId } from '../shared';
import { persist } from '../persisted/persist';
import { formatNewFolderNameByLocale } from '@i18n';
import { resolveAppLanguage } from '@i18n/resolveLanguage';
import type { BookmarkFolder, BookmarkFolderUpdate } from './browserFoldersTypes';
import { collectAllDescendantFolderIds } from './browserFoldersUtils';
import {
  computeDeleteAllBookmarksOutcome,
  computeDeleteOwnBookmarksOutcome,
} from './browserFoldersDeletion';
import { applyBookmarkMove } from './browserBookmarkOrder';
import type { BookmarkMove, BookmarkMoveError } from './browserBookmarkOrder';

export type { BookmarkEntry, BookmarkFolder, BookmarkFolderUpdate } from './browserFoldersTypes';

export interface BrowserBookmarkFoldersSlice {
  browserBookmarkFolders: BookmarkFolder[];
  browserBookmarkChildOrder: Record<string, string[]>;
  browserTabTreeExpanded: Record<string, boolean>;

  browserCreateBookmarkFolder: (
    name?: string,
    parentId?: string,
    parentType?: 'workspace' | 'folder',
  ) => void;
  browserUpdateBookmarkFolder: (folderId: string, patch: Partial<BookmarkFolderUpdate>) => void;
  browserDeleteBookmarkFolder: (folderId: string) => void;
  browserToggleTabTreePath: (path: string) => void;
  browserCollapseAllTreePaths: () => void;
  browserExpandAllTreePaths: (paths: string[]) => void;
  browserDeleteAllBookmarksInNode: (nodePath: string) => void;
  browserDeleteOwnBookmarksInNode: (nodePath: string) => void;
  browserClearAllFolderBookmarks: () => void;
  browserMoveBookmarkNode: (
    move: BookmarkMove,
  ) => { ok: true } | { ok: false; error: BookmarkMoveError };
}

export const createBrowserBookmarkFoldersSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): BrowserBookmarkFoldersSlice => ({
  browserBookmarkFolders: [],
  browserBookmarkChildOrder: {},
  browserTabTreeExpanded: {},

  browserCreateBookmarkFolder: async (
    name?: string,
    parentId?: string,
    parentType?: 'workspace' | 'folder',
  ) => {
    const folderCount = _get().browserBookmarkFolders.length;
    const locale = resolveAppLanguage(_get().appInfo?.config.language);
    const folderName = name?.trim() || (await formatNewFolderNameByLocale(locale, folderCount + 1));
    set((state) => {
      const newFolder: BookmarkFolder = {
        id: createUiId('bookmark-folder'),
        name: folderName,
        createdAt: Date.now(),
        isUserCreated: true,
        parentId: parentId,
        parentType: parentType as 'workspace' | 'folder' | undefined,
      };
      const resultFolders = [...state.browserBookmarkFolders, newFolder];
      persist('adl:browser.bookmarkFolders', resultFolders);
      return { browserBookmarkFolders: resultFolders };
    });
  },

  browserUpdateBookmarkFolder: (folderId, patch) =>
    set((state) => {
      const nextFolders = state.browserBookmarkFolders.map((folder) => {
        if (folder.id === folderId) {
          return { ...folder, ...patch };
        }
        return folder;
      });
      persist('adl:browser.bookmarkFolders', nextFolders);
      return { browserBookmarkFolders: nextFolders };
    }),

  browserDeleteBookmarkFolder: (folderId) =>
    set((state) => {
      const idsToDelete = [
        folderId,
        ...collectAllDescendantFolderIds(state.browserBookmarkFolders, folderId),
      ];
      const nextFolders = state.browserBookmarkFolders.filter(
        (folder) => !idsToDelete.includes(folder.id),
      );
      persist('adl:browser.bookmarkFolders', nextFolders);
      return { browserBookmarkFolders: nextFolders };
    }),

  browserToggleTabTreePath: (path) =>
    set((state) => {
      const next = {
        ...state.browserTabTreeExpanded,
        [path]: !(state.browserTabTreeExpanded[path] ?? false),
      };
      persist('adl:browser.tabTreeExpanded', next);
      return { browserTabTreeExpanded: next };
    }),

  browserCollapseAllTreePaths: () =>
    set((_state) => {
      persist('adl:browser.tabTreeExpanded', {});
      return { browserTabTreeExpanded: {} };
    }),

  browserExpandAllTreePaths: (paths) =>
    set((_state) => {
      const next: Record<string, boolean> = {};
      for (const p of paths) {
        next[p] = true;
      }
      persist('adl:browser.tabTreeExpanded', next);
      return { browserTabTreeExpanded: next };
    }),

  browserDeleteAllBookmarksInNode: (nodePath) =>
    set((state) => {
      const outcome = computeDeleteAllBookmarksOutcome(state, nodePath);
      if (outcome.partial === null) {
        return state;
      }
      if (outcome.wsChanged) {
        persist('adl:browser.workspaceBookmarks', outcome.partial.browserWorkspaceBookmarks!);
      }
      if (outcome.foldersChanged) {
        persist('adl:browser.bookmarkFolders', outcome.partial.browserBookmarkFolders!);
      }
      if (outcome.tabsChanged) {
        persist('adl:browser.tabs', outcome.partial.browserTabs!);
        persist('adl:browser.activeTabId', outcome.partial.browserActiveTabId!);
      }
      if (outcome.historyChanged) {
        persist('adl:browser.history', outcome.partial.browserHistory!);
      }
      return outcome.partial;
    }),

  browserDeleteOwnBookmarksInNode: (nodePath) =>
    set((state) => {
      const outcome = computeDeleteOwnBookmarksOutcome(state, nodePath);
      if (outcome.partial === null) {
        return state;
      }
      if (outcome.wsChanged) {
        persist('adl:browser.workspaceBookmarks', outcome.partial.browserWorkspaceBookmarks!);
      }
      if (outcome.foldersChanged) {
        persist('adl:browser.bookmarkFolders', outcome.partial.browserBookmarkFolders!);
      }
      if (outcome.tabsChanged) {
        persist('adl:browser.tabs', outcome.partial.browserTabs!);
        persist('adl:browser.activeTabId', outcome.partial.browserActiveTabId!);
      }
      if (outcome.historyChanged) {
        persist('adl:browser.history', outcome.partial.browserHistory!);
      }
      return outcome.partial;
    }),

  browserClearAllFolderBookmarks: () => {
    set((state) => {
      const allBookmarkIds: string[] = [];
      const allUrls: string[] = [];
      for (const folder of state.browserBookmarkFolders) {
        if (folder.entries) {
          for (const entry of folder.entries) {
            allBookmarkIds.push(entry.id);
            if (entry.url && !allUrls.includes(entry.url)) {
              allUrls.push(entry.url);
            }
          }
        }
      }

      const urlSet = new Set(allUrls);
      const nextBookmarks = state.browserBookmarks.filter((b) => !urlSet.has(b.url));

      const bookmarkIdSet = new Set(allBookmarkIds);
      const nextWorkspaceBookmarks = { ...state.browserWorkspaceBookmarks };
      for (const wsId of Object.keys(nextWorkspaceBookmarks)) {
        const entries = nextWorkspaceBookmarks[wsId];
        const remaining = entries.filter((entry) => !bookmarkIdSet.has(entry.id));
        if (remaining.length === 0) {
          delete nextWorkspaceBookmarks[wsId];
        } else {
          nextWorkspaceBookmarks[wsId] = remaining;
        }
      }

      const nextFolders = state.browserBookmarkFolders.map((f) => {
        if (f.entries && f.entries.length > 0) {
          return { ...f, entries: [] };
        }
        return f;
      });

      persist('adl:browser.bookmarkFolders', nextFolders);
      persist('adl:browser.bookmarks', nextBookmarks);
      persist('adl:browser.workspaceBookmarks', nextWorkspaceBookmarks);
      return {
        browserBookmarkFolders: nextFolders,
        browserBookmarks: nextBookmarks,
        browserWorkspaceBookmarks: nextWorkspaceBookmarks,
      };
    });
  },

  browserMoveBookmarkNode: (move) => {
    const state = _get();
    const result = applyBookmarkMove(
      {
        browserBookmarkFolders: state.browserBookmarkFolders,
        browserWorkspaceBookmarks: state.browserWorkspaceBookmarks,
        browserBookmarkChildOrder: state.browserBookmarkChildOrder,
        workspaceIds: state.recentWorkspaces?.map((workspace) => workspace.id),
      },
      move,
    );
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    set({
      browserBookmarkFolders: result.state.browserBookmarkFolders,
      browserWorkspaceBookmarks: result.state.browserWorkspaceBookmarks,
      browserBookmarkChildOrder: result.state.browserBookmarkChildOrder,
    });
    persist('adl:browser.bookmarkFolders', result.state.browserBookmarkFolders);
    persist('adl:browser.workspaceBookmarks', result.state.browserWorkspaceBookmarks);
    persist('adl:browser.bookmarkChildOrder', result.state.browserBookmarkChildOrder);
    return { ok: true };
  },
});
