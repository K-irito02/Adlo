import { useCallback, useMemo } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import {
  prefetchPageMeta,
  clearFaviconCacheForUrl,
  clearPageMetaCacheForUrl,
  unlockTabTitle,
  isTabTitleLocked,
  setCachedFavicon,
} from '../../utils/fetchPageMeta';
import { findFolderByIdLocal, collectAllDescendantTabIdsLocal } from './browserTreeUtils';

export function useBrowserTreeActions() {
  const {
    recentWorkspaces,
    browserTabFolders,
    browserTabTreeExpanded,
    browserHistory,
    browserToggleTabTreePath,
    browserExpandAllTreePaths,
    browserCollapseAllTreePaths,
    browserDeleteAllTabsInNode,
    browserDeleteOwnTabsInNode,
    browserDeleteTabFolder,
    browserDeleteHistoryByLevel,
    browserOpenTab,
    browserCloseTab,
    browserUpdateTab,
    browserUpdateHistoryTitle,
    browserDeleteHistoryEntry,
    browserRemoveTabBookmarks,
  } = useAppStore(
    useShallow((state) => ({
      recentWorkspaces: state.recentWorkspaces,
      browserTabFolders: state.browserTabFolders,
      browserTabTreeExpanded: state.browserTabTreeExpanded,
      browserHistory: state.browserHistory,
      browserToggleTabTreePath: state.browserToggleTabTreePath,
      browserExpandAllTreePaths: state.browserExpandAllTreePaths,
      browserCollapseAllTreePaths: state.browserCollapseAllTreePaths,
      browserDeleteAllTabsInNode: state.browserDeleteAllTabsInNode,
      browserDeleteOwnTabsInNode: state.browserDeleteOwnTabsInNode,
      browserDeleteTabFolder: state.browserDeleteTabFolder,
      browserDeleteHistoryByLevel: state.browserDeleteHistoryByLevel,
      browserOpenTab: state.browserOpenTab,
      browserCloseTab: state.browserCloseTab,
      browserUpdateTab: state.browserUpdateTab,
      browserUpdateHistoryTitle: state.browserUpdateHistoryTitle,
      browserDeleteHistoryEntry: state.browserDeleteHistoryEntry,
      browserRemoveTabBookmarks: state.browserRemoveTabBookmarks,
    }))
  );

  const allTreeExpanded = useMemo(() => {
    const visible = recentWorkspaces.filter(
      (w) => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available
    );
    const wsPaths = visible.map((w) => `workspace:${w.id}`);
    const folderPaths = browserTabFolders.filter((f) => !f.parentId).map((f) => `folder:${f.id}`);
    const allEntryPaths = [...wsPaths, ...folderPaths];
    if (browserHistory.length > 0) {
      allEntryPaths.push('history:root');
    }
    if (allEntryPaths.length === 0) {
      return false;
    }
    return allEntryPaths.every((p) => browserTabTreeExpanded[p] ?? false);
  }, [recentWorkspaces, browserTabFolders, browserHistory, browserTabTreeExpanded]);

  const handleCreateTabInTree = useCallback(
    (workspaceId?: string, _folderId?: string) => {
      browserOpenTab(undefined, undefined, workspaceId);
    },
    [browserOpenTab]
  );

  const handleToggleTreePath = useCallback(
    (path: string) => {
      browserToggleTabTreePath(path);
    },
    [browserToggleTabTreePath]
  );

  const handleDeleteAllChildTabs = useCallback(
    (_categoryType: string, nodePath: string) => {
      const state = useAppStore.getState();
      let tabIds: string[] = [];
      let urls: string[] = [];

      if (nodePath.startsWith('workspace:')) {
        const wsId = nodePath.slice('workspace:'.length);
        const tabs = state.browserTabs.filter((t) => t.workspaceId === wsId);
        tabIds = tabs.map((t) => t.id);
        urls = tabs.map((t) => t.url).filter((u): u is string => !!u);
      } else if (nodePath.startsWith('folder:')) {
        const folderId = nodePath.slice('folder:'.length);
        const folder = findFolderByIdLocal(
          state.browserTabFolders as Array<{ id: string; tabs?: string[]; children?: unknown[] }>,
          folderId
        );
        if (folder) {
          tabIds = [...(folder.tabs ?? [])];
          const childTabs = collectAllDescendantTabIdsLocal(
            state.browserTabFolders as Array<{ id: string; tabs?: string[]; children?: unknown[] }>,
            folderId
          );
          tabIds.push(...childTabs);
          const allTabIds = [...tabIds];
          urls = state.browserTabs
            .filter((t) => allTabIds.includes(t.id))
            .map((t) => t.url)
            .filter((u): u is string => !!u);
          tabIds = allTabIds;
        }
      } else if (nodePath.startsWith('history:day:')) {
        const dayDate = nodePath.slice('history:day:'.length);
        const entries = state.browserHistory.filter((h) => {
          const d = new Date(h.visitedAt);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const dy = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${dy}` === dayDate;
        });
        tabIds = entries.map((h) => h.id);
        urls = entries.map((h) => h.url).filter((u): u is string => !!u);
      }

      for (const url of urls) {
        clearFaviconCacheForUrl(url);
        clearPageMetaCacheForUrl(url);
      }
      for (const tabId of tabIds) {
        const tab = state.browserTabs.find((t) => t.id === tabId);
        browserRemoveTabBookmarks(tabId, tab?.url || '');
        unlockTabTitle(tabId);
      }

      browserDeleteAllTabsInNode(nodePath);
    },
    [browserDeleteAllTabsInNode, browserRemoveTabBookmarks]
  );

  const handleDeleteOwnChildTabs = useCallback(
    (_categoryType: string, nodePath: string) => {
      const state = useAppStore.getState();
      let tabIds: string[] = [];
      let urls: string[] = [];

      if (nodePath.startsWith('workspace:')) {
        const wsId = nodePath.slice('workspace:'.length);
        const allTabs = state.browserTabs.filter((t) => t.workspaceId === wsId);
        const folderTabIds: string[] = [];
        const rootFolderIds = state.browserTabFolders
          .filter(
            (f) =>
              (f as { parentType?: string }).parentType === 'workspace' &&
              (f as { parentId?: string }).parentId === wsId
          )
          .map((f) => f.id);
        for (const folderId of rootFolderIds) {
          const folder = findFolderByIdLocal(
            state.browserTabFolders as Array<{
              id: string;
              tabs?: string[];
              children?: unknown[];
            }>,
            folderId
          );
          if (folder?.tabs) {
            folderTabIds.push(...folder.tabs);
          }
          const descendantTabs = collectAllDescendantTabIdsLocal(
            state.browserTabFolders as Array<{
              id: string;
              tabs?: string[];
              children?: unknown[];
            }>,
            folderId
          );
          folderTabIds.push(...descendantTabs);
        }
        tabIds = allTabs.filter((t) => !folderTabIds.includes(t.id)).map((t) => t.id);
        urls = allTabs
          .filter((t) => !folderTabIds.includes(t.id))
          .map((t) => t.url)
          .filter((u): u is string => !!u);
      } else if (nodePath.startsWith('folder:')) {
        const folderId = nodePath.slice('folder:'.length);
        const folder = findFolderByIdLocal(
          state.browserTabFolders as Array<{ id: string; tabs?: string[]; children?: unknown[] }>,
          folderId
        );
        if (folder) {
          tabIds = [...(folder.tabs ?? [])];
          urls = state.browserTabs
            .filter((t) => tabIds.includes(t.id))
            .map((t) => t.url)
            .filter((u): u is string => !!u);
        }
      } else if (nodePath.startsWith('history:day:')) {
        const dayDate = nodePath.slice('history:day:'.length);
        const entries = state.browserHistory.filter((h) => {
          const d = new Date(h.visitedAt);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const dy = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${dy}` === dayDate;
        });
        tabIds = entries.map((h) => h.id);
        urls = entries.map((h) => h.url).filter((u): u is string => !!u);
      }

      for (const url of urls) {
        clearFaviconCacheForUrl(url);
        clearPageMetaCacheForUrl(url);
      }
      for (const tabId of tabIds) {
        const tab = state.browserTabs.find((t) => t.id === tabId);
        browserRemoveTabBookmarks(tabId, tab?.url || '');
        unlockTabTitle(tabId);
      }

      browserDeleteOwnTabsInNode(nodePath);
    },
    [browserDeleteOwnTabsInNode, browserRemoveTabBookmarks]
  );

  const handleOpenAllInNewTabs = useCallback(
    (_categoryType: string, nodePath: string) => {
      const state = useAppStore.getState();
      if (nodePath.startsWith('workspace:')) {
        const wsId = nodePath.slice('workspace:'.length);
        const tabs = state.browserTabs.filter((t) => t.workspaceId === wsId);
        tabs.forEach((tab) => browserOpenTab(tab.url, tab.title, tab.workspaceId));
      } else if (nodePath.startsWith('folder:')) {
        const folderId = nodePath.slice('folder:'.length);
        const folder = findFolderByIdLocal(
          state.browserTabFolders as Array<{ id: string; tabs?: string[]; children?: unknown[] }>,
          folderId
        );
        if (folder?.tabs) {
          folder.tabs.forEach((tabId) => {
            const tab = state.browserTabs.find((t) => t.id === tabId);
            if (tab) {
              browserOpenTab(tab.url, tab.title, tab.workspaceId);
            }
          });
        }
      } else if (nodePath.startsWith('history:day:')) {
        const dayDate = nodePath.slice('history:day:'.length);
        state.browserHistory
          .filter((h) => {
            const d = new Date(h.visitedAt);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dy = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${dy}` === dayDate;
          })
          .forEach((h) => browserOpenTab(h.url, h.title));
      }
    },
    [browserOpenTab]
  );

  const handleRemoveFromArea = useCallback((workspaceId: string) => {
    useAppStore.getState().hideWorkspaceFromRightPanels(workspaceId);
  }, []);

  const handleDeleteDirectory = useCallback(
    (folderId: string) => {
      if (folderId.startsWith('history:')) {
        const state = useAppStore.getState();
        const dayDate = folderId.slice('history:day:'.length);
        const entries = state.browserHistory.filter((h) => {
          const d = new Date(h.visitedAt);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const dy = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${dy}` === dayDate;
        });
        for (const entry of entries) {
          if (entry.url) {
            clearFaviconCacheForUrl(entry.url);
            clearPageMetaCacheForUrl(entry.url);
          }
        }
        browserDeleteAllTabsInNode(folderId);
      } else {
        const actualId = folderId.startsWith('folder:')
          ? folderId.slice('folder:'.length)
          : folderId;
        const state = useAppStore.getState();
        const folder = findFolderByIdLocal(
          state.browserTabFolders as Array<{ id: string; tabs?: string[]; children?: unknown[] }>,
          actualId
        );
        if (folder) {
          const allTabIds = [
            ...(folder.tabs ?? []),
            ...collectAllDescendantTabIdsLocal(
              state.browserTabFolders as Array<{
                id: string;
                tabs?: string[];
                children?: unknown[];
              }>,
              actualId
            ),
          ];
          const urls = state.browserTabs
            .filter((t) => allTabIds.includes(t.id))
            .map((t) => t.url)
            .filter((u): u is string => !!u);
          for (const url of urls) {
            clearFaviconCacheForUrl(url);
            clearPageMetaCacheForUrl(url);
          }
          for (const tabId of allTabIds) {
            const tab = state.browserTabs.find((t) => t.id === tabId);
            browserRemoveTabBookmarks(tabId, tab?.url || '');
            unlockTabTitle(tabId);
          }
        }
        browserDeleteTabFolder(actualId);
      }
    },
    [browserDeleteTabFolder, browserDeleteAllTabsInNode, browserRemoveTabBookmarks]
  );

  const handleDeleteHistoryLevel = useCallback(
    (level: 'label' | 'year' | 'month' | 'day', nodePath: string) => {
      const state = useAppStore.getState();
      const deletedEntries = state.browserHistory.filter((h) => {
        if (level === 'label') {
          return true;
        }
        const d = new Date(h.visitedAt);
        const y = String(d.getFullYear());
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dy = String(d.getDate()).padStart(2, '0');
        if (level === 'year') {
          const year = nodePath.replace('history:year:', '');
          return String(d.getFullYear()) === year;
        }
        if (level === 'month') {
          const monthKey = nodePath.replace('history:month:', '');
          return `${y}-${m}` === monthKey;
        }
        const dayKey = nodePath.replace('history:day:', '');
        return `${y}-${m}-${dy}` === dayKey;
      });
      deletedEntries.forEach((entry) => {
        if (entry.url) {
          clearFaviconCacheForUrl(entry.url);
          clearPageMetaCacheForUrl(entry.url);
        }
      });
      browserDeleteHistoryByLevel(level, nodePath);
    },
    [browserDeleteHistoryByLevel]
  );

  const handleExpandAllTree = useCallback(() => {
    const state = useAppStore.getState();
    const paths: string[] = [];
    const workspaces = state.recentWorkspaces.filter(
      (w) => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available
    );
    for (const ws of workspaces) {
      paths.push(`workspace:${ws.id}`);
    }
    for (const folder of state.browserTabFolders) {
      paths.push(`folder:${folder.id}`);
    }
    if (state.browserHistory.length > 0) {
      paths.push('history:root');
    }
    browserExpandAllTreePaths(paths);
  }, [browserExpandAllTreePaths]);

  const handleCollapseAllTree = useCallback(() => {
    browserCollapseAllTreePaths();
  }, [browserCollapseAllTreePaths]);

  const handleRefreshTab = useCallback(
    async (tabId: string, url: string) => {
      if (!url) {
        return;
      }
      // Clear existing caches for this URL to force a fresh fetch
      clearFaviconCacheForUrl(url);
      clearPageMetaCacheForUrl(url);
      // Re-fetch page meta
      const meta = await prefetchPageMeta(url);
      if (meta) {
        const state = useAppStore.getState();
        // Check if this is a browser tab
        const tab = state.browserTabs.find((t) => t.id === tabId);
        if (tab) {
          if (!isTabTitleLocked(tabId) && meta.title) {
            browserUpdateTab(tabId, { title: meta.title });
          }
        } else {
          // Check if this is a history entry
          const isHistoryEntry = state.browserHistory.some((h) => h.id === tabId);
          if (isHistoryEntry && meta.title) {
            browserUpdateHistoryTitle(url, meta.title);
          }
        }
        // Always update favicon cache regardless of tab or history
        if (meta.favicon) {
          setCachedFavicon(url, meta.favicon, true);
        }
      }
    },
    [browserUpdateTab, browserUpdateHistoryTitle]
  );

  const handleDeleteTab = useCallback(
    (tabId: string, url: string) => {
      const state = useAppStore.getState();
      const isHistoryEntry = state.browserHistory.some((h) => h.id === tabId);

      if (isHistoryEntry) {
        // Clear caches
        if (url) {
          clearFaviconCacheForUrl(url);
          clearPageMetaCacheForUrl(url);
        }
        // Delete history entry
        browserDeleteHistoryEntry(tabId);
      } else {
        // Remove all bookmark state (bookmarks, workspace bookmarks, folder memberships)
        browserRemoveTabBookmarks(tabId, url);
        // Clear caches
        if (url) {
          clearFaviconCacheForUrl(url);
          clearPageMetaCacheForUrl(url);
        }
        // Unlock title if locked
        unlockTabTitle(tabId);
        // Close the tab
        browserCloseTab(tabId);
      }
    },
    [browserCloseTab, browserRemoveTabBookmarks, browserDeleteHistoryEntry]
  );

  const handleRemoveBookmarkTab = useCallback(
    (tabId: string, url: string) => {
      // Only remove bookmark state, don't close the tab or affect history
      browserRemoveTabBookmarks(tabId, url);
      if (url) {
        clearFaviconCacheForUrl(url);
        clearPageMetaCacheForUrl(url);
      }
      unlockTabTitle(tabId);
    },
    [browserRemoveTabBookmarks]
  );

  const handleCopyTabLink = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  }, []);

  const handleOpenTabInNewTab = useCallback(
    (url: string, title: string) => {
      browserOpenTab(url, title);
    },
    [browserOpenTab]
  );

  const handleOpenTabInCurrentTab = useCallback(
    (tabId: string) => {
      const state = useAppStore.getState();
      const tab = state.browserTabs.find((t) => t.id === tabId);
      const activeTabId = state.browserActiveTabId;
      if (tab && activeTabId) {
        browserUpdateTab(activeTabId, { url: tab.url, title: tab.title });
      }
    },
    [browserUpdateTab]
  );

  return {
    browserTabFolders,
    tabTreeExpanded: browserTabTreeExpanded,
    allTreeExpanded,
    handleCreateTabInTree,
    handleToggleTreePath,
    handleDeleteAllChildTabs,
    handleDeleteOwnChildTabs,
    handleOpenAllInNewTabs,
    handleRemoveFromArea,
    handleDeleteDirectory,
    handleDeleteHistoryLevel,
    handleExpandAllTree,
    handleCollapseAllTree,
    handleRefreshTab,
    handleDeleteTab,
    handleCopyTabLink,
    handleOpenTabInNewTab,
    handleOpenTabInCurrentTab,
    handleRemoveBookmarkTab,
  };
}
