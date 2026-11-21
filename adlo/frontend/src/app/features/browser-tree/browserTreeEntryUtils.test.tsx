import { describe, it, expect, vi } from 'vitest';
import {
  buildFlatTabItems,
  getEntryHoverButtons,
  getEntryMoreMenuItems,
} from './browserTreeEntryUtils';
import type { CopyDict } from '@i18n';
import type { BrowserTreeNode } from './types';
import { browserZh } from '@i18n/zh-CN/browser';

function makeTabNode(tabId: string, name: string): BrowserTreeNode {
  return {
    name,
    path: `tab:${tabId}`,
    kind: 'file',
    nodeType: 'tab',
    tabId,
    url: `https://${name}.example`,
    children: [],
  };
}

function makeDirNode(name: string, path: string, children: BrowserTreeNode[]): BrowserTreeNode {
  return {
    name,
    path,
    kind: 'directory',
    nodeType: 'folder',
    children,
  };
}

describe('buildFlatTabItems', () => {
  it('returns all direct tabs', () => {
    const root = makeDirNode('root', 'root', [
      makeTabNode('t1', 'Tab1'),
      makeTabNode('t2', 'Tab2'),
    ]);
    const result = buildFlatTabItems(root, false);
    expect(result.filter((r) => r.type === 'tab')).toHaveLength(2);
  });

  it('keeps a separator for a directory with tabs when enabled', () => {
    const dir = makeDirNode('OpenDir', 'dir', [
      makeTabNode('t1', 'Tab1'),
      makeTabNode('t2', 'Tab2'),
    ]);
    const root = makeDirNode('root', 'root', [dir]);
    const result = buildFlatTabItems(root, true);
    expect(result.filter((r) => r.type === 'separator')).toHaveLength(1);
    expect(result.filter((r) => r.type === 'tab')).toHaveLength(2);
  });

  it('recursively includes nested directories', () => {
    const nested = makeDirNode('Inner', 'outer/inner', [makeTabNode('t1', 'Tab1')]);
    const outer = makeDirNode('Outer', 'outer', [nested]);
    const root = makeDirNode('root', 'root', [outer]);
    const result = buildFlatTabItems(root, true);
    expect(result.filter((r) => r.type === 'tab')).toHaveLength(1);
    expect(result.filter((r) => r.type === 'separator').map((r) => r.label)).toEqual([
      'Outer/Inner',
    ]);
  });
});

function makeCallbacks() {
  return {
    onCreateTab: vi.fn(),
    onOpenAllInNewTabs: vi.fn(),
    onRemoveFromArea: vi.fn(),
    onDeleteAllChildTabs: vi.fn(),
    onDeleteOwnChildTabs: vi.fn(),
    onDeleteDirectory: vi.fn(),
    onRenameDirectory: vi.fn(),
    onDeleteHistory: vi.fn(),
    onOpenTab: vi.fn(),
    onRefreshTab: vi.fn(),
    onEditTab: vi.fn(),
    onDeleteTab: vi.fn(),
    onCopyTabLink: vi.fn(),
    onOpenTabInNewTab: vi.fn(),
    onOpenTabInCurrentTab: vi.fn(),
  };
}

const t = {
  browserContextCreateBookmark: '新建书签',
  browserContextOpenAllNewTabs: '全部打开',
  workspaceRemoveEntry: '移出该工作区',
  workspaceRemoveEntryHint: 'h',
  browserContextRename: '重命名',
  browserContextMore: '更多',
  browserContextDeleteAllTabs: '删除全部',
  nestedBadge: '嵌套',
  browserContextDeleteSelfTabs: '删除自身',
  browserContextDeleteDir: '删除目录',
  browserContextDeleteAllHistory: '删除全部历史记录',
  browserDeleteAllTabsHint: 'h',
  browserDeleteSelfTabsHint: 'h',
  browserDeleteDirHint: 'h',
} as unknown as CopyDict;

describe('getEntryMoreMenuItems', () => {
  it('adds create-bookmark item for workspace node', () => {
    const callbacks = makeCallbacks();
    const items = getEntryMoreMenuItems('workspace', 'workspace', 'workspace:ws1', callbacks, t);
    const item = items.find((i) => i.id === 'create-bookmark')!;
    expect(item).toBeDefined();
    expect(item.label).toBe('新建书签');
    item.action();
    expect(callbacks.onCreateTab).toHaveBeenCalledWith('ws1', undefined);
  });

  it('adds create-bookmark item for folder node', () => {
    const callbacks = makeCallbacks();
    const items = getEntryMoreMenuItems('folder', 'userFolder', 'folder:f1', callbacks, t);
    const item = items.find((i) => i.id === 'create-bookmark')!;
    expect(item).toBeDefined();
    item.action();
    expect(callbacks.onCreateTab).toHaveBeenCalledWith(undefined, 'f1');
  });

  it('delete-all-tabs carries nested badge instead of [嵌套] suffix (事项 5)', () => {
    const callbacks = makeCallbacks();
    const items = getEntryMoreMenuItems('folder', 'userFolder', 'folder:f1', callbacks, t);
    const item = items.find((i) => i.id === 'delete-all-tabs')!;
    expect(item.label).not.toContain('[嵌套]');
    expect(item.badge).toBe('嵌套');
  });

  it('历史记录顶层不再提供右键菜单（含失效的年/月/日删除项）', () => {
    const callbacks = makeCallbacks();
    expect(getEntryMoreMenuItems('history', 'history', 'history:root', callbacks, t)).toEqual([]);
  });
});

describe('getEntryHoverButtons', () => {
  it('history 子目录不使用顶层悬停按钮（由 getChildNodeHoverButtons 接管）', () => {
    const btns = getEntryHoverButtons('year', 'history', t);
    expect(btns).toEqual([]);
  });

  it('历史记录顶层只显示「删除全部历史记录」按钮，不再显示更多操作', () => {
    const btns = getEntryHoverButtons('history', 'history', t);
    expect(btns.map((b) => b.id)).toEqual(['delete-history-label']);
    expect(btns[0].label).toBe(t.browserContextDeleteAllHistory);
  });

  it('历史记录顶层文案统一为「删除全部历史记录」', () => {
    expect(browserZh.browserContextDeleteAllHistory).toBe('删除全部历史记录');
  });

  it('non-workspace/folder node type returns only the more button', () => {
    const btns = getEntryHoverButtons('tab', 'workspace', t);
    expect(btns.map((b) => b.id)).toEqual(['more']);
  });

  it('workspace node returns create-bookmark and more', () => {
    const btns = getEntryHoverButtons('workspace', 'workspace', t);
    expect(btns.map((b) => b.id)).toEqual(['create-bookmark', 'more']);
  });

  it('folder node returns create-bookmark and more', () => {
    const btns = getEntryHoverButtons('folder', 'userFolder', t);
    expect(btns.map((b) => b.id)).toEqual(['create-bookmark', 'more']);
  });
});
