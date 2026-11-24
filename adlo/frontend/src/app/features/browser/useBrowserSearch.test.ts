import { describe, it, expect } from 'vitest';
import { findInBrowserLookupIndex } from './useBrowserSearch';

const INDEX = [
  { title: 'Bing: 百度', url: 'https://www.bing.com/search?q=%E7%99%BE%E5%BA%A6' },
  { title: 'YouTube', url: 'https://www.youtube.com/' },
  { title: '百度百科', url: 'https://baike.baidu.com/' },
  { title: 'Local Dev', url: 'http://localhost:8080/' },
];

describe('findInBrowserLookupIndex', () => {
  it('returns undefined for plain search words (skips history match, triggers search)', () => {
    // 输入搜索词"百度"不应命中标题含"百度"的历史条目（Chrome/Edge omnibox 语义）
    expect(findInBrowserLookupIndex(INDEX, '百度')).toBeUndefined();
  });

  it('returns undefined for a search word that equals a bookmark title (M1-J)', () => {
    // 标题精确匹配也受 URL 格式门控：输入"百度百科"不因书签标题同名而劫持
    expect(findInBrowserLookupIndex(INDEX, '百度百科')).toBeUndefined();
  });

  it('matches exact URL regardless of format', () => {
    const r = findInBrowserLookupIndex(INDEX, 'https://www.youtube.com/');
    expect(r?.url).toBe('https://www.youtube.com/');
  });

  it('matches by host with TLD', () => {
    const r = findInBrowserLookupIndex(INDEX, 'youtube.com');
    expect(r?.url).toBe('https://www.youtube.com/');
  });

  it('matches localhost with port', () => {
    const r = findInBrowserLookupIndex(INDEX, 'localhost:8080');
    expect(r?.url).toBe('http://localhost:8080/');
  });

  it('matches IP-address-like input', () => {
    const ipIndex = [{ title: 'Router', url: 'http://192.168.1.1/' }];
    const r = findInBrowserLookupIndex(ipIndex, '192.168.1.1');
    expect(r?.url).toBe('http://192.168.1.1/');
  });

  it('does NOT treat a bare word with no dot/slash as URL', () => {
    // localhostxyz（无端口边界）不应被 localhost 规则误判为 URL
    expect(findInBrowserLookupIndex(INDEX, 'localhostxyz')).toBeUndefined();
  });

  it('matches host:port form (foo.com:8080)', () => {
    const portIndex = [{ title: 'App', url: 'http://foo.com:8080/' }];
    const r = findInBrowserLookupIndex(portIndex, 'foo.com:8080');
    expect(r?.url).toBe('http://foo.com:8080/');
  });

  it('does not prefix-match a longer history URL when a full URL is typed', () => {
    // 用户输入站点根 `http://127.0.0.1:5199/` 时，历史里的 `.../file.txt`
    // 不得劫持导航（用户实测：地址栏自动变成 /file.txt）。
    const index = [{ title: 'download', url: 'http://127.0.0.1:5199/file.txt' }];
    expect(findInBrowserLookupIndex(index, 'http://127.0.0.1:5199/')).toBeUndefined();
  });

  it('still exact-matches a full URL ignoring a trailing slash', () => {
    const index = [{ title: 'root', url: 'http://127.0.0.1:5199/' }];
    expect(findInBrowserLookupIndex(index, 'http://127.0.0.1:5199')?.url).toBe(
      'http://127.0.0.1:5199/',
    );
  });

  it('does not treat a full protocol URL as a history prefix', () => {
    // 显式输入 scheme 的完整 URL 直接导航，不命中更长的历史搜索 URL。
    expect(findInBrowserLookupIndex(INDEX, 'https://www.bing.com')).toBeUndefined();
  });
});
