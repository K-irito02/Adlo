import { describe, it, expect } from 'vitest';
import {
  isSearchQuery,
  buildSearchUrl,
  ensureProtocol,
  normalizeUrlForCompare,
  mergeSearchResults,
  sanitizeRestoredBrowserUrl,
} from '../browserUrlUtils';
import type { SearchEngine } from '../browserUrlUtils';

describe('isSearchQuery', () => {
  it('returns false for URLs with protocol', () => {
    expect(isSearchQuery('https://github.com')).toBe(false);
    expect(isSearchQuery('http://example.com')).toBe(false);
  });
  it('returns false for about: URLs', () => {
    expect(isSearchQuery('about:blank')).toBe(false);
  });
  it('returns false for IP addresses', () => {
    expect(isSearchQuery('192.168.1.1')).toBe(false);
  });
  it('returns false for localhost', () => {
    expect(isSearchQuery('localhost:3000')).toBe(false);
  });
  it('returns true for strings with spaces', () => {
    expect(isSearchQuery('react hooks')).toBe(true);
  });
  it('returns true for Chinese text', () => {
    expect(isSearchQuery('你好世界')).toBe(true);
  });
  it('returns true for strings without dots', () => {
    expect(isSearchQuery('github')).toBe(true);
  });
});

describe('buildSearchUrl', () => {
  const googleEngine: SearchEngine = {
    id: 'google',
    name: 'Google',
    urlTemplate: 'https://www.google.com/search?q=%s',
    isBuiltIn: true,
    isDefault: true,
  };
  it('replaces %s with encoded query', () => {
    expect(buildSearchUrl(googleEngine, 'react hooks')).toBe(
      'https://www.google.com/search?q=react%20hooks',
    );
  });
  it('encodes Chinese characters', () => {
    expect(buildSearchUrl(googleEngine, '你好')).toBe(
      'https://www.google.com/search?q=%E4%BD%A0%E5%A5%BD',
    );
  });
});

describe('ensureProtocol', () => {
  it('preserves existing protocol', () => {
    expect(ensureProtocol('https://github.com')).toBe('https://github.com');
  });
  it('preserves about: URLs', () => {
    expect(ensureProtocol('about:blank')).toBe('about:blank');
  });
  it('adds https:// to bare domains', () => {
    expect(ensureProtocol('github.com')).toBe('https://github.com');
  });
});

describe('normalizeUrlForCompare modal_id', () => {
  it('treats base and modal_id variants as equal', () => {
    expect(normalizeUrlForCompare('https://a.com/search/music?type=general')).toBe(
      normalizeUrlForCompare('https://a.com/search/music?modal_id=123&type=general'),
    );
  });
  it('removes trailing ? when modal_id is the only query param', () => {
    expect(normalizeUrlForCompare('https://a.com/p?modal_id=123')).toBe('https://a.com/p');
  });
  it('leaves urls without modal_id unchanged', () => {
    expect(normalizeUrlForCompare('https://a.com/p?a=1&b=2')).toBe('https://a.com/p?a=1&b=2');
  });
});

describe('mergeSearchResults（事项 10-c）', () => {
  const labels = { savedTabs: '收藏标签', historyTabs: '历史标签', openTabs: '已打开标签页' };
  const yt = { title: 'YouTube', url: 'https://www.youtube.com/' };
  const bk = { title: 'Bklit UI', url: 'https://example.com/ui' };

  it('空查询直接返回空（点域不再默认列出全域）', () => {
    expect(
      mergeSearchResults({
        query: '  ',
        scope: 'all',
        bookmarks: [yt],
        history: [yt],
        openTabs: [yt],
        labels,
      }),
    ).toEqual([]);
  });

  it('全部域同网址三源只留一行且已打开优先', () => {
    const results = mergeSearchResults({
      query: 'you',
      scope: 'all',
      bookmarks: [yt],
      history: [yt],
      openTabs: [yt],
      labels,
    });
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('已打开标签页');
  });

  it('全部域仅收藏命中时保留收藏来源', () => {
    const results = mergeSearchResults({
      query: 'bklit',
      scope: 'all',
      bookmarks: [bk],
      history: [],
      openTabs: [],
      labels,
    });
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('收藏标签');
  });

  it('收藏域只搜收藏、历史域只搜历史', () => {
    const inBookmarks = mergeSearchResults({
      query: 'bklit',
      scope: 'bookmarks',
      bookmarks: [bk],
      history: [yt],
      openTabs: [yt],
      labels,
    });
    expect(inBookmarks.map((r) => r.url)).toEqual(['https://example.com/ui']);
    const inHistory = mergeSearchResults({
      query: 'you',
      scope: 'history',
      bookmarks: [bk],
      history: [yt],
      openTabs: [yt],
      labels,
    });
    expect(inHistory.map((r) => r.url)).toEqual(['https://www.youtube.com/']);
  });
});

describe('sanitizeRestoredBrowserUrl', () => {
  it('blanks drive-letter pseudo hosts (proven-bad pattern)', () => {
    expect(sanitizeRestoredBrowserUrl('https://c/Users/31432/x.html')).toBe('about:blank');
    expect(sanitizeRestoredBrowserUrl('https://D/docs/readme')).toBe('about:blank');
  });
  it('keeps single-label intranet hosts (no data loss; silent fetch skips them separately)', () => {
    expect(sanitizeRestoredBrowserUrl('http://nas/')).toBe('http://nas/');
    expect(sanitizeRestoredBrowserUrl('http://myserver:8080/app')).toBe('http://myserver:8080/app');
  });
  it('keeps extension-like real domains', () => {
    expect(sanitizeRestoredBrowserUrl('https://agents.md/')).toBe('https://agents.md/');
    expect(sanitizeRestoredBrowserUrl('https://example.com/readme.md')).toBe(
      'https://example.com/readme.md',
    );
  });
  it('passes through non-http(s), about:blank and empty (new-tab lifecycle)', () => {
    expect(sanitizeRestoredBrowserUrl('')).toBe('');
    expect(sanitizeRestoredBrowserUrl('about:blank')).toBe('about:blank');
    expect(sanitizeRestoredBrowserUrl('file:///C:/x.html')).toBe('file:///C:/x.html');
    expect(sanitizeRestoredBrowserUrl('not a url at all')).toBe('not a url at all');
  });
  it('keeps normal public/localhost/IP hosts', () => {
    expect(sanitizeRestoredBrowserUrl('https://www.bilibili.com/video')).toBe(
      'https://www.bilibili.com/video',
    );
    expect(sanitizeRestoredBrowserUrl('http://127.0.0.1:3080/')).toBe('http://127.0.0.1:3080/');
    expect(sanitizeRestoredBrowserUrl('http://localhost:5173/')).toBe('http://localhost:5173/');
  });
});
