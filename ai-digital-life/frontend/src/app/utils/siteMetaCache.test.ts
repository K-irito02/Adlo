import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SiteMetaBackend } from './siteMetaBackends/types';

const FAVICON_MAX_DATA_URI_LEN = Math.ceil((512 * 1024 * 4) / 3) + 128;

describe('siteMetaCache memory layer', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  });

  it('set + get roundtrips data-URI first', async () => {
    const mod = await import('./siteMetaCache');
    mod.setSiteMetaBackendForTest(mod.createMockSiteMetaBackend());
    await mod.initSiteMetaCache();
    mod.__mirrorUpsertForTest('https://a.com', {
      title: 'A',
      faviconUrl: 'https://a.com/favicon.ico',
      faviconDataUri: 'data:image/png;base64,AA',
      fetchedAt: 1,
      titleSource: '',
      lastOkAt: 0,
      nextRetryAt: 0,
      failCount: 0,
    });
    expect(mod.getCachedFavicon('https://a.com')).toBe('data:image/png;base64,AA');
    expect(mod.getCachedTitle('https://a.com')).toBe('A');
  });

  it('remove clears entry', async () => {
    const mod = await import('./siteMetaCache');
    mod.setSiteMetaBackendForTest(mod.createMockSiteMetaBackend());
    await mod.initSiteMetaCache();
    mod.__mirrorUpsertForTest('https://a.com', {
      title: 'A',
      faviconUrl: '',
      faviconDataUri: 'data:x;base64,AA',
      fetchedAt: 1,
      titleSource: '',
      lastOkAt: 0,
      nextRetryAt: 0,
      failCount: 0,
    });
    mod.removeCachedSiteMeta('https://a.com');
    expect(mod.getCachedSiteMeta('https://a.com')).toBeUndefined();
  });

  it('preload gates readiness (false before init, true after)', async () => {
    const mod = await import('./siteMetaCache');
    mod.setSiteMetaBackendForTest(mod.createMockSiteMetaBackend());
    expect(mod.isSiteMetaCacheReady()).toBe(false);
    await mod.initSiteMetaCache();
    expect(mod.isSiteMetaCacheReady()).toBe(true);
  });

  it('size caps: oversized data-URI dropped, title kept', async () => {
    const mod = await import('./siteMetaCache');
    mod.setSiteMetaBackendForTest(mod.createMockSiteMetaBackend());
    await mod.initSiteMetaCache();
    const big = 'data:image/png;base64,' + 'x'.repeat(FAVICON_MAX_DATA_URI_LEN + 1);
    mod.__mirrorUpsertForTest('https://a.com', {
      title: 'A'.repeat(500),
      faviconUrl: '',
      faviconDataUri: big,
      fetchedAt: 1,
      titleSource: '',
      lastOkAt: 0,
      nextRetryAt: 0,
      failCount: 0,
    });
    const entry = mod.getCachedSiteMeta('https://a.com')!;
    expect(entry.faviconDataUri).toBe('');
    expect(entry.title).toHaveLength(200);
  });

  it('size cap: data-URI in the 64-512KB char band is kept (Rust 512KB binary cap alignment)', async () => {
    const mod = await import('./siteMetaCache');
    mod.setSiteMetaBackendForTest(mod.createMockSiteMetaBackend());
    await mod.initSiteMetaCache();
    // ~400KB of base64 chars ≈ 300KB binary — under the Rust 512KB binary cap, so
    // the frontend clamp must NOT drop it (old 64KB-char cap did).
    const mid = 'data:image/png;base64,' + 'x'.repeat(400 * 1024);
    mod.__mirrorUpsertForTest('https://a.com', {
      title: 'A',
      faviconUrl: '',
      faviconDataUri: mid,
      fetchedAt: 1,
      titleSource: '',
      lastOkAt: 0,
      nextRetryAt: 0,
      failCount: 0,
    });
    expect(mod.getCachedSiteMeta('https://a.com')!.faviconDataUri).toBe(mid);
  });

  it('subscribe fires on mirror upsert for matching url', async () => {
    const mod = await import('./siteMetaCache');
    mod.setSiteMetaBackendForTest(mod.createMockSiteMetaBackend());
    await mod.initSiteMetaCache();
    let fired = 0;
    mod.subscribeSiteMeta('https://a.com', () => {
      fired++;
    });
    mod.__mirrorUpsertForTest('https://a.com', {
      title: 'A',
      faviconUrl: '',
      faviconDataUri: '',
      fetchedAt: 1,
      titleSource: '',
      lastOkAt: 0,
      nextRetryAt: 0,
      failCount: 0,
    });
    expect(fired).toBe(1);
  });

  it('normalizeUrlForCache strips hash and trailing slash', async () => {
    const mod = await import('./siteMetaCache');
    expect(mod.normalizeUrlForCache('https://a.com/#section')).toBe('https://a.com/');
    expect(mod.normalizeUrlForCache('https://a.com/path/')).toBe('https://a.com/path');
  });

  it('mirror upsert stores full entry (title/faviconUrl/faviconDataUri/fetchedAt)', async () => {
    const mod = await import('./siteMetaCache');
    mod.setSiteMetaBackendForTest(mod.createMockSiteMetaBackend());
    await mod.initSiteMetaCache();
    mod.__mirrorUpsertForTest('https://x.com', {
      title: 'X',
      faviconUrl: 'https://x.com/favicon.ico',
      faviconDataUri: 'data:image/png;base64,AAA',
      fetchedAt: 123,
      titleSource: '',
      lastOkAt: 0,
      nextRetryAt: 0,
      failCount: 0,
    });
    expect(mod.getCachedSiteMeta('https://x.com')).toEqual({
      title: 'X',
      faviconUrl: 'https://x.com/favicon.ico',
      faviconDataUri: 'data:image/png;base64,AAA',
      fetchedAt: 123,
      titleSource: '',
      lastOkAt: 0,
      nextRetryAt: 0,
      failCount: 0,
    });
  });

  it('mirror upsert with empty faviconDataUri still caches title + faviconUrl (render falls back to faviconUrl)', async () => {
    const mod = await import('./siteMetaCache');
    mod.setSiteMetaBackendForTest(mod.createMockSiteMetaBackend());
    await mod.initSiteMetaCache();
    mod.__mirrorUpsertForTest('https://x.com', {
      title: 'X',
      faviconUrl: 'https://x.com/favicon.ico',
      faviconDataUri: '',
      fetchedAt: 1,
      titleSource: '',
      lastOkAt: 0,
      nextRetryAt: 0,
      failCount: 0,
    });
    expect(mod.getCachedTitle('https://x.com')).toBe('X');
    expect(mod.getCachedFavicon('https://x.com')).toBe('');
    expect(mod.getCachedSiteMeta('https://x.com')?.faviconUrl).toBe('https://x.com/favicon.ico');
  });

  it('preload merges persisted entries and keeps existing memory entries', async () => {
    const mod = await import('./siteMetaCache');
    const backend = mod.createMockSiteMetaBackend();
    await backend.upsert({
      'https://p.com/': {
        title: 'P',
        faviconUrl: '',
        faviconDataUri: 'data:x;base64,PP',
        fetchedAt: 2,
        titleSource: '',
        lastOkAt: 0,
        nextRetryAt: 0,
        failCount: 0,
      },
    });
    mod.setSiteMetaBackendForTest(backend);
    mod.__mirrorUpsertForTest('https://m.com', {
      title: 'M',
      faviconUrl: '',
      faviconDataUri: '',
      fetchedAt: 1,
      titleSource: '',
      lastOkAt: 0,
      nextRetryAt: 0,
      failCount: 0,
    });
    await mod.initSiteMetaCache();
    expect(mod.getCachedSiteMeta('https://p.com')?.title).toBe('P');
    expect(mod.getCachedSiteMeta('https://m.com')?.title).toBe('M');
  });

  it('init clamps persisted oversized data-URIs when loading into memory', async () => {
    const mod = await import('./siteMetaCache');
    const backend = mod.createMockSiteMetaBackend();
    const big = 'data:image/png;base64,' + 'x'.repeat(FAVICON_MAX_DATA_URI_LEN + 1);
    await backend.upsert({
      'https://p.com/': {
        title: 'P',
        faviconUrl: '',
        faviconDataUri: big,
        fetchedAt: 2,
        titleSource: '',
        lastOkAt: 0,
        nextRetryAt: 0,
        failCount: 0,
      },
    });
    mod.setSiteMetaBackendForTest(backend);
    await mod.initSiteMetaCache();
    const entry = mod.getCachedSiteMeta('https://p.com')!;
    expect(entry.faviconDataUri).toBe('');
    expect(entry.title).toBe('P');
  });

  it('mirror updates from pageMetaClient broadcast without backend writes', async () => {
    const mod = await import('./siteMetaCache');
    mod.setSiteMetaBackendForTest(mod.createMockSiteMetaBackend());
    await mod.initSiteMetaCache();
    mod.__mirrorUpsertForTest('https://a.com/', {
      title: 'A',
      titleSource: 'http',
      faviconUrl: '',
      faviconDataUri: '',
      fetchedAt: 1,
      lastOkAt: 1,
      nextRetryAt: 0,
      failCount: 0,
    });
    expect(mod.getCachedTitle('https://a.com/')).toBe('A');
  });

  it('applyBroadcastUpdate mirrors the server payload and notifies subscribers', async () => {
    const mod = await import('./siteMetaCache');
    mod.setSiteMetaBackendForTest(mod.createMockSiteMetaBackend());
    await mod.initSiteMetaCache();
    let fired = 0;
    mod.subscribeSiteMeta('https://b.com', () => {
      fired++;
    });
    mod.applyBroadcastUpdate({
      url: 'https://b.com/',
      title: 'B',
      faviconUrl: 'https://b.com/favicon.ico',
      faviconDataUri: 'data:image/png;base64,BB',
      source: 'http',
    });
    const entry = mod.getCachedSiteMeta('https://b.com')!;
    expect(entry.title).toBe('B');
    expect(entry.titleSource).toBe('http');
    expect(entry.faviconUrl).toBe('https://b.com/favicon.ico');
    expect(entry.faviconDataUri).toBe('data:image/png;base64,BB');
    expect(entry.failCount).toBe(0);
    expect(fired).toBe(1);
  });

  it('applyBroadcastUpdate merge guard: empty broadcast does not clear good mirror (RC3)', async () => {
    const mod = await import('./siteMetaCache');
    mod.setSiteMetaBackendForTest(mod.createMockSiteMetaBackend());
    await mod.initSiteMetaCache();
    // 先写入真实镜像数据（等价于之前成功广播/抓取落地的缓存）
    mod.applyBroadcastUpdate({
      url: 'https://c.com/',
      title: 'C',
      faviconUrl: 'https://c.com/favicon.ico',
      faviconDataUri: 'data:image/png;base64,CC',
      source: 'http',
    });
    let fired = 0;
    mod.subscribeSiteMeta('https://c.com', () => {
      fired++;
    });
    // 空广播（抓取失败/被限速/robots 拦截）→ 不得清空镜像
    mod.applyBroadcastUpdate({
      url: 'https://c.com/',
      title: '',
      faviconUrl: '',
      faviconDataUri: '',
      source: 'http',
    });
    const entry = mod.getCachedSiteMeta('https://c.com')!;
    expect(entry.title).toBe('C');
    expect(entry.faviconUrl).toBe('https://c.com/favicon.ico');
    expect(entry.faviconDataUri).toBe('data:image/png;base64,CC');
    expect(fired).toBe(1);
  });

  it('applyBroadcastUpdate merge guard: partial broadcast keeps favicon only when url unchanged', async () => {
    const mod = await import('./siteMetaCache');
    mod.setSiteMetaBackendForTest(mod.createMockSiteMetaBackend());
    await mod.initSiteMetaCache();
    mod.applyBroadcastUpdate({
      url: 'https://d.com/',
      title: 'D',
      faviconUrl: 'https://d.com/favicon.ico',
      faviconDataUri: 'data:image/png;base64,DD',
      source: 'http',
    });
    // 新广播带新标题但同 URL、无 dataUri（下载失败）→ 保留既有 dataUri（避免闪烁）
    mod.applyBroadcastUpdate({
      url: 'https://d.com/',
      title: 'D2',
      faviconUrl: 'https://d.com/favicon.ico',
      faviconDataUri: '',
      source: 'http',
    });
    let entry = mod.getCachedSiteMeta('https://d.com')!;
    expect(entry.title).toBe('D2');
    expect(entry.faviconUrl).toBe('https://d.com/favicon.ico');
    expect(entry.faviconDataUri).toBe('data:image/png;base64,DD');
    // favicon URL 变更但 dataUri 缺失 → 保留既有 dataUri（YouTube 等 CDN 轮换哈希时
    // URL 变化但图标图片不变；丢弃会导致重新下载，重启后仍慢）。新 data-URI 到达时覆盖。
    mod.applyBroadcastUpdate({
      url: 'https://d.com/',
      title: 'D3',
      faviconUrl: 'https://d.com/new.ico',
      faviconDataUri: '',
      source: 'http',
    });
    entry = mod.getCachedSiteMeta('https://d.com')!;
    expect(entry.faviconUrl).toBe('https://d.com/new.ico');
    expect(entry.faviconDataUri).toBe('data:image/png;base64,DD');
  });

  it('setCachedSiteMeta/removeCachedSiteMeta do not persist to backend (write path removed)', async () => {
    const mod = await import('./siteMetaCache');
    const backend: SiteMetaBackend = mod.createMockSiteMetaBackend();
    const upsertSpy = vi.spyOn(backend, 'upsert');
    const removeSpy = vi.spyOn(backend, 'remove');
    mod.setSiteMetaBackendForTest(backend);
    await mod.initSiteMetaCache();
    mod.setCachedSiteMeta('https://x.com', {
      title: 'X',
      faviconUrl: '',
      faviconDataUri: '',
      fetchedAt: 1,
      titleSource: '',
      lastOkAt: 0,
      nextRetryAt: 0,
      failCount: 0,
    });
    expect(upsertSpy).not.toHaveBeenCalled();
    // mirror is still updated in memory
    expect(mod.getCachedTitle('https://x.com')).toBe('X');
    mod.removeCachedSiteMeta('https://x.com');
    expect(removeSpy).not.toHaveBeenCalled();
    expect(mod.getCachedSiteMeta('https://x.com')).toBeUndefined();
  });

  it('removeSiteMetaFromCache deletes mirror AND backend (reference-count cleanup)', async () => {
    const mod = await import('./siteMetaCache');
    const backend: SiteMetaBackend = mod.createMockSiteMetaBackend();
    const removeSpy = vi.spyOn(backend, 'remove');
    mod.setSiteMetaBackendForTest(backend);
    await mod.initSiteMetaCache();
    mod.__mirrorUpsertForTest('https://x.com', {
      title: 'X',
      faviconUrl: '',
      faviconDataUri: '',
      fetchedAt: 1,
      titleSource: '',
      lastOkAt: 0,
      nextRetryAt: 0,
      failCount: 0,
    });
    await mod.removeSiteMetaFromCache('https://x.com');
    expect(mod.getCachedSiteMeta('https://x.com')).toBeUndefined();
    expect(removeSpy).toHaveBeenCalledWith(['https://x.com/']);
  });

  it('persistFaviconDataUri updates mirror AND persists to backend (Chrome/Edge write path)', async () => {
    const mod = await import('./siteMetaCache');
    const backend: SiteMetaBackend = mod.createMockSiteMetaBackend();
    mod.setSiteMetaBackendForTest(backend);
    await mod.initSiteMetaCache();
    mod.__mirrorUpsertForTest('https://youtube.com', {
      title: 'YouTube',
      faviconUrl: 'https://www.youtube.com/favicon.ico',
      faviconDataUri: '',
      fetchedAt: 1,
      titleSource: '',
      lastOkAt: 0,
      nextRetryAt: 0,
      failCount: 0,
    });
    await mod.persistFaviconDataUri('https://youtube.com', 'data:image/png;base64,AA');
    // mirror updated
    expect(mod.getCachedFavicon('https://youtube.com')).toBe('data:image/png;base64,AA');
    // title/faviconUrl preserved
    const entry = mod.getCachedSiteMeta('https://youtube.com');
    expect(entry?.title).toBe('YouTube');
    expect(entry?.faviconUrl).toBe('https://www.youtube.com/favicon.ico');
    // backend persisted (getAll on fresh mock backend returns it)
    const all = await backend.getAll();
    expect(all['https://youtube.com/']?.faviconDataUri).toBe('data:image/png;base64,AA');
  });

  it('persistFaviconUrl updates mirror AND persists to backend (external URL fallback path)', async () => {
    const mod = await import('./siteMetaCache');
    const backend: SiteMetaBackend = mod.createMockSiteMetaBackend();
    mod.setSiteMetaBackendForTest(backend);
    await mod.initSiteMetaCache();
    // 无既有条目 → 仅写入 faviconUrl
    await mod.persistFaviconUrl('https://youtube.com', 'https://www.youtube.com/favicon.ico');
    const entry = mod.getCachedSiteMeta('https://youtube.com')!;
    expect(entry.faviconUrl).toBe('https://www.youtube.com/favicon.ico');
    expect(entry.faviconDataUri).toBe('');
    const all = await backend.getAll();
    expect(all['https://youtube.com/']?.faviconUrl).toBe('https://www.youtube.com/favicon.ico');
    // 幂等：同 URL 且已成功 → 不重复写
    const upsertSpy = vi.spyOn(backend, 'upsert');
    await mod.persistFaviconUrl('https://youtube.com', 'https://www.youtube.com/favicon.ico');
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('persistFaviconUrl no-ops for empty/data-URI input', async () => {
    const mod = await import('./siteMetaCache');
    const backend: SiteMetaBackend = mod.createMockSiteMetaBackend();
    const upsertSpy = vi.spyOn(backend, 'upsert');
    mod.setSiteMetaBackendForTest(backend);
    await mod.initSiteMetaCache();
    await mod.persistFaviconUrl('https://a.com', '');
    await mod.persistFaviconUrl('https://a.com', 'data:image/png;base64,AA');
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('persistFaviconDataUri no-ops for empty data-URI or missing entry', async () => {
    const mod = await import('./siteMetaCache');
    const backend: SiteMetaBackend = mod.createMockSiteMetaBackend();
    const upsertSpy = vi.spyOn(backend, 'upsert');
    mod.setSiteMetaBackendForTest(backend);
    await mod.initSiteMetaCache();
    // empty data-URI → no write
    await mod.persistFaviconDataUri('https://empty.com', '');
    expect(upsertSpy).not.toHaveBeenCalled();
    // missing entry → writes only key without prior entry (data-URI preserved, faviconUrl empty)
    await mod.persistFaviconDataUri('https://missing.com', 'data:image/png;base64,BB');
    expect(upsertSpy).toHaveBeenCalledTimes(1);
  });

  it('isSiteMetaResolvedForTree is origin-level while isSiteMetaResolved is exact', async () => {
    const mod = await import('./siteMetaCache');
    mod.setSiteMetaBackendForTest(mod.createMockSiteMetaBackend());
    await mod.initSiteMetaCache();
    // 同 origin 另一路径有 entry：树解析视为已结算（可回退主机名）；
    // 精确 URL 判定仍为未结算（标签头/图标保持空占位，避免提前终止跳动）。
    mod.__mirrorUpsertForTest('https://a.com/other', {
      title: 'Other',
      faviconUrl: '',
      faviconDataUri: '',
      fetchedAt: 1,
      titleSource: '',
      lastOkAt: 0,
      nextRetryAt: 0,
      failCount: 0,
    });
    expect(mod.isSiteMetaResolved('https://a.com/page')).toBe(false);
    expect(mod.isSiteMetaResolvedForTree('https://a.com/page')).toBe(true);
    expect(mod.isSiteMetaResolvedForTree('https://a.com/other')).toBe(true);
    expect(mod.isSiteMetaResolvedForTree('https://b.com/anything')).toBe(false);
  });
});

describe('buildCachedSiteMetaEntry (entry builder)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  });

  it('fills full entry from meta when no existing entry', async () => {
    const mod = await import('./siteMetaCache');
    const entry = mod.buildCachedSiteMetaEntry(
      'X',
      'https://x.com/favicon.ico',
      'data:image/png;base64,AAA',
    );
    expect(entry.title).toBe('X');
    expect(entry.faviconUrl).toBe('https://x.com/favicon.ico');
    expect(entry.faviconDataUri).toBe('data:image/png;base64,AAA');
    expect(typeof entry.fetchedAt).toBe('number');
  });

  it('keeps existing data-URI when meta provides none', async () => {
    const mod = await import('./siteMetaCache');
    const entry = mod.buildCachedSiteMetaEntry('X', 'https://x.com/favicon.ico', '', {
      title: 'Old',
      faviconUrl: 'old.ico',
      faviconDataUri: 'data:image/png;base64,OLD',
      fetchedAt: 1,
      titleSource: '',
      lastOkAt: 0,
      nextRetryAt: 0,
      failCount: 0,
    });
    expect(entry.faviconDataUri).toBe('data:image/png;base64,OLD');
  });

  it('keeps existing title when meta has none', async () => {
    const mod = await import('./siteMetaCache');
    const entry = mod.buildCachedSiteMetaEntry(
      '',
      'https://x.com/favicon.ico',
      'data:image/png;base64,AAA',
      {
        title: 'Old Title',
        faviconUrl: 'old.ico',
        faviconDataUri: '',
        fetchedAt: 1,
        titleSource: '',
        lastOkAt: 0,
        nextRetryAt: 0,
        failCount: 0,
      },
    );
    expect(entry.title).toBe('Old Title');
  });

  it('falls back to empty strings when neither meta nor existing provides values', async () => {
    const mod = await import('./siteMetaCache');
    const entry = mod.buildCachedSiteMetaEntry('', 'https://x.com/favicon.ico', '');
    expect(entry.title).toBe('');
    expect(entry.faviconDataUri).toBe('');
    expect(entry.faviconUrl).toBe('https://x.com/favicon.ico');
  });

  it('keeps existing faviconUrl when meta provides none (symmetric merge)', async () => {
    const mod = await import('./siteMetaCache');
    const entry = mod.buildCachedSiteMetaEntry('X', '', '', {
      title: 'Old',
      faviconUrl: 'old.ico',
      faviconDataUri: '',
      fetchedAt: 1,
      titleSource: '',
      lastOkAt: 0,
      nextRetryAt: 0,
      failCount: 0,
    });
    expect(entry.title).toBe('X');
    expect(entry.faviconUrl).toBe('old.ico');
    expect(entry.faviconDataUri).toBe('');
  });
});
