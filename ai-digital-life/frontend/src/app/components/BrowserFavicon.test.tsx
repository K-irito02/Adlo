import { render, act, fireEvent } from '@testing-library/react';
import { it, expect, vi, beforeEach } from 'vitest';
import { BrowserFavicon } from './BrowserFavicon';
import * as cache from '../utils/siteMetaCache';
import * as pageMeta from '../utils/pageMetaClient';

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

it('renders site initial letter as the ultimate fallback once meta resolved with no favicon', () => {
  // 已结算仍是空图标 → 显示兜底字母；未结算时装空占位（见上一用例）
  mirrorFavicon('https://uncached.example', '');
  const { container } = render(<BrowserFavicon url="https://uncached.example" />);
  const fallback = container.querySelector(
    '.adl-browser-tree__link-fallback',
  ) as HTMLElement | null;
  expect(fallback).not.toBeNull();
  expect(fallback?.textContent).toBe('U');
  expect(fallback?.style.display).not.toBe('none');
});

it('stays degraded when a broadcast keeps the same faviconUrl (no remount flicker)', () => {
  // L6：faviconUrl 未变化时保持降级态，避免每次广播重挂 img → 404 → 再降级的闪烁
  mirrorFavicon('https://same.example', 'https://same.example/favicon.ico');
  const { container } = render(<BrowserFavicon url="https://same.example" />);
  const img = container.querySelector('.adl-browser-tree__favicon') as HTMLImageElement | null;
  expect(img).not.toBeNull();
  act(() => {
    fireEvent.error(img!);
  });
  expect(container.querySelector('.adl-browser-tree__favicon')).toBeNull();
  // 相同 faviconUrl 的镜像广播 → faviconUrl 未变 → 保持降级，img 不重挂
  mirrorFavicon('https://same.example', 'https://same.example/favicon.ico');
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

it('triggers data-URI backfill via pageMetaClient.get with force when favicon is external (missing data-URI)', async () => {
  const getSpy = vi.spyOn(pageMeta.pageMetaClient, 'get').mockResolvedValue(null);
  mirrorFavicon('https://youtube.com', 'https://www.youtube.com/favicon.ico');
  render(<BrowserFavicon url="https://youtube.com" />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(getSpy).toHaveBeenCalledWith('https://youtube.com', { force: true });
});

it('does NOT trigger backfill when favicon is a data-URI', async () => {
  const getSpy = vi.spyOn(pageMeta.pageMetaClient, 'get').mockResolvedValue(null);
  mirrorFavicon('https://cached.example', 'https://cached.example/favicon.ico', 'data:image/png;base64,AA');
  render(<BrowserFavicon url="https://cached.example" />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(getSpy).not.toHaveBeenCalled();
});

it('does NOT trigger backfill when no favicon cached at all', async () => {
  const getSpy = vi.spyOn(pageMeta.pageMetaClient, 'get').mockResolvedValue(null);
  render(<BrowserFavicon url="https://empty.example" />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(getSpy).not.toHaveBeenCalled();
});
