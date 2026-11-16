import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { CopyDict } from '@i18n/types';
import { TCopyProvider } from '@i18n/TCopyContext';
import { BrowserTreeEntryFlatList } from '../BrowserTreeEntryFlatList';
import type { BrowserTreeNode } from '../types';

const t = new Proxy(
  {},
  {
    get: (_target, key: string) => key,
  },
) as unknown as CopyDict;

function flatNode(
  name: string,
  nodeType: BrowserTreeNode['nodeType'],
  url: string,
): BrowserTreeNode {
  return { path: `flat:${name}`, name, kind: 'file', children: [], nodeType, url };
}

function renderList(node: BrowserTreeNode) {
  return render(
    <TCopyProvider t={t} locale="en-US">
      <BrowserTreeEntryFlatList
        flatItems={[{ type: 'tab', node }]}
        selectedTreePath={null}
        onFlatTabClick={vi.fn()}
        onTabContextMenu={vi.fn()}
        onRefreshTab={vi.fn()}
      />
    </TCopyProvider>,
  );
}

function rowOf(container: HTMLElement): Element | null {
  return container.querySelector('.adl-filetree__row');
}

describe('BrowserTreeEntryFlatList favicon policy wiring', () => {
  it('renders bookmark result rows with the site initial instead of a spinner', () => {
    // 回归拦截（F1）：扁平/搜索结果行同样要把 pending='initial' 传给 BrowserFavicon
    const { container } = renderList(
      flatNode('收藏书签', 'bookmark', 'https://bookmark-flat-row.example/page'),
    );
    const row = rowOf(container);
    expect(row).not.toBeNull();
    expect(row?.querySelector('.adl-spinner')).toBeNull();
    expect(row?.querySelector('.adl-browser-tree__link-fallback')?.textContent).toBe('B');
  });

  it('keeps the spinner for live tab rows', () => {
    const { container } = renderList(flatNode('活标签', 'tab', 'https://live-flat-row.example/'));
    const row = rowOf(container);
    expect(row).not.toBeNull();
    expect(row?.querySelector('.adl-spinner')).not.toBeNull();
  });

  it('treats saved-bookmark rows typed as tab as passive', () => {
    // 测试夹具/外部构造的节点仍可能带 nodeType:'tab' + isSavedBookmark（当前
    // buildBookmarkEntryNode 已只产出 'bookmark'）；被动判定必须以 isSavedBookmark 优先。
    const { container } = renderList({
      ...flatNode('收藏结果', 'tab', 'https://saved-search-row.example/'),
      isSavedBookmark: true,
    });
    const row = rowOf(container);
    expect(row).not.toBeNull();
    expect(row?.querySelector('.adl-spinner')).toBeNull();
    expect(row?.querySelector('.adl-browser-tree__link-fallback')?.textContent).toBe('S');
  });
});
