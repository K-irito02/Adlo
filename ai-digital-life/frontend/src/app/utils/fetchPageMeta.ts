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

export function lockTabTitle(tabId: string): void {
  titleLockedTabs.add(tabId);
}

export function isTabTitleLocked(tabId: string): boolean {
  return titleLockedTabs.has(tabId);
}

export function getCachedFavicon(url: string): string | undefined {
  return faviconUrlCache.get(url);
}

export function setCachedFavicon(url: string, favicon: string, pin?: boolean): void {
  if (faviconPinned.has(url)) {
    return;
  }
  if (faviconUrlCache.size > 200) {
    const firstKey = faviconUrlCache.keys().next().value;
    if (firstKey) {
      faviconUrlCache.delete(firstKey);
      faviconPinned.delete(firstKey);
    }
  }
  faviconUrlCache.set(url, favicon);
  if (pin) {
    faviconPinned.add(url);
  }
}

export function clearFaviconCacheForUrl(url: string): void {
  faviconUrlCache.delete(url);
  faviconPinned.delete(url);
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

    if (data.favicon) {
      setCachedFavicon(url, data.favicon);
    }

    return { title: data.title, favicon: data.favicon };
  } catch {
    return null;
  }
}

export async function prefetchPageMeta(
  url: string
): Promise<{ title: string; favicon: string } | null> {
  const PREFETCH_TIMEOUT = 5000;

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
