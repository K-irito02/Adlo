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
    // 一次性认证参数（如 dsh `?token=`）绝不是缓存身份：字符串级剔除
    // （不重编码其余参数，与后端 `normalize_cache_key` 同字节口径；R1-Medium）。
    if (u.search) {
      const kept = u.search
        .slice(1)
        .split('&')
        .filter((p) => p.split('=')[0] !== 'token');
      u.search = kept.length > 0 ? `?${kept.join('&')}` : '';
    }
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
 * （历史条目 URL 回写最终 URL）承担。设上限防止无界增长（FIFO 逐出）。
 */
const redirectMap = new Map<string, string>();
const REDIRECT_MAP_MAX = 500;

function recordRedirectMapEntry(from: string, to: string): void {
  redirectMap.set(from, to);
  if (redirectMap.size > REDIRECT_MAP_MAX) {
    const oldest = redirectMap.keys().next().value as string | undefined;
    if (oldest !== undefined) {
      redirectMap.delete(oldest);
    }
  }
}

let ready = false;
let initPromise: Promise<void> | null = null;

// 后端惰性解析：模块导入期不得有副作用（`isTauriShell()` 会在测试里被部分 mock 的
// tauri-bridge 模块上暴露为缺失导出）。首次读写时才确定 Tauri / 预览实现。
let backend: SiteMetaBackend | null = null;

function resolveBackend(): SiteMetaBackend {
  if (!backend) {
    backend = isTauriShell() ? tauriSiteMetaBackend : previewSiteMetaBackend;
  }
  return backend;
}

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
 * 全局订阅（已归一化 key）：每当任意 URL 的元数据镜像更新时触发，
 * 回调收到**已归一化的 cache key**（upsertMirror/applyBroadcastUpdate 的 key）。
 * 调用方据此与自身归一化 URL 比较，无需再次 URL 解析（F2 性能优化）。
 */
export function subscribeSiteMetaGlobal(callback: (normalizedKey: string) => void): () => void {
  globalListeners.add(callback);
  return () => globalListeners.delete(callback);
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
      const persisted = await resolveBackend().getAll();
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

const INLINE_IMAGE_ICON_RE = /^data:image\//i;

/** 导入书签的 `ICON` 快照是否可安全用于 `<img>`（只接受内联图片，拒绝远程/脚本协议）。 */
function isInlineImageIcon(value: string): boolean {
  return INLINE_IMAGE_ICON_RE.test(value.trim());
}

export interface FaviconSnapshot {
  url: string;
  iconUri: string;
}

/**
 * 把导入书签自带的图标快照播种到共享镜像（Chrome/Edge 式：书签图标与站点图标
 * 同一处取用，书签树与搜索（收藏结果行）立即有图标）。
 *
 * 关键约束：
 * - **不写后端持久层**：快照的真源是书签自身（`BookmarkEntry.iconUri`）。写进持久层
 *   后 `should_replace_favicon` 会因 `data:` 前缀永久锁定，真实图标无法升级。
 * - **只在没有图标时播种**：已有真实 favicon（data-URI 或 URL）一律不覆盖。
 * - **水合前不播种**：`initSiteMetaCache` 只在 key 不存在时写入，提前播种会挡住
 *   持久层里的真实图标；启动同步在 cache ready 之后执行。
 *
 * 真实图标到达（广播携带 data-URI）时由 `applyBroadcastUpdate` 覆盖，实现
 * 「用户点开/后台抓取成功后才更新」。
 *
 * @returns 实际播种的条目数（0 表示镜像未就绪或全部被真实数据占位）。
 */
export function seedSnapshotFavicons(snapshots: Iterable<FaviconSnapshot>): number {
  if (!ready) {
    return 0;
  }
  let seeded = 0;
  for (const { url, iconUri } of snapshots) {
    const inline = iconUri.trim();
    if (!url || !isInlineImageIcon(inline) || inline.length > FAVICON_MAX_DATA_URI_LEN) {
      continue;
    }
    const key = normalizeUrlForCache(url);
    if (!key) {
      continue;
    }
    const existing = memoryCache.get(key);
    if (existing?.faviconDataUri || existing?.faviconUrl) {
      continue;
    }
    upsertMirror(key, {
      title: existing?.title ?? '',
      titleSource: existing?.titleSource ?? '',
      faviconUrl: '',
      faviconDataUri: inline,
      fetchedAt: existing?.fetchedAt ?? Date.now(),
      lastOkAt: existing?.lastOkAt ?? 0,
      nextRetryAt: existing?.nextRetryAt ?? 0,
      failCount: existing?.failCount ?? 0,
    });
    seeded += 1;
  }
  return seeded;
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
  recordRedirectMapEntry(from, to);
  // 链式：若目标本身又是重定向源，直接跳到最终目标（Chrome 重定向链消化语义）。
  // visited 集合检测真环（A→B→A），避免 8 跳上限误收敛到中间节点。
  let finalTarget = to;
  const visited = new Set([from, to]);
  let next = redirectMap.get(finalTarget);
  while (next && !visited.has(next)) {
    visited.add(next);
    finalTarget = next;
    next = redirectMap.get(finalTarget);
  }
  if (finalTarget !== to) {
    recordRedirectMapEntry(from, finalTarget);
  }
}

/**
 * 返回 URL 已知的重定向目标（normalize 后），无则 undefined。
 * 链式解析：源 → 目标 → 最终目标，visited 集合检测真环（A→B→A）。
 */
export function getRedirectTarget(url: string): string | undefined {
  const from = normalizeUrlForCache(url);
  if (!from) {
    return undefined;
  }
  let target = redirectMap.get(from);
  if (!target) {
    return undefined;
  }
  const visited = new Set([from, target]);
  let next = redirectMap.get(target);
  while (next && !visited.has(next)) {
    visited.add(next);
    target = next;
    next = redirectMap.get(target);
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
    await resolveBackend().remove([key]);
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
 * 空字段保留既有值；data-URI 以广播新值为准，未携带新 data-URI 时保留既有
 * data-URI（即使 faviconUrl 轮换也不丢弃：YouTube 等 CDN 哈希变化但图片不变，
 * 丢弃会触发重新下载；用例见 `applyBroadcastUpdate merge guard: partial broadcast
 * keeps the cached data-URI ...`）。
 *
 * 与后端 `should_replace_favicon` 的关系：**已持久化到后端**的 data-URI 会让后端
 * 不再替换 faviconUrl；仅存在于前端镜像的导入快照（`seedSnapshotFavicons`）不受此
 * 约束——后端仍可能刷新 faviconUrl，镜像保留快照直到真实 data-URI 广播到达。
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
    await resolveBackend().upsert({ [key]: next });
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

export function getSiteMetaCacheStats(): { size: number; ready: boolean } {
  return { size: memoryCache.size, ready };
}
