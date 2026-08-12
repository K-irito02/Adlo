import { useCallback, useRef } from 'react';
import { useAppStore } from '@stores/slicedStore';
import {
  setCachedSiteMeta,
  getCachedSiteMeta,
  buildCachedSiteMetaEntry,
} from '@utils/siteMetaCache';
import type { ToastType } from '@components/Toast';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import { existingFaviconBaseline, shouldReplaceFavicon } from './faviconQuality';

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

export type MetaSource = 'com' | 'http' | 'iframe' | 'google';

const SOURCE_PRIORITY: Record<MetaSource, number> = {
  com: 4,
  iframe: 3,
  http: 2,
  google: 1,
};

interface MetaProcessedEntry {
  timestamp: number;
  source: MetaSource;
}

/**
 * TTL for deduplicating rapid handlePageMeta calls from
 * meta-changed events (WebView2 postMessage + Rust active fetch).
 * Must be long enough to cover the fast poll interval overlap.
 */
const META_DEDUP_TTL = 2000; // ms

function normalizeMetaUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }
    return u.toString();
  } catch {
    const noHash = url.split('#')[0] || url;
    if (noHash.length > 8 && noHash.endsWith('/')) {
      return noHash.replace(/\/+$/, '');
    }
    return noHash;
  }
}

export function useBrowserPageMeta(
  pendingNavigationsRef: React.MutableRefObject<Set<string>>,
  _setToastMessage?: React.Dispatch<
    React.SetStateAction<{ id: string; message: string; type?: ToastType; source?: string }[]>
  >,
  _showToast?: (message: string, type?: ToastType, source?: string) => void,
  markUrlSeen?: (url: string) => void,
) {
  /**
   * Tracks URLs that have been recently processed by handlePageMeta.
   * Prevents the two concurrent callback paths (onUrlChanged + meta-changed)
   * from creating duplicate tabs / history entries for the same navigation.
   */
  const processedMetaRef = useRef<Map<string, MetaProcessedEntry>>(new Map());

  const shouldProcessMeta = useCallback((url: string, source: MetaSource): boolean => {
    const now = Date.now();
    const entry = processedMetaRef.current.get(url);
    if (!entry) {
      return true;
    }
    if (now - entry.timestamp > META_DEDUP_TTL) {
      processedMetaRef.current.delete(url);
      return true;
    }
    // Also check by hostname+pathname to catch SPA pushState URL variants
    const metaKey = hostnamePathKey(url);
    if (!metaKey) {
      return false;
    }
    for (const [seenUrl, seenEntry] of processedMetaRef.current.entries()) {
      if (now - seenEntry.timestamp > META_DEDUP_TTL) {
        processedMetaRef.current.delete(seenUrl);
        continue;
      }
      if (hostnamePathKey(seenUrl) === metaKey) {
        // Allow overwrite only if incoming has strictly higher priority
        return SOURCE_PRIORITY[source] > SOURCE_PRIORITY[seenEntry.source];
      }
    }
    return true;
  }, []);

  const handlePageMeta = useCallback(
    (meta: { title: string; favicon: string; url: string }, source: MetaSource = 'http') => {
      const cleanUrl = normalizeMetaUrl(meta.url);
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        return;
      }

      const state = useAppStore.getState();
      pendingNavigationsRef.current.delete(cleanUrl);

      const normalizedMetaUrl = normalizeUrlForDedup(cleanUrl);
      const exactMatch = state.browserTabs.find(
        (t: BrowserTabState) => normalizeUrlForDedup(normalizeMetaUrl(t.url)) === normalizedMetaUrl,
      );
      const activeTab = state.browserTabs.find(
        (t: BrowserTabState) => t.id === state.browserActiveTabId,
      );

      if (!meta.title && !meta.favicon) {
        return;
      }

      if (meta.favicon) {
        const existing = getCachedSiteMeta(cleanUrl);
        const existingFavicon = existingFaviconBaseline(existing);
        if (shouldReplaceFavicon(existingFavicon, meta.favicon)) {
          const dataUri = (meta as { faviconDataUri?: string }).faviconDataUri ?? '';
          const writeEntry = () => {
            setCachedSiteMeta(
              cleanUrl,
              buildCachedSiteMetaEntry(meta.title, meta.favicon, dataUri, existing),
            );
          };
          if (source === 'com') {
            // COM-sourced favicons need preload to prevent flicker
            const img = new Image();
            img.onload = writeEntry;
            img.onerror = writeEntry;
            img.src = meta.favicon;
          } else {
            // HTTP/iframe/google sources: image was already loaded or will be loaded naturally
            writeEntry();
          }
        }
      }

      const pageTitle = meta.title;

      if (exactMatch) {
        if (exactMatch.title !== pageTitle) {
          state.browserUpdateTab(exactMatch.id, { title: pageTitle });
          state.browserAddToHistory(cleanUrl, pageTitle);
          state.browserUpdateHistoryTitle(cleanUrl, pageTitle);
        }
        // Also update the active tab's title if it's a different tab with the
        // same URL (e.g. user opened the same link in multiple tabs — only
        // the first tab would get the title without this).
        if (activeTab && activeTab.id !== exactMatch.id && activeTab.title !== pageTitle) {
          state.browserUpdateTab(activeTab.id, { title: pageTitle });
        }
        return;
      }

      if (activeTab) {
        if (!shouldProcessMeta(cleanUrl, source)) {
          return;
        }
        if (markUrlSeen) {
          markUrlSeen(cleanUrl);
        }
        processedMetaRef.current.set(cleanUrl, { timestamp: Date.now(), source });

        state.browserUpdateTab(activeTab.id, {
          url: cleanUrl,
          title: pageTitle,
        });
        state.browserAddToHistory(cleanUrl, pageTitle);
        state.browserUpdateHistoryTitle(cleanUrl, pageTitle);
        return;
      }

      if (!shouldProcessMeta(cleanUrl, source)) {
        return;
      }
      if (markUrlSeen) {
        markUrlSeen(cleanUrl);
      }
      processedMetaRef.current.set(cleanUrl, { timestamp: Date.now(), source });
      state.browserOpenTab(cleanUrl, pageTitle);
      state.browserAddToHistory(cleanUrl, pageTitle);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: handler reads latest state via refs and useAppStore.getState(); adding deps would recreate the callback and break the subscription
    [],
  );

  return { handlePageMeta };
}
