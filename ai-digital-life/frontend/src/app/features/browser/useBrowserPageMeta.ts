import { useCallback, useRef } from 'react';
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

function normalizeUrlForDedup(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : u.pathname;
    return `${u.protocol}//${u.hostname.toLowerCase()}${path}${u.search}${u.hash}`;
  } catch {
    return url;
  }
}

function hostnamePathKey(url: string): string {
  try {
    const u = new URL(url);
    const path = (
      u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : u.pathname
    ).toLowerCase();
    return `${u.hostname.toLowerCase()}${path}`;
  } catch {
    return '';
  }
}

/**
 * TTL for deduplicating concurrent handlePageMeta calls from the two
 * callback paths (onUrlChanged → browser_fetch_page_meta AND
 * meta-changed from INIT_SCRIPT).  Must be long enough to cover the
 * async HTTP meta fetch on slow connections.
 */
const META_DEDUP_TTL = 5000; // ms

export function useBrowserPageMeta(
  pendingNavigationsRef: React.MutableRefObject<Set<string>>,
  _setToastMessage?: React.Dispatch<
    React.SetStateAction<Array<{ id: string; message: string; type?: ToastType; source?: string }>>
  >,
  _showToast?: (message: string, type?: ToastType, source?: string) => void,
  markUrlSeen?: (url: string) => void
) {
  /**
   * Tracks URLs that have been recently processed by handlePageMeta.
   * Prevents the two concurrent callback paths (onUrlChanged + meta-changed)
   * from creating duplicate tabs / history entries for the same navigation.
   */
  const processedMetaRef = useRef<Map<string, number>>(new Map());

  const isMetaRecentlyProcessed = useCallback((url: string): boolean => {
    const now = Date.now();
    const ts = processedMetaRef.current.get(url);
    if (ts !== undefined) {
      if (now - ts > META_DEDUP_TTL) {
        processedMetaRef.current.delete(url);
        return false;
      }
      return true;
    }
    // Also check by hostname+pathname to catch SPA pushState URL variants
    const metaKey = hostnamePathKey(url);
    if (!metaKey) {
      return false;
    }
    for (const [seenUrl, seenTs] of processedMetaRef.current.entries()) {
      if (now - seenTs > META_DEDUP_TTL) {
        processedMetaRef.current.delete(seenUrl);
        continue;
      }
      if (hostnamePathKey(seenUrl) === metaKey) {
        return true;
      }
    }
    return false;
  }, []);

  const handlePageMeta = useCallback(
    (meta: { title: string; favicon: string; url: string }) => {
      const faviconToCache = meta.favicon || (meta.url ? getGoogleFaviconUrl(meta.url) : '');
      if (faviconToCache) {
        setCachedFavicon(meta.url, faviconToCache);
        new Image().src = faviconToCache;
      }

      if (!meta.title) {
        return;
      }

      pendingNavigationsRef.current.delete(meta.url);

      const urlHostname = hostnameFromUrl(meta.url);
      if (meta.title === urlHostname) {
        return;
      }

      const pageTitle = meta.title;
      if (!pageTitle) {
        return;
      }

      // Deduplicate concurrent calls from the two callback paths
      // (onUrlChanged → browser_fetch_page_meta and meta-changed from INIT_SCRIPT).
      // If another handlePageMeta call already processed this URL (or a
      // hostname+pathname equivalent) within META_DEDUP_TTL, we skip
      // tab creation to avoid duplicate tabs / history entries.
      if (isMetaRecentlyProcessed(meta.url)) {
        return;
      }

      const state = useAppStore.getState();
      const normalizedMetaUrl = normalizeUrlForDedup(meta.url);

      // 1. Exact normalized match
      const exactMatch = state.browserTabs.find(
        (t) => normalizeUrlForDedup(t.url) === normalizedMetaUrl
      );
      if (exactMatch) {
        if (exactMatch.title !== pageTitle) {
          state.browserUpdateTab(exactMatch.id, { title: pageTitle });
        }
        state.browserUpdateBookmarkTitle(meta.url, pageTitle);
        state.browserUpdateHistoryTitle(meta.url, pageTitle);
        return;
      }

      // 2. In in-place mode: check if active tab matches by hostname+pathname (ignore query params)
      // Handles SPA pushState URL changes (e.g. YouTube removing &pp=oAcB)
      if (state.browserNavigateInPlace) {
        const metaKey = hostnamePathKey(meta.url);
        const activeTab = state.browserTabs.find((t) => t.id === state.browserActiveTabId);
        if (activeTab && hostnamePathKey(activeTab.url) === metaKey && metaKey !== '') {
          if (markUrlSeen) {
            markUrlSeen(meta.url);
          }
          state.browserUpdateTab(activeTab.id, { url: meta.url, title: pageTitle });
          state.browserAddToHistory(meta.url, pageTitle);
          state.browserUpdateBookmarkTitle(meta.url, pageTitle);
          state.browserUpdateHistoryTitle(meta.url, pageTitle);
          return;
        }
      }

      // 3. No match: create new tab or update active tab
      // Mark URL as seen BEFORE creating tab to prevent the subsequent
      // useEffect → navigateTauriUrl → browser_navigate → page refresh loop.
      // This is critical when meta-changed fires from the INIT_SCRIPT
      // (via useBrowserMetaSubscription) because that path does NOT go through
      // onUrlChanged where markUrlSeen is normally called.
      if (markUrlSeen) {
        markUrlSeen(meta.url);
      }
      // Mark as processed BEFORE creating tab so the second callback path
      // (meta-changed from INIT_SCRIPT) sees it and skips.
      processedMetaRef.current.set(meta.url, Date.now());
      if (state.browserNavigateInPlace) {
        state.browserNavigateActiveTab(meta.url, pageTitle);
        state.browserAddToHistory(meta.url, pageTitle);
      } else {
        state.browserOpenTab(meta.url, pageTitle);
        state.browserAddToHistory(meta.url, pageTitle);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return { handlePageMeta };
}
