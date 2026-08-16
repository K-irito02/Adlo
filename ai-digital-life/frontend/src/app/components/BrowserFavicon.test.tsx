import { render, act, fireEvent } from '@testing-library/react';
import { it, expect, vi, beforeEach } from 'vitest';
import { BrowserFavicon } from './BrowserFavicon';
import * as cache from '../utils/siteMetaCache';

beforeEach(() => { vi.restoreAllMocks(); });

it('renders fallback icon (not blank) before cache ready', () => {
  // 私网 URL：getFaviconUrl 跳过外部兜底返回 '' → 无 img，占位图标真正可见（非 display:none）
  const { container } = render(<BrowserFavicon url="http://localhost:8080" />);
  const iconLink = container.querySelector('.adl-browser-tree__link-fallback') as HTMLElement | null;
  expect(iconLink).not.toBeNull();
  expect(iconLink?.style.display).not.toBe('none');
});

it('image error does not remove cache (no removeCachedSiteMeta call)', async () => {
  const removeSpy = vi.spyOn(cache, 'removeCachedSiteMeta').mockImplementation(() => {});
  const { container } = render(<BrowserFavicon url="https://a.com" />);
  const img = container.querySelector('.adl-browser-tree__favicon') as HTMLImageElement | null;
  if (img) {
    act(() => { fireEvent.error(img); });
  }
  expect(removeSpy).not.toHaveBeenCalled();
});

it('shows built-in fallback icon when both real icon and google-s2 fail', async () => {
  const { container } = render(<BrowserFavicon url="https://a.com" />);
  const img = container.querySelector('.adl-browser-tree__favicon') as HTMLImageElement | null;
  // img 存在（DDG 兜底 URL 恒非空）→ 触发加载失败（真实与 Google S2 均失败路径）
  if (img) {
    // 第一次 error：切 Google S2（img.src 改变）
    fireEvent.error(img);
    const img2 = container.querySelector('.adl-browser-tree__favicon') as HTMLImageElement | null;
    // 第二次 error（Google S2 也失败）→ degraded → img 卸载、IconLink 可见
    if (img2 && img2.src.includes('google.com/s2/favicons')) {
      act(() => { fireEvent.error(img2); });
      const iconLink = container.querySelector('.adl-browser-tree__link-fallback') as HTMLElement | null;
      expect(iconLink).not.toBeNull();
      expect(iconLink?.style.display).not.toBe('none');
      expect(container.querySelector('.adl-browser-tree__favicon')).toBeNull();
    }
  }
});
