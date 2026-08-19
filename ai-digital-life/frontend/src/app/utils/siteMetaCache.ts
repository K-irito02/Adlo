import { isTauriShell } from '../../tauri-bridge/tauri-shared';
import type { SiteMetaBackend, SiteMetaCacheEntry } from './siteMetaBackends/types';
import { tauriSiteMetaBackend } from './siteMetaBackends/tauri';
import { previewSiteMetaBackend } from './siteMetaBackends/preview';
import { createMockSiteMetaBackend } from './siteMetaBackends/mock';
import type { PageMetaUpdatedPayload } from '../../shared/ipc/browser';

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

const memoryCache = new Map<string, SiteMetaCacheEntry>();
const urlListeners = new Map<string, Set<() => void>>();
const globalListeners = new Set<(url: string) => void>();
const readyListeners = new Set<() => void>();

let ready = false;
let initPromise: Promise<void> | null = null;

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

/**
 * 只读镜像写入口：clamp + 内存 set + notify。
 * 写路径唯一在服务端 PageMetaService——本模块只维护镜像，不触碰后端持久化。
 */
function upsertMirror(key: string, entry: SiteMetaCacheEntry): void {
  const clean = clamp(entry);
  memoryCache.set(key, clean);
  notify(key);
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

/**
 * 仅更新内存镜像（写路径唯一在服务端）。保留函数名以便 Task 9/10 迁移
 * 前的调用点编译通过；生产代码不再通过它写后端。
 */
export function setCachedSiteMeta(url: string, entry: SiteMetaCacheEntry): void {
  upsertMirror(normalizeUrlForCache(url), entry);
}

/**
 * 仅清理内存镜像。写/删路径唯一在服务端——生产路径不得调用本函数；
 * 保留导出仅为 Task 8 重写 BrowserFavicon 前编译通过。
 */
export function removeCachedSiteMeta(url: string): void {
  const key = normalizeUrlForCache(url);
  memoryCache.delete(key);
  notify(key);
}

/**
 * 测试专用：模拟服务端广播写入镜像（等价于 applyBroadcastUpdate 的镜像效果）。
 */
export function __mirrorUpsertForTest(url: string, entry: SiteMetaCacheEntry): void {
  upsertMirror(normalizeUrlForCache(url), entry);
}

/**
 * 服务端 page-meta-updated 广播驱动镜像更新。
 *
 * RC3 合并守卫：空/部分字段的广播（抓取失败、被限速、robots 拦截等瞬态）
 * 不得清空镜像中已有的真实数据 —— 否则真实图标被清后回落 DDG 代理图标、
 * 下次成功又恢复，导致图标在"兜底↔真实"之间来回切换。合并规则：
 * 空字段保留既有值；data-URI 优先保留广播新值，仅在广播 faviconUrl 变化
 * 且未携带新 data-URI 时丢弃既有 data-URI（避免新 URL 配上旧站点的陈旧
 * 图标）。与 Rust write_success 收敛：镜像 data-URI 非空 ⇒ 后端
 * `should_replace_favicon` 不会替换 faviconUrl ⇒ 广播 faviconUrl 实际不变
 * ⇒ 两分支在真实数据下结果一致。
 */
export function applyBroadcastUpdate(payload: PageMetaUpdatedPayload): void {
  const key = normalizeUrlForCache(payload.url);
  const existing = memoryCache.get(key);
  const hasData =
    payload.title !== '' || payload.faviconUrl !== '' || payload.faviconDataUri !== '';
  if (!hasData && existing) {
    console.info('[site-meta-cache] broadcast no-data ignored', {
      url: payload.url,
      title: payload.title,
      faviconUrl: payload.faviconUrl,
    });
    notify(key);
    return;
  }
  console.info('[site-meta-cache] broadcast apply', {
    url: payload.url,
    srcTitle: payload.title,
    srcFaviconUrl: payload.faviconUrl,
    srcFaviconUrlLen: payload.faviconUrl.length,
    hasDataUri: Boolean(payload.faviconDataUri),
    hadCache: Boolean(existing),
  });
  upsertMirror(key, {
    title: payload.title || existing?.title || '',
    titleSource: payload.source || existing?.titleSource || '',
    faviconUrl: payload.faviconUrl || existing?.faviconUrl || '',
    faviconDataUri:
      payload.faviconDataUri ||
      (existing && payload.faviconUrl === existing.faviconUrl ? existing.faviconDataUri : ''),
    fetchedAt: Date.now(),
    lastOkAt: Date.now(),
    nextRetryAt: 0,
    failCount: 0,
  });
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
