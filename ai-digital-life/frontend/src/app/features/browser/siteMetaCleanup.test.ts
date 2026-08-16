import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('removeSiteMetaIfUnreferenced', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('keeps cache when url still referenced by a tab', async () => {
    const cleanup = await import('./siteMetaCleanup');
    const cache = await import('../../utils/siteMetaCache');
    cache.setSiteMetaBackendForTest(cache.createMockSiteMetaBackend());
    await cache.initSiteMetaCache();
    cache.setCachedSiteMeta('https://a.com', {
      title: 'A',
      faviconUrl: '',
      faviconDataUri: '',
      fetchedAt: 1,
      titleSource: '',
      lastOkAt: 0,
      nextRetryAt: 0,
      failCount: 0,
    });

    const store = await import('../../stores/slicedStore');
    store.useAppStore.setState({
      browserTabs: [
        {
          id: 't1',
          workspaceId: 'w',
          title: 'A',
          url: 'https://a.com',
          isPinned: false,
          sortOrder: 0,
          isPlayingAudio: false,
          isAudioMuted: false,
        },
      ],
    });

    cleanup.removeSiteMetaIfUnreferenced('https://a.com');
    expect(cache.getCachedSiteMeta('https://a.com')).toBeDefined();

    store.useAppStore.setState({ browserTabs: [] });
    cleanup.removeSiteMetaIfUnreferenced('https://a.com');
    expect(cache.getCachedSiteMeta('https://a.com')).toBeUndefined();
  });
});
