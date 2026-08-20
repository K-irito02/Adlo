import { describe, it, expect, beforeEach } from 'vitest';
import { getFaviconUrl } from '../favicon';
import {
  setSiteMetaBackendForTest,
  __mirrorUpsertForTest,
  buildCachedSiteMetaEntry,
  createMockSiteMetaBackend,
} from '../siteMetaCache';

describe('getFaviconUrl origin fallback', () => {
  beforeEach(() => {
    setSiteMetaBackendForTest(createMockSiteMetaBackend());
  });

  it('reuses the same-origin favicon for a different query/path variant', () => {
    __mirrorUpsertForTest(
      'https://www.douyin.com/search/music?type=general',
      buildCachedSiteMetaEntry('音乐合集', 'https://www.douyin.com/favicon.ico', 'data:image/x'),
    );
    const modalUrl =
      'https://www.douyin.com/search/music?modal_id=7556986863237696804&type=general';
    expect(getFaviconUrl(modalUrl)).toBe('data:image/x');
  });

  it('returns empty when no same-origin entry exists', () => {
    expect(getFaviconUrl('https://no-such-origin.test/p')).toBe('');
  });
});
