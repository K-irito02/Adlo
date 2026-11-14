import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BrowserCategorySection } from '../BrowserCategorySection';
import type { BrowserCategoryState, BrowserTreeNode } from '../types';
import type { CopyDict } from '@i18n/types';
import { TCopyProvider } from '@i18n/TCopyContext';

// 缺失 key 回退为 key 名本身，测试断言用 key 名定位，不依赖具体文案。
const t = new Proxy(
  {},
  {
    get: (_target, key: string) => key,
  },
) as unknown as CopyDict;

const callbacks = {
  onCreateTab: vi.fn(),
  onDeleteAllChildTabs: vi.fn(),
  onDeleteOwnChildTabs: vi.fn(),
  onOpenAllInNewTabs: vi.fn(),
  onRemoveFromArea: vi.fn(),
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
  onOpenInCenter: vi.fn(),
  onOpenAllInCenter: vi.fn(),
  onRemoveBookmarkTab: vi.fn(),
};

function bookmarkNode(): BrowserTreeNode {
  // 外部导入 / 「仅保存」的书签：没有活标签页，只有 bookmarkId 与快照 URL。
  return {
    path: 'bookmark:imported-1',
    name: '商店 — XMRth',
    kind: 'file',
    children: [],
    nodeType: 'bookmark',
    bookmarkId: 'imported-1',
    url: 'https://xmrth.fun/user/shop',
    workspaceId: 'ws-1',
    isSavedBookmark: true,
  };
}

function tabNode(): BrowserTreeNode {
  return {
    path: 'tab:ws-1:t1',
    name: '活标签',
    kind: 'file',
    children: [],
    nodeType: 'tab',
    tabId: 't1',
    url: 'https://live.example/',
    workspaceId: 'ws-1',
  };
}

const folderWith = (child: BrowserTreeNode): BrowserTreeNode => ({
  path: 'folder:imported',
  name: '导入目录',
  kind: 'directory',
  nodeType: 'folder',
  folderId: 'imported',
  children: [child],
});

function renderExpandedFolder(child: BrowserTreeNode) {
  const category: BrowserCategoryState = {
    label: '自建目录',
    nodes: [folderWith(child)],
  };
  return render(
    <TCopyProvider t={t} locale="zh-CN">
      <BrowserCategorySection
        category={category}
        categoryType="userFolder"
        expandedPaths={{ 'folder:imported': true }}
        selectedTreePath={null}
        onSelectTreePath={vi.fn()}
        onTogglePath={vi.fn()}
        onOpenFile={vi.fn()}
        callbacks={callbacks}
        counts={new Map()}
      />
    </TCopyProvider>,
  );
}

function rowOf(container: HTMLElement, label: string): Element {
  const row = [...container.querySelectorAll('.adl-filetree__row')].find((candidate) =>
    candidate.textContent?.includes(label),
  );
  expect(row).toBeDefined();
  return row as Element;
}

describe('书签目录：没有活标签页的书签行', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('悬停时提供操作图标按钮（更多操作）', () => {
    const { container } = renderExpandedFolder(bookmarkNode());
    const row = rowOf(container, '商店 — XMRth');
    expect(row.querySelector('[aria-label="browserContextMore"]')).not.toBeNull();
  });

  it('右键打开菜单卡片并包含打开等条目', () => {
    const { container } = renderExpandedFolder(bookmarkNode());
    const row = rowOf(container, '商店 — XMRth');
    fireEvent.contextMenu(row, { clientX: 40, clientY: 60 });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('browserContextOpenCurrent')).toBeInTheDocument();
  });

  it('书签行悬停「刷新」按钮按 URL 刷新（无 tabId 也能生效）', () => {
    const { container } = renderExpandedFolder(bookmarkNode());
    const row = rowOf(container, '商店 — XMRth');
    fireEvent.click(row.querySelector('[aria-label="browserRefreshMeta"]')!);
    expect(callbacks.onRefreshTab).toHaveBeenCalledWith(undefined, 'https://xmrth.fun/user/shop');
  });

  it('点击悬停「更多操作」按钮同样打开菜单卡片', () => {
    const { container } = renderExpandedFolder(bookmarkNode());
    const row = rowOf(container, '商店 — XMRth');
    const more = row.querySelector('[aria-label="browserContextMore"]') as HTMLElement | null;
    expect(more).not.toBeNull();
    fireEvent.click(more!);
    expect(document.querySelector('[data-menu-id="browser-child-menu"]')).not.toBeNull();
    expect(screen.getByText('browserContextOpenCurrent')).toBeInTheDocument();
  });

  it('右键菜单包含「在中心打开」，点击后以书签 URL 打开到中心', () => {
    const { container } = renderExpandedFolder(bookmarkNode());
    const row = rowOf(container, '商店 — XMRth');
    fireEvent.contextMenu(row, { clientX: 40, clientY: 60 });
    fireEvent.click(screen.getByText('centerTabOpenInCenter'));
    expect(callbacks.onOpenInCenter).toHaveBeenCalledWith('https://xmrth.fun/user/shop', undefined);
  });

  it('目录右键菜单包含「全部在中心打开」，并回传目录节点路径', () => {
    const { container } = renderExpandedFolder(bookmarkNode());
    const header = container.querySelector('.adl-browser-entry__header') as HTMLElement;
    fireEvent.contextMenu(header, { clientX: 30, clientY: 40 });
    fireEvent.click(screen.getByText('centerTabOpenAllInCenter'));
    expect(callbacks.onOpenAllInCenter).toHaveBeenCalledWith('userFolder', 'folder:imported');
  });

  it('菜单删除会走「移除书签条目」而不是删除标签页', () => {
    const { container } = renderExpandedFolder(bookmarkNode());
    const row = rowOf(container, '商店 — XMRth');
    fireEvent.contextMenu(row, { clientX: 40, clientY: 60 });
    fireEvent.click(screen.getByText('browserContextDelete'));
    expect(callbacks.onRemoveBookmarkTab).toHaveBeenCalledWith(
      'imported-1',
      'https://xmrth.fun/user/shop',
    );
  });

  it('反向守护：活标签行仍能右键打开菜单', () => {
    const { container } = renderExpandedFolder(tabNode());
    const row = rowOf(container, '活标签');
    fireEvent.contextMenu(row, { clientX: 40, clientY: 60 });
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});
