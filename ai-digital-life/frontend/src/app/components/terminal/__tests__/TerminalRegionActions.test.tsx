// src/app/components/terminal/__tests__/TerminalRegionActions.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TerminalRegionActions, type TerminalRegionActionsTitles } from '../TerminalRegionActions';

// 语义：两区都可见 → 按钮「最大化本区」（另一区让位）；某区已独显（另一区被收起）→ 按钮「还原」。
const titles: TerminalRegionActionsTitles = {
  collapse: '还原',
  expand: '最大化',
  deleteLabel: '删除历史',
  deleteTitle: '删除该标签的全部历史记录（不可恢复）',
  clearLabel: '清空',
  clearTitle: '清空实时终端当前显示的内容（等同 clear 命令）',
};

describe('TerminalRegionActions', () => {
  it('删除在左、最大化在右（两区都可见）', () => {
    render(
      <TerminalRegionActions
        region="history"
        collapsedRegion="none"
        canCollapse
        onToggleCollapse={() => {}}
        onDelete={() => {}}
        titles={titles}
      />,
    );
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      '删除历史',
      '最大化',
    ]);
  });

  it('清空在左、最大化在右（实时区）', () => {
    render(
      <TerminalRegionActions
        region="live"
        collapsedRegion="none"
        canCollapse
        onToggleCollapse={() => {}}
        onClear={() => {}}
        titles={titles}
      />,
    );
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      '清空',
      '最大化',
    ]);
  });

  it('只剩一个区域（canCollapse=false）时不渲染最大化/还原按钮', () => {
    render(
      <TerminalRegionActions
        region="live"
        collapsedRegion="none"
        canCollapse={false}
        onToggleCollapse={() => {}}
        onClear={() => {}}
        titles={titles}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByLabelText('最大化')).toBeNull();
  });

  it('某区被收起（本区已最大化）时按钮为「还原」，title 为系统原生 title 属性', () => {
    render(
      <TerminalRegionActions
        region="history"
        collapsedRegion="live"
        canCollapse
        onToggleCollapse={() => {}}
        titles={titles}
      />,
    );
    const btn = screen.getByLabelText('还原');
    expect(btn.getAttribute('title')).toBe('还原');
  });

  it('自身即被收起区时不渲染（防误传，调用方契约兜底，双向对称）', () => {
    for (const region of ['history', 'live'] as const) {
      const { container, unmount } = render(
        <TerminalRegionActions
          region={region}
          collapsedRegion={region}
          canCollapse
          onToggleCollapse={() => {}}
          titles={titles}
        />,
      );
      expect(container.firstChild).toBeNull();
      unmount();
    }
  });

  it('独显常驻组合渲染「还原」按钮（alwaysVisible + 已最大化）', () => {
    render(
      <TerminalRegionActions
        region="live"
        collapsedRegion="history"
        canCollapse
        onToggleCollapse={() => {}}
        onClear={() => {}}
        titles={titles}
        alwaysVisible
      />,
    );
    const btn = screen.getByLabelText('还原');
    expect(btn.closest('.is-always-visible')).not.toBeNull();
  });

  it('按钮带 data-region 便于定位所属区域', () => {
    render(
      <TerminalRegionActions
        region="live"
        collapsedRegion="none"
        canCollapse
        onToggleCollapse={() => {}}
        onClear={() => {}}
        titles={titles}
      />,
    );
    expect(screen.getByLabelText('最大化').getAttribute('data-region')).toBe('live');
  });

  it('图标随状态对调：两区可见=四角外扩（最大化），已最大化=四角内收（还原）', () => {
    // IconRegionExpand 为单个实心 path（四角箭头外扩）；IconRegionCollapse 为四条角括号 path（内收）。
    const { container: maximizeView } = render(
      <TerminalRegionActions
        region="live"
        collapsedRegion="none"
        canCollapse
        onToggleCollapse={() => {}}
        onClear={() => {}}
        titles={titles}
      />,
    );
    const maximizeIcon = maximizeView.querySelector(
      '.adl-terminal-region-actions__btn[data-region="live"] svg',
    );
    expect(maximizeIcon?.querySelectorAll('path')).toHaveLength(1);
    cleanup();

    const { container: restoreView } = render(
      <TerminalRegionActions
        region="live"
        collapsedRegion="history"
        canCollapse
        onToggleCollapse={() => {}}
        onClear={() => {}}
        titles={titles}
      />,
    );
    const restoreIcon = restoreView.querySelector(
      '.adl-terminal-region-actions__btn[data-region="live"] svg',
    );
    expect(restoreIcon?.querySelectorAll('path')).toHaveLength(4);
  });

  it('删除按钮的原生 title 写清后果（不加二次确认）', () => {
    render(
      <TerminalRegionActions
        region="history"
        collapsedRegion="none"
        canCollapse
        onToggleCollapse={() => {}}
        onDelete={() => {}}
        titles={titles}
      />,
    );
    expect(screen.getByLabelText('删除历史').getAttribute('title')).toBe(
      '删除该标签的全部历史记录（不可恢复）',
    );
  });

  it('点击回调正确触发', async () => {
    const onDelete = vi.fn();
    const onToggle = vi.fn();
    render(
      <TerminalRegionActions
        region="history"
        collapsedRegion="none"
        canCollapse
        onToggleCollapse={onToggle}
        onDelete={onDelete}
        titles={titles}
      />,
    );
    await userEvent.click(screen.getByLabelText('删除历史'));
    expect(onDelete).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByLabelText('最大化'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('常驻态加 is-always-visible 类（不依赖 hover）', () => {
    const { container } = render(
      <TerminalRegionActions
        region="live"
        collapsedRegion="none"
        canCollapse={false}
        onToggleCollapse={() => {}}
        titles={titles}
        alwaysVisible
      />,
    );
    expect(container.querySelector('.is-always-visible')).not.toBeNull();
  });
});
