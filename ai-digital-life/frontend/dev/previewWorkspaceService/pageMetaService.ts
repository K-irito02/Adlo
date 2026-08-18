/**
 * pageMetaService.ts —— 浏览器预览模式的 PageMeta 集中式服务层（JS 同构实现）。
 *
 * 语义真源：Rust `crates/browser/src/page_meta_service.rs`（缓存策略：TTL 7 天 /
 * 失败指数退避 5min×2^n≤2h / get 的 TTL 短路 / write_success 占位标题门控 /
 * mark_failure 失败不删缓存 / 单飞行）与 `crates/browser/src/meta_merge.rs`
 * （合并引擎：is_placeholder_title / should_apply_exact_match_title /
 * get_favicon_quality_score / should_replace_favicon）。
 *
 * 职责：内存 Map + JSON 持久化（防抖 500ms）+ 本地 subscribeUpdated 广播 +
 * 单飞行合并。抓取默认委托 `previewFetchPageMeta.fetchPageMetaOnce`，
 * 测试可注入 `fetchOnce` stub。
 *
 * 门控：所有抓取路径（默认与注入的 fetchOnce）在执行 HTML 抓取前先过
 * `pageMetaGateAllows`（robots + 域名限速，测试可注入 `gateAllows` stub）——
 * 与 Rust fetcher 内部 `robots_allow_fetch` + `rate_limit_allowed` 对所有
 * 抓取路径生效同构；被拒返回空 PageMeta → 走失败退避（mark_failure）。
 */
import { fetchPageMetaOnce } from '../previewFetchPageMeta';
import { pageMetaGateAllows } from '../previewCrawlerGate';
import { readSiteMetaCache, upsertSiteMetaCache } from './siteMetaCache';
import type { SiteMetaCacheEntry } from './siteMetaCache';
import type { MetaSource, PageMeta, PageMetaUpdatedPayload } from '../../src/shared/ipc/browser';

// --- 常量（与 Rust page_meta_service.rs / meta_merge.rs 一致）---
export const META_SOURCE_COM: MetaSource = 'com';
export const META_SOURCE_HTTP: MetaSource = 'http';
export const META_SOURCE_IFRAME: MetaSource = 'iframe';
export const META_SOURCE_GOOGLE: MetaSource = 'google';

export const META_TTL_MS = 7 * 24 * 3600 * 1000;
export const RETRY_BASE_MS = 5 * 60 * 1000;
export const RETRY_MAX_MS = 2 * 3600 * 1000;
const PERSIST_DEBOUNCE_MS = 500;
const WARMUP_CONCURRENCY = 8;

// --- 合并引擎纯函数（与 Rust meta_merge.rs 逐函数同构）---

/**
 * 缓存键归一化：去 hash、去路径尾部多余斜杠。
 * 与 Rust `site_meta_cache.rs::normalize_cache_key`（及前端
 * `siteMetaCache.ts::normalizeUrlForCache`）同构。
 */
export function normalizeCacheKey(url: string): string {
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

function hostnameWithoutWww(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return '';
  }
}

/** 占位标题：空 / 等于 URL / http(s) 前缀 / 裸域名（www 前缀归一）。 */
export function isPlaceholderTitle(title: string, url: string): boolean {
  if (title === '') return true;
  if (title === url) return true;
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.startsWith('http://') || lowerTitle.startsWith('https://')) return true;
  const host = hostnameWithoutWww(url);
  if (host === '') return false;
  const t = title.trim().toLowerCase();
  return t === host || t === `www.${host}`;
}

/** 标题是否应被应用：占位可被覆盖；http/iframe 可覆盖任意；com 仅覆盖占位或 com/google。 */
export function shouldApplyExactMatchTitle(
  currentTitle: string,
  url: string,
  incomingTitle: string,
  source: string,
  currentSource: string | undefined,
): boolean {
  if (incomingTitle === '') return false;
  if (incomingTitle === currentTitle) return false;
  if (isPlaceholderTitle(incomingTitle, url)) return false;
  if (isPlaceholderTitle(currentTitle, url)) return true;
  if (source === META_SOURCE_HTTP || source === META_SOURCE_IFRAME) return true;
  if (source === META_SOURCE_COM) {
    return currentSource === META_SOURCE_COM || currentSource === META_SOURCE_GOOGLE;
  }
  return false;
}

/** 现有图标基线：dataUri 优先，其次 faviconUrl。 */
export function existingFaviconBaseline(faviconDataUri: string, faviconUrl: string): string {
  if (faviconDataUri !== '') return faviconDataUri;
  if (faviconUrl !== '') return faviconUrl;
  return '';
}

/**
 * 图标质量评分。与前端 `src/app/features/browser/faviconQuality.ts` 及
 * Rust `meta_merge.rs::get_favicon_quality_score` 完全一致
 * （Google S2=1, /favicon.ico=2, .ico=4, svg=10, png 按尺寸 11-15, 其余=3）。
 */
export function getFaviconQualityScore(favicon: string): number {
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
      const size = Number.parseInt(sizeMatch[1] as string, 10);
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

/** 图标替换门控：incoming 空不替换；dataUri 不可覆盖；否则按质量分 ≥ 比较。 */
export function shouldReplaceFavicon(existing: string | undefined, incoming: string): boolean {
  if (incoming === '') {
    return false;
  }
  if (existing?.startsWith('data:')) {
    return false;
  }
  if (!existing) {
    return true;
  }
  return getFaviconQualityScore(incoming) >= getFaviconQualityScore(existing);
}

function toPageMeta(e: SiteMetaCacheEntry): PageMeta {
  return {
    title: e.title,
    favicon: e.faviconUrl,
    faviconDataUri: e.faviconDataUri,
    url: '',
    source: e.titleSource === '' ? 'http' : (e.titleSource as MetaSource),
  };
}

export interface PreviewPageMetaServiceOptions {
  baseDir: string;
  /** 抓取依赖；测试注入 stub。默认 previewFetchPageMeta.fetchPageMetaOnce。 */
  fetchOnce?: (url: string) => Promise<PageMeta>;
  /**
   * HTML 级门控（robots + 域名限速）；测试注入 stub。
   * 默认 previewCrawlerGate.pageMetaGateAllows（robots + 5s/域名限速）。
   * 被拒 → 空 PageMeta → 失败退避，不触发抓取（与 Rust fetcher 内部门控一致）。
   */
  gateAllows?: (url: string) => Promise<boolean>;
}

export interface PreviewPageMetaService {
  get(url: string, force?: boolean): Promise<PageMeta | null>;
  report(url: string, title: string, favicon: string, source: MetaSource): Promise<boolean>;
  warmup(urls: string[]): Promise<PageMeta[]>;
  peek(url: string): SiteMetaCacheEntry | undefined;
  subscribeUpdated(listener: (p: PageMetaUpdatedPayload) => void): () => void;
}

export function createPreviewPageMetaService(
  opts: PreviewPageMetaServiceOptions,
): PreviewPageMetaService {
  const { baseDir } = opts;
  const fetchOnce = opts.fetchOnce ?? fetchPageMetaOnce;
  const gateAllows = opts.gateAllows ?? pageMetaGateAllows;

  /**
   * 门控抓取包装：HTML 抓取前先过 robots + 域名限速门控，被拒返回空 PageMeta
   * （不触发抓取；空结果 → executeFetch 走 markFailure 失败退避，不写成功缓存）。
   */
  async function gatedFetchOnce(url: string): Promise<PageMeta> {
    if (!(await gateAllows(url))) {
      return { title: '', favicon: '', faviconDataUri: '', url };
    }
    return fetchOnce(url);
  }

  const memory = new Map<string, SiteMetaCacheEntry>();
  const inFlight = new Map<string, Promise<PageMeta | null>>();
  const listeners = new Set<(p: PageMetaUpdatedPayload) => void>();

  // 启动预载：把 JSON 持久层灌入内存（已有内存项优先），对应 Rust `preload`。
  const preloadPromise = readSiteMetaCache(baseDir)
    .then((all) => {
      for (const [key, entry] of Object.entries(all)) {
        if (!memory.has(key)) memory.set(key, entry);
      }
    })
    .catch(() => {});

  // JSON 持久化防抖（500ms）：批量 upsert，串行队列避免并发读改写竞争。
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingPersist = new Map<string, SiteMetaCacheEntry>();
  let persistQueue: Promise<void> = Promise.resolve();

  function schedulePersist(key: string, entry: SiteMetaCacheEntry): void {
    pendingPersist.set(key, entry);
    if (persistTimer !== null) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      const batch = pendingPersist;
      pendingPersist = new Map();
      persistQueue = persistQueue
        .then(() => upsertSiteMetaCache(baseDir, Object.fromEntries(batch)))
        .catch(() => {});
    }, PERSIST_DEBOUNCE_MS);
  }

  function broadcast(payload: PageMetaUpdatedPayload): void {
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch {
        // 单个监听器异常不影响其他监听器与调用方
      }
    }
  }

  function peek(url: string): SiteMetaCacheEntry | undefined {
    return memory.get(normalizeCacheKey(url));
  }

  /** 失败退避：failCount+1、nextRetryAt 指数退避；不删缓存、不写持久层（与 Rust 一致）。 */
  function markFailure(key: string): void {
    const now = Date.now();
    const existing = memory.get(key);
    let entry: SiteMetaCacheEntry;
    if (existing) {
      entry = existing;
      entry.failCount = Math.min(entry.failCount + 1, Number.MAX_SAFE_INTEGER);
    } else {
      entry = {
        title: '',
        titleSource: '',
        faviconUrl: '',
        faviconDataUri: '',
        fetchedAt: now,
        lastOkAt: 0,
        nextRetryAt: now + RETRY_BASE_MS,
        failCount: 1,
      };
      memory.set(key, entry);
    }
    const delay = Math.min(
      RETRY_BASE_MS * Math.pow(2, Math.min(entry.failCount, 5)),
      RETRY_MAX_MS,
    );
    entry.nextRetryAt = now + delay;
  }

  /**
   * 成功写入（对应 Rust `write_success`）：占位标题门控保留权威标题、
   * 图标质量门控、dataUri 不可被覆盖；lastOkAt/fetchedAt 刷新、退避清零。
   */
  function writeSuccess(key: string, meta: PageMeta, source: MetaSource, now: number): void {
    const existing = memory.get(key);
    const curTitle = existing?.title ?? '';
    const curSource = existing?.titleSource;
    const titleSource =
      shouldApplyExactMatchTitle(curTitle, key, meta.title, source, curSource) ||
      meta.title === ''
        ? source
        : (existing?.titleSource ?? '');
    const title =
      meta.title === '' || isPlaceholderTitle(meta.title, key)
        ? (existing?.title ?? '')
        : meta.title;
    const existingFav = existing
      ? existingFaviconBaseline(existing.faviconDataUri, existing.faviconUrl)
      : undefined;
    const faviconUrl = shouldReplaceFavicon(existingFav, meta.favicon)
      ? meta.favicon
      : (existing?.faviconUrl ?? '');
    const faviconDataUri =
      (meta.faviconDataUri ?? '') === ''
        ? (existing?.faviconDataUri ?? '')
        : (meta.faviconDataUri ?? '');
    const entry: SiteMetaCacheEntry = {
      title,
      titleSource,
      faviconUrl,
      faviconDataUri,
      fetchedAt: now,
      lastOkAt: now,
      nextRetryAt: 0,
      failCount: 0,
    };
    memory.set(key, entry);
    schedulePersist(key, entry);
    broadcast({ url: key, title, faviconUrl, faviconDataUri, source });
  }

  async function executeFetch(key: string, url: string): Promise<PageMeta | null> {
    const now = Date.now();
    let meta: PageMeta;
    try {
      meta = await gatedFetchOnce(url);
    } catch {
      // 与 Rust AppFetcher 一致：抓取异常视为空结果（走失败退避，不删除既有缓存）
      meta = { title: '', favicon: '', faviconDataUri: '', url };
    }
    if (meta.title !== '' || meta.favicon !== '' || (meta.faviconDataUri ?? '') !== '') {
      writeSuccess(key, meta, META_SOURCE_HTTP, now);
    } else {
      markFailure(key);
    }
    // 与 Rust get 抓取路径同构（RC3）：统一返回缓存条目的合并值 —— 抓取失败时
    // 避免把空结果经路由/广播清空前端镜像（真实图标来回切换）；成功时返回
    // writeSuccess 合并后的权威值（含质量门控保留的既有图标）。
    // source 反映缓存条目的真实 title_source（成功写后为 http；失败保留既有 com
    // 权威条目则返回 com）。
    const entry = memory.get(key) ?? {
      title: '',
      titleSource: '',
      faviconUrl: '',
      faviconDataUri: '',
      fetchedAt: now,
      lastOkAt: 0,
      nextRetryAt: now,
      failCount: 0,
    };
    return {
      title: entry.title,
      favicon: entry.faviconUrl,
      faviconDataUri: entry.faviconDataUri,
      url: key,
      source: (entry.titleSource as MetaSource | undefined) || 'http',
    };
  }

  async function get(url: string, force = false): Promise<PageMeta | null> {
    await preloadPromise;
    const key = normalizeCacheKey(url);
    const now = Date.now();
    // TTL 短路 + 退避短路（RC4）：内存命中且未过期 / 未到退避期直接返回缓存，
    // 不发起抓取；force 绕过（避免失败域名被后续 get/warmup 反复重抓、限速放大）。
    if (!force) {
      const entry = memory.get(key);
      if (entry) {
        const ttlHit = entry.lastOkAt > 0 && now - entry.lastOkAt < META_TTL_MS;
        const backedOff = entry.lastOkAt === 0 && now < entry.nextRetryAt;
        if (ttlHit || backedOff) {
          return toPageMeta(entry);
        }
      }
    }
    const existing = inFlight.get(key);
    if (existing) {
      // 单飞行：同 url 并发请求共享持有者的 promise
      return existing;
    }
    const p = executeFetch(key, url);
    inFlight.set(key, p);
    try {
      return await p;
    } finally {
      if (inFlight.get(key) === p) {
        inFlight.delete(key);
      }
    }
  }

  async function report(
    url: string,
    title: string,
    favicon: string,
    source: MetaSource,
  ): Promise<boolean> {
    await preloadPromise;
    const key = normalizeCacheKey(url);
    const now = Date.now();
    const existing = memory.get(key);
    const curTitle = existing?.title ?? '';
    const curSource = existing?.titleSource;
    const titleApplied =
      title !== '' && shouldApplyExactMatchTitle(curTitle, key, title, source, curSource);
    const existingFav = existing
      ? existingFaviconBaseline(existing.faviconDataUri, existing.faviconUrl)
      : undefined;
    const faviconApplied = shouldReplaceFavicon(existingFav, favicon);
    if (!titleApplied && !faviconApplied) {
      return false;
    }
    const entry: SiteMetaCacheEntry = {
      title: titleApplied ? title : (existing?.title ?? ''),
      titleSource: titleApplied ? source : (existing?.titleSource ?? ''),
      faviconUrl: faviconApplied ? favicon : (existing?.faviconUrl ?? ''),
      faviconDataUri: existing?.faviconDataUri ?? '',
      fetchedAt: now,
      lastOkAt: now,
      nextRetryAt: 0,
      failCount: 0,
    };
    memory.set(key, entry);
    schedulePersist(key, entry);
    broadcast({
      url: key,
      title: entry.title,
      faviconUrl: entry.faviconUrl,
      faviconDataUri: entry.faviconDataUri,
      source,
    });
    return true;
  }

  async function warmup(urls: string[]): Promise<PageMeta[]> {
    await preloadPromise;
    const seen = new Set<string>();
    const tasks: string[] = [];
    for (const u of urls) {
      const key = normalizeCacheKey(u);
      if (seen.has(key)) continue;
      seen.add(key);
      const now = Date.now();
      const entry = memory.get(key);
      if (!entry || now >= entry.nextRetryAt) {
        tasks.push(key);
      }
    }
    // 全部 retry_due URL 并发抓取（并发上限 WARMUP_CONCURRENCY），不再截断数量。
    let index = 0;
    const workers = Array.from(
      { length: Math.min(WARMUP_CONCURRENCY, tasks.length) },
      async () => {
        while (index < tasks.length) {
          const key = tasks[index];
          index += 1;
          await get(key, false);
        }
      },
    );
    await Promise.all(workers);
    // 返回每个已处理 URL 的缓存结果（供 preview 路由回传 → 前端镜像落地）
    return tasks.flatMap((key) => {
      const entry = memory.get(key);
      return entry ? [{ ...toPageMeta(entry), url: key }] : [];
    });
  }

  function subscribeUpdated(listener: (p: PageMetaUpdatedPayload) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return { get, report, warmup, peek, subscribeUpdated };
}
