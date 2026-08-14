import { describe, it, expect, vi } from 'vitest';
import { getChildNodeMoreMenuItems } from './browserEntrySubEntriesUtils';
import type { CopyDict } from '@i18n';

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

  it('does not add create-bookmark item for history day node', () => {
    const callbacks = makeCallbacks();
    const items = getChildNodeMoreMenuItems('day', 'history', 'history:2026-08', callbacks, t);
    const item = items.find((i) => i.id === 'create-bookmark');
    expect(item).toBeUndefined();
  });
});
