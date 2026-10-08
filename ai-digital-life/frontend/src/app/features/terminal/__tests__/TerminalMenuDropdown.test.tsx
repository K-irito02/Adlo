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
  const menuRef = { current: null as HTMLDivElement | null };
  const { container } = render(
    <TerminalMenuDropdown
      menuOpen
      menuRef={menuRef}
      menuItems={items}
      onToggle={onToggle}
      onClose={onClose}
    />,
  );
  menuRef.current = container.querySelector('.adl-menu');
  return { container, onClose, onToggle };
}

describe('TerminalMenuDropdown checkbox items', () => {
  it('开关项渲染为 menuitemcheckbox，checked 时打勾', () => {
    // 顺带证明 COPY mock 生效（按钮名取自 mock 字典）。
    renderDropdown([{ id: 'borders', label: '边界线', checked: true, action: vi.fn() }]);
    expect(screen.getByRole('button', { name: 'MORE_ACTIONS' })).not.toBeNull();
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

  it('开关项（keepOpen）点击后执行 action 且保持菜单展开（仿行号）', () => {
    const action = vi.fn();
    const { onClose } = renderDropdown([
      { id: 'borders', label: '边界线', checked: true, keepOpen: true, action },
    ]);
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '边界线' }));
    expect(action).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('破坏性动作项（无 keepOpen）点击后关闭菜单，防重复误触', () => {
    const action = vi.fn();
    const { onClose } = renderDropdown([{ id: 'kill', label: '杀死进程', action }]);
    fireEvent.click(screen.getByRole('menuitem', { name: '杀死进程' }));
    expect(action).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('普通动作项仍渲染为 menuitem', () => {
    renderDropdown([{ id: 'x', label: '普通项', action: vi.fn() }]);
    expect(screen.getByRole('menuitem', { name: '普通项' })).not.toBeNull();
  });

  it('提示标记可键盘聚焦并带无障碍名称', () => {
    renderDropdown([
      {
        id: 'kill',
        label: '杀死进程',
        hint: '# 标题\n· 内容',
        hintLabel: '杀死进程说明',
        action: vi.fn(),
      },
    ]);
    const mark = document.querySelector('.adl-menu-item__hint') as HTMLElement;
    expect(mark.getAttribute('tabindex')).toBe('0');
    expect(mark.getAttribute('aria-label')).toBe('杀死进程说明');
  });
});

describe('TerminalMenuDropdown hint mark', () => {
  const HINT = '# 结束鼠标最近一次所点击的终端窗口\n· 只影响这一格\n· 窗口还在';

  it('有 hint 的项最右侧渲染感叹号，悬停出现提示卡（含标题）', () => {
    renderDropdown([{ id: 'kill', label: '杀死进程', hint: HINT, action: vi.fn() }]);
    const mark = document.querySelector('.adl-menu-item__hint') as HTMLElement;
    expect(mark?.textContent).toBe('!');

    fireEvent.mouseEnter(mark);
    const card = document.body.querySelector('.hint-card');
    expect(card).not.toBeNull();
    expect(card?.querySelector('.hint-card__title')?.textContent).toBe(
      '结束鼠标最近一次所点击的终端窗口',
    );

    fireEvent.mouseLeave(mark);
  });

  it('点击感叹号不触发行动作（只看说明，不误执行）', () => {
    const action = vi.fn();
    renderDropdown([{ id: 'kill', label: '杀死进程', hint: HINT, action }]);
    fireEvent.click(document.querySelector('.adl-menu-item__hint') as HTMLElement);
    expect(action).not.toHaveBeenCalled();
  });

  it('无 hint 的项不渲染感叹号', () => {
    renderDropdown([{ id: 'x', label: '普通项', action: vi.fn() }]);
    expect(document.querySelector('.adl-menu-item__hint')).toBeNull();
  });
});
