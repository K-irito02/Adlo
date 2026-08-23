import { describe, it, expect, beforeEach } from 'vitest';
import { getFaviconUrl } from '../favicon';
import {
  setSiteMetaBackendForTest,
  __mirrorUpsertForTest,
  buildCachedSiteMetaEntry,
  createMockSiteMetaBackend,
  recordRedirect,
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

describe('getFaviconUrl cross-origin redirect fallback', () => {
  beforeEach(() => {
    setSiteMetaBackendForTest(createMockSiteMetaBackend());
  });

  it('falls back to the redirect target favicon when original URL has none', () => {
    // 原始 URL 无缓存，重定向目标有 data-URI
    __mirrorUpsertForTest(
      'https://marginalia-search.com/search?q=x',
      buildCachedSiteMetaEntry(
        'Marginalia',
        'https://marginalia-search.com/favicon.ico',
        'data:image/png;base64,AA',
      ),
    );
    recordRedirect(
      'https://search.marginalia.nu/search?q=x',
      'https://marginalia-search.com/search?q=x',
    );
    expect(getFaviconUrl('https://search.marginalia.nu/search?q=x')).toBe(
      'data:image/png;base64,AA',
    );
  });

  it('returns HTTP URL for redirect target when only external URL cached', () => {
    // 原始 URL 无缓存，重定向目标只有外部 URL
    __mirrorUpsertForTest(
      'https://target.test/search?q=x',
      buildCachedSiteMetaEntry('Target', 'https://target.test/favicon.ico', ''),
    );
    recordRedirect('https://source.test/search?q=x', 'https://target.test/search?q=x');
    const fav = getFaviconUrl('https://source.test/search?q=x');
    expect(fav).toBe('https://target.test/favicon.ico');
  });

  it('returns empty when redirect target has no favicon either', () => {
    __mirrorUpsertForTest(
      'https://target.test/search?q=x',
      buildCachedSiteMetaEntry('Target', '', ''),
    );
    recordRedirect('https://source.test/search?q=x', 'https://target.test/search?q=x');
    expect(getFaviconUrl('https://source.test/search?q=x')).toBe('');
  });
});
