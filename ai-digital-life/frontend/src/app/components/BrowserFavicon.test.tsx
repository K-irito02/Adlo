import { render, act, fireEvent } from '@testing-library/react';
import { it, expect, vi, beforeEach } from 'vitest';
import { BrowserFavicon } from './BrowserFavicon';
import * as cache from '../utils/siteMetaCache';

beforeEach(() => {
  vi.restoreAllMocks();
});

function mirrorFavicon(url: string, faviconUrl: string, faviconDataUri = '') {
  act(() => {
    cache.__mirrorUpsertForTest(url, {
      title: 'A',
      titleSource: '',
      faviconUrl,
      faviconDataUri,
      fetchedAt: 1,
      lastOkAt: 0,
      nextRetryAt: 0,
      failCount: 0,
    });
  });
}

it('renders fallback icon (not blank) when no cached favicon / no proxy fallback', () => {
  // Fix D：未缓存且不再有 DDG/Google 代理兜底 → getFaviconUrl 返回 '' → 无 img，
  // 占位图标真正可见（非 display:none）。
  const { container } = render(<BrowserFavicon url="https://uncached.example" />);
  const iconLink = container.querySelector(
    '.adl-browser-tree__link-fallback',
  ) as HTMLElement | null;
  expect(iconLink).not.toBeNull();
  expect(iconLink?.style.display).not.toBe('none');
  expect(container.querySelector('.adl-browser-tree__favicon')).toBeNull();
});

it('image error does not remove cache (no removeCachedSiteMeta call)', () => {
  mirrorFavicon('https://err.example', 'https://err.example/favicon.ico');
  const removeSpy = vi.spyOn(cache, 'removeCachedSiteMeta').mockImplementation(() => {});
  const { container } = render(<BrowserFavicon url="https://err.example" />);
  const img = container.querySelector('.adl-browser-tree__favicon') as HTMLImageElement | null;
  expect(img).not.toBeNull();
  act(() => {
    fireEvent.error(img!);
  });
  expect(removeSpy).not.toHaveBeenCalled();
});

it('shows built-in fallback icon when real icon fails (single error, no google retry)', () => {
  mirrorFavicon('https://fail.example', 'https://fail.example/favicon.ico');
  const { container } = render(<BrowserFavicon url="https://fail.example" />);
  const img = container.querySelector('.adl-browser-tree__favicon') as HTMLImageElement | null;
  // 镜像提供真实 favicon → img 渲染；触发加载失败 → 直接 degraded → img 卸载、占位可见
  expect(img).not.toBeNull();
  act(() => {
    fireEvent.error(img!);
  });
  const iconLink = container.querySelector(
    '.adl-browser-tree__link-fallback',
  ) as HTMLElement | null;
  expect(iconLink).not.toBeNull();
  expect(iconLink?.style.display).not.toBe('none');
  expect(container.querySelector('.adl-browser-tree__favicon')).toBeNull();
});

it('recovers from degraded state when mirror updates bring a new favicon', () => {
  mirrorFavicon('https://recover.example', 'https://recover.example/favicon.ico');
  const { container } = render(<BrowserFavicon url="https://recover.example" />);
  const img = container.querySelector('.adl-browser-tree__favicon') as HTMLImageElement | null;
  expect(img).not.toBeNull();
  // 加载失败 → degraded（img 卸载）
  act(() => {
    fireEvent.error(img!);
  });
  expect(container.querySelector('.adl-browser-tree__favicon')).toBeNull();
  // 镜像更新（等价于服务端广播写入镜像）：notify 触发订阅回调 → setFaviconUrl +
  // setDegraded(false) → img 恢复为新图标
  mirrorFavicon('https://recover.example', 'https://cdn.example.com/favicon.ico');
  const img2 = container.querySelector('.adl-browser-tree__favicon') as HTMLImageElement | null;
  expect(img2).not.toBeNull();
  expect(img2?.src).toBe('https://cdn.example.com/favicon.ico');
  const iconLink = container.querySelector(
    '.adl-browser-tree__link-fallback',
  ) as HTMLElement | null;
  expect(iconLink?.style.display).toBe('none');
});
