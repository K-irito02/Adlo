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

function renderSection(nodes: BrowserTreeNode[]) {
  const category: BrowserCategoryState = { label: 'Workspace', nodes };
  return render(
    <TCopyProvider t={t} locale="en-US">
      <BrowserCategorySection
        category={category}
        categoryType="workspace"
        expandedPaths={{}}
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
});
