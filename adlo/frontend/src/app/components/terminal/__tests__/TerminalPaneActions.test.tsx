// src/app/components/terminal/__tests__/TerminalPaneActions.test.tsx
import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TerminalPaneActions } from '../TerminalPaneActions';

const titles = {
  close: '关闭窗口',
  clear: '清空内容',
  maximize: '最大化',
  restore: '还原',
};

function renderActions(overrides: Partial<ComponentProps<typeof TerminalPaneActions>> = {}) {
  const onClose = vi.fn();
  const onClear = vi.fn();
  const onToggleMaximize = vi.fn();
  const { container } = render(
    <TerminalPaneActions
      onClose={onClose}
      onClear={onClear}
      isMaximized={false}
      onToggleMaximize={onToggleMaximize}
      titles={titles}
      {...overrides}
    />,
  );
  return { container, onClose, onClear, onToggleMaximize };
}

describe('TerminalPaneActions', () => {
  it('渲染清空 / 最大化 / 关闭三颗按钮，aria-label 与 title 均取 titles', () => {
    renderActions();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);

    const [clearBtn, maximizeBtn, closeBtn] = buttons;
    expect(clearBtn.getAttribute('aria-label')).toBe('清空内容');
    expect(clearBtn.getAttribute('title')).toBe('清空内容');
    expect(maximizeBtn.getAttribute('aria-label')).toBe('最大化');
    expect(maximizeBtn.getAttribute('title')).toBe('最大化');
    expect(closeBtn.getAttribute('aria-label')).toBe('关闭窗口');
    expect(closeBtn.getAttribute('title')).toBe('关闭窗口');
  });

  it('点击三颗按钮分别触发 onClear / onToggleMaximize / onClose', async () => {
    const { onClear, onToggleMaximize, onClose } = renderActions();
    const [clearBtn, maximizeBtn, closeBtn] = screen.getAllByRole('button');

    await userEvent.click(clearBtn);
    await userEvent.click(maximizeBtn);
    await userEvent.click(closeBtn);

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onToggleMaximize).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('isMaximized 时最大化按钮文案切换为「还原」', () => {
    renderActions({ isMaximized: true });
    const maximizeBtn = screen.getByRole('button', { name: '还原' });
    expect(maximizeBtn.getAttribute('title')).toBe('还原');
    expect(screen.queryByRole('button', { name: '最大化' })).toBeNull();
  });

  it('「关闭窗口」按钮带 --danger 类', () => {
    const { container } = renderActions();
    expect(container.querySelector('.adl-terminal-region-actions__btn--danger')).not.toBeNull();
  });

  it('默认不常驻显示（仅悬停/聚焦显露，由 CSS 控制）', () => {
    const { container } = renderActions();
    expect(container.querySelector('.adl-terminal-region-actions')).not.toBeNull();
    expect(container.querySelector('.is-always-visible')).toBeNull();
  });
});
