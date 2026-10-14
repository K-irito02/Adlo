import { describe, it, expect, vi } from 'vitest';
import { getChildNodeMoreMenuItems, getTabContextMenuItems } from './browserEntrySubEntriesUtils';
import type { CopyDict } from '@i18n';
import type { BrowserTreeNode } from './types';

function makeCallbacks() {
  return {
    onCreateTab: vi.fn(),
    onOpenAllInNewTabs: vi.fn(),
    onDeleteAllChildTabs: vi.fn(),
    onDeleteOwnChildTabs: vi.fn(),
    onDeleteDirectory: vi.fn(),
    onRenameDirectory: vi.fn(),
    onRemoveFromArea: vi.fn(),
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
  browserContextRename: '重命名',
  browserContextDeleteAllTabs: '删除全部',
  nestedBadge: '嵌套',
  browserContextDeleteSelfTabs: '删除自身',
  browserContextDeleteDir: '删除目录',
  browserDeleteAllTabsHint: 'h',
  browserDeleteSelfTabsHint: 'h',
  browserDeleteDirHint: 'h',
} as unknown as CopyDict;

describe('getChildNodeMoreMenuItems', () => {
  it('adds create-bookmark item for nested folder node', () => {
    const callbacks = makeCallbacks();
    const items = getChildNodeMoreMenuItems('folder', 'userFolder', 'folder:f1', callbacks, t);
    const item = items.find((i) => i.id === 'create-bookmark')!;
    expect(item).toBeDefined();
    expect(item.label).toBe('新建书签');
    item.action();
    expect(callbacks.onCreateTab).toHaveBeenCalledWith(undefined, 'f1');
  });

  it('forwards workspaceId to onCreateTab when provided', () => {
    const callbacks = makeCallbacks();
    const items = getChildNodeMoreMenuItems(
      'folder',
      'workspace',
      'folder:f1',
      callbacks,
      t,
      'ws1',
    );
    const item = items.find((i) => i.id === 'create-bookmark')!;
    expect(item).toBeDefined();
    item.action();
    expect(callbacks.onCreateTab).toHaveBeenCalledWith('ws1', 'f1');
  });

  it('does not add create-bookmark item for history day node', () => {
    const callbacks = makeCallbacks();
    const items = getChildNodeMoreMenuItems('day', 'history', 'history:2026-08', callbacks, t);
    const item = items.find((i) => i.id === 'create-bookmark');
    expect(item).toBeUndefined();
  });

  it('delete-all-tabs carries nested badge instead of [嵌套] suffix (事项 5)', () => {
    const callbacks = makeCallbacks();
    const items = getChildNodeMoreMenuItems('folder', 'userFolder', 'folder:f1', callbacks, t);
    const item = items.find((i) => i.id === 'delete-all-tabs')!;
    expect(item.label).not.toContain('[嵌套]');
    expect(item.badge).toBe('嵌套');
  });
});

describe('getTabContextMenuItems open-new title isolation', () => {
  function tabNode(partial: Partial<BrowserTreeNode>): BrowserTreeNode {
    return {
      path: 'p',
      name: 'Snapshot Title',
      kind: 'file',
      children: [],
      nodeType: 'tab',
      url: 'https://example.com',
      ...partial,
    };
  }

  it('open-new passes undefined title for saved bookmark nodes', () => {
    const callbacks = makeCallbacks();
    const items = getTabContextMenuItems(tabNode({ isSavedBookmark: true }), callbacks, t, true);
    const item = items.find((i) => i.id === 'open-new')!;
    expect(item).toBeDefined();
    item.action();
    expect(callbacks.onOpenTabInNewTab).toHaveBeenCalledWith('https://example.com', undefined);
  });

  it('open-new passes node.name for normal tab nodes', () => {
    const callbacks = makeCallbacks();
    const items = getTabContextMenuItems(tabNode({ isSavedBookmark: false }), callbacks, t, false);
    const item = items.find((i) => i.id === 'open-new')!;
    expect(item).toBeDefined();
    item.action();
    expect(callbacks.onOpenTabInNewTab).toHaveBeenCalledWith(
      'https://example.com',
      'Snapshot Title',
    );
  });
});
