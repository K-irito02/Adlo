import { useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import {
  prefetchPageMeta,
  clearFaviconCacheForUrl,
  clearPageMetaCacheForUrl,
  unlockTabTitle,
  isTabTitleLocked,
  setCachedFavicon,
} from '@utils/fetchPageMeta';

export function useBrowserTagActions() {
  const {
    browserOpenTab,
    browserCloseTab,
    browserUpdateTab,
    browserUpdateHistoryTitle,
    browserDeleteHistoryEntry,
    browserRemoveTabBookmarks,
  } = useAppStore(
    useShallow((state) => ({
      browserOpenTab: state.browserOpenTab,
      browserCloseTab: state.browserCloseTab,
      browserUpdateTab: state.browserUpdateTab,
      browserUpdateHistoryTitle: state.browserUpdateHistoryTitle,
      browserDeleteHistoryEntry: state.browserDeleteHistoryEntry,
      browserRemoveTabBookmarks: state.browserRemoveTabBookmarks,
    }))
  );

  const handleCreateTabInTree = useCallback(
    (workspaceId?: string, _folderId?: string) => {
      browserOpenTab(undefined, undefined, workspaceId);
    },
    [browserOpenTab]
  );

  const handleRefreshTab = useCallback(
    async (tabId: string, url: string) => {
      if (!url) {
        return;
      }
      clearFaviconCacheForUrl(url);
      clearPageMetaCacheForUrl(url);
      const meta = await prefetchPageMeta(url);
      if (meta) {
        const state = useAppStore.getState();
        const tab = state.browserTabs.find((t) => t.id === tabId);
        if (tab) {
          if (!isTabTitleLocked(tabId) && meta.title) {
            browserUpdateTab(tabId, { title: meta.title });
          }
        } else {
          const isHistoryEntry = state.browserHistory.some((h) => h.id === tabId);
          if (isHistoryEntry && meta.title) {
            browserUpdateHistoryTitle(url, meta.title);
          }
        }
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
        if (url) {
          clearFaviconCacheForUrl(url);
          clearPageMetaCacheForUrl(url);
        }
        browserDeleteHistoryEntry(tabId);
      } else {
        browserRemoveTabBookmarks(tabId, url);
        if (url) {
          clearFaviconCacheForUrl(url);
          clearPageMetaCacheForUrl(url);
        }
        unlockTabTitle(tabId);
        browserCloseTab(tabId);
      }
    },
    [browserCloseTab, browserRemoveTabBookmarks, browserDeleteHistoryEntry]
  );

  const handleCopyTabLink = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
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
    handleCreateTabInTree,
    handleRefreshTab,
    handleDeleteTab,
    handleCopyTabLink,
    handleOpenTabInNewTab,
    handleOpenTabInCurrentTab,
  };
}
