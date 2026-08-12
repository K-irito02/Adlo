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

  it('write path: successful fetch stores full entry (title/faviconUrl/faviconDataUri/fetchedAt)', async () => {
    const mod = await import('./siteMetaCache');
    mod.setSiteMetaBackendForTest(mod.createMockSiteMetaBackend());
    await mod.initSiteMetaCache();
    mod.setCachedSiteMeta('https://x.com', {
      title: 'X',
      faviconUrl: 'https://x.com/favicon.ico',
      faviconDataUri: 'data:image/png;base64,AAA',
      fetchedAt: 123,
    });
    expect(mod.getCachedSiteMeta('https://x.com')).toEqual({
      title: 'X',
      faviconUrl: 'https://x.com/favicon.ico',
      faviconDataUri: 'data:image/png;base64,AAA',
      fetchedAt: 123,
    });
  });

  it('write path: empty faviconDataUri still caches title + faviconUrl (render falls back to faviconUrl)', async () => {
    const mod = await import('./siteMetaCache');
    mod.setSiteMetaBackendForTest(mod.createMockSiteMetaBackend());
    await mod.initSiteMetaCache();
    mod.setCachedSiteMeta('https://x.com', {
      title: 'X',
      faviconUrl: 'https://x.com/favicon.ico',
      faviconDataUri: '',
      fetchedAt: 1,
    });
    expect(mod.getCachedTitle('https://x.com')).toBe('X');
    expect(mod.getCachedFavicon('https://x.com')).toBe('');
    expect(mod.getCachedSiteMeta('https://x.com')?.faviconUrl).toBe('https://x.com/favicon.ico');
  });
});

describe('buildCachedSiteMetaEntry (write-path entry builder)', () => {
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
});
