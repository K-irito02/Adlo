import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserCategorySection } from '../BrowserCategorySection';
import type { BrowserCategoryState, BrowserTreeNode } from '../types';
import type { CopyDict } from '@i18n/types';
import { TCopyProvider } from '@i18n/TCopyContext';

// 缺失 key 回退为 key 名本身，保证新增文案不导致测试崩溃
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
};

function makeLeafNode(name: string): BrowserTreeNode {
  return {
    path: `tab:ws-ws-1-${name}:tab-1`,
    name,
    kind: 'file',
    children: [],
    nodeType: 'tab',
    tabId: 'tab-1',
    url: 'https://example.com',
    workspaceId: 'ws-1',
  };
}

function renderSection(nodes: BrowserTreeNode[], expandedPaths: Record<string, boolean> = {}) {
  const category: BrowserCategoryState = { label: 'Workspace', nodes };
  return render(
    <TCopyProvider t={t} locale="en-US">
      <BrowserCategorySection
        category={category}
        categoryType="workspace"
        expandedPaths={expandedPaths}
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

describe('BrowserCategorySection always-expanded', () => {
  it('renders entries without a category toggle button', () => {
    const { container } = renderSection([makeLeafNode('Example')]);

    // 条目常渲染
    expect(screen.getByText('Example')).toBeInTheDocument();
    // 分类标题行无任何收起/展开按钮
    expect(container.querySelector('.adl-browser-category__label button')).toBeNull();
  });

  it('exposes the category as a labelled group for assistive tech', () => {
    renderSection([makeLeafNode('Example')]);

    expect(screen.getByRole('group', { name: 'Workspace' })).toBeInTheDocument();
  });

  it('renders expanded bookmark rows with the site initial instead of a spinner', () => {
    // 回归拦截（F1）：树行必须把 pending='initial' 真正传给 BrowserFavicon；
    // 改回 url-only 接线时这里会重新出现 .adl-spinner。
    const { container } = renderSection(
      [
        {
          path: 'folder:books',
          name: '书籍资源网',
          kind: 'directory',
          nodeType: 'folder',
          folderId: 'books',
          children: [
            {
              path: 'bookmark:no-spinner-row',
              name: '无图标书签',
              kind: 'file',
              children: [],
              nodeType: 'bookmark',
              bookmarkId: 'b-no-spinner-row',
              url: 'https://no-spinner-row.example/page',
              isSavedBookmark: true,
            },
          ],
        },
      ],
      { 'folder:books': true },
    );

    const row = [...container.querySelectorAll('.adl-filetree__row')].find((r) =>
      r.textContent?.includes('无图标书签'),
    );
    expect(row).toBeDefined();
    expect(row?.querySelector('.adl-spinner')).toBeNull();
    expect(row?.querySelector('.adl-browser-tree__link-fallback')?.textContent).toBe('N');
  });

  it('keeps the spinner on live tab rows', () => {
    // 反向守护：活标签行仍走默认 spinner 策略（确有在途抓取）
    const { container } = renderSection(
      [
        {
          path: 'folder:live',
          name: 'LiveFolder',
          kind: 'directory',
          nodeType: 'folder',
          folderId: 'live',
          children: [makeLeafNode('Live tab')],
        },
      ],
      { 'folder:live': true },
    );
    expect(screen.getByText('Live tab')).toBeInTheDocument();
    expect(container.querySelectorAll('.adl-spinner')).toHaveLength(1);
  });
});
