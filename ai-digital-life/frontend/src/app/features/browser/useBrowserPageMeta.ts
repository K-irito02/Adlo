import { useCallback } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import { getGoogleFaviconUrl } from '../../utils/favicon';
import { setCachedFavicon } from '../../utils/fetchPageMeta';
import type { ToastType } from '../../components/Toast';

export function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function useBrowserPageMeta(
  pendingNavigationsRef: React.MutableRefObject<Set<string>>,
  _setToastMessage?: React.Dispatch<
    React.SetStateAction<Array<{ id: string; message: string; type?: ToastType; source?: string }>>
  >,
  _showToast?: (message: string, type?: ToastType, source?: string) => void
) {
  const handlePageMeta = useCallback(
    (meta: { title: string; favicon: string; url: string }) => {
      // Cache favicon alongside title for sync; use Google S2 fallback when empty
      const faviconToCache = meta.favicon || (meta.url ? getGoogleFaviconUrl(meta.url) : '');
      if (faviconToCache) {
        setCachedFavicon(meta.url, faviconToCache);
        // Warm browser cache so favicon renders immediately with title
        new Image().src = faviconToCache;
      }

      if (!meta.title) {
        return;
      }

      // Clear pending navigation marker
      pendingNavigationsRef.current.delete(meta.url);

      const urlHostname = hostnameFromUrl(meta.url);
      if (meta.title === urlHostname) {
        return;
      }

      const pageTitle = meta.title;

      if (pageTitle) {
        const state = useAppStore.getState();
        const tabExists = state.browserTabs.some((t) => t.url === meta.url);
        if (!tabExists) {
          // Create tab with real title and record in history
          state.browserOpenTab(meta.url, pageTitle);
          state.browserAddToHistory(meta.url, pageTitle);
          return;
        }
        let _tabUpdateCount = 0;
        for (const tab of state.browserTabs) {
          if (tab.url === meta.url && tab.title !== pageTitle) {
            _tabUpdateCount++;
            state.browserUpdateTab(tab.id, { title: pageTitle });
          }
        }
        state.browserUpdateBookmarkTitle(meta.url, pageTitle);
        state.browserUpdateHistoryTitle(meta.url, pageTitle);
      }
    },
    // pendingNavigationsRef is a stable ref, no need to include in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return { handlePageMeta };
}
