// src/app/features/terminal/__tests__/TerminalMenuDropdown.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TerminalMenuDropdown } from '../TerminalMenuDropdown';
import type { TerminalMenuItem } from '../useTerminalPanel';

const COPY = vi.hoisted(() => ({
  terminalMoreActions: 'MORE_ACTIONS',
}));

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({ t: COPY, locale: 'en-US', formatT: vi.fn() }),
}));

function renderDropdown(items: TerminalMenuItem[], onClose = vi.fn()) {
  const onToggle = vi.fn();
  const { container } = render(
    <TerminalMenuDropdown
      menuOpen
      menuRef={{ current: null }}
      menuItems={items}
      onToggle={onToggle}
      onClose={onClose}
    />,
  );
  return { container, onClose, onToggle };
}

describe('TerminalMenuDropdown checkbox items', () => {
  it('开关项渲染为 menuitemcheckbox，checked 时打勾', () => {
    renderDropdown([{ id: 'borders', label: '边界线', checked: true, action: vi.fn() }]);
    const item = screen.getByRole('menuitemcheckbox', { name: '边界线' });
    expect(item.getAttribute('aria-checked')).toBe('true');
    expect(item.querySelector('.adl-menu__check')).not.toBeNull();
  });

  it('未勾选时无打勾图标，aria-checked=false', () => {
    renderDropdown([{ id: 'borders', label: '边界线', checked: false, action: vi.fn() }]);
    const item = screen.getByRole('menuitemcheckbox', { name: '边界线' });
    expect(item.getAttribute('aria-checked')).toBe('false');
    expect(item.querySelector('.adl-menu__check')).toBeNull();
  });

  it('开关项点击后执行 action 且保持菜单展开（仿行号）', () => {
    const action = vi.fn();
    const { onClose } = renderDropdown([{ id: 'borders', label: '边界线', checked: true, action }]);
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '边界线' }));
    expect(action).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('普通动作项仍渲染为 menuitem', () => {
    renderDropdown([{ id: 'x', label: '普通项', action: vi.fn() }]);
    expect(screen.getByRole('menuitem', { name: '普通项' })).not.toBeNull();
  });
});
