import { isTauriShell } from '../../tauri-bridge/tauri-shared';
import type { SiteMetaBackend, SiteMetaCacheEntry } from './siteMetaBackends/types';
import { tauriSiteMetaBackend } from './siteMetaBackends/tauri';
import { previewSiteMetaBackend } from './siteMetaBackends/preview';
import { createMockSiteMetaBackend } from './siteMetaBackends/mock';

export type { SiteMetaCacheEntry };
export { createMockSiteMetaBackend };

export function normalizeUrlForCache(url: string): string {
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

const FAVICON_MAX_DATA_URI_LEN = Math.ceil((64 * 1024 * 4) / 3);
const TITLE_MAX_LEN = 200;
const PERSIST_DEBOUNCE_MS = 500;

const memoryCache = new Map<string, SiteMetaCacheEntry>();
const urlListeners = new Map<string, Set<() => void>>();
const globalListeners = new Set<(url: string) => void>();
const readyListeners = new Set<() => void>();

let ready = false;
let initPromise: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let flushChain: Promise<void> = Promise.resolve();
const pendingUpserts = new Map<string, SiteMetaCacheEntry>();
const pendingRemoves = new Set<string>();

let backend: SiteMetaBackend = isTauriShell() ? tauriSiteMetaBackend : previewSiteMetaBackend;

export function setSiteMetaBackendForTest(b: SiteMetaBackend): void {
  backend = b;
}

function clamp(entry: SiteMetaCacheEntry): SiteMetaCacheEntry {
  return {
    ...entry,
    title: entry.title.slice(0, TITLE_MAX_LEN),
    faviconDataUri:
      entry.faviconDataUri.length <= FAVICON_MAX_DATA_URI_LEN ? entry.faviconDataUri : '',
  };
}

export function buildCachedSiteMetaEntry(
  metaTitle: string,
  faviconUrl: string,
  dataUri: string,
  existing?: SiteMetaCacheEntry,
): SiteMetaCacheEntry {
  return {
    title: metaTitle || existing?.title || '',
    titleSource: existing?.titleSource ?? '',
    faviconUrl: faviconUrl || existing?.faviconUrl || '',
    faviconDataUri: dataUri || existing?.faviconDataUri || '',
    fetchedAt: Date.now(),
    lastOkAt: existing?.lastOkAt ?? 0,
    nextRetryAt: existing?.nextRetryAt ?? 0,
    failCount: existing?.failCount ?? 0,
  };
}

function notify(url: string): void {
  urlListeners.get(url)?.forEach((fn) => {
    try {
      fn();
    } catch {
      /* listener error */
    }
  });
  globalListeners.forEach((fn) => {
    try {
      fn(url);
    } catch {
      /* listener error */
    }
  });
}

function schedulePersist(): void {
  if (persistTimer) {
    return;
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    flushChain = flushChain.then(() => flushPersist()).catch(() => {});
  }, PERSIST_DEBOUNCE_MS);
}

async function flushPersist(): Promise<void> {
  if (pendingUpserts.size === 0 && pendingRemoves.size === 0) {
    return;
  }
  const upserts = new Map(pendingUpserts);
  const removes = [...pendingRemoves];
  try {
    if (upserts.size > 0) {
      await backend.upsert(Object.fromEntries(upserts));
      for (const [key, val] of upserts) {
        if (pendingUpserts.get(key) === val) {
          pendingUpserts.delete(key);
        }
      }
    }
    if (removes.length > 0) {
      await backend.remove(removes);
      for (const url of removes) {
        pendingRemoves.delete(url);
      }
    }
  } catch (err) {
    console.warn('siteMetaCache: persist failed', err);
  }
}

export async function initSiteMetaCache(): Promise<void> {
  if (initPromise) {
    return initPromise;
  }
  initPromise = (async () => {
    try {
      const persisted = await backend.getAll();
      for (const [url, entry] of Object.entries(persisted ?? {})) {
        if (!memoryCache.has(url)) {
          memoryCache.set(url, clamp(entry));
        }
      }
    } catch (err) {
      console.warn('siteMetaCache: preload failed', err);
    } finally {
      ready = true;
      readyListeners.forEach((fn) => {
        try {
          fn();
        } catch {
          /* listener error */
        }
      });
      readyListeners.clear();
    }
  })();
  return initPromise;
}

export function isSiteMetaCacheReady(): boolean {
  return ready;
}

export function whenSiteMetaCacheReady(): Promise<void> {
  return initPromise ?? initSiteMetaCache();
}

export function subscribeSiteMetaReady(callback: () => void): () => void {
  if (ready) {
    queueMicrotask(callback);
    return () => {};
  }
  readyListeners.add(callback);
  return () => readyListeners.delete(callback);
}

export function getCachedSiteMeta(url: string): SiteMetaCacheEntry | undefined {
  return memoryCache.get(normalizeUrlForCache(url));
}

export function getCachedFavicon(url: string): string {
  return memoryCache.get(normalizeUrlForCache(url))?.faviconDataUri ?? '';
}

export function getCachedTitle(url: string): string {
  return memoryCache.get(normalizeUrlForCache(url))?.title ?? '';
}

export function setCachedSiteMeta(url: string, entry: SiteMetaCacheEntry): void {
  const key = normalizeUrlForCache(url);
  const clean = clamp(entry);
  memoryCache.set(key, clean);
  pendingUpserts.set(key, clean);
  pendingRemoves.delete(key);
  notify(key);
  schedulePersist();
}

export function removeCachedSiteMeta(url: string): void {
  const key = normalizeUrlForCache(url);
  memoryCache.delete(key);
  pendingRemoves.add(key);
  pendingUpserts.delete(key);
  notify(key);
  schedulePersist();
}

export function subscribeSiteMeta(url: string, callback: () => void): () => void {
  const key = normalizeUrlForCache(url);
  if (!urlListeners.has(key)) {
    urlListeners.set(key, new Set());
  }
  urlListeners.get(key)!.add(callback);
  return () => {
    const set = urlListeners.get(key);
    set?.delete(callback);
    if (set?.size === 0) {
      urlListeners.delete(key);
    }
  };
}

export function subscribeSiteMetaGlobal(callback: (url: string) => void): () => void {
  globalListeners.add(callback);
  return () => globalListeners.delete(callback);
}

export function getSiteMetaCacheStats(): { size: number; ready: boolean } {
  return { size: memoryCache.size, ready };
}
