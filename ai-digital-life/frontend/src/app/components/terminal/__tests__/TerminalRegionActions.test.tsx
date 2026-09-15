// src/app/components/terminal/__tests__/TerminalRegionActions.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TerminalRegionActions, type TerminalRegionActionsTitles } from '../TerminalRegionActions';

const titles: TerminalRegionActionsTitles = {
  collapse: '收起{region}',
  expand: '展开{region}',
  regionName: '只读历史区域',
  otherRegionName: '实时终端区域',
  deleteLabel: '删除历史',
  deleteTitle: '删除该标签的全部历史记录（不可恢复）',
  clearLabel: '清空',
  clearTitle: '清空实时终端当前显示的内容（等同 clear 命令）',
};

describe('TerminalRegionActions', () => {
  it('删除在左、收起在右', () => {
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
      '收起只读历史区域',
    ]);
  });

  it('清空在左、收起在右（实时区）', () => {
    render(
      <TerminalRegionActions
        region="live"
        collapsedRegion="none"
        canCollapse
        onToggleCollapse={() => {}}
        onClear={() => {}}
        titles={{ ...titles, regionName: '实时终端区域', otherRegionName: '只读历史区域' }}
      />,
    );
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      '清空',
      '收起实时终端区域',
    ]);
  });

  it('只剩一个区域（canCollapse=false）时不渲染收起/展开按钮', () => {
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
    expect(screen.queryByLabelText('收起只读历史区域')).toBeNull();
  });

  it('实时区被收起时，历史区按钮展开另一区（非本区），title 为系统原生 title 属性', () => {
    render(
      <TerminalRegionActions
        region="history"
        collapsedRegion="live"
        canCollapse
        onToggleCollapse={() => {}}
        titles={titles}
      />,
    );
    const btn = screen.getByLabelText('展开实时终端区域');
    expect(btn.getAttribute('title')).toBe('展开实时终端区域');
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

  it('独显常驻组合渲染另一区的展开按钮（alwaysVisible + solo）', () => {
    render(
      <TerminalRegionActions
        region="live"
        collapsedRegion="history"
        canCollapse
        onToggleCollapse={() => {}}
        onClear={() => {}}
        titles={{ ...titles, regionName: '实时终端区域', otherRegionName: '只读历史区域' }}
        alwaysVisible
      />,
    );
    const btn = screen.getByLabelText('展开只读历史区域');
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
        titles={{ ...titles, regionName: '实时终端区域', otherRegionName: '只读历史区域' }}
      />,
    );
    expect(screen.getByLabelText('收起实时终端区域').getAttribute('data-region')).toBe('live');
  });

  it('历史区被收起时，实时区按钮展开另一区', () => {
    render(
      <TerminalRegionActions
        region="live"
        collapsedRegion="history"
        canCollapse
        onToggleCollapse={() => {}}
        onClear={() => {}}
        titles={{ ...titles, regionName: '实时终端区域', otherRegionName: '只读历史区域' }}
      />,
    );
    expect(screen.getByLabelText('展开只读历史区域')).toBeInTheDocument();
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
    await userEvent.click(screen.getByLabelText('收起只读历史区域'));
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
