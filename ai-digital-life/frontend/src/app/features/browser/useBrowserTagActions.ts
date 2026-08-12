import { useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { prefetchPageMeta } from '@utils/fetchPageMeta';
import {
  setCachedSiteMeta,
  getCachedSiteMeta,
  buildCachedSiteMetaEntry,
} from '@utils/siteMetaCache';
import { hostnameFromUrl } from '@utils/browserDisplayUtils';
import { existingFaviconBaseline, shouldReplaceFavicon } from './faviconQuality';
import { removeSiteMetaIfUnreferenced } from './siteMetaCleanup';

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
    })),
  );

  const handleCreateTabInTree = useCallback(
    (workspaceId?: string, _folderId?: string) => {
      browserOpenTab(undefined, undefined, workspaceId);
    },
    [browserOpenTab],
  );

  const handleRefreshTab = useCallback(
    async (tabId: string, url: string) => {
      if (!url) {
        return;
      }
      const meta = await prefetchPageMeta(url, { force: true });

      const state = useAppStore.getState();
      const tab = state.browserTabs.find((t) => t.id === tabId);

      const title = meta?.title || hostnameFromUrl(url);
      if (tab) {
        browserUpdateTab(tabId, { title });
      } else {
        const isHistoryEntry = state.browserHistory.some((h) => h.id === tabId);
        if (isHistoryEntry) {
          browserUpdateHistoryTitle(url, title);
        }
      }

      if (meta?.title || meta?.faviconDataUri) {
        const existing = getCachedSiteMeta(url);
        const faviconUrl = shouldReplaceFavicon(
          existingFaviconBaseline(existing),
          meta.favicon ?? '',
        )
          ? (meta.favicon ?? '')
          : (existing?.faviconUrl ?? '');
        setCachedSiteMeta(
          url,
          buildCachedSiteMetaEntry(
            meta.title || '',
            faviconUrl,
            meta.faviconDataUri || '',
            existing,
          ),
        );
      }
    },
    [browserUpdateTab, browserUpdateHistoryTitle],
  );

  const handleDeleteTab = useCallback(
    (tabId: string, url: string) => {
      const state = useAppStore.getState();
      const isHistoryEntry = state.browserHistory.some((h) => h.id === tabId);

      if (isHistoryEntry) {
        browserDeleteHistoryEntry(tabId);
        if (url) {
          removeSiteMetaIfUnreferenced(url);
        }
      } else {
        browserRemoveTabBookmarks(tabId, url);
        browserCloseTab(tabId);
        if (url) {
          removeSiteMetaIfUnreferenced(url);
        }
      }
    },
    [browserCloseTab, browserRemoveTabBookmarks, browserDeleteHistoryEntry],
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
    [browserOpenTab],
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
    [browserUpdateTab],
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
