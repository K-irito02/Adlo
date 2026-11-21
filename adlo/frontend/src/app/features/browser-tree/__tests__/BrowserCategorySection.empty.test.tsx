import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { IconFolderPlus, IconNewFolderBrowser } from '@icons';
import { BrowserCategorySection } from '../BrowserCategorySection';

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      browserCategoryEmptyWorkspaceGuidePrefix: '点击顶部标题栏',
      browserCategoryEmptyWorkspaceGuideSuffix: '按钮创建工作区目录',
      browserCategoryEmptyUserFolderGuidePrefix: '点击此侧边栏上方',
      browserCategoryEmptyUserFolderGuideSuffix: '按钮创建自建目录',
    },
    locale: 'zh-CN',
    formatT: vi.fn(),
  }),
}));

const baseProps = {
  expandedPaths: {},
  selectedTreePath: null,
  onSelectTreePath: vi.fn(),
  onTogglePath: vi.fn(),
  onOpenFile: vi.fn(),
  callbacks: {} as never,
  counts: new Map<string, number>(),
};

function expectFolderPlusIcon(container: HTMLElement) {
  const actual = container.querySelector('.adl-empty-hint__icon svg');
  expect(actual).not.toBeNull();
  const { container: reference } = render(<IconFolderPlus size={14} decorative />);
  expect(actual?.innerHTML).toBe(reference.querySelector('svg')?.innerHTML);
}

function expectNewFolderBrowserIcon(container: HTMLElement) {
  const actual = container.querySelector('.adl-empty-hint__icon svg');
  expect(actual).not.toBeNull();
  const { container: reference } = render(<IconNewFolderBrowser size={14} decorative />);
  expect(actual?.innerHTML).toBe(reference.querySelector('svg')?.innerHTML);
}

describe('BrowserCategorySection 空态', () => {
  it('工作区目录为空时显示「点击顶部标题栏 [图标] 按钮创建工作区目录」，不再有「暂无目录」', () => {
    const { container } = render(
      <BrowserCategorySection
        {...baseProps}
        category={{ label: '工作区目录', nodes: [] }}
        categoryType="workspace"
      />,
    );
    expect(container.textContent).toContain('点击顶部标题栏');
    expect(container.textContent).toContain('按钮创建工作区目录');
    expect(container.textContent).not.toContain('暂无目录');
    expectFolderPlusIcon(container);
  });

  it('自建目录为空时显示「点击此侧边栏上方 [图标] 按钮创建自建目录」', () => {
    const { container } = render(
      <BrowserCategorySection
        {...baseProps}
        category={{ label: '自建目录', nodes: [] }}
        categoryType="userFolder"
      />,
    );
    expect(container.textContent).toContain('点击此侧边栏上方');
    expect(container.textContent).toContain('按钮创建自建目录');
    expect(container.textContent).not.toContain('暂无目录');
    expectNewFolderBrowserIcon(container);
  });

  it('非空分类不渲染空态', () => {
    const { container } = render(
      <BrowserCategorySection
        {...baseProps}
        category={{
          label: '工作区目录',
          nodes: [
            {
              path: 'workspace:ws-1',
              name: 'ws-1',
              kind: 'directory',
              children: [],
              nodeType: 'workspace',
              workspaceId: 'ws-1',
            },
          ],
        }}
        categoryType="workspace"
      />,
    );
    expect(container.querySelector('.adl-browser-category__empty')).toBeNull();
  });
});
