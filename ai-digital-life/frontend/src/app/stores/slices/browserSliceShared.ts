/**
 * Browser Slice Shared Module
 *
 * Single source of truth for cross-slice types and constants.
 *
 * This module breaks the circular import between browserFoldersSlice,
 * browserBookmarkSlice, and browserTabsSlice by providing a leaf module
 * with no imports on other browser slices. All three slices import from
 * here; none of them re-import from each other.
 *
 * - Folder types are re-exported from `browserFoldersTypes` (already a clean leaf).
 * - Tab state types are defined here (moved from `browserTabsSlice.ts`).
 * - Storage key constants are defined here (moved from `browserBookmarkSlice.ts`).
 */

// Re-export folder types from the leaf types module (no imports there).
export type { BookmarkTabItem, TabFolderState, TabFolderStateUpdate } from './browserFoldersTypes';

/**
 * Browser tab state — single source of truth for the tab shape used across
 * the browser store slices. Moved here from `browserTabsSlice.ts` to break
 * the cross-slice type import cycle.
 */
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

/** Patch shape for partial tab updates. Field set mirrors `BrowserTabState`. */
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

/**
 * Browser storage key constants — single source of truth.
 *
 * Centralized here (the shared leaf module) to eliminate duplication across
 * browserSlice / browserTabsSlice / browserHistorySlice / browserBookmarkSlice
 * / browserFoldersUtils. All values must remain identical to the originals;
 * only their definition location changes.
 */
export const BROWSER_TABS_KEY = 'adl-ui:browser-tabs';
export const BROWSER_HISTORY_KEY = 'adl-ui:browser-history';
export const BROWSER_BOOKMARKS_KEY = 'adl-ui:browser-bookmarks';
export const BROWSER_TAB_FOLDERS_KEY = 'adl-ui:browser-tab-folders';
export const BROWSER_ACTIVE_TAB_KEY = 'adl-ui:browser-active-tab';
export const BROWSER_TREE_EXPANDED_KEY = 'adl-ui:browser-tab-tree-expanded';
export const BROWSER_WORKSPACE_EXPANDED_KEY = 'adl-ui:browser-workspace-expanded';
export const BROWSER_WORKSPACE_BOOKMARKS_KEY = 'adl-ui:browser-workspace-bookmarks';

/**
 * Storage key for the global browser bookmarks list.
 * Backwards-compatible alias for `BROWSER_BOOKMARKS_KEY`.
 */
export const BROWSER_BOOKMARKS_STORAGE_KEY = BROWSER_BOOKMARKS_KEY;

/**
 * Storage key for the tabId → bookmarked URL map.
 * Enables snapshot lookup after tab navigation.
 */
export const BROWSER_BOOKMARK_TABID_URL_MAP_KEY = 'adl-ui:browser-bookmark-tabid-url-map';
