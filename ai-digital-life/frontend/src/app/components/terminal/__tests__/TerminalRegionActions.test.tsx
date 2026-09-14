// src/app/components/terminal/__tests__/TerminalRegionActions.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TerminalRegionActions, type TerminalRegionActionsTitles } from '../TerminalRegionActions';

const titles: TerminalRegionActionsTitles = {
  collapse: '收起{region}',
  expand: '展开{region}',
  regionName: '只读历史区域',
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
        collapsed={false}
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
        collapsed={false}
        canCollapse
        onToggleCollapse={() => {}}
        onClear={() => {}}
        titles={{ ...titles, regionName: '实时终端区域' }}
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
        collapsed={false}
        canCollapse={false}
        onToggleCollapse={() => {}}
        onClear={() => {}}
        titles={titles}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByLabelText('收起只读历史区域')).toBeNull();
  });

  it('收起态时按钮为「展开」，且 title 为系统原生 title 属性', () => {
    render(
      <TerminalRegionActions
        region="history"
        collapsed
        canCollapse
        onToggleCollapse={() => {}}
        titles={titles}
      />,
    );
    const btn = screen.getByLabelText('展开只读历史区域');
    expect(btn.getAttribute('title')).toBe('展开只读历史区域');
  });

  it('删除按钮的原生 title 写清后果（不加二次确认）', () => {
    render(
      <TerminalRegionActions
        region="history"
        collapsed={false}
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
        collapsed={false}
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
        collapsed
        canCollapse={false}
        onToggleCollapse={() => {}}
        titles={titles}
        alwaysVisible
      />,
    );
    expect(container.querySelector('.is-always-visible')).not.toBeNull();
  });
});
