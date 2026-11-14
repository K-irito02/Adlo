import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import type { CopyDict } from '@i18n/types';
import { TCopyProvider } from '@i18n/TCopyContext';
import { BrowserTreeEntryFlatList, FLAT_LIST_PAGE_SIZE } from '../BrowserTreeEntryFlatList';
import type { BrowserTreeNode } from '../types';
import type { FlatItem } from '../browserTreeEntryUtils';

const t = new Proxy(
  {},
  {
    get: (_target, key: string) => key,
  },
) as unknown as CopyDict;

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  readonly callback: IntersectionObserverCallback;
  readonly observed: Element[] = [];

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  observe(el: Element) {
    this.observed.push(el);
  }

  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  trigger() {
    this.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

function makeItems(count: number): FlatItem[] {
  return Array.from({ length: count }, (_, index) => {
    const node: BrowserTreeNode = {
      path: `flat:${index}`,
      name: `书签 ${index}`,
      kind: 'file',
      children: [],
      nodeType: 'bookmark',
      bookmarkId: `b-${index}`,
      url: `https://flat-${index}.example/`,
      isSavedBookmark: true,
    };
    return { type: 'tab', node };
  });
}

function renderList(flatItems: FlatItem[], selectedTreePath: string | null = null) {
  return render(
    <TCopyProvider t={t} locale="zh-CN">
      <BrowserTreeEntryFlatList
        flatItems={flatItems}
        selectedTreePath={selectedTreePath}
        onFlatTabClick={vi.fn()}
        onTabContextMenu={vi.fn()}
        onRefreshTab={vi.fn()}
      />
    </TCopyProvider>,
  );
}

beforeEach(() => {
  MockIntersectionObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BrowserTreeEntryFlatList 窗口化', () => {
  it('首屏只渲染一页，哨兵进入视口后追加下一页', () => {
    const { container } = renderList(makeItems(100));
    expect(container.querySelectorAll('.adl-filetree__row')).toHaveLength(FLAT_LIST_PAGE_SIZE);
    expect(container.querySelector('.adl-browser-entry__flat-sentinel')).not.toBeNull();

    const observer = MockIntersectionObserver.instances.at(-1)!;
    act(() => observer.trigger());
    expect(container.querySelectorAll('.adl-filetree__row')).toHaveLength(100);
  });

  it('数据量小于一页时全部渲染，不输出哨兵', () => {
    const { container } = renderList(makeItems(10));
    expect(container.querySelectorAll('.adl-filetree__row')).toHaveLength(10);
    expect(container.querySelector('.adl-browser-entry__flat-sentinel')).toBeNull();
  });

  it('同长度的数据变化也重置回一页', () => {
    const { container, rerender } = renderList(makeItems(90));
    const observer = MockIntersectionObserver.instances.at(-1)!;
    act(() => observer.trigger());
    // 90 条在追加一页后已全部展开（哨兵消失）
    expect(container.querySelectorAll('.adl-filetree__row')).toHaveLength(90);

    rerender(
      <TCopyProvider t={t} locale="zh-CN">
        <BrowserTreeEntryFlatList
          flatItems={makeItems(90).map((item, index) =>
            item.type === 'tab'
              ? { ...item, node: { ...item.node, path: `replaced:${index}` } }
              : item,
          )}
          selectedTreePath={null}
          onFlatTabClick={vi.fn()}
          onTabContextMenu={vi.fn()}
          onRefreshTab={vi.fn()}
        />
      </TCopyProvider>,
    );
    expect(container.querySelectorAll('.adl-filetree__row')).toHaveLength(FLAT_LIST_PAGE_SIZE);
  });

  it('内容相同的重建（元数据刷新）不重置窗口', () => {
    const { container, rerender } = renderList(makeItems(90));
    act(() => MockIntersectionObserver.instances.at(-1)!.trigger());
    expect(container.querySelectorAll('.adl-filetree__row')).toHaveLength(90);

    // 树在站点元数据更新时整棵重建：数组身份变化、路径不变 → 窗口保持
    rerender(
      <TCopyProvider t={t} locale="zh-CN">
        <BrowserTreeEntryFlatList
          flatItems={makeItems(90).map((item) =>
            item.type === 'tab'
              ? { ...item, node: { ...item.node, name: `${item.node.name}!` } }
              : item,
          )}
          selectedTreePath={null}
          onFlatTabClick={vi.fn()}
          onTabContextMenu={vi.fn()}
          onRefreshTab={vi.fn()}
        />
      </TCopyProvider>,
    );
    expect(container.querySelectorAll('.adl-filetree__row')).toHaveLength(90);
  });

  it('选中项在窗口之外时仍纳入渲染，并暴露 setsize/posinset', () => {
    const items = makeItems(90);
    const { container } = renderList(items, 'flat:85');
    expect(container.querySelectorAll('.adl-filetree__row').length).toBeGreaterThan(
      FLAT_LIST_PAGE_SIZE,
    );
    const selectedRow = container.querySelector('[data-path="flat:85"]');
    expect(selectedRow).not.toBeNull();
    expect(selectedRow?.getAttribute('aria-setsize')).toBe('90');
    expect(selectedRow?.getAttribute('aria-posinset')).toBe('86');
  });
});
