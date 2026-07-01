import { isTauriShell } from '../../tauri-bridge';
import { invoke } from '@tauri-apps/api/core';

const PAGE_META_TTL = 5 * 60 * 1000;

interface CacheEntry {
  title: string;
  favicon: string;
  url: string;
  fetchedAt: number;
}

const metaCache = new Map<string, CacheEntry>();
const faviconUrlCache = new Map<string, string>();
const faviconPinned = new Set<string>();
const titleLockedTabs = new Set<string>();

const FAVICON_CACHE_KEY = 'adl-ui:browser-favicon-cache';
const PERSIST_DEBOUNCE_MS = 500;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersistFaviconCache(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const obj: Record<string, string> = {};
      for (const [key, value] of faviconUrlCache.entries()) {
        obj[key] = value;
      }
      localStorage.setItem(FAVICON_CACHE_KEY, JSON.stringify(obj));
    } catch {
      // localStorage quota exceeded or unavailable — silently skip
    }
  }, PERSIST_DEBOUNCE_MS);
}

function loadPersistedFaviconCache(): void {
  try {
    const raw = localStorage.getItem(FAVICON_CACHE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, string>;
    for (const [key, value] of Object.entries(obj)) {
      if (!faviconUrlCache.has(key)) {
        faviconUrlCache.set(key, value);
      }
    }
  } catch {
    // Corrupted data or unavailable — start fresh
  }
}

// Call on module load
loadPersistedFaviconCache();
const faviconListeners = new Map<string, Set<() => void>>();
const globalFaviconListeners = new Set<(url: string) => void>();

export function lockTabTitle(tabId: string): void {
  titleLockedTabs.add(tabId);
}

export function isTabTitleLocked(tabId: string): boolean {
  return titleLockedTabs.has(tabId);
}

function normalizeUrlForCache(url: string): string {
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

export function getCachedFavicon(url: string): string | undefined {
  return faviconUrlCache.get(normalizeUrlForCache(url));
}

export function setCachedFavicon(url: string, favicon: string, pin?: boolean): void {
  const cacheKey = normalizeUrlForCache(url);
  if (faviconPinned.has(cacheKey)) {
    return;
  }
  if (faviconUrlCache.size >= 200) {
    const firstKey = faviconUrlCache.keys().next().value;
    if (firstKey) {
      faviconUrlCache.delete(firstKey);
      faviconPinned.delete(firstKey);
    }
  }
  const oldFavicon = faviconUrlCache.get(cacheKey);
  if (oldFavicon === favicon) {
    return;
  }
  faviconUrlCache.set(cacheKey, favicon);
  schedulePersistFaviconCache();
  if (pin) {
    faviconPinned.add(cacheKey);
  }
  // Notify listeners for this URL
  const listeners = faviconListeners.get(cacheKey);
  if (listeners) {
    listeners.forEach((fn) => {
      try {
        fn();
      } catch {
        /* ignore listener errors */
      }
    });
  }
  // Notify global listeners
  globalFaviconListeners.forEach((fn) => {
    try {
      fn(cacheKey);
    } catch {
      /* ignore listener errors */
    }
  });
}

export function subscribeFavicon(url: string, callback: () => void): () => void {
  const cacheKey = normalizeUrlForCache(url);
  if (!faviconListeners.has(cacheKey)) {
    faviconListeners.set(cacheKey, new Set());
  }
  const set = faviconListeners.get(cacheKey)!;
  set.add(callback);
  return () => {
    set.delete(callback);
    if (set.size === 0) {
      faviconListeners.delete(cacheKey);
    }
  };
}

export function subscribeFaviconGlobal(callback: (url: string) => void): () => void {
  globalFaviconListeners.add(callback);
  return () => {
    globalFaviconListeners.delete(callback);
  };
}

export function clearFaviconCacheForUrl(url: string): void {
  const cacheKey = normalizeUrlForCache(url);
  faviconUrlCache.delete(cacheKey);
  faviconPinned.delete(cacheKey);
}

export function clearPageMetaCacheForUrl(url: string): void {
  metaCache.delete(url);
}

export function unlockTabTitle(tabId: string): void {
  titleLockedTabs.delete(tabId);
}

export async function fetchPageMeta(
  url: string
): Promise<{ title: string; favicon: string } | null> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return null;
  }

  const cached = metaCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < PAGE_META_TTL) {
    return { title: cached.title, favicon: cached.favicon };
  }

  try {
    const res = await fetch(
      `/__adl_preview_api__/browser/page-meta?url=${encodeURIComponent(url)}`
    );
    if (!res.ok) {
      return null;
    }
    const data: { title: string; favicon: string; url: string } = await res.json();

    if (metaCache.size > 100) {
      const firstKey = metaCache.keys().next().value;
      if (firstKey) {
        metaCache.delete(firstKey);
      }
    }
    metaCache.set(url, { ...data, fetchedAt: Date.now() });

    return { title: data.title, favicon: data.favicon };
  } catch {
    return null;
  }
}

export async function prefetchPageMeta(
  url: string
): Promise<{ title: string; favicon: string } | null> {
  const PREFETCH_TIMEOUT = 5000;

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return null;
  }

  if (isTauriShell()) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), PREFETCH_TIMEOUT)
      );
      const result = (await Promise.race([
        invoke('browser_fetch_page_meta', { url }),
        timeoutPromise,
      ])) as { ok: boolean; data: { title: string; favicon: string; url: string } };
      if (result?.ok && result.data) {
        return { title: result.data.title, favicon: result.data.favicon };
      }
    } catch {
      return null;
    }
    return null;
  }

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), PREFETCH_TIMEOUT)
    );
    const meta = (await Promise.race([fetchPageMeta(url), timeoutPromise])) as Awaited<
      ReturnType<typeof fetchPageMeta>
    >;
    return meta;
  } catch {
    return null;
  }
}
