import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SiteMetaBackend } from '../../utils/siteMetaBackends/types';

describe('removeSiteMetaIfUnreferenced', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('keeps cache when url still referenced by a tab', async () => {
    const cleanup = await import('./siteMetaCleanup');
    const cache = await import('../../utils/siteMetaCache');
    const backend: SiteMetaBackend = cache.createMockSiteMetaBackend();
    const removeSpy = vi.spyOn(backend, 'remove');
    cache.setSiteMetaBackendForTest(backend);
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
          titleResolved: false,
          isPinned: false,
          sortOrder: 0,
          isPlayingAudio: false,
          isAudioMuted: false,
          isDownloading: false,
        },
      ],
    });

    cleanup.removeSiteMetaIfUnreferenced('https://a.com');
    expect(cache.getCachedSiteMeta('https://a.com')).toBeDefined();
    expect(removeSpy).not.toHaveBeenCalled();

    store.useAppStore.setState({ browserTabs: [] });
    cleanup.removeSiteMetaIfUnreferenced('https://a.com');
    expect(cache.getCachedSiteMeta('https://a.com')).toBeUndefined();
    // fire-and-forget backend removal is eventually issued (disk cache truly deleted)
    await new Promise((r) => setTimeout(r, 0));
    expect(removeSpy).toHaveBeenCalledWith(['https://a.com/']);
  });
});
