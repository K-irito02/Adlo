import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetFaviconDisplayCacheForTest,
  forgetPageFavicon,
  getRememberedPageFavicon,
  isFaviconSourceReady,
  markFaviconSourceFailed,
  markFaviconSourceLoaded,
  rememberPageFavicon,
} from '../faviconDisplayCache';

beforeEach(() => {
  __resetFaviconDisplayCacheForTest();
});

describe('faviconDisplayCache', () => {
  it('externally loaded sources are ready; failures revoke readiness', () => {
    const src = 'https://cache.example/favicon.ico';
    expect(isFaviconSourceReady(src)).toBe(false);
    markFaviconSourceLoaded(src);
    expect(isFaviconSourceReady(src)).toBe(true);
    markFaviconSourceFailed(src);
    expect(isFaviconSourceReady(src)).toBe(false);
  });

  it('inline data URIs are ready until they fail', () => {
    const dataUri = 'data:image/png;base64,AA';
    expect(isFaviconSourceReady(dataUri)).toBe(true);
    markFaviconSourceFailed(dataUri);
    expect(isFaviconSourceReady(dataUri)).toBe(false);
    // 重新成功加载会解除失败标记
    markFaviconSourceLoaded(dataUri);
    expect(isFaviconSourceReady(dataUri)).toBe(true);
  });

  it('remembers the last displayed icon per page URL and can forget it', () => {
    const page = 'https://page.example/a';
    expect(getRememberedPageFavicon(page)).toBe('');
    rememberPageFavicon(page, 'https://page.example/favicon.ico');
    expect(getRememberedPageFavicon(page)).toBe('https://page.example/favicon.ico');
    // 只清除匹配的 URL/src，误传其它 src 不清除
    forgetPageFavicon(page, 'https://other.example/favicon.ico');
    expect(getRememberedPageFavicon(page)).toBe('https://page.example/favicon.ico');
    forgetPageFavicon(page, 'https://page.example/favicon.ico');
    expect(getRememberedPageFavicon(page)).toBe('');
  });
});
