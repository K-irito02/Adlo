import type { StoreState } from '../StoreState';
import { createUiId } from '../shared';
import { persist } from '../persisted/persist';
import { formatNewFolderNameByLocale } from '@i18n';
import { resolveAppLanguage } from '@i18n/resolveLanguage';
import type {
  BrowserTabState,
  BrowserBookmark as _BrowserBookmark,
  BookmarkEntry,
  BookmarkFolder,
} from './browserTypes';
import { bookmarkUrlKey, hostnameFromUrl } from '@utils/browserDisplayUtils';
import { buildFolderPathLabel, buildWorkspacePathLabel } from './browserFoldersUtils';
import type { RecentWorkspaceEntry } from '@shared/ipc';

export type BrowserBookmark = _BrowserBookmark;

export interface BookmarkCollisionCheck {
  ok: boolean;
  pathLabel?: string;
  reason?: 'no-tab';
}

export function checkBookmarkCollision(
  url: string,
  title: string,
  opts: { workspaceId?: string; folderId?: string },
  state: BrowserBookmarkHelpersState,
  workspaces: RecentWorkspaceEntry[] = [],
  excludeBookmarkId?: string,
): BookmarkCollisionCheck {
  if (opts.folderId) {
    const folder = state.browserBookmarkFolders.find((f) => f.id === opts.folderId);
    const collides = folder?.entries?.some(
      (entry) => entry.id !== excludeBookmarkId && entry.url === url && entry.title === title,
    );
    if (collides) {
      return {
        ok: false,
        pathLabel: buildFolderPathLabel(opts.folderId, state.browserBookmarkFolders, workspaces),
      };
    }
  }
  if (opts.workspaceId) {
    const entries = state.browserWorkspaceBookmarks[opts.workspaceId] || [];
    if (
      entries.some(
        (entry) => entry.id !== excludeBookmarkId && entry.url === url && entry.title === title,
      )
    ) {
      return {
        ok: false,
        pathLabel: buildWorkspacePathLabel(opts.workspaceId, workspaces),
      };
    }
  }
  return { ok: true };
}

interface BrowserBookmarkHelpersState {
  browserTabs: BrowserTabState[];
  browserActiveTabId: string;
  browserBookmarks: _BrowserBookmark[];
  browserBookmarkFolders: BookmarkFolder[];
  browserWorkspaceBookmarks: Record<string, BookmarkEntry[]>;
}

interface BookmarkOutcome {
  partial: Partial<{
    browserBookmarks: _BrowserBookmark[];
    browserBookmarkFolders: BookmarkFolder[];
    browserWorkspaceBookmarks: Record<string, BookmarkEntry[]>;
  }> | null;
  bookmarksChanged: boolean;
  foldersChanged: boolean;
  wsBookmarksChanged: boolean;
}

const NO_CHANGES: BookmarkOutcome = {
  partial: null,
  bookmarksChanged: false,
  foldersChanged: false,
  wsBookmarksChanged: false,
};

function makeEntry(
  id: string,
  url: string,
  title: string,
  now: number,
  sourceTabId?: string,
): BookmarkEntry {
  return {
    id,
    url,
    title,
    addedAt: now,
    lastModifiedAt: now,
    ...(sourceTabId ? { sourceTabId } : {}),
  };
}

/** 该 (url,title) 元组是否仍被任何目录 / 工作区条目引用。 */
function isTupleStillReferenced(
  folders: BookmarkFolder[],
  workspaceBookmarks: Record<string, BookmarkEntry[]>,
  url: string,
  title: string,
): boolean {
  for (const entries of Object.values(workspaceBookmarks)) {
    if (entries.some((entry) => entry.url === url && entry.title === title)) {
      return true;
    }
  }
  return folders.some((folder) =>
    folder.entries?.some((entry) => entry.url === url && entry.title === title),
  );
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

  const exists = state.browserBookmarks.some((b) => b.url === url && b.title === title);
  if (!exists) {
    return {
      partial: { browserBookmarks: [...state.browserBookmarks, { url, title }] },
      bookmarksChanged: true,
      foldersChanged: false,
      wsBookmarksChanged: false,
    };
  }

  // 取消收藏：只移除「来自这些同 URL 标签页」的条目，手动加入目录的副本保持不动。
  const sourceTabIds = new Set(
    state.browserTabs.filter((tab) => tab.url === url).map((tab) => tab.id),
  );

  let foldersChanged = false;
  const nextFolders = state.browserBookmarkFolders.map((folder) => {
    if (!folder.entries?.length) {
      return folder;
    }
    const remaining = folder.entries.filter(
      (entry) =>
        !(
          entry.url === url &&
          entry.title === title &&
          entry.sourceTabId !== undefined &&
          sourceTabIds.has(entry.sourceTabId)
        ),
    );
    if (remaining.length === folder.entries.length) {
      return folder;
    }
    foldersChanged = true;
    return { ...folder, entries: remaining };
  });

  let wsBookmarksChanged = false;
  const nextWorkspaceBookmarks = { ...state.browserWorkspaceBookmarks };
  for (const wsId of Object.keys(nextWorkspaceBookmarks)) {
    const entries = nextWorkspaceBookmarks[wsId];
    const remaining = entries.filter(
      (entry) =>
        !(
          entry.url === url &&
          entry.title === title &&
          entry.sourceTabId !== undefined &&
          sourceTabIds.has(entry.sourceTabId)
        ),
    );
    if (remaining.length === entries.length) {
      continue;
    }
    wsBookmarksChanged = true;
    if (remaining.length === 0) {
      delete nextWorkspaceBookmarks[wsId];
    } else {
      nextWorkspaceBookmarks[wsId] = remaining;
    }
  }

  const stillReferenced = isTupleStillReferenced(nextFolders, nextWorkspaceBookmarks, url, title);
  const nextBookmarks = stillReferenced
    ? state.browserBookmarks
    : state.browserBookmarks.filter((b) => !(b.url === url && b.title === title));

  return {
    partial: {
      browserBookmarks: nextBookmarks,
      browserBookmarkFolders: nextFolders,
      browserWorkspaceBookmarks: nextWorkspaceBookmarks,
    },
    bookmarksChanged: nextBookmarks !== state.browserBookmarks,
    foldersChanged,
    wsBookmarksChanged,
  };
}

interface SaveTabBookmarkParams {
  tabId: string;
  folderId?: string;
  newFolderName?: string;
  workspaceId?: string;
  titleOverride?: string;
  newFolderId: string;
  newBookmarkId: string;
  now: number;
}

function computeSaveTabBookmarkOutcome(
  state: BrowserBookmarkHelpersState,
  params: SaveTabBookmarkParams,
): BookmarkOutcome {
  const { tabId, folderId, newFolderName, workspaceId, newFolderId, newBookmarkId, now } = params;
  const tab = state.browserTabs.find((t) => t.id === tabId);
  if (!tab || !tab.url) {
    return NO_CHANGES;
  }

  const url = tab.url;
  const title = params.titleOverride?.trim() || tab.title || hostnameFromUrl(url) || url;

  const existsInIndex = state.browserBookmarks.some((b) => b.url === url && b.title === title);
  const nextBookmarks = existsInIndex
    ? state.browserBookmarks
    : [...state.browserBookmarks, { url, title }];

  const staleTuples: { url: string; title: string }[] = [];

  let nextFolders = state.browserBookmarkFolders;
  let foldersChanged = false;
  let targetFolderId = folderId;

  if (targetFolderId) {
    const folder = state.browserBookmarkFolders.find((f) => f.id === targetFolderId);
    const oldEntry = folder?.entries?.find((entry) => entry.sourceTabId === tabId);
    if (oldEntry) {
      staleTuples.push({ url: oldEntry.url, title: oldEntry.title });
    }
  }
  if (workspaceId) {
    const oldEntry = (state.browserWorkspaceBookmarks[workspaceId] || []).find(
      (entry) => entry.sourceTabId === tabId,
    );
    if (oldEntry) {
      staleTuples.push({ url: oldEntry.url, title: oldEntry.title });
    }
  }

  if (!targetFolderId && newFolderName) {
    const folderName = newFolderName.trim() || `New Folder ${nextFolders.length + 1}`;
    const newFolder: BookmarkFolder = {
      id: newFolderId,
      name: folderName,
      createdAt: now,
      isUserCreated: true,
      entries: [makeEntry(newBookmarkId, url, title, now, tabId)],
    };
    nextFolders = [...nextFolders, newFolder];
    targetFolderId = newFolder.id;
    foldersChanged = true;
  } else if (targetFolderId) {
    nextFolders = nextFolders.map((folder) => {
      if (folder.id !== targetFolderId) {
        return folder;
      }
      const existingEntries = folder.entries ?? [];
      const sameSource = existingEntries.find((entry) => entry.sourceTabId === tabId);
      if (sameSource) {
        if (sameSource.url === url && sameSource.title === title) {
          return folder;
        }
        const titleCollision = existingEntries.some(
          (entry) => entry.id !== sameSource.id && entry.url === url && entry.title === title,
        );
        if (titleCollision) {
          return folder;
        }
        foldersChanged = true;
        return {
          ...folder,
          entries: existingEntries.map((entry) =>
            entry.id === sameSource.id ? { ...entry, url, title, lastModifiedAt: now } : entry,
          ),
        };
      }
      if (existingEntries.some((entry) => entry.url === url && entry.title === title)) {
        return folder;
      }
      foldersChanged = true;
      return {
        ...folder,
        entries: [...existingEntries, makeEntry(newBookmarkId, url, title, now, tabId)],
      };
    });
  }

  let nextWorkspaceBookmarks = state.browserWorkspaceBookmarks;
  let wsBookmarksChanged = false;
  if (workspaceId) {
    const existing = state.browserWorkspaceBookmarks[workspaceId] || [];
    const sameSourceIdx = existing.findIndex((entry) => entry.sourceTabId === tabId);
    if (sameSourceIdx >= 0) {
      const current = existing[sameSourceIdx];
      const unchanged = current.url === url && current.title === title;
      const collision = existing.some(
        (entry) => entry.id !== current.id && entry.url === url && entry.title === title,
      );
      if (!unchanged && !collision) {
        const updated = [...existing];
        updated[sameSourceIdx] = { ...current, url, title, lastModifiedAt: now };
        nextWorkspaceBookmarks = { ...state.browserWorkspaceBookmarks, [workspaceId]: updated };
        wsBookmarksChanged = true;
      }
    } else if (!existing.some((entry) => entry.url === url && entry.title === title)) {
      nextWorkspaceBookmarks = {
        ...state.browserWorkspaceBookmarks,
        [workspaceId]: [...existing, makeEntry(newBookmarkId, url, title, now, tabId)],
      };
      wsBookmarksChanged = true;
    }
  }

  let bookmarksChanged = nextBookmarks !== state.browserBookmarks;
  let finalBookmarks = nextBookmarks;
  for (const stale of staleTuples) {
    if (stale.url === url && stale.title === title) {
      continue;
    }
    if (isTupleStillReferenced(nextFolders, nextWorkspaceBookmarks, stale.url, stale.title)) {
      continue;
    }
    const filtered = finalBookmarks.filter(
      (b) => !(b.url === stale.url && b.title === stale.title),
    );
    if (filtered.length !== finalBookmarks.length) {
      finalBookmarks = filtered;
      bookmarksChanged = true;
    }
  }

  return {
    partial: {
      browserBookmarkFolders: nextFolders,
      browserBookmarks: finalBookmarks,
      browserWorkspaceBookmarks: nextWorkspaceBookmarks,
    },
    bookmarksChanged,
    foldersChanged,
    wsBookmarksChanged,
  };
}

interface RemoveEntriesResult {
  partial: Partial<StoreState> | null;
  foldersChanged: boolean;
  wsChanged: boolean;
  bookmarksChanged: boolean;
}

/**
 * 从目录 / 工作区里删除满足条件的书签条目，并修剪因此变成孤儿的全局索引项。
 * 删除只影响书签，不会关闭任何浏览器标签页。
 */
function removeEntriesMatching(
  state: BrowserBookmarkHelpersState,
  predicate: (entry: BookmarkEntry) => boolean,
  scopeFolderId?: string,
): RemoveEntriesResult {
  const removedTuples: { url: string; title: string }[] = [];

  const nextWorkspaceBookmarks = { ...state.browserWorkspaceBookmarks };
  let wsChanged = false;
  for (const wsId of Object.keys(nextWorkspaceBookmarks)) {
    const entries = nextWorkspaceBookmarks[wsId];
    const matching = entries.filter(predicate);
    if (matching.length === 0) {
      continue;
    }
    removedTuples.push(...matching.map((entry) => ({ url: entry.url, title: entry.title })));
    const remaining = entries.filter((entry) => !predicate(entry));
    if (remaining.length === 0) {
      delete nextWorkspaceBookmarks[wsId];
    } else {
      nextWorkspaceBookmarks[wsId] = remaining;
    }
    wsChanged = true;
  }

  let foldersChanged = false;
  const nextFolders = state.browserBookmarkFolders.map((folder) => {
    if (scopeFolderId && folder.id !== scopeFolderId) {
      return folder;
    }
    const entries = folder.entries ?? [];
    const matching = entries.filter(predicate);
    if (matching.length === 0) {
      return folder;
    }
    removedTuples.push(...matching.map((entry) => ({ url: entry.url, title: entry.title })));
    foldersChanged = true;
    return { ...folder, entries: entries.filter((entry) => !predicate(entry)) };
  });

  const toRemoveTuples = removedTuples.filter(
    (tuple) => !isTupleStillReferenced(nextFolders, nextWorkspaceBookmarks, tuple.url, tuple.title),
  );
  const nextBookmarks =
    toRemoveTuples.length > 0
      ? state.browserBookmarks.filter(
          (b) => !toRemoveTuples.some((t) => t.url === b.url && t.title === b.title),
        )
      : state.browserBookmarks;
  const bookmarksChanged = nextBookmarks !== state.browserBookmarks;

  if (!wsChanged && !foldersChanged && !bookmarksChanged) {
    return { partial: null, foldersChanged: false, wsChanged: false, bookmarksChanged: false };
  }

  return {
    partial: {
      browserBookmarks: nextBookmarks,
      browserWorkspaceBookmarks: nextWorkspaceBookmarks,
      browserBookmarkFolders: nextFolders,
    },
    foldersChanged,
    wsChanged,
    bookmarksChanged,
  };
}

export interface BrowserBookmarkSlice {
  browserBookmarks: _BrowserBookmark[];
  browserWorkspaceBookmarks: Record<string, BookmarkEntry[]>;
  browserPendingBookmark: { url: string; title: string; bookmarkId?: string } | null;

  browserToggleBookmark: (input?: { url?: string; title?: string }) => void;
  browserCreateBookmarkEntry: (input: {
    url: string;
    title: string;
    workspaceId?: string;
    folderId?: string;
  }) => BookmarkCollisionCheck;
  browserSaveTabAsBookmark: (
    tabId: string,
    folderId?: string,
    newFolderName?: string,
    workspaceId?: string,
    titleOverride?: string,
  ) => Promise<BookmarkCollisionCheck>;
  browserUpdateSavedBookmark: (
    bookmarkId: string,
    updates: { url: string; title: string },
  ) => { ok: boolean; pathLabel?: string; isSavedBookmark?: boolean };
  browserRemoveBookmark: (bookmarkId: string, url: string, scopeFolderId?: string) => void;
  /**
   * 按 URL 取消收藏（地址栏实心星）。树/列表书签行的「取消收藏」是条目级动作，不走这里。
   *
   * 与 `browserToggleBookmark` 的 (url,title) 元组语义不同：收藏状态只看 URL，
   * 因此这里删除所有 URL 身份相同的条目（含导入/仅保存/自定义标题的副本），
   * 避免出现「星标已点亮但点击后仍有同名条目残留、星标又亮回来」。
   */
  browserRemoveBookmarksForUrl: (url: string) => void;
  /** 关闭/删除某个标签页时，连带移除它当初带来的那份收藏。 */
  browserRemoveBookmarksFromTab: (tabId: string, url: string) => void;
  browserRemoveOrphanedBookmarks: () => void;
  browserClearAllWorkspaceBookmarks: () => void;
  browserSetPendingBookmark: (
    data: {
      url: string;
      title: string;
      bookmarkId?: string;
    } | null,
  ) => void;
}

export const createBrowserBookmarkSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): BrowserBookmarkSlice => ({
  browserBookmarks: [],
  browserWorkspaceBookmarks: {},
  browserPendingBookmark: null,

  browserToggleBookmark: (input?: { url?: string; title?: string }) => {
    set((state) => {
      const outcome = computeToggleBookmarkOutcome(state, input);
      if (outcome.partial === null) {
        return state;
      }
      if (outcome.bookmarksChanged) {
        persist('adl:browser.bookmarks', outcome.partial.browserBookmarks!);
      }
      if (outcome.foldersChanged) {
        persist('adl:browser.bookmarkFolders', outcome.partial.browserBookmarkFolders!);
      }
      if (outcome.wsBookmarksChanged) {
        persist('adl:browser.workspaceBookmarks', outcome.partial.browserWorkspaceBookmarks!);
      }
      return outcome.partial;
    });
  },

  browserCreateBookmarkEntry: (input) => {
    const url = input.url.trim();
    const title = input.title.trim() || hostnameFromUrl(url) || url;
    if (!url) {
      return { ok: false };
    }
    const currentState = _get();
    const collision = checkBookmarkCollision(
      url,
      title,
      { folderId: input.folderId, workspaceId: input.workspaceId },
      currentState,
      currentState.recentWorkspaces,
    );
    if (!collision.ok) {
      return collision;
    }
    set((state) => {
      const now = Date.now();
      const bookmarkId = createUiId('bookmark');
      const exists = state.browserBookmarks.some((b) => b.url === url && b.title === title);
      const nextBookmarks = exists
        ? state.browserBookmarks
        : [...state.browserBookmarks, { url, title }];

      let nextFolders = state.browserBookmarkFolders;
      let foldersChanged = false;
      if (input.folderId) {
        nextFolders = state.browserBookmarkFolders.map((folder) => {
          if (folder.id !== input.folderId) {
            return folder;
          }
          const existingEntries = folder.entries ?? [];
          if (existingEntries.some((entry) => entry.url === url && entry.title === title)) {
            return folder;
          }
          foldersChanged = true;
          return {
            ...folder,
            entries: [...existingEntries, makeEntry(bookmarkId, url, title, now)],
          };
        });
      }

      let nextWorkspaceBookmarks = state.browserWorkspaceBookmarks;
      let wsChanged = false;
      if (input.workspaceId) {
        const existing = state.browserWorkspaceBookmarks[input.workspaceId] || [];
        if (!existing.some((entry) => entry.url === url && entry.title === title)) {
          nextWorkspaceBookmarks = {
            ...state.browserWorkspaceBookmarks,
            [input.workspaceId]: [...existing, makeEntry(bookmarkId, url, title, now)],
          };
          wsChanged = true;
        }
      }

      if (!exists) {
        persist('adl:browser.bookmarks', nextBookmarks);
      }
      if (foldersChanged) {
        persist('adl:browser.bookmarkFolders', nextFolders);
      }
      if (wsChanged) {
        persist('adl:browser.workspaceBookmarks', nextWorkspaceBookmarks);
      }

      return {
        browserBookmarks: nextBookmarks,
        browserBookmarkFolders: nextFolders,
        browserWorkspaceBookmarks: nextWorkspaceBookmarks,
      };
    });
    return { ok: true };
  },

  browserSaveTabAsBookmark: async (tabId, folderId, newFolderName, workspaceId, titleOverride) => {
    const locale = resolveAppLanguage(_get().appInfo?.config.language);
    const folders = _get().browserBookmarkFolders;
    const resolvedName =
      newFolderName != null
        ? newFolderName.trim() || (await formatNewFolderNameByLocale(locale, folders.length + 1))
        : undefined;

    const currentState = _get();
    const tab = currentState.browserTabs.find((t) => t.id === tabId);
    if (!tab || !tab.url) {
      return { ok: false, reason: 'no-tab' };
    }
    {
      const url = tab.url;
      const title = titleOverride?.trim() || tab.title || hostnameFromUrl(url) || url;
      // 同一标签页重复收藏走"更新已有条目"路径：预检必须排除它自己，否则会被判成重复
      const existingEntryId = folderId
        ? currentState.browserBookmarkFolders
            .find((f) => f.id === folderId)
            ?.entries?.find((entry) => entry.sourceTabId === tabId)?.id
        : workspaceId
          ? currentState.browserWorkspaceBookmarks[workspaceId]?.find(
              (entry) => entry.sourceTabId === tabId,
            )?.id
          : undefined;
      const collision = checkBookmarkCollision(
        url,
        title,
        { folderId, workspaceId },
        currentState,
        currentState.recentWorkspaces,
        existingEntryId,
      );
      if (!collision.ok) {
        return collision;
      }
    }

    set((state) => {
      const outcome = computeSaveTabBookmarkOutcome(state, {
        tabId,
        folderId,
        newFolderName: resolvedName,
        workspaceId,
        titleOverride,
        newFolderId: createUiId('bookmark-folder'),
        newBookmarkId: createUiId('bookmark'),
        now: Date.now(),
      });
      if (outcome.partial === null) {
        return state;
      }
      if (outcome.foldersChanged) {
        persist('adl:browser.bookmarkFolders', outcome.partial.browserBookmarkFolders!);
      }
      if (outcome.bookmarksChanged) {
        persist('adl:browser.bookmarks', outcome.partial.browserBookmarks!);
      }
      if (outcome.wsBookmarksChanged) {
        persist('adl:browser.workspaceBookmarks', outcome.partial.browserWorkspaceBookmarks!);
      }
      return outcome.partial;
    });
    return { ok: true };
  },

  browserUpdateSavedBookmark: (bookmarkId: string, updates: { url: string; title: string }) => {
    const url = updates.url.trim();
    const title = updates.title.trim() || hostnameFromUrl(url) || url;
    const workspaces = _get().recentWorkspaces ?? [];
    let ok = true;
    let pathLabel: string | undefined;
    let isSavedBookmark = false;
    set((state) => {
      if (!url) {
        return state;
      }
      const now = Date.now();
      const foldersWithEntry = state.browserBookmarkFolders.filter((folder) =>
        folder.entries?.some((entry) => entry.id === bookmarkId),
      );
      const wsIdsWithEntry = Object.keys(state.browserWorkspaceBookmarks || {}).filter((id) =>
        state.browserWorkspaceBookmarks[id].some((entry) => entry.id === bookmarkId),
      );
      if (foldersWithEntry.length === 0 && wsIdsWithEntry.length === 0) {
        return state;
      }
      isSavedBookmark = true;

      for (const folder of foldersWithEntry) {
        const collides = (folder.entries || []).some(
          (entry) => entry.id !== bookmarkId && entry.url === url && entry.title === title,
        );
        if (collides) {
          ok = false;
          pathLabel = buildFolderPathLabel(folder.id, state.browserBookmarkFolders, workspaces);
          return state;
        }
      }
      for (const id of wsIdsWithEntry) {
        const collides = state.browserWorkspaceBookmarks[id].some(
          (entry) => entry.id !== bookmarkId && entry.url === url && entry.title === title,
        );
        if (collides) {
          ok = false;
          pathLabel = buildWorkspacePathLabel(id, workspaces);
          return state;
        }
      }

      const staleTuples: { url: string; title: string }[] = [];
      let nextFolders = state.browserBookmarkFolders;
      let foldersChanged = false;
      if (foldersWithEntry.length > 0) {
        const folderIds = new Set(foldersWithEntry.map((f) => f.id));
        for (const folder of foldersWithEntry) {
          const oldEntry = folder.entries?.find((entry) => entry.id === bookmarkId);
          if (oldEntry) {
            staleTuples.push({ url: oldEntry.url, title: oldEntry.title });
          }
        }
        nextFolders = state.browserBookmarkFolders.map((folder) => {
          if (!folderIds.has(folder.id)) {
            return folder;
          }
          const entries = folder.entries || [];
          const target = entries.find((entry) => entry.id === bookmarkId);
          if (!target || (target.url === url && target.title === title)) {
            return folder;
          }
          foldersChanged = true;
          return {
            ...folder,
            entries: entries.map((entry) =>
              entry.id === bookmarkId ? { ...entry, url, title, lastModifiedAt: now } : entry,
            ),
          };
        });
      }

      let nextWorkspaceBookmarks = state.browserWorkspaceBookmarks;
      let wsChanged = false;
      if (wsIdsWithEntry.length > 0) {
        const wsIdSet = new Set(wsIdsWithEntry);
        for (const id of wsIdsWithEntry) {
          const oldEntry = state.browserWorkspaceBookmarks[id].find(
            (entry) => entry.id === bookmarkId,
          );
          if (oldEntry) {
            staleTuples.push({ url: oldEntry.url, title: oldEntry.title });
          }
        }
        nextWorkspaceBookmarks = Object.fromEntries(
          Object.entries(state.browserWorkspaceBookmarks).map(([id, entries]) => [
            id,
            wsIdSet.has(id)
              ? entries.map((entry) => {
                  if (entry.id !== bookmarkId) {
                    return entry;
                  }
                  if (entry.url === url && entry.title === title) {
                    return entry;
                  }
                  wsChanged = true;
                  return { ...entry, url, title, lastModifiedAt: now };
                })
              : entries,
          ]),
        );
      }

      let nextBookmarks = state.browserBookmarks;
      let bookmarksChanged = false;
      if (!nextBookmarks.some((b) => b.url === url && b.title === title)) {
        nextBookmarks = [...nextBookmarks, { url, title }];
        bookmarksChanged = true;
      }
      for (const stale of staleTuples) {
        if (stale.url === url && stale.title === title) {
          continue;
        }
        if (isTupleStillReferenced(nextFolders, nextWorkspaceBookmarks, stale.url, stale.title)) {
          continue;
        }
        const filtered = nextBookmarks.filter(
          (b) => !(b.url === stale.url && b.title === stale.title),
        );
        if (filtered.length !== nextBookmarks.length) {
          nextBookmarks = filtered;
          bookmarksChanged = true;
        }
      }

      if (bookmarksChanged) {
        persist('adl:browser.bookmarks', nextBookmarks);
      }
      if (foldersChanged) {
        persist('adl:browser.bookmarkFolders', nextFolders);
      }
      if (wsChanged) {
        persist('adl:browser.workspaceBookmarks', nextWorkspaceBookmarks);
      }

      return {
        browserBookmarks: nextBookmarks,
        browserBookmarkFolders: nextFolders,
        browserWorkspaceBookmarks: nextWorkspaceBookmarks,
      };
    });
    return { ok, isSavedBookmark, ...(pathLabel !== undefined ? { pathLabel } : {}) };
  },

  browserRemoveBookmark: (bookmarkId: string, url: string, scopeFolderId?: string) => {
    set((state) => {
      const result = removeEntriesMatching(
        state,
        (entry) => entry.id === bookmarkId && entry.url === url,
        scopeFolderId,
      );
      if (result.partial === null) {
        return state;
      }
      if (result.wsChanged) {
        persist('adl:browser.workspaceBookmarks', result.partial.browserWorkspaceBookmarks!);
      }
      if (result.foldersChanged) {
        persist('adl:browser.bookmarkFolders', result.partial.browserBookmarkFolders!);
      }
      if (result.bookmarksChanged) {
        persist('adl:browser.bookmarks', result.partial.browserBookmarks!);
      }
      return result.partial;
    });
  },

  browserRemoveBookmarksForUrl: (url: string) => {
    const target = url.trim();
    if (!target) {
      return;
    }
    const targetKey = bookmarkUrlKey(target);
    set((state) => {
      const result = removeEntriesMatching(
        state,
        (entry) => Boolean(entry.url) && bookmarkUrlKey(entry.url) === targetKey,
      );
      // 仅存在于全局索引（未挂到目录/工作区）的收藏也要一并移除。
      const baseBookmarks = result.partial?.browserBookmarks ?? state.browserBookmarks;
      const nextBookmarks = baseBookmarks.filter(
        (bookmark) => bookmarkUrlKey(bookmark.url) !== targetKey,
      );
      const bookmarksChanged = nextBookmarks.length !== state.browserBookmarks.length;
      if (result.partial === null && !bookmarksChanged) {
        return state;
      }
      const nextState = {
        browserBookmarks: nextBookmarks,
        browserBookmarkFolders:
          result.partial?.browserBookmarkFolders ?? state.browserBookmarkFolders,
        browserWorkspaceBookmarks:
          result.partial?.browserWorkspaceBookmarks ?? state.browserWorkspaceBookmarks,
      };
      if (result.wsChanged) {
        persist('adl:browser.workspaceBookmarks', nextState.browserWorkspaceBookmarks);
      }
      if (result.foldersChanged) {
        persist('adl:browser.bookmarkFolders', nextState.browserBookmarkFolders);
      }
      if (bookmarksChanged) {
        persist('adl:browser.bookmarks', nextState.browserBookmarks);
      }
      return nextState;
    });
  },

  browserRemoveBookmarksFromTab: (tabId: string, url: string) => {
    set((state) => {
      const result = removeEntriesMatching(
        state,
        (entry) => entry.sourceTabId === tabId && entry.url === url,
      );
      if (result.partial === null) {
        return state;
      }
      if (result.wsChanged) {
        persist('adl:browser.workspaceBookmarks', result.partial.browserWorkspaceBookmarks!);
      }
      if (result.foldersChanged) {
        persist('adl:browser.bookmarkFolders', result.partial.browserBookmarkFolders!);
      }
      if (result.bookmarksChanged) {
        persist('adl:browser.bookmarks', result.partial.browserBookmarks!);
      }
      return result.partial;
    });
  },

  browserRemoveOrphanedBookmarks: () =>
    set((state) => {
      const tupleKey = (url: string, title: string) => JSON.stringify([url, title]);
      const referenced = new Set<string>();
      for (const entries of Object.values(state.browserWorkspaceBookmarks)) {
        for (const entry of entries) {
          if (entry.url) {
            referenced.add(tupleKey(entry.url, entry.title));
          }
        }
      }
      for (const folder of state.browserBookmarkFolders) {
        for (const entry of folder.entries ?? []) {
          if (entry.url) {
            referenced.add(tupleKey(entry.url, entry.title));
          }
        }
      }
      const nextBookmarks = state.browserBookmarks.filter(
        (b) => !b.url || referenced.has(tupleKey(b.url, b.title)),
      );
      if (nextBookmarks.length === state.browserBookmarks.length) {
        return state;
      }
      persist('adl:browser.bookmarks', nextBookmarks);
      return { browserBookmarks: nextBookmarks };
    }),

  browserClearAllWorkspaceBookmarks: () => {
    persist('adl:browser.workspaceBookmarks', {});
    set({ browserWorkspaceBookmarks: {} });
  },

  browserSetPendingBookmark: (data) => {
    set({ browserPendingBookmark: data });
  },
});
