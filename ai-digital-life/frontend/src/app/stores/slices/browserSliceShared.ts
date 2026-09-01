import type { BrowserTabState, BrowserTabStateUpdate } from './browserTypes';

export type { BrowserTabState, BrowserTabStateUpdate };
export type { BookmarkTabItem, TabFolderState, TabFolderStateUpdate } from './browserFoldersTypes';

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
export const BROWSER_SHORTCUTS_KEY = 'adl-ui:browser-shortcuts';
export const BROWSER_LOCAL_PORTS_KEY = 'adl-ui:browser-local-ports';
export const BROWSER_BG_CONFIG_KEY = 'adl-ui:browser-bg-config';
export const BROWSER_CONFIGURED_PORTS_KEY = 'adl-ui:browser-configured-ports';

/** Default list of ports to scan for local development servers. */
export const DEFAULT_CONFIGURED_PORTS = [
  3000, 3001, 3080, 4173, 5000, 5173, 8080, 8000, 4200, 9000, 9229, 2718,
];
