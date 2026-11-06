import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { BrowserCategorySection } from '../BrowserCategorySection';

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      browserCategoryEmptyWorkspaceGuidePrefix: '点击顶部标题栏',
      browserCategoryEmptyWorkspaceGuideSuffix: '按钮创建工作区目录',
      browserCategoryEmptyUserFolderGuidePrefix: '点击此侧边栏上方',
      browserCategoryEmptyUserFolderGuideSuffix: '按钮创建自建目录',
      browserCategoryEmptyHistory: '暂无历史记录',
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

describe('BrowserCategorySection 空状态', () => {
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
    expect(container.querySelector('.adl-empty-hint__icon svg')).not.toBeNull();
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
    expect(container.querySelector('.adl-empty-hint__icon svg')).not.toBeNull();
  });

  it('历史为空时只显示「暂无历史记录」', () => {
    const { container } = render(
      <BrowserCategorySection
        {...baseProps}
        category={{ label: '历史目录', nodes: [] }}
        categoryType="history"
      />,
    );
    expect(container.textContent).toContain('暂无历史记录');
    expect(container.querySelector('.adl-empty-hint__icon')).toBeNull();
  });

  it('非空分类不渲染空状态', () => {
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
