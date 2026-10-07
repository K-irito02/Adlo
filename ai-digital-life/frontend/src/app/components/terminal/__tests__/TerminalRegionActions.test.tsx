// src/app/components/terminal/__tests__/TerminalRegionActions.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TerminalRegionActions } from '../TerminalRegionActions';

const titles = {
  clearLabel: '清空',
  clearTitle: '清空实时终端当前显示的内容（等同 clear 命令）',
};

describe('TerminalRegionActions', () => {
  it('渲染单颗清空按钮：aria-label / title 均来自 titles', () => {
    render(<TerminalRegionActions onClear={() => {}} titles={titles} />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-label')).toBe('清空');
    expect(btn.getAttribute('title')).toBe(titles.clearTitle);
  });

  it('点击清空按钮触发 onClear', async () => {
    const onClear = vi.fn();
    render(<TerminalRegionActions onClear={onClear} titles={titles} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('alwaysVisible 时加 is-always-visible 类（常驻显示，不依赖 hover）', () => {
    const { container } = render(
      <TerminalRegionActions onClear={() => {}} titles={titles} alwaysVisible />,
    );
    expect(
      container.querySelector('.adl-terminal-region-actions.is-always-visible'),
    ).not.toBeNull();
  });

  it('未设 alwaysVisible 时不加常驻类', () => {
    const { container } = render(<TerminalRegionActions onClear={() => {}} titles={titles} />);
    expect(container.querySelector('.is-always-visible')).toBeNull();
  });
});
