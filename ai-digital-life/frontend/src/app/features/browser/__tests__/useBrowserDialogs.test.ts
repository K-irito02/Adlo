import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { PageMeta } from '@shared/ipc/browser';
import { prefetchPageMeta } from '@utils/fetchPageMeta';
import * as siteMetaCache from '@utils/siteMetaCache';
import { useBrowserDialogs } from '../useBrowserDialogs';

vi.mock('@utils/fetchPageMeta', () => ({
  prefetchPageMeta: vi.fn(),
}));

function makeMeta(partial: Partial<PageMeta>): PageMeta {
  const {
    title = 'X',
    favicon = 'https://x.com/f.png',
    faviconDataUri = '',
    url = 'https://x.com',
  } = partial;
  return { title, favicon, faviconDataUri, url };
}

describe('useBrowserDialogs create-tab write gate', () => {
  beforeEach(async () => {
    vi.mocked(prefetchPageMeta).mockReset();
    siteMetaCache.setSiteMetaBackendForTest(siteMetaCache.createMockSiteMetaBackend());
    await siteMetaCache.initSiteMetaCache();
  });

  async function confirmCreateTab(url: string) {
    const openTab = vi.fn();
    const { result } = renderHook(() =>
      useBrowserDialogs({
        browserOpenTab: openTab,
        browserUpdateTab: vi.fn(),
        activeTab: null,
        isBookmarked: false,
        showToast: vi.fn(),
        t: {},
      }),
    );
    await act(async () => {
      await result.current.handleCreateTabConfirm('', url);
    });
    return { openTab };
  }

  it('failed fetch (null meta) does NOT write and no Google-fallback write happens', async () => {
    vi.mocked(prefetchPageMeta).mockResolvedValue(null);
    await confirmCreateTab('https://dlg-null.example');
    expect(siteMetaCache.getCachedSiteMeta('https://dlg-null.example')).toBeUndefined();
    expect(siteMetaCache.getCachedFavicon('https://dlg-null.example')).toBe('');
  });

  it('successful fetch writes a full entry via setCachedSiteMeta', async () => {
    vi.mocked(prefetchPageMeta).mockResolvedValue(
      makeMeta({
        title: 'X',
        faviconDataUri: 'data:image/png;base64,AAA',
        url: 'https://dlg-full.example',
      }),
    );
    await confirmCreateTab('https://dlg-full.example');
    const entry = siteMetaCache.getCachedSiteMeta('https://dlg-full.example')!;
    expect(entry.title).toBe('X');
    expect(entry.faviconUrl).toBe('https://x.com/f.png');
    expect(entry.faviconDataUri).toBe('data:image/png;base64,AAA');
    expect(typeof entry.fetchedAt).toBe('number');
  });

  it('meta with favicon but empty faviconDataUri still caches title + faviconUrl', async () => {
    vi.mocked(prefetchPageMeta).mockResolvedValue(
      makeMeta({ faviconDataUri: '', url: 'https://dlg-empty-datauri.example' }),
    );
    await confirmCreateTab('https://dlg-empty-datauri.example');
    const entry = siteMetaCache.getCachedSiteMeta('https://dlg-empty-datauri.example')!;
    expect(entry.title).toBe('X');
    expect(entry.faviconUrl).toBe('https://x.com/f.png');
    expect(entry.faviconDataUri).toBe('');
  });

  it('does NOT overwrite a cached high-quality faviconUrl with a low-quality create-tab favicon', async () => {
    siteMetaCache.setCachedSiteMeta('https://dlg-q.example', {
      title: 'Old',
      faviconUrl: 'https://cdn.example.com/icons/icon-512.png',
      faviconDataUri: '',
      fetchedAt: 1,
    });
    vi.mocked(prefetchPageMeta).mockResolvedValue(
      makeMeta({
        title: 'New',
        favicon: 'https://dlg-q.example/favicon.ico',
        url: 'https://dlg-q.example',
      }),
    );
    await confirmCreateTab('https://dlg-q.example');
    const entry = siteMetaCache.getCachedSiteMeta('https://dlg-q.example')!;
    expect(entry.faviconUrl).toBe('https://cdn.example.com/icons/icon-512.png');
  });

  it('dataUri-only cache + low-quality URL favicon on create-tab does NOT write a faviconUrl', async () => {
    siteMetaCache.setCachedSiteMeta('https://dlg-datauri-only.example', {
      title: 'Old',
      faviconUrl: '',
      faviconDataUri: 'data:image/png;base64,OLD',
      fetchedAt: 1,
    });
    vi.mocked(prefetchPageMeta).mockResolvedValue(
      makeMeta({
        title: 'New',
        favicon: 'https://dlg-datauri-only.example/favicon.ico',
        faviconDataUri: '',
        url: 'https://dlg-datauri-only.example',
      }),
    );
    await confirmCreateTab('https://dlg-datauri-only.example');
    const entry = siteMetaCache.getCachedSiteMeta('https://dlg-datauri-only.example')!;
    expect(entry.faviconUrl).toBe('');
    expect(entry.faviconDataUri).toBe('data:image/png;base64,OLD');
  });

  it('preserves cached title when the create-tab fetch returns a data-URI but empty title', async () => {
    siteMetaCache.setCachedSiteMeta('https://dlg-title.example', {
      title: 'Old Title',
      faviconUrl: '',
      faviconDataUri: 'data:image/png;base64,OLD',
      fetchedAt: 1,
    });
    vi.mocked(prefetchPageMeta).mockResolvedValue(
      makeMeta({
        title: '',
        favicon: 'https://x.com/f.png',
        faviconDataUri: 'data:image/png;base64,NEW',
        url: 'https://dlg-title.example',
      }),
    );
    await confirmCreateTab('https://dlg-title.example');
    const entry = siteMetaCache.getCachedSiteMeta('https://dlg-title.example')!;
    expect(entry.title).toBe('Old Title');
    expect(entry.faviconDataUri).toBe('data:image/png;base64,NEW');
  });
});
