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

it('renders fallback icon (not blank) when no cached favicon', () => {
  // 未缓存 → getFaviconUrl 返回 '' → 无 img，占位图标真正可见（非 display:none）
  const { container } = render(<BrowserFavicon url="https://uncached.example" />);
  const iconLink = container.querySelector(
    '.adl-browser-tree__link-fallback',
  ) as HTMLElement | null;
  expect(iconLink).not.toBeNull();
  expect(iconLink?.style.display).not.toBe('none');
  expect(container.querySelector('.adl-browser-tree__favicon')).toBeNull();
});

it('shows fallback letter when only external URL cached (no data-URI)', () => {
  // 只有外部 URL 无 data-URI → 不显示 img，显示兜底字母（用户需求：删除外部 URL 方案）
  mirrorFavicon('https://external.example', 'https://external.example/favicon.ico');
  const { container } = render(<BrowserFavicon url="https://external.example" />);
  const fallback = container.querySelector(
    '.adl-browser-tree__link-fallback',
  ) as HTMLElement | null;
  expect(fallback).not.toBeNull();
  expect(fallback?.textContent).toBe('E'); // 首字母大写
  expect(container.querySelector('.adl-browser-tree__favicon')).toBeNull();
});

it('renders img when data-URI is available', () => {
  // 有 data-URI → 显示真实 favicon
  mirrorFavicon('https://hasdata.example', 'https://hasdata.example/favicon.ico', 'data:image/png;base64,AA');
  const { container } = render(<BrowserFavicon url="https://hasdata.example" />);
  const img = container.querySelector('.adl-browser-tree__favicon') as HTMLImageElement | null;
  expect(img).not.toBeNull();
  expect(img?.src).toContain('data:image/png;base64,AA');
});

it('shows fallback letter when meta resolved with empty faviconUrl', () => {
  // 已结算仍是空图标 → 显示兜底字母
  mirrorFavicon('https://uncached.example', '');
  const { container } = render(<BrowserFavicon url="https://uncached.example" />);
  const fallback = container.querySelector(
    '.adl-browser-tree__link-fallback',
  ) as HTMLElement | null;
  expect(fallback).not.toBeNull();
  expect(fallback?.textContent).toBe('U');
  expect(fallback?.style.display).not.toBe('none');
});

it('shows empty placeholder (not letter/favicon) while meta fetch has not settled', () => {
  // 未缓存/未结算：空占位，避免"兜底字母 → 真实图标"的中间态跳动
  const { container } = render(<BrowserFavicon url="https://never-fetched.example" />);
  const fallback = container.querySelector(
    '.adl-browser-tree__link-fallback',
  ) as HTMLElement | null;
  expect(fallback).not.toBeNull();
  expect(fallback?.style.display).not.toBe('none');
  expect(fallback?.textContent).toBe('');
  expect(container.querySelector('.adl-browser-tree__favicon')).toBeNull();
});

it('image error does not remove cache (no removeCachedSiteMeta call)', () => {
  // 有 data-URI → img 渲染 → 触发错误 → degraded → img 卸载，但缓存不删除
  mirrorFavicon('https://err.example', 'https://err.example/favicon.ico', 'data:image/png;base64,AA');
  const removeSpy = vi.spyOn(cache, 'removeCachedSiteMeta').mockImplementation(() => {});
  const { container } = render(<BrowserFavicon url="https://err.example" />);
  const img = container.querySelector('.adl-browser-tree__favicon') as HTMLImageElement | null;
  expect(img).not.toBeNull();
  act(() => {
    fireEvent.error(img!);
  });
  expect(removeSpy).not.toHaveBeenCalled();
});

it('shows fallback when img load fails (degraded state)', () => {
  // 有 data-URI → img 渲染 → 触发错误 → degraded → img 卸载、占位可见
  mirrorFavicon('https://fail.example', 'https://fail.example/favicon.ico', 'data:image/png;base64,AA');
  const { container } = render(<BrowserFavicon url="https://fail.example" />);
  const img = container.querySelector('.adl-browser-tree__favicon') as HTMLImageElement | null;
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

it('recovers from degraded state when mirror updates bring a new data-URI', () => {
  // 有 data-URI → img 渲染 → 错误 → degraded → 镜像更新新 data-URI → 恢复
  mirrorFavicon('https://recover.example', 'https://recover.example/favicon.ico', 'data:image/png;base64,AA');
  const { container } = render(<BrowserFavicon url="https://recover.example" />);
  const img = container.querySelector('.adl-browser-tree__favicon') as HTMLImageElement | null;
  expect(img).not.toBeNull();
  // 加载失败 → degraded（img 卸载）
  act(() => {
    fireEvent.error(img!);
  });
  expect(container.querySelector('.adl-browser-tree__favicon')).toBeNull();
  // 镜像更新新 data-URI → 恢复
  mirrorFavicon('https://recover.example', 'https://cdn.example.com/favicon.ico', 'data:image/png;base64,BB');
  const img2 = container.querySelector('.adl-browser-tree__favicon') as HTMLImageElement | null;
  expect(img2).not.toBeNull();
  expect(img2?.src).toContain('data:image/png;base64,BB');
  const iconLink = container.querySelector(
    '.adl-browser-tree__link-fallback',
  ) as HTMLElement | null;
  expect(iconLink?.style.display).toBe('none');
});

it('stays degraded when a broadcast keeps the same data-URI (no remount flicker)', () => {
  // L6：data-URI 未变化时保持降级态，避免每次广播重挂 img → 失败 → 再降级的闪烁
  mirrorFavicon('https://same.example', 'https://same.example/favicon.ico', 'data:image/png;base64,AA');
  const { container } = render(<BrowserFavicon url="https://same.example" />);
  const img = container.querySelector('.adl-browser-tree__favicon') as HTMLImageElement | null;
  expect(img).not.toBeNull();
  act(() => {
    fireEvent.error(img!);
  });
  expect(container.querySelector('.adl-browser-tree__favicon')).toBeNull();
  // 相同 data-URI 的镜像广播 → faviconUrl 未变 → 保持降级，img 不重挂
  mirrorFavicon('https://same.example', 'https://same.example/favicon.ico', 'data:image/png;base64,AA');
  expect(container.querySelector('.adl-browser-tree__favicon')).toBeNull();
  const iconLink = container.querySelector(
    '.adl-browser-tree__link-fallback',
  ) as HTMLElement | null;
  expect(iconLink?.style.display).not.toBe('none');
});

it('renders the new-tab page icon for an empty URL (事项 4)', () => {
  // 新标签页（url=''）无站点 favicon → 内置"新标签页"图标（非空白占位）
  const { container } = render(<BrowserFavicon url="" />);
  expect(container.querySelector('svg.adl-icon')).not.toBeNull();
  expect(container.querySelector('.adl-browser-tree__favicon')).toBeNull();
});

it('renders the new-tab page icon for about:blank (事项 4)', () => {
  const { container } = render(<BrowserFavicon url="about:blank" />);
  expect(container.querySelector('svg.adl-icon')).not.toBeNull();
  expect(container.querySelector('.adl-browser-tree__favicon')).toBeNull();
});

it('does NOT render the new-tab page icon for a real URL (事项 4)', () => {
  const { container } = render(<BrowserFavicon url="https://real.example" />);
  expect(container.querySelector('svg.adl-icon')).toBeNull();
});
