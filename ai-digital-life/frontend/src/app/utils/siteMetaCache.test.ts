import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('siteMetaCache memory layer', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  });

  it('set + get roundtrips data-URI first', async () => {
    const mod = await import('./siteMetaCache');
    mod.setSiteMetaBackendForTest(mod.createMockSiteMetaBackend());
    await mod.initSiteMetaCache();
    mod.setCachedSiteMeta('https://a.com', { title: 'A', faviconUrl: 'https://a.com/favicon.ico', faviconDataUri: 'data:image/png;base64,AA', fetchedAt: 1 });
    expect(mod.getCachedFavicon('https://a.com')).toBe('data:image/png;base64,AA');
    expect(mod.getCachedTitle('https://a.com')).toBe('A');
  });

  it('remove clears entry', async () => {
    const mod = await import('./siteMetaCache');
    mod.setSiteMetaBackendForTest(mod.createMockSiteMetaBackend());
    await mod.initSiteMetaCache();
    mod.setCachedSiteMeta('https://a.com', { title: 'A', faviconUrl: '', faviconDataUri: 'data:x;base64,AA', fetchedAt: 1 });
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
    const big = 'data:image/png;base64,' + 'x'.repeat(64 * 1024 + 1);
    mod.setCachedSiteMeta('https://a.com', { title: 'A'.repeat(500), faviconUrl: '', faviconDataUri: big, fetchedAt: 1 });
    const entry = mod.getCachedSiteMeta('https://a.com')!;
    expect(entry.faviconDataUri).toBe('');
    expect(entry.title).toHaveLength(200);
  });

  it('subscribe fires on set for matching url', async () => {
    const mod = await import('./siteMetaCache');
    mod.setSiteMetaBackendForTest(mod.createMockSiteMetaBackend());
    await mod.initSiteMetaCache();
    let fired = 0;
    mod.subscribeSiteMeta('https://a.com', () => { fired++; });
    mod.setCachedSiteMeta('https://a.com', { title: 'A', faviconUrl: '', faviconDataUri: '', fetchedAt: 1 });
    expect(fired).toBe(1);
  });

  it('normalizeUrlForCache strips hash and trailing slash', async () => {
    const mod = await import('./siteMetaCache');
    expect(mod.normalizeUrlForCache('https://a.com/#section')).toBe('https://a.com/');
    expect(mod.normalizeUrlForCache('https://a.com/path/')).toBe('https://a.com/path');
  });
});
