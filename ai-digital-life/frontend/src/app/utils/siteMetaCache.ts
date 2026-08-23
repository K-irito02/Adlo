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

// Rust 侧 MAX_FAVICON_BYTES=512KB 是二进制上限；前端收的是其 base64 data-URI（约
// 512KB·4/3=699052 字符）再加 `data:…;base64,` 前缀（~25 字符）。clamp 需带上前缀
// 余量，否则恰好顶满后端上限的 favicon 会被整段丢弃。
const FAVICON_MAX_DATA_URI_LEN = Math.ceil((512 * 1024 * 4) / 3) + 128;
const TITLE_MAX_LEN = 200;

const memoryCache = new Map<string, SiteMetaCacheEntry>();
const urlListeners = new Map<string, Set<() => void>>();
const globalListeners = new Set<(url: string) => void>();
const readyListeners = new Set<() => void>();

/**
 * 重定向映射：原始 URL（normalize 后） → 重定向目标 URL（normalize 后）。
 *
 * 解决跨域重定向的 favicon/标题查找 miss（参考 Chromium `icon_mapping.page_url_type`
 * 的 kRedirect 语义）：`search.marginalia.nu/search?q=…` 会 302 到
 * `marginalia-search.com/search?q=…`，元数据只缓存于目标 origin 下。查找原始 URL
 * 时通过本映射落到目标 URL，直接命中缓存，避免"永久 spinner/兜底字母"。
 *
 * 仅内存态（会话级）：重定向关系是导航时的瞬态事实，持久化到 history 由方案 A
 * （历史条目 URL 回写最终 URL）承担。
 */
const redirectMap = new Map<string, string>();

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

export function isFaviconConfirmed(url: string): boolean {
  const entry = memoryCache.get(normalizeUrlForCache(url));
  const exactMatch = Boolean(entry && (entry.faviconDataUri || entry.lastOkAt > 0));
  if (exactMatch) {
    return true;
  }
  const originEntry = findCanonicalOriginEntry(url);
  return Boolean(
    originEntry && (originEntry.entry.faviconDataUri || originEntry.entry.lastOkAt > 0),
  );
}

export function getCachedFavicon(url: string): string {
  return memoryCache.get(normalizeUrlForCache(url))?.faviconDataUri ?? '';
}

/** 解析 url 的 origin（scheme://host[:port]）；失败返回 ''。 */
export function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

function hasFavicon(entry: SiteMetaCacheEntry): boolean {
  return Boolean(entry.faviconDataUri || entry.faviconUrl);
}

/**
 * 确定性选取同一 origin 的"站点级"canonical 图标条目（Chrome/Edge 式：每个站点一个唯一 favicon）。
 *
 * 优先级（目标：稳定，不随缓存插入顺序/各页 URL 不同而在多种真实图标间来回切换）：
 * 1. 站点根条目（origin 或 origin + '/'）且含图标 —— 站点根图标为准，最稳定；
 * 2. 含图标的条目中 lastOkAt 最新 → fetchedAt 最新（最近成功/最近抓取）；
 * 3. 完全没有任何图标的同 origin 条目里，取插入顺序第一条。
 *
 * 返回 `{ entry, cacheKey }`；同 origin 无任何条目返回 undefined。
 */
export function findCanonicalOriginEntry(
  url: string,
): { entry: SiteMetaCacheEntry; cacheKey: string } | undefined {
  const origin = originOf(url);
  if (!origin) {
    return undefined;
  }
  const candidates: { cacheKey: string; entry: SiteMetaCacheEntry }[] = [];
  for (const [key, entry] of memoryCache) {
    if (originOf(key) === origin) {
      candidates.push({ cacheKey: key, entry });
    }
  }
  if (candidates.length === 0) {
    return undefined;
  }
  const root = candidates.find((c) => c.cacheKey === origin || c.cacheKey === `${origin}/`);
  if (root && hasFavicon(root.entry)) {
    return root;
  }
  const withFav = candidates.filter((c) => hasFavicon(c.entry));
  if (withFav.length > 0) {
    // Array.prototype.sort 稳定：时间戳相同时保留原插入顺序，保证确定性。
    const chosen = [...withFav].sort(
      (a, b) => b.entry.lastOkAt - a.entry.lastOkAt || b.entry.fetchedAt - a.entry.fetchedAt,
    )[0]!;
    return chosen;
  }
  return candidates[0]!;
}

/** 该 URL 站点级 canonical 图标。 */
export function getCanonicalOriginFavicon(url: string): {
  faviconDataUri: string;
  faviconUrl: string;
  cacheKey: string;
} {
  const found = findCanonicalOriginEntry(url);
  return {
    faviconDataUri: found?.entry.faviconDataUri ?? '',
    faviconUrl: found?.entry.faviconUrl ?? '',
    cacheKey: found?.cacheKey ?? '',
  };
}

export function getCachedTitle(url: string): string {
  return memoryCache.get(normalizeUrlForCache(url))?.title ?? '';
}

/**
 * 记录导航时的重定向关系：原始 URL → 重定向目标 URL（均 normalize 后存储）。
 *
 * 调用时机：导航完成检测到 `expectedNavigationUrl` ≠ 实际 `url` 且非同源时记录。
 * 仅当两者 normalize 后不同才记录，避免自引用。目标 URL 再次重定向时
 * 逐跳覆盖，始终指向最终 URL。
 */
export function recordRedirect(originalUrl: string, targetUrl: string): void {
  const from = normalizeUrlForCache(originalUrl);
  const to = normalizeUrlForCache(targetUrl);
  if (!from || !to || from === to) {
    return;
  }
  redirectMap.set(from, to);
  // 链式：若目标本身又是重定向源，直接跳到最终目标（Chrome 重定向链消化语义）
  let finalTarget = to;
  let hops = 0;
  while (hops < 8) {
    const next = redirectMap.get(finalTarget);
    if (!next || next === finalTarget) {
      break;
    }
    finalTarget = next;
    hops += 1;
  }
  redirectMap.set(from, finalTarget);
}

/**
 * 返回 URL 已知的重定向目标（normalize 后），无则 undefined。
 * 链式解析：源 → 目标 → 最终目标，最多 8 跳防环。
 */
export function getRedirectTarget(url: string): string | undefined {
  const from = normalizeUrlForCache(url);
  if (!from) {
    return undefined;
  }
  let target = redirectMap.get(from);
  let hops = 0;
  while (target && hops < 8) {
    const next = redirectMap.get(target);
    if (!next || next === target) {
      break;
    }
    target = next;
    hops += 1;
  }
  return target;
}

/**
 * 该 URL（或其重定向目标）是否已"抓取结算"。
 * 供 BrowserFavicon 等按精确 URL 判断的场景使用：直接 URL 无 entry 时
 * 检查重定向目标（跨域重定向场景），命中即视为已结算。
 */
export function isSiteMetaResolvedOrRedirected(url: string): boolean {
  if (memoryCache.has(normalizeUrlForCache(url))) {
    return true;
  }
  const target = getRedirectTarget(url);
  return Boolean(target && memoryCache.has(target));
}

/**
 * 该 URL 的站点元数据是否已"抓取结算"（内存镜像中已有记录）。
 * 有 entry（fetchedAt>0，无论是否成功抓到真实标题/图标）即视为已确认；
 * 无 entry 视为尚未抓取（加载中）。用于标题/图标显示：未确认时不急于回退
 * 主机名/兜底字母，舍去"主机名→真实标题/图标"的中间态跳动——
 * 等真实数据到来直接显示真实值，只有确认抓取结算仍无真实数据时才回退。
 */
export function isSiteMetaResolved(url: string): boolean {
  return memoryCache.has(normalizeUrlForCache(url));
}

/**
 * 该 URL 是否"已抓取结算"——精确 URL 有 entry，或同 origin 任意路径已有 entry。
 * 仅用于收藏/历史树节点的标题解析（resolveSiteTitle 的 resolved 参数）：
 * 同站点其它页面已抓取，说明该站点元数据管道正常工作，历史条目可从
 * 主机名兜底进入最终标题；标签头/图标等对 URL 精确性敏感的场景仍用
 * `isSiteMetaResolved`（精确匹配，避免同站点另一页的结算提前终止空占位）。
 */
export function isSiteMetaResolvedForTree(url: string): boolean {
  const key = normalizeUrlForCache(url);
  if (memoryCache.has(key)) {
    return true;
  }
  const origin = originOf(url);
  if (!origin) {
    return false;
  }
  for (const k of memoryCache.keys()) {
    if (originOf(k) === origin) {
      return true;
    }
  }
  return false;
}

/**
 * 仅更新内存镜像（写路径唯一在服务端）。保留函数名以便 Task 9/10 迁移
 * 前的调用点编译通过；生产代码不再通过它写后端。
 */
export function setCachedSiteMeta(url: string, entry: SiteMetaCacheEntry): void {
  upsertMirror(normalizeUrlForCache(url), entry);
}

/**
 * 仅清理内存镜像（不触达后端持久化）。生产引用计数删除请用
 * `removeSiteMetaFromCache`（镜像 + 后端同步）；本函数仅供测试直接驱动镜像。
 */
export function removeCachedSiteMeta(url: string): void {
  const key = normalizeUrlForCache(url);
  memoryCache.delete(key);
  notify(key);
}

/**
 * 引用计数删除：内存镜像 + 后端持久化（Tauri SQLite / 预览 JSON）同步移除。
 * 配合 `removeSiteMetaIfUnreferenced`：关闭最后一个引用该 URL 的 tab/书签后
 * 真正删除磁盘缓存，避免重启后 `initSiteMetaCache` 重新灌回镜像。
 */
export async function removeSiteMetaFromCache(url: string): Promise<void> {
  const key = normalizeUrlForCache(url);
  memoryCache.delete(key);
  notify(key);
  try {
    await backend.remove([key]);
  } catch (err) {
    console.warn('siteMetaCache: backend remove failed', err);
  }
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
 * 图标）。与后端 `should_replace_favicon` 收敛：镜像 data-URI 非空 ⇒ 后端
 * `should_replace_favicon` 不会替换 faviconUrl ⇒ 广播 faviconUrl 实际不变
 * ⇒ 两分支在真实数据下结果一致。
 */
export function applyBroadcastUpdate(payload: PageMetaUpdatedPayload): void {
  const key = normalizeUrlForCache(payload.url);
  const existing = memoryCache.get(key);
  const hasData =
    payload.title !== '' || payload.faviconUrl !== '' || payload.faviconDataUri !== '';
  if (!hasData && existing) {
    notify(key);
    return;
  }
  upsertMirror(key, {
    title: payload.title || existing?.title || '',
    titleSource: payload.source || existing?.titleSource || '',
    faviconUrl: payload.faviconUrl || existing?.faviconUrl || '',
    faviconDataUri: payload.faviconDataUri || existing?.faviconDataUri || '',
    fetchedAt: Date.now(),
    lastOkAt: Date.now(),
    nextRetryAt: 0,
    failCount: 0,
  });
}

/**
 * 持久化 favicon data-URI（Chrome/Edge 式写回路径）：
 * 前端 canvas 预加载成功转换外部 favicon → data-URI 后调用，将 data-URI 写回
 * 内存镜像 + 后端持久层（Tauri SQLite / preview JSON），使重启后 initSiteMetaCache
 * 水合直接命中，无需再次网络请求。
 *
 * 合并语义与 applyBroadcastUpdate 一致：保留既有 title/faviconUrl，仅更新
 * faviconDataUri（广播新值优先，否则保留既有值）。
 */
export async function persistFaviconDataUri(url: string, dataUri: string): Promise<void> {
  if (!dataUri || !url) {
    return;
  }
  const key = normalizeUrlForCache(url);
  const existing = memoryCache.get(key);
  if (existing?.faviconDataUri === dataUri) {
    return;
  }
  const next: SiteMetaCacheEntry = {
    title: existing?.title ?? '',
    titleSource: existing?.titleSource ?? '',
    faviconUrl: existing?.faviconUrl ?? '',
    faviconDataUri: dataUri || existing?.faviconDataUri || '',
    fetchedAt: Date.now(),
    lastOkAt: existing?.lastOkAt ?? Date.now(),
    nextRetryAt: 0,
    failCount: 0,
  };
  upsertMirror(key, next);
  try {
    await backend.upsert({ [key]: next });
  } catch (err) {
    console.warn('siteMetaCache: persist favicon data-URI failed', err);
  }
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
