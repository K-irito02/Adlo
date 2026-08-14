import { describe, it, expect, vi } from 'vitest';
import { buildFlatTabItems, getEntryMoreMenuItems } from './browserTreeEntryUtils';
import type { CopyDict } from '@i18n';
import type { BrowserTreeNode } from './types';

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

describe('buildFlatTabItems with filterTabIds', () => {
  it('returns all tabs when no filter is provided', () => {
    const root = makeDirNode('root', 'root', [
      makeTabNode('t1', 'Tab1'),
      makeTabNode('t2', 'Tab2'),
    ]);
    const result = buildFlatTabItems(root, false);
    expect(result.filter((r) => r.type === 'tab')).toHaveLength(2);
  });

  it('filters to only tabs in filterTabIds set', () => {
    const root = makeDirNode('root', 'root', [
      makeTabNode('t1', 'Tab1'),
      makeTabNode('t2', 'Tab2'),
      makeTabNode('t3', 'Tab3'),
    ]);
    const filterTabIds = new Set(['t1', 't3']);
    const result = buildFlatTabItems(root, false, filterTabIds);
    const tabs = result.filter((r) => r.type === 'tab');
    expect(tabs).toHaveLength(2);
    const tabIds = tabs.map((t) => (t.type === 'tab' ? t.node.tabId : null));
    expect(tabIds).toEqual(['t1', 't3']);
  });

  it('skips empty directories when filtering', () => {
    const dir = makeDirNode('EmptyDir', 'dir', [makeTabNode('t1', 'Tab1')]);
    const root = makeDirNode('root', 'root', [dir]);
    const filterTabIds = new Set(['t2']);
    const result = buildFlatTabItems(root, true, filterTabIds);
    expect(result.filter((r) => r.type === 'tab')).toHaveLength(0);
  });

  it('keeps separator for directory with open tabs', () => {
    const dir = makeDirNode('OpenDir', 'dir', [
      makeTabNode('t1', 'Tab1'),
      makeTabNode('t2', 'Tab2'),
    ]);
    const root = makeDirNode('root', 'root', [dir]);
    const filterTabIds = new Set(['t1']);
    const result = buildFlatTabItems(root, true, filterTabIds);
    expect(result.filter((r) => r.type === 'separator')).toHaveLength(1);
    expect(result.filter((r) => r.type === 'tab')).toHaveLength(1);
  });

  it('skips separator for directory with no open tabs after filtering', () => {
    const dir = makeDirNode('ClosedDir', 'dir', [
      makeTabNode('t1', 'Tab1'),
      makeTabNode('t2', 'Tab2'),
    ]);
    const root = makeDirNode('root', 'root', [dir]);
    const filterTabIds = new Set(['t3']);
    const result = buildFlatTabItems(root, true, filterTabIds);
    expect(result).toHaveLength(0);
  });

  it('recursively filters nested directories', () => {
    const nested = makeDirNode('Inner', 'outer/inner', [makeTabNode('t1', 'Tab1')]);
    const outer = makeDirNode('Outer', 'outer', [nested]);
    const root = makeDirNode('root', 'root', [outer]);
    const filterTabIds = new Set(['t1']);
    const result = buildFlatTabItems(root, true, filterTabIds);
    expect(result.filter((r) => r.type === 'tab')).toHaveLength(1);
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
  browserContextRemoveFromView: '移除',
  browserContextRename: '重命名',
  browserContextDeleteAllTabs: '删除全部',
  browserContextDeleteSelfTabs: '删除自身',
  browserContextDeleteDir: '删除目录',
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
});
