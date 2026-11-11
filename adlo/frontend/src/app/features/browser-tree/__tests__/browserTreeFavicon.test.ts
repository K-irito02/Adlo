import { describe, it, expect } from 'vitest';
import { faviconPropsForNode } from '../browserTreeFavicon';
import type { BrowserTreeNode } from '../types';

function node(over: Partial<BrowserTreeNode>): BrowserTreeNode {
  return {
    path: 'p',
    name: 'n',
    kind: 'file',
    children: [],
    nodeType: 'tab',
    url: 'https://example.com/',
    ...over,
  };
}

describe('faviconPropsForNode', () => {
  it('live tab rows keep the spinner policy', () => {
    // 打开的标签页有在途元数据抓取，转圈是有意义的
    expect(faviconPropsForNode(node({ nodeType: 'tab', tabId: 'tab-1' }))).toEqual({
      url: 'https://example.com/',
      pending: 'spinner',
    });
  });

  it('bookmark rows use the initial policy', () => {
    // 书签行是被动列表：不转圈，直接首字母
    expect(faviconPropsForNode(node({ nodeType: 'bookmark', bookmarkId: 'b-1' }))).toEqual({
      url: 'https://example.com/',
      pending: 'initial',
    });
  });

  it('history rows use the initial policy', () => {
    expect(faviconPropsForNode(node({ nodeType: 'history', tabId: 'h-1' }))).toEqual({
      url: 'https://example.com/',
      pending: 'initial',
    });
  });

  it('saved-bookmark rows stay passive even when the node type is tab (search results)', () => {
    // BrowserNavSearchMode 的纯收藏结果节点 type 仍是 tab，但并无活标签
    expect(
      faviconPropsForNode(node({ nodeType: 'tab', isSavedBookmark: true, tabId: 'b-1' })),
    ).toEqual({ url: 'https://example.com/', pending: 'initial' });
  });

  it('falls back to an empty URL when the node has none', () => {
    expect(faviconPropsForNode(node({ nodeType: 'bookmark', url: undefined }))).toEqual({
      url: '',
      pending: 'initial',
    });
  });
});
