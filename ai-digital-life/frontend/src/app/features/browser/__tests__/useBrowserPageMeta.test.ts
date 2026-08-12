import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBrowserPageMeta } from '../useBrowserPageMeta';
import * as siteMetaCache from '@utils/siteMetaCache';

describe('meta source priority', () => {
  it('should allow higher priority to overwrite lower priority within TTL', () => {
    const processed = new Map<string, { timestamp: number; source: string }>();
    const TTL = 2000;
    const PRIORITY = { com: 4, iframe: 3, http: 2, google: 1 };

    function shouldProcess(url: string, source: string): boolean {
      const entry = processed.get(url);
      if (!entry) {
        return true;
      }
      if (Date.now() - entry.timestamp > TTL) {
        processed.delete(url);
        return true;
      }
      return (
        PRIORITY[source as keyof typeof PRIORITY] > PRIORITY[entry.source as keyof typeof PRIORITY]
      );
    }

    expect(shouldProcess('https://example.com', 'http')).toBe(true);
    processed.set('https://example.com', { timestamp: Date.now(), source: 'http' });

    expect(shouldProcess('https://example.com', 'com')).toBe(true);

    processed.set('https://example.com', { timestamp: Date.now(), source: 'com' });
    expect(shouldProcess('https://example.com', 'google')).toBe(false);
    expect(shouldProcess('https://example.com', 'http')).toBe(false);
    expect(shouldProcess('https://example.com', 'iframe')).toBe(false);
  });

  it('should allow same priority to overwrite after TTL expiry', async () => {
    const processed = new Map<string, { timestamp: number; source: string }>();
    const TTL = 50;
    const PRIORITY = { com: 4, iframe: 3, http: 2, google: 1 };

    function shouldProcess(url: string, source: string): boolean {
      const entry = processed.get(url);
      if (!entry) {
        return true;
      }
      if (Date.now() - entry.timestamp > TTL) {
        processed.delete(url);
        return true;
      }
      return (
        PRIORITY[source as keyof typeof PRIORITY] > PRIORITY[entry.source as keyof typeof PRIORITY]
      );
    }

    processed.set('https://example.com', { timestamp: Date.now() - 100, source: 'com' });
    await new Promise((r) => setTimeout(r, 10));
    expect(shouldProcess('https://example.com', 'google')).toBe(true);
  });
});

interface HandlePageMetaMeta {
  title: string;
  favicon: string;
  faviconDataUri?: string;
  url: string;
}

describe('useBrowserPageMeta write path (siteMetaCache mock backend)', () => {
  beforeEach(async () => {
    siteMetaCache.setSiteMetaBackendForTest(siteMetaCache.createMockSiteMetaBackend());
    await siteMetaCache.initSiteMetaCache();
  });

  async function handle(meta: HandlePageMetaMeta, source?: 'com' | 'http' | 'iframe' | 'google') {
    const pendingNavigationsRef = { current: new Set<string>() };
    const { result } = renderHook(() => useBrowserPageMeta(pendingNavigationsRef));
    await act(async () => {
      result.current.handlePageMeta(meta, source ?? 'http');
    });
  }

  it('successful fetch writes a full entry via setCachedSiteMeta', async () => {
    await handle({
      title: 'X',
      favicon: 'https://x.com/f.png',
      faviconDataUri: 'data:image/png;base64,AAA',
      url: 'https://write-full.example',
    });
    const entry = siteMetaCache.getCachedSiteMeta('https://write-full.example')!;
    expect(entry).toMatchObject({
      title: 'X',
      faviconUrl: 'https://x.com/f.png',
      faviconDataUri: 'data:image/png;base64,AAA',
    });
    expect(typeof entry.fetchedAt).toBe('number');
  });

  it('meta with no title and no favicon (failed-fetch contract) does NOT write', async () => {
    await handle({ title: '', favicon: '', url: 'https://write-no-meta.example' });
    expect(siteMetaCache.getCachedSiteMeta('https://write-no-meta.example')).toBeUndefined();
  });

  it('meta with title but no favicon does NOT write (render falls back at draw time)', async () => {
    await handle({ title: 'X', favicon: '', url: 'https://write-title-only.example' });
    expect(siteMetaCache.getCachedSiteMeta('https://write-title-only.example')).toBeUndefined();
  });

  it('meta with favicon but empty faviconDataUri still caches title + faviconUrl', async () => {
    await handle({
      title: 'X',
      favicon: 'https://x.com/f.png',
      faviconDataUri: '',
      url: 'https://write-empty-datauri.example',
    });
    const entry = siteMetaCache.getCachedSiteMeta('https://write-empty-datauri.example')!;
    expect(entry.title).toBe('X');
    expect(entry.faviconUrl).toBe('https://x.com/f.png');
    expect(entry.faviconDataUri).toBe('');
  });

  it('keeps existing cached favicon data-URI when a lower-quality fetch has none', async () => {
    siteMetaCache.setCachedSiteMeta('https://write-keep-existing.example', {
      title: 'Old',
      faviconUrl: 'https://x.com/old.ico',
      faviconDataUri: 'data:image/png;base64,OLD',
      fetchedAt: 1,
    });
    await handle({
      title: 'X',
      favicon: 'https://x.com/better.png',
      faviconDataUri: '',
      url: 'https://write-keep-existing.example',
    });
    const entry = siteMetaCache.getCachedSiteMeta('https://write-keep-existing.example')!;
    expect(entry.faviconDataUri).toBe('data:image/png;base64,OLD');
    expect(entry.faviconUrl).toBe('https://x.com/better.png');
    expect(entry.title).toBe('X');
  });

  it('Google S2 favicon (low quality) does NOT overwrite a cached high-quality faviconUrl', async () => {
    siteMetaCache.setCachedSiteMeta('https://quality-s2.example', {
      title: 'Q',
      faviconUrl: 'https://cdn.example.com/icons/icon-512.png',
      faviconDataUri: '',
      fetchedAt: 1,
    });
    await handle({
      title: 'Q',
      favicon: 'https://www.google.com/s2/favicons?domain=quality-s2.example&sz=64',
      url: 'https://quality-s2.example',
    });
    const entry = siteMetaCache.getCachedSiteMeta('https://quality-s2.example')!;
    expect(entry.faviconUrl).toBe('https://cdn.example.com/icons/icon-512.png');
    expect(entry.faviconDataUri).toBe('');
  });

  it('favicon.ico (low quality) does NOT overwrite a cached high-quality faviconUrl', async () => {
    siteMetaCache.setCachedSiteMeta('https://quality-ico.example', {
      title: 'Q',
      faviconUrl: 'https://cdn.example.com/icons/icon-512.png',
      faviconDataUri: '',
      fetchedAt: 1,
    });
    await handle({
      title: 'Q',
      favicon: 'https://quality-ico.example/favicon.ico',
      url: 'https://quality-ico.example',
    });
    const entry = siteMetaCache.getCachedSiteMeta('https://quality-ico.example')!;
    expect(entry.faviconUrl).toBe('https://cdn.example.com/icons/icon-512.png');
  });
});
