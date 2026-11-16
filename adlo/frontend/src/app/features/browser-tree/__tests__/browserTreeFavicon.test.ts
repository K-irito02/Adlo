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

  it('saved-bookmark rows stay passive even when the node type is tab', () => {
    // 测试夹具/外部构造的节点仍可能带 nodeType:'tab' + isSavedBookmark；被动判定
    // 必须以 isSavedBookmark 优先（当前 buildBookmarkEntryNode 已只产出 'bookmark'）。
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

  it('passes the bookmark icon snapshot through for immediate rendering', () => {
    // 导入书签自带 ICON data-URI：树行首帧即可显示，避免每次展开先露首字母。
    expect(
      faviconPropsForNode(
        node({
          nodeType: 'bookmark',
          bookmarkId: 'b-1',
          iconUri: 'data:image/png;base64,AA',
        }),
      ),
    ).toEqual({
      url: 'https://example.com/',
      pending: 'initial',
      snapshot: 'data:image/png;base64,AA',
    });
  });
});
