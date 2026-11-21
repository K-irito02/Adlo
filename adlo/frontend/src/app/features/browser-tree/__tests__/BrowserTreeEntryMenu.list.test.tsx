import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { TCopyProvider } from '@i18n/TCopyContext';
import type { CopyDict } from '@i18n/types';
import { BrowserTreeEntry } from '../BrowserTreeEntry';
import type { BrowserTreeNode } from '../types';

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

function folderWith(children: BrowserTreeNode[]): BrowserTreeNode {
  return {
    path: 'folder:list',
    name: '列表目录',
    kind: 'directory',
    nodeType: 'folder',
    folderId: 'list',
    children,
  };
}

function renderListFolder(children: BrowserTreeNode[]) {
  return render(
    <TCopyProvider t={t} locale="zh-CN">
      <BrowserTreeEntry
        node={folderWith(children)}
        categoryType="userFolder"
        expandedPaths={{ 'folder:list': true }}
        selectedTreePath={null}
        onSelectTreePath={vi.fn()}
        onTogglePath={vi.fn()}
        onOpenFile={vi.fn()}
        callbacks={callbacks}
        counts={new Map()}
        browserViewMode="list"
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

function openMenu(container: HTMLElement, label: string) {
  const row = rowOf(container, label);
  const rect = row.getBoundingClientRect();
  fireEvent.contextMenu(row, { clientX: rect.left + 20, clientY: rect.top + 8 });
  return document.querySelector('[data-menu-id="browser-tab-context-menu"]') as HTMLElement;
}

const savedBookmark: BrowserTreeNode = {
  path: 'bookmark:saved',
  name: '已保存书签',
  kind: 'file',
  children: [],
  nodeType: 'bookmark',
  bookmarkId: 'saved-1',
  url: 'https://saved.example/',
  isSavedBookmark: true,
};
const liveTab: BrowserTreeNode = {
  path: 'tab:live',
  name: '活标签',
  kind: 'file',
  children: [],
  nodeType: 'tab',
  tabId: 'live-1',
  url: 'https://live.example/',
};
const historyRow: BrowserTreeNode = {
  path: 'history-entry:1',
  name: '历史条目',
  kind: 'file',
  children: [],
  nodeType: 'history',
  tabId: 'h-1',
  url: 'https://history.example/',
};

describe('书签列表右键菜单（列表模式）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('已保存书签「取消收藏」只移除当前条目，不按 URL 清理全部副本', () => {
    const { container } = renderListFolder([savedBookmark]);
    const menu = openMenu(container, '已保存书签');
    const item = [...menu.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('browserUnbookmark'),
    );
    expect(item).toBeDefined();
    fireEvent.click(item!);
    expect(callbacks.onRemoveBookmarkTab).toHaveBeenCalledWith('saved-1', 'https://saved.example/');
  });

  it('活标签行有「在中心显示」，历史行不出现', () => {
    const { container } = renderListFolder([liveTab, historyRow]);

    const liveMenu = openMenu(container, '活标签');
    expect(liveMenu.textContent).toContain('centerTabShowInCenter');
    expect(liveMenu.textContent).toContain('centerTabOpenInCenter');
    // 「显示」必须在危险项「删除」之前，避免菜单末尾出现「删除 → 显示」。
    const liveText = liveMenu.textContent ?? '';
    expect(liveText.indexOf('centerTabShowInCenter')).toBeLessThan(
      liveText.indexOf('browserContextDelete'),
    );

    const historyMenu = openMenu(container, '历史条目');
    expect(historyMenu.textContent).toContain('centerTabOpenInCenter');
    expect(historyMenu.textContent).not.toContain('centerTabShowInCenter');
  });
});

describe('历史记录顶层（树模式）', () => {
  function renderHistoryRoot(expandedPaths: Record<string, boolean> = {}) {
    const onDeleteHistory = vi.fn();
    const onTogglePath = vi.fn();
    const view = render(
      <TCopyProvider t={t} locale="zh-CN">
        <BrowserTreeEntry
          node={{
            path: 'history:root',
            name: '历史记录',
            kind: 'directory',
            nodeType: 'history',
            children: [],
          }}
          categoryType="history"
          expandedPaths={expandedPaths}
          selectedTreePath={null}
          onSelectTreePath={vi.fn()}
          onTogglePath={onTogglePath}
          onOpenFile={vi.fn()}
          callbacks={{ ...callbacks, onDeleteHistory }}
          counts={new Map()}
        />
      </TCopyProvider>,
    );
    return { ...view, onDeleteHistory, onTogglePath };
  }

  it('悬停只显示「删除全部历史记录」按钮，点击删除全部', () => {
    const { container, onDeleteHistory } = renderHistoryRoot();
    const deleteBtn = container.querySelector(
      '[aria-label="browserContextDeleteAllHistory"]',
    ) as HTMLButtonElement;
    expect(deleteBtn).not.toBeNull();
    expect(container.querySelector('[aria-label="browserContextMore"]')).toBeNull();
    fireEvent.click(deleteBtn);
    expect(onDeleteHistory).toHaveBeenCalledWith('label', 'history:root');
  });

  it('右键不打开菜单卡片', () => {
    const { container } = renderHistoryRoot();
    const header = container.querySelector('.adl-browser-entry__header') as HTMLElement;
    fireEvent.contextMenu(header, { clientX: 10, clientY: 10 });
    expect(document.querySelector('[data-menu-id="browser-entry-menu-history:root"]')).toBeNull();
  });

  it('空历史时默认展开并显示「暂无历史记录」空态', () => {
    const { container } = renderHistoryRoot();
    expect(container.textContent).toContain('browserCategoryEmptyHistory');
  });

  it('空历史即使持久化为折叠也强制展开（决策 5）', () => {
    const { container } = renderHistoryRoot({ 'history:root': false });
    expect(container.textContent).toContain('browserCategoryEmptyHistory');
  });

  it('空历史顶层头部与折叠按钮不再翻转持久化折叠值', () => {
    const { container, onTogglePath } = renderHistoryRoot({ 'history:root': false });
    const header = container.querySelector('.adl-browser-entry__header') as HTMLElement;
    const expandBtn = container.querySelector(
      '.adl-browser-entry__expand-btn',
    ) as HTMLButtonElement;

    fireEvent.click(expandBtn);
    fireEvent.click(header);

    expect(onTogglePath).not.toHaveBeenCalled();
  });
});
