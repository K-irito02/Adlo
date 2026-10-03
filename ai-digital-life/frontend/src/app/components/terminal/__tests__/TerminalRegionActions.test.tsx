// src/app/components/terminal/__tests__/TerminalRegionActions.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TerminalRegionActions, type TerminalRegionActionsTitles } from '../TerminalRegionActions';
import { IconRegionCollapse, IconRegionExpand } from '@icons';
import type { RegionCollapse, RegionName } from '@features/terminal/terminalRegionCollapse';

// 语义：两区都可见 → 按钮「最大化本区」（另一区让位）；某区已独显（另一区被隐藏）→ 按钮「还原」。
const titles: TerminalRegionActionsTitles = {
  restore: '还原',
  maximize: '最大化',
  deleteLabel: '删除历史',
  deleteTitle: '删除该标签的全部历史记录（不可恢复）',
  clearLabel: '清空',
  clearTitle: '清空实时终端当前显示的内容（等同 clear 命令）',
};

const REGION_NAMES: Record<RegionName, string> = {
  history: '只读历史区域',
  live: '实时终端区域',
};

function RegionActions({
  region,
  collapsedRegion,
  canCollapse = true,
  onToggleCollapse = () => {},
  onDelete,
  onClear,
  alwaysVisible,
}: {
  region: RegionName;
  collapsedRegion: RegionCollapse;
  canCollapse?: boolean;
  onToggleCollapse?: () => void;
  onDelete?: () => void;
  onClear?: () => void;
  alwaysVisible?: boolean;
}) {
  return (
    <TerminalRegionActions
      region={region}
      collapsedRegion={collapsedRegion}
      canCollapse={canCollapse}
      onToggleCollapse={onToggleCollapse}
      onDelete={onDelete}
      onClear={onClear}
      titles={titles}
      regionName={REGION_NAMES[region]}
      alwaysVisible={alwaysVisible}
    />
  );
}

/** 切换按钮内 <svg> 的子树 markup（与独立渲染的图标组件比对，避免绑定 path 数量等实现细节） */
function toggleIconMarkup(container: HTMLElement): string | undefined {
  return container.querySelector('.adl-terminal-region-actions__btn[data-region] svg')?.innerHTML;
}

describe('TerminalRegionActions', () => {
  it('删除在左、最大化在右（两区都可见）', () => {
    render(<RegionActions region="history" collapsedRegion="none" onDelete={() => {}} />);
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      '删除历史',
      '最大化 只读历史区域',
    ]);
  });

  it('清空在左、最大化在右（实时区）', () => {
    render(<RegionActions region="live" collapsedRegion="none" onClear={() => {}} />);
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      '清空',
      '最大化 实时终端区域',
    ]);
  });

  it('只剩一个区域（canCollapse=false）时不渲染最大化/还原按钮', () => {
    render(
      <RegionActions region="live" collapsedRegion="none" canCollapse={false} onClear={() => {}} />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByLabelText(/最大化|还原/)).toBeNull();
  });

  it('可见 title 为短文案（不带区域名），aria-label 带区域名以便两区都可见时 AT 可区分', () => {
    render(<RegionActions region="history" collapsedRegion="none" />);
    const btn = screen.getByLabelText('最大化 只读历史区域');
    expect(btn.getAttribute('title')).toBe('最大化');
  });

  it('本区已最大化时按钮为「还原」，title 同样为短文案', () => {
    render(<RegionActions region="history" collapsedRegion="live" />);
    const btn = screen.getByLabelText('还原 只读历史区域');
    expect(btn.getAttribute('title')).toBe('还原');
  });

  it('两区都可见时两个按钮的 aria-label 互不相同（AT 可区分作用区域）', () => {
    const { container } = render(
      <>
        <RegionActions region="history" collapsedRegion="none" onDelete={() => {}} />
        <RegionActions region="live" collapsedRegion="none" onClear={() => {}} />
      </>,
    );
    const labels = [...container.querySelectorAll('.adl-terminal-region-actions__btn')].map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(labels).toEqual(['删除历史', '最大化 只读历史区域', '清空', '最大化 实时终端区域']);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('自身即被收起区时不渲染（防误传，调用方契约兜底，双向对称）', () => {
    for (const region of ['history', 'live'] as const) {
      const { container, unmount } = render(
        <RegionActions region={region} collapsedRegion={region} />,
      );
      expect(container.firstChild).toBeNull();
      unmount();
    }
  });

  it('独显常驻组合渲染「还原」按钮（alwaysVisible + 已最大化）', () => {
    render(
      <RegionActions region="live" collapsedRegion="history" onClear={() => {}} alwaysVisible />,
    );
    const btn = screen.getByLabelText('还原 实时终端区域');
    expect(btn.closest('.is-always-visible')).not.toBeNull();
  });

  it('按钮带 data-region 便于定位所属区域', () => {
    render(<RegionActions region="live" collapsedRegion="none" onClear={() => {}} />);
    expect(screen.getByLabelText('最大化 实时终端区域').getAttribute('data-region')).toBe('live');
  });

  it('图标随状态对调：两区可见=四角外扩（IconRegionExpand），已最大化=四角内收（IconRegionCollapse）', () => {
    const { container: expandRef } = render(<IconRegionExpand size={14} decorative />);
    const expandMarkup = expandRef.querySelector('svg')?.innerHTML;
    cleanup();
    const { container: collapseRef } = render(<IconRegionCollapse size={14} decorative />);
    const collapseMarkup = collapseRef.querySelector('svg')?.innerHTML;
    cleanup();

    const { container: maximizeView } = render(
      <RegionActions region="live" collapsedRegion="none" onClear={() => {}} />,
    );
    expect(toggleIconMarkup(maximizeView)).toBe(expandMarkup);
    cleanup();

    const { container: restoreView } = render(
      <RegionActions region="live" collapsedRegion="history" onClear={() => {}} />,
    );
    expect(toggleIconMarkup(restoreView)).toBe(collapseMarkup);
  });

  it('删除按钮的原生 title 写清后果（不加二次确认）', () => {
    render(<RegionActions region="history" collapsedRegion="none" onDelete={() => {}} />);
    expect(screen.getByLabelText('删除历史').getAttribute('title')).toBe(
      '删除该标签的全部历史记录（不可恢复）',
    );
  });

  it('点击回调正确触发', async () => {
    const onDelete = vi.fn();
    const onToggle = vi.fn();
    render(
      <RegionActions
        region="history"
        collapsedRegion="none"
        onToggleCollapse={onToggle}
        onDelete={onDelete}
      />,
    );
    await userEvent.click(screen.getByLabelText('删除历史'));
    expect(onDelete).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByLabelText('最大化 只读历史区域'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('常驻态加 is-always-visible 类（不依赖 hover）', () => {
    const { container } = render(
      <RegionActions region="live" collapsedRegion="none" canCollapse={false} alwaysVisible />,
    );
    expect(container.querySelector('.is-always-visible')).not.toBeNull();
  });
});
