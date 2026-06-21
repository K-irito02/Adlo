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

function findFolderByIdLocal(
  folders: Array<{ id: string; children?: unknown[] }>,
  folderId: string
): { id: string; tabs?: string[] } | null {
  for (const folder of folders) {
    if (folder.id === folderId) {
      return folder as { id: string; tabs?: string[] };
    }
    if (Array.isArray(folder.children)) {
      const found = findFolderByIdLocal(
        folder.children as Array<{ id: string; children?: unknown[] }>,
        folderId
      );
      if (found) {
        return found;
      }
    }
  }
  return null;
}

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
    browserDeleteTabFolder,
    browserDeleteHistoryByLevel,
    browserOpenTab,
    browserCloseTab,
    browserUpdateTab,
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
      browserDeleteTabFolder: state.browserDeleteTabFolder,
      browserDeleteHistoryByLevel: state.browserDeleteHistoryByLevel,
      browserOpenTab: state.browserOpenTab,
      browserCloseTab: state.browserCloseTab,
      browserUpdateTab: state.browserUpdateTab,
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
      browserDeleteAllTabsInNode(nodePath);
    },
    [browserDeleteAllTabsInNode]
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
        browserDeleteAllTabsInNode(folderId);
      } else {
        const actualId = folderId.startsWith('folder:')
          ? folderId.slice('folder:'.length)
          : folderId;
        browserDeleteTabFolder(actualId);
      }
    },
    [browserDeleteTabFolder, browserDeleteAllTabsInNode]
  );

  const handleDeleteHistoryLevel = useCallback(
    (level: 'label' | 'year' | 'month' | 'day', nodePath: string) => {
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
        const tab = state.browserTabs.find((t) => t.id === tabId);
        if (tab) {
          // Only update the title if it's not locked (user-customized)
          if (!isTabTitleLocked(tabId) && meta.title) {
            browserUpdateTab(tabId, { title: meta.title });
          }
          // Update favicon cache
          if (meta.favicon) {
            setCachedFavicon(url, meta.favicon, true);
          }
        }
      }
    },
    [browserUpdateTab]
  );

  const handleDeleteTab = useCallback(
    (tabId: string, url: string) => {
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
    },
    [browserCloseTab, browserRemoveTabBookmarks]
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
  };
}
