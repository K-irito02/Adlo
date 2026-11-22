import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShortcutCard } from './ShortcutCard';
import type { ShortcutSite } from '@stores/slices/browserSlice';
import { __mirrorUpsertForTest, removeCachedSiteMeta } from '@utils/siteMetaCache';
import { __resetFaviconDisplayCacheForTest } from '@components/faviconDisplayCache';
import { ensureSiteFavicon } from '../faviconSelfHeal';

vi.mock('../faviconSelfHeal', () => ({
  ensureSiteFavicon: vi.fn(),
  ensureSiteFaviconHttp: vi.fn(),
}));

const site: ShortcutSite = {
  id: 'shortcut-1',
  name: '源码仓库',
  url: 'https://gitee.com/K_irito/Adlo',
  sortOrder: 0,
  createdAt: 0,
};

function renderCard(target: ShortcutSite = site) {
  return render(
    <ShortcutCard
      site={target}
      _index={0}
      isDragOver={false}
      onDragStart={vi.fn()}
      onDragOver={vi.fn()}
      onDragEnd={vi.fn()}
      onDrop={vi.fn()}
      onContextMenu={vi.fn()}
      onClick={vi.fn()}
    />,
  );
}

beforeEach(() => {
  vi.mocked(ensureSiteFavicon).mockClear();
  __resetFaviconDisplayCacheForTest();
  // 站点元数据镜像跨用例共享：清掉本文件写入的 URL，避免上一条用例的 data-URI 泄漏。
  removeCachedSiteMeta(site.url);
});

describe('ShortcutCard favicon', () => {
  it('renders the real site icon once the shared mirror has a data-URI', () => {
    act(() => {
      __mirrorUpsertForTest(site.url, {
        title: 'Adlo',
        titleSource: 'com',
        faviconUrl: 'https://gitee.com/favicon.ico',
        faviconDataUri: 'data:image/png;base64,SHORTCUT',
        fetchedAt: 1,
        lastOkAt: 1,
        nextRetryAt: 0,
        failCount: 0,
      });
    });
    const { container } = renderCard();
    const img = container.querySelector('.adl-browser-tree__favicon') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.src).toContain('data:image/png;base64,SHORTCUT');
    expect(container.querySelector('.adl-browser-tree__link-fallback')?.textContent).toBe('');
    // 挂载即请求补抓（内部再判"已有图标就跳过"），这里只锁调用契约。
    expect(ensureSiteFavicon).toHaveBeenCalledWith(site.url);
  });

  it('requests a favicon backfill on mount and falls back to the name initial meanwhile', () => {
    const { container } = renderCard();
    expect(ensureSiteFavicon).toHaveBeenCalledWith(site.url);
    const fallback = container.querySelector('.adl-browser-tree__link-fallback');
    expect(fallback?.textContent).toBe('源');
  });
});
