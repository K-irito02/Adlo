import type { StoreState } from '../StoreState';
import { createUiId } from '../shared';
import { persist } from '../persisted/persist';
import { formatNewFolderNameByLocale } from '@i18n';
import { resolveAppLanguage } from '@i18n/resolveLanguage';
import type {
  BrowserTabState,
  BrowserBookmark as _BrowserBookmark,
  WorkspaceBookmarkEntry as _WorkspaceBookmarkEntry,
  TabFolderState,
  BookmarkTabItem,
} from './browserTypes';
import { hostnameFromUrl } from '@utils/browserDisplayUtils';
import { buildFolderPathLabel, buildWorkspacePathLabel } from './browserFoldersUtils';
import type { RecentWorkspaceEntry } from '@shared/ipc';

export type BrowserBookmark = _BrowserBookmark;
export type WorkspaceBookmarkEntry = _WorkspaceBookmarkEntry;

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
  excludeTabId?: string,
): BookmarkCollisionCheck {
  if (opts.folderId) {
    const folder = state.browserTabFolders.find((f) => f.id === opts.folderId);
    const collides = folder?.tabs?.some(
      (item) => item.tabId !== excludeTabId && item.url === url && item.title === title,
    );
    if (collides) {
      return {
        ok: false,
        pathLabel: buildFolderPathLabel(opts.folderId, state.browserTabFolders, workspaces),
      };
    }
  }
  if (opts.workspaceId) {
    const entries = state.browserWorkspaceBookmarks[opts.workspaceId] || [];
    if (
      entries.some(
        (entry) => entry.tabId !== excludeTabId && entry.url === url && entry.title === title,
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
  titleOverride?: string;
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

  // 元组语义：按 (url,title) 判断该具体收藏是否存在
  const exists = state.browserBookmarks.some((b) => b.url === url && b.title === title);

  let nextFolders = state.browserTabFolders;
  let nextWorkspaceBookmarks = state.browserWorkspaceBookmarks;
  let nextBookmarks = state.browserBookmarks;

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
          folder.tabs.some(
            (item) => tabIdsForUrl.has(item.tabId) && item.url === url && item.title === title,
          )
        ) {
          return {
            ...folder,
            tabs: folder.tabs.filter(
              (item) => !(tabIdsForUrl.has(item.tabId) && item.url === url && item.title === title),
            ),
          };
        }
        return folder;
      });
      foldersChanged = true;

      nextWorkspaceBookmarks = { ...state.browserWorkspaceBookmarks };
      for (const wsId of Object.keys(nextWorkspaceBookmarks)) {
        if (
          nextWorkspaceBookmarks[wsId].some(
            (entry) => tabIdsForUrl.has(entry.tabId) && entry.url === url && entry.title === title,
          )
        ) {
          nextWorkspaceBookmarks[wsId] = nextWorkspaceBookmarks[wsId].filter(
            (entry) =>
              !(tabIdsForUrl.has(entry.tabId) && entry.url === url && entry.title === title),
          );
          if (nextWorkspaceBookmarks[wsId].length === 0) {
            delete nextWorkspaceBookmarks[wsId];
          }
        }
      }
      wsBookmarksChanged = true;
    }

    // 仅当该 (url,title) 元组不再被任何 folder/workspace 条目引用时才从全局移除
    const stillReferenced =
      Object.values(nextWorkspaceBookmarks).some((entries) =>
        entries.some((e) => e.url === url && e.title === title),
      ) || nextFolders.some((f) => f.tabs?.some((t) => t.url === url && t.title === title));
    if (!stillReferenced) {
      nextBookmarks = state.browserBookmarks.filter((b) => !(b.url === url && b.title === title));
    }
  } else {
    nextBookmarks = [...state.browserBookmarks, { url, title }];
  }

  return {
    partial: {
      browserBookmarks: nextBookmarks,
      browserTabFolders: nextFolders,
      browserWorkspaceBookmarks: nextWorkspaceBookmarks,
      browserBookmarkTabIdUrlMap: nextTabIdUrlMap,
    },
    bookmarksChanged: nextBookmarks !== state.browserBookmarks,
    foldersChanged,
    wsBookmarksChanged,
    tabIdUrlMapChanged: nextTabIdUrlMap !== state.browserBookmarkTabIdUrlMap,
  };
}

function computeBookmarkTabOutcome(
  state: BrowserBookmarkHelpersState,
  params: BookmarkTabParams,
): BookmarkOutcome {
  const { tabId, folderId, newFolderName, workspaceId, newFolderId, now, titleOverride } = params;
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
  const rawTitle = titleOverride?.trim() || tab.title;
  const title = rawTitle || hostnameFromUrl(url) || url;

  const existsInBookmarks = state.browserBookmarks.some((b) => b.url === url && b.title === title);
  let nextBookmarks = state.browserBookmarks;

  if (!existsInBookmarks) {
    nextBookmarks = [...state.browserBookmarks, { url, title }];
  }

  let nextFolders = [...state.browserTabFolders];
  let targetFolderId = folderId;
  let foldersChanged = false;

  // 记录该 tabId 在目标路径中的旧 (url,title) 元组，供标题变更后修剪全局孤儿
  const oldTuples: { url: string; title: string }[] = [];
  if (targetFolderId) {
    const folder = state.browserTabFolders.find((f) => f.id === targetFolderId);
    const oldItem = folder?.tabs?.find((item) => item.tabId === tabId);
    if (oldItem) {
      oldTuples.push({ url: oldItem.url, title: oldItem.title });
    }
  }
  if (workspaceId) {
    const oldEntry = (state.browserWorkspaceBookmarks[workspaceId] || []).find(
      (entry) => entry.tabId === tabId,
    );
    if (oldEntry) {
      oldTuples.push({ url: oldEntry.url, title: oldEntry.title });
    }
  }

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
    foldersChanged = true;
  } else if (targetFolderId) {
    nextFolders = nextFolders.map((folder) => {
      if (folder.id === targetFolderId) {
        const existingTabs: BookmarkTabItem[] = folder.tabs || [];
        const existing = existingTabs.find((item) => item.tabId === tabId && item.url === url);
        if (existing) {
          if (existing.title !== title) {
            const titleCollision = existingTabs.some(
              (item) => item.tabId !== tabId && item.url === url && item.title === title,
            );
            if (titleCollision) {
              return folder;
            }
            foldersChanged = true;
            return {
              ...folder,
              tabs: existingTabs.map((item) =>
                item.tabId === tabId && item.url === url ? { tabId, url, title } : item,
              ),
            };
          }
        } else {
          const duplicate = existingTabs.some((item) => item.url === url && item.title === title);
          if (duplicate) {
            return folder;
          }
          // 就地导航场景：同 tabId 的旧 URL 条目一并移除，避免残留
          const priorSameTab = existingTabs.filter((item) => item.tabId === tabId);
          const tabsWithoutStale =
            priorSameTab.length > 0
              ? existingTabs.filter((item) => item.tabId !== tabId)
              : existingTabs;
          foldersChanged = true;
          return {
            ...folder,
            tabs: [...tabsWithoutStale, { tabId, url, title }],
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
      const titleCollision = existingWsTabs.some(
        (entry) => entry.tabId !== tabId && entry.url === url && entry.title === title,
      );
      if (!titleCollision) {
        const current = existingWsTabs[existingIdx];
        if (current.url !== url || current.title !== title) {
          const updated = [...existingWsTabs];
          updated[existingIdx] = { tabId, url, title };
          nextWorkspaceBookmarks = {
            ...state.browserWorkspaceBookmarks,
            [workspaceId]: updated,
          };
          wsBookmarksChanged = true;
        }
      }
    } else {
      const duplicate = existingWsTabs.some((entry) => entry.url === url && entry.title === title);
      if (!duplicate) {
        // 就地导航场景：同 tabId 的旧 URL 条目一并移除，避免残留
        const tabsWithoutStale = existingWsTabs.filter((entry) => entry.tabId !== tabId);
        nextWorkspaceBookmarks = {
          ...state.browserWorkspaceBookmarks,
          [workspaceId]: [...tabsWithoutStale, { tabId, url, title }],
        };
        wsBookmarksChanged = true;
      }
    }
  }

  // 修剪全局孤儿元组：旧 (url,title) 若不再被任何 folder/workspace 条目引用则移除
  let bookmarksChanged = nextBookmarks !== state.browserBookmarks;
  for (const oldTuple of oldTuples) {
    if (oldTuple.url === url && oldTuple.title === title) {
      continue;
    }
    const stillReferenced =
      Object.values(nextWorkspaceBookmarks).some((entries) =>
        entries.some((e) => e.url === oldTuple.url && e.title === oldTuple.title),
      ) ||
      nextFolders.some((f) =>
        f.tabs?.some((t) => t.url === oldTuple.url && t.title === oldTuple.title),
      );
    if (!stillReferenced) {
      nextBookmarks = nextBookmarks.filter(
        (b) => !(b.url === oldTuple.url && b.title === oldTuple.title),
      );
      bookmarksChanged = true;
    }
  }

  return {
    partial: {
      browserTabFolders: nextFolders,
      browserBookmarks: nextBookmarks,
      browserWorkspaceBookmarks: nextWorkspaceBookmarks,
      browserBookmarkTabIdUrlMap: nextTabIdUrlMap,
    },
    bookmarksChanged,
    foldersChanged,
    wsBookmarksChanged,
    tabIdUrlMapChanged: nextTabIdUrlMap[tabId] !== state.browserBookmarkTabIdUrlMap[tabId],
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
  }) => BookmarkCollisionCheck;
  browserBookmarkTab: (
    tabId: string,
    folderId?: string,
    newFolderName?: string,
    workspaceId?: string,
    titleOverride?: string,
  ) => Promise<BookmarkCollisionCheck>;
  browserUpdateSavedBookmark: (
    tabId: string,
    updates: { url: string; title: string },
  ) => { ok: boolean; pathLabel?: string; isSavedBookmark?: boolean };
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
        persist('adl:browser.bookmarks', outcome.partial.browserBookmarks!);
      }
      if (outcome.foldersChanged) {
        persist('adl:browser.tabFolders', outcome.partial.browserTabFolders!);
      }
      if (outcome.wsBookmarksChanged) {
        persist('adl:browser.workspaceBookmarks', outcome.partial.browserWorkspaceBookmarks!);
      }
      if (outcome.tabIdUrlMapChanged) {
        persist('adl:browser.tabIdUrlMap', outcome.partial.browserBookmarkTabIdUrlMap!);
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
      const url = input.url.trim();
      const title = input.title.trim() || hostnameFromUrl(url) || url;
      if (!url) {
        return state;
      }
      const syntheticTabId = createUiId('bookmark');
      const exists = state.browserBookmarks.some((b) => b.url === url && b.title === title);
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
          if (existingTabs.some((item) => item.url === url && item.title === title)) {
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
        if (!existing.some((entry) => entry.url === url && entry.title === title)) {
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
        persist('adl:browser.bookmarks', nextBookmarks);
      }
      if (foldersChanged) {
        persist('adl:browser.tabFolders', nextFolders);
      }
      if (wsChanged) {
        persist('adl:browser.workspaceBookmarks', nextWorkspaceBookmarks);
      }
      if (input.folderId && foldersChanged) {
        persist('adl:browser.tabIdUrlMap', nextTabIdUrlMap);
      }

      return {
        browserBookmarks: nextBookmarks,
        browserTabFolders: nextFolders,
        browserWorkspaceBookmarks: nextWorkspaceBookmarks,
        browserBookmarkTabIdUrlMap: nextTabIdUrlMap,
      };
    });
    return { ok: true };
  },

  browserBookmarkTab: async (tabId, folderId, newFolderName, workspaceId, titleOverride) => {
    const locale = resolveAppLanguage(_get().appInfo?.config.language);
    const folders = _get().browserTabFolders;
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
      const collision = checkBookmarkCollision(
        url,
        title,
        { folderId, workspaceId },
        currentState,
        currentState.recentWorkspaces,
        tabId,
      );
      if (!collision.ok) {
        return collision;
      }
    }

    set((state) => {
      const outcome = computeBookmarkTabOutcome(state, {
        tabId,
        folderId,
        newFolderName: resolvedName,
        workspaceId,
        titleOverride,
        newFolderId: createUiId('tab-folder'),
        now: Date.now(),
        locale,
      });
      if (outcome.partial === null) {
        return state;
      }
      if (outcome.foldersChanged) {
        persist('adl:browser.tabFolders', outcome.partial.browserTabFolders!);
      }
      if (outcome.bookmarksChanged) {
        persist('adl:browser.bookmarks', outcome.partial.browserBookmarks!);
      }
      if (outcome.wsBookmarksChanged) {
        persist('adl:browser.workspaceBookmarks', outcome.partial.browserWorkspaceBookmarks!);
      }
      if (outcome.tabIdUrlMapChanged) {
        persist('adl:browser.tabIdUrlMap', outcome.partial.browserBookmarkTabIdUrlMap!);
      }
      return outcome.partial;
    });
    return { ok: true };
  },

  browserUpdateSavedBookmark: (tabId: string, updates: { url: string; title: string }) => {
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
      const foldersWithTab = (state.browserTabFolders || []).filter((f) =>
        f.tabs?.some((item) => item.tabId === tabId),
      );
      const wsIdsWithTab = Object.keys(state.browserWorkspaceBookmarks || {}).filter((id) =>
        state.browserWorkspaceBookmarks[id].some((entry) => entry.tabId === tabId),
      );
      if (foldersWithTab.length === 0 && wsIdsWithTab.length === 0) {
        return state;
      }
      isSavedBookmark = true;

      // 任一包含该 tabId 的路径存在同路径 (url,title) 碰撞（其它 tabId）→ 拦截
      for (const folder of foldersWithTab) {
        const folderCollides = (folder.tabs || []).some(
          (item) => item.tabId !== tabId && item.url === url && item.title === title,
        );
        if (folderCollides) {
          ok = false;
          pathLabel = buildFolderPathLabel(folder.id, state.browserTabFolders, workspaces);
          return state;
        }
      }
      for (const id of wsIdsWithTab) {
        const wsCollides = state.browserWorkspaceBookmarks[id].some(
          (entry) => entry.tabId !== tabId && entry.url === url && entry.title === title,
        );
        if (wsCollides) {
          ok = false;
          pathLabel = buildWorkspacePathLabel(id, workspaces);
          return state;
        }
      }

      const oldTuples: { url: string; title: string }[] = [];
      let nextFolders = state.browserTabFolders;
      let foldersChanged = false;
      if (foldersWithTab.length > 0) {
        for (const folder of foldersWithTab) {
          const oldItem = folder.tabs?.find((item) => item.tabId === tabId);
          if (oldItem) {
            oldTuples.push({ url: oldItem.url, title: oldItem.title });
            if (oldItem.url !== url || oldItem.title !== title) {
              foldersChanged = true;
            }
          }
        }
        const tabIdSet = new Set(foldersWithTab.map((f) => f.id));
        nextFolders = state.browserTabFolders.map((f) =>
          tabIdSet.has(f.id)
            ? {
                ...f,
                tabs: (f.tabs || []).map((item) =>
                  item.tabId === tabId ? { tabId, url, title } : item,
                ),
              }
            : f,
        );
      }

      let nextWorkspaceBookmarks = state.browserWorkspaceBookmarks;
      let wsChanged = false;
      if (wsIdsWithTab.length > 0) {
        for (const id of wsIdsWithTab) {
          const oldEntry = state.browserWorkspaceBookmarks[id].find(
            (entry) => entry.tabId === tabId,
          );
          if (oldEntry) {
            oldTuples.push({ url: oldEntry.url, title: oldEntry.title });
            if (oldEntry.url !== url || oldEntry.title !== title) {
              wsChanged = true;
            }
          }
        }
        const wsIdSet = new Set(wsIdsWithTab);
        nextWorkspaceBookmarks = Object.fromEntries(
          Object.entries(state.browserWorkspaceBookmarks).map(([id, entries]) => [
            id,
            wsIdSet.has(id)
              ? entries.map((entry) => (entry.tabId === tabId ? { tabId, url, title } : entry))
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
      for (const oldTuple of oldTuples) {
        if (url === oldTuple.url && title === oldTuple.title) {
          continue;
        }
        const stillReferenced =
          Object.values(nextWorkspaceBookmarks || {}).some((entries) =>
            entries.some((e) => e.url === oldTuple.url && e.title === oldTuple.title),
          ) ||
          (nextFolders || []).some((f) =>
            f.tabs?.some((t) => t.url === oldTuple.url && t.title === oldTuple.title),
          );
        if (!stillReferenced) {
          nextBookmarks = nextBookmarks.filter(
            (b) => !(b.url === oldTuple.url && b.title === oldTuple.title),
          );
          bookmarksChanged = true;
        }
      }

      const nextTabIdUrlMap = { ...state.browserBookmarkTabIdUrlMap, [tabId]: url };

      if (bookmarksChanged) {
        persist('adl:browser.bookmarks', nextBookmarks);
      }
      if (foldersChanged) {
        persist('adl:browser.tabFolders', nextFolders);
      }
      if (wsChanged) {
        persist('adl:browser.workspaceBookmarks', nextWorkspaceBookmarks);
      }
      if (nextTabIdUrlMap[tabId] !== state.browserBookmarkTabIdUrlMap[tabId]) {
        persist('adl:browser.tabIdUrlMap', nextTabIdUrlMap);
      }

      return {
        browserBookmarks: nextBookmarks,
        browserTabFolders: nextFolders,
        browserWorkspaceBookmarks: nextWorkspaceBookmarks,
        browserBookmarkTabIdUrlMap: nextTabIdUrlMap,
      };
    });
    return { ok, isSavedBookmark, ...(pathLabel !== undefined ? { pathLabel } : {}) };
  },

  browserRemoveTabBookmarks: (tabId: string, url: string, scopeFolderId?: string) => {
    set((state) => {
      const nextTabIdUrlMap = { ...state.browserBookmarkTabIdUrlMap };
      delete nextTabIdUrlMap[tabId];

      const removedTuples: { url: string; title: string }[] = [];

      const nextWorkspaceBookmarks = { ...state.browserWorkspaceBookmarks };
      let wsChanged = false;
      for (const wsId of Object.keys(nextWorkspaceBookmarks)) {
        const matching = nextWorkspaceBookmarks[wsId].filter(
          (entry) => entry.tabId === tabId && entry.url === url,
        );
        if (matching.length > 0) {
          removedTuples.push(...matching.map((e) => ({ url: e.url, title: e.title })));
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
        persist('adl:browser.workspaceBookmarks', nextWorkspaceBookmarks);
      }

      const nextFolders = scopeFolderId
        ? state.browserTabFolders.map((folder) => {
            if (folder.id === scopeFolderId) {
              const matching = (folder.tabs || []).filter(
                (item) => item.tabId === tabId && item.url === url,
              );
              if (matching.length > 0) {
                removedTuples.push(...matching.map((i) => ({ url: i.url, title: i.title })));
                return {
                  ...folder,
                  tabs: (folder.tabs || []).filter(
                    (item) => !(item.tabId === tabId && item.url === url),
                  ),
                };
              }
            }
            return folder;
          })
        : state.browserTabFolders.map((folder) => {
            const matching = (folder.tabs || []).filter(
              (item) => item.tabId === tabId && item.url === url,
            );
            if (matching.length > 0) {
              removedTuples.push(...matching.map((i) => ({ url: i.url, title: i.title })));
              return {
                ...folder,
                tabs: (folder.tabs || []).filter(
                  (item) => !(item.tabId === tabId && item.url === url),
                ),
              };
            }
            return folder;
          });
      if (nextFolders !== state.browserTabFolders) {
        persist('adl:browser.tabFolders', nextFolders);
      }

      // 仅当被移除的 (url,title) 元组不再被任何 folder/workspace 条目引用时才从全局移除
      const stillReferenced = (u: string, t: string) =>
        Object.values(nextWorkspaceBookmarks).some((entries) =>
          entries.some((e) => e.url === u && e.title === t),
        ) || nextFolders.some((f) => f.tabs?.some((i) => i.url === u && i.title === t));
      const toRemoveTuples = removedTuples.filter(
        (tuple) => !stillReferenced(tuple.url, tuple.title),
      );
      const nextBookmarks =
        toRemoveTuples.length > 0
          ? state.browserBookmarks.filter(
              (b) => !toRemoveTuples.some((t) => t.url === b.url && t.title === b.title),
            )
          : state.browserBookmarks;
      if (nextBookmarks !== state.browserBookmarks) {
        persist('adl:browser.bookmarks', nextBookmarks);
      }

      persist('adl:browser.tabIdUrlMap', nextTabIdUrlMap);
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
      const tupleKey = (url: string, title: string) => JSON.stringify([url, title]);
      const referenced = new Set<string>();
      for (const entries of Object.values(state.browserWorkspaceBookmarks)) {
        for (const entry of entries) {
          if (entry.url) {
            referenced.add(tupleKey(entry.url, entry.title));
          }
        }
      }
      for (const folder of state.browserTabFolders) {
        if (folder.tabs) {
          for (const tab of folder.tabs) {
            if (tab.url) {
              referenced.add(tupleKey(tab.url, tab.title));
            }
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
    persist('adl:browser.tabIdUrlMap', {});
    set({
      browserWorkspaceBookmarks: {},
      browserBookmarkTabIdUrlMap: {},
    });
  },

  browserSetPendingBookmark: (data) => {
    set({ browserPendingBookmark: data });
  },
});
