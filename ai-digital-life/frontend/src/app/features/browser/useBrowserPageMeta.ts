import { useCallback, useRef } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import { setCachedFavicon, isTabTitleLocked, getCachedFavicon } from '../../utils/fetchPageMeta';
import type { ToastType } from '../../components/Toast';
import type { BrowserTabState } from '../../stores/slices/browserSlice';

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
 * TTL for deduplicating rapid handlePageMeta calls from
 * meta-changed events (WebView2 postMessage + Rust active fetch).
 * Must be long enough to cover the fast poll interval overlap.
 */
const META_DEDUP_TTL = 2000; // ms

function getFaviconQualityScore(favicon: string): number {
  if (!favicon) {
    return 0;
  }
  const lower = favicon.toLowerCase();

  if (
    lower.includes('google.com/s2/favicons') ||
    lower.includes('favicon.cc') ||
    lower.includes('faviconkit') ||
    lower.includes('besticon') ||
    lower.includes('favicon-generator')
  ) {
    return 1;
  }

  if (lower.endsWith('/favicon.ico')) {
    return 2;
  }
  if (lower.endsWith('favicon.ico')) {
    return 3;
  }
  if (lower.endsWith('.ico')) {
    return 4;
  }
  if (lower.endsWith('.svg')) {
    return 10;
  }
  if (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.gif')
  ) {
    const sizeMatch = lower.match(/(\d+)(?:x\d+)?\.(?:png|jpg|webp|gif)$/);
    if (sizeMatch) {
      const size = parseInt(sizeMatch[1], 10);
      if (size >= 256) {
        return 15;
      }
      if (size >= 128) {
        return 14;
      }
      if (size >= 64) {
        return 13;
      }
      if (size >= 32) {
        return 12;
      }
      return 11;
    }
    if (lower.includes('apple-touch-icon')) {
      return 13;
    }
    if (
      lower.includes('512') ||
      lower.includes('256') ||
      lower.includes('192') ||
      lower.includes('180')
    ) {
      return 14;
    }
    return 11;
  }
  return 3;
}

function shouldReplaceFavicon(existing: string | undefined, incoming: string): boolean {
  if (!incoming) {
    return false;
  }
  if (!existing) {
    return true;
  }
  const existingScore = getFaviconQualityScore(existing);
  const incomingScore = getFaviconQualityScore(incoming);
  return incomingScore >= existingScore;
}

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
      console.info(
        '[browser-debug] handlePageMeta called (ts=' + performance.now().toFixed(0) + '):',
        JSON.stringify(meta)
      );

      const cleanUrl = normalizeMetaUrl(meta.url);
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        console.info('[browser-debug] handlePageMeta: non-http URL, ignoring');
        return;
      }

      const state = useAppStore.getState();
      pendingNavigationsRef.current.delete(cleanUrl);

      const normalizedMetaUrl = normalizeUrlForDedup(cleanUrl);
      const exactMatch = state.browserTabs.find(
        (t: BrowserTabState) => normalizeUrlForDedup(normalizeMetaUrl(t.url)) === normalizedMetaUrl
      );
      const activeTab = state.browserTabs.find(
        (t: BrowserTabState) => t.id === state.browserActiveTabId
      );

      if (!meta.title) {
        if (meta.favicon && exactMatch) {
          console.info('[browser-debug] handlePageMeta: title empty, deferring favicon cache');
        }
        return;
      }

      // Cache favicon only when we have a real title — both appear in the same render
      if (meta.favicon) {
        const existingFavicon = getCachedFavicon(cleanUrl);
        if (shouldReplaceFavicon(existingFavicon, meta.favicon)) {
          console.info('[browser-debug] preloading favicon for', cleanUrl, ':', meta.favicon);
          // Preload the image first, then update cache on load/error.
          // This prevents a flicker caused by the <img> src changing to an uncached URL.
          const img = new Image();
          img.onload = () => {
            setCachedFavicon(cleanUrl, meta.favicon);
          };
          img.onerror = () => {
            setCachedFavicon(cleanUrl, meta.favicon);
          };
          img.src = meta.favicon;
        } else if (existingFavicon) {
          console.info(
            '[browser-debug] skipping lower-quality favicon:',
            meta.favicon,
            '(existing:',
            existingFavicon,
            ')'
          );
        }
      }

      const pageTitle = meta.title;

      console.info('[browser-debug] activeTabId:', state.browserActiveTabId);
      console.info('[browser-debug] total tabs:', state.browserTabs.length);
      state.browserTabs.forEach((t: BrowserTabState, i: number) => {
        console.info(`[browser-debug] tab[${i}]: id=${t.id} | url=${t.url} | title=${t.title}`);
      });

      if (exactMatch) {
        if (exactMatch.title !== pageTitle) {
          console.info('[browser-debug] handlePageMeta: exact match found, updating title');
          if (!isTabTitleLocked(exactMatch.id)) {
            state.browserUpdateTab(exactMatch.id, { title: pageTitle });
          }
          state.browserAddToHistory(cleanUrl, pageTitle);
          state.browserUpdateHistoryTitle(cleanUrl, pageTitle);
        }
        return;
      }

      if (activeTab) {
        console.info('[browser-debug] handlePageMeta: active tab found, checking dedup');
        if (isMetaRecentlyProcessed(cleanUrl)) {
          console.info('[browser-debug] handlePageMeta: URL already recently processed, skip');
          return;
        }
        if (markUrlSeen) {
          markUrlSeen(cleanUrl);
        }
        processedMetaRef.current.set(cleanUrl, Date.now());

        console.info('[browser-debug] handlePageMeta: updating active tab with new url and title');
        if (!isTabTitleLocked(activeTab.id)) {
          state.browserUpdateTab(activeTab.id, {
            url: cleanUrl,
            title: pageTitle,
          });
        }
        state.browserAddToHistory(cleanUrl, pageTitle);
        state.browserUpdateHistoryTitle(cleanUrl, pageTitle);
        return;
      }

      console.info('[browser-debug] handlePageMeta: no active tab, creating new tab');
      if (isMetaRecentlyProcessed(cleanUrl)) {
        return;
      }
      if (markUrlSeen) {
        markUrlSeen(cleanUrl);
      }
      processedMetaRef.current.set(cleanUrl, Date.now());
      state.browserOpenTab(cleanUrl, pageTitle);
      state.browserAddToHistory(cleanUrl, pageTitle);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return { handlePageMeta };
}
