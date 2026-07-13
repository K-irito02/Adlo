/**
 * Browser Bookmark 切片辅助纯函数
 * 从 browserBookmarkSlice.ts 提取的 bookmark 计算逻辑（无 store 访问、无副作用、无持久化）。
 *
 * Slice 仅负责调用 set() 与 scheduleWrite()；本模块只接收状态切片与参数，
 * 返回下一状态切片及变更标志，便于 slice 决定持久化范围。
 *
 * 注意：类型通过 `import type` 引用，避免与 browserBookmarkSlice 形成运行时循环依赖。
 */
import type { BrowserTabState } from './browserSliceShared';
import type { TabFolderState, BookmarkTabItem } from './browserFoldersTypes';
import type { BrowserBookmark, WorkspaceBookmarkEntry } from './browserBookmarkSlice';
import { hostnameFromUrl } from '@utils/browserDisplayUtils';

/** Subset of StoreState needed by bookmark helpers. */
export interface BrowserBookmarkHelpersState {
  browserTabs: BrowserTabState[];
  browserActiveTabId: string;
  browserBookmarks: BrowserBookmark[];
  browserTabFolders: TabFolderState[];
  browserWorkspaceBookmarks: Record<string, WorkspaceBookmarkEntry[]>;
  browserBookmarkTabIdUrlMap: Record<string, string>;
}

/** Computed outcome of a bookmark operation. */
export interface BookmarkOutcome {
  /**
   * Partial state to merge via set(). `null` means no change — slice should
   * return state unchanged.
   */
  partial: Partial<{
    browserBookmarks: BrowserBookmark[];
    browserTabFolders: TabFolderState[];
    browserWorkspaceBookmarks: Record<string, WorkspaceBookmarkEntry[]>;
    browserBookmarkTabIdUrlMap: Record<string, string>;
  }> | null;
  /** Persist browserBookmarks (slice calls scheduleWrite). */
  bookmarksChanged: boolean;
  /** Persist browserTabFolders (slice calls scheduleWrite). */
  foldersChanged: boolean;
  /** Persist browserWorkspaceBookmarks (slice calls scheduleWrite). */
  wsBookmarksChanged: boolean;
  /** Persist browserBookmarkTabIdUrlMap (slice calls scheduleWrite). */
  tabIdUrlMapChanged: boolean;
}

/**
 * Compute the next state for `browserToggleBookmark`.
 *
 * Pure: does not touch the store, call any persistence layer, or generate
 * non-deterministic values.
 */
export function computeToggleBookmarkOutcome(
  state: BrowserBookmarkHelpersState,
  input?: { url?: string; title?: string }
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

  let foldersChanged = false;
  let wsBookmarksChanged = false;

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
    // Toggle always changes bookmarks and tabIdUrlMap (matches original persistence behavior).
    bookmarksChanged: true,
    foldersChanged,
    wsBookmarksChanged,
    tabIdUrlMapChanged: true,
  };
}

/** Params for computeBookmarkTabOutcome. IDs/timestamps are generated by the slice. */
export interface BookmarkTabParams {
  tabId: string;
  folderId?: string;
  newFolderName?: string;
  workspaceId?: string;
  /** Pre-generated id for the new folder (when creating one). */
  newFolderId: string;
  /** Pre-generated timestamp for the new folder. */
  now: number;
  /** Resolved locale string ('en-US' | 'zh-CN'). */
  locale: 'en-US' | 'zh-CN';
}

/**
 * Compute the next state for `browserBookmarkTab`.
 *
 * Pure: does not touch the store, call any persistence layer, or generate
 * non-deterministic values. New folder id/timestamp/locale are passed in by the slice.
 */
export function computeBookmarkTabOutcome(
  state: BrowserBookmarkHelpersState,
  params: BookmarkTabParams
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
  let wsBookmarksChanged = false;
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
    wsBookmarksChanged = true;
  }

  return {
    partial: {
      browserTabFolders: nextFolders,
      browserBookmarks: nextBookmarks,
      browserWorkspaceBookmarks: nextWorkspaceBookmarks,
      browserBookmarkTabIdUrlMap: nextTabIdUrlMap,
    },
    // Matches original persistence behavior: always persist bookmarks/folders/tabIdUrlMap.
    bookmarksChanged: true,
    foldersChanged: true,
    wsBookmarksChanged,
    tabIdUrlMapChanged: true,
  };
}
