import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TCopyProvider } from '@i18n/TCopyContext';
import { TerminalContextMenu } from '../TerminalContextMenu';
import type { ContextMenuState } from '../useTerminalPanel';

const baseMenu: ContextMenuState = { open: true, x: 10, y: 10, tabId: 't1', isPinned: false };

// 组件内用 useTCopy 取菜单文案，测试需提供 Provider（与其它组件测试同法）
const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
});

function renderMenu(overrides: Partial<ContextMenuState> = {}) {
  const onClose = vi.fn();
  const onRename = vi.fn();
  const onDelete = vi.fn();
  const onTogglePin = vi.fn();
  const onOpenInCenter = vi.fn();
  render(
    <TCopyProvider t={mockT as never} locale="en-US">
      <TerminalContextMenu
        contextMenu={{ ...baseMenu, ...overrides }}
        onTogglePin={onTogglePin}
        onRename={onRename}
        onOpenInCenter={onOpenInCenter}
        onDelete={onDelete}
        onClose={onClose}
      />
    </TCopyProvider>,
  );
  return { onClose, onRename, onDelete, onTogglePin, onOpenInCenter };
}

describe('TerminalContextMenu', () => {
  afterEach(() => cleanup());

  it('菜单关闭时不渲染', () => {
    renderMenu({ open: false });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('菜单打开时渲染四个动作项', () => {
    renderMenu();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    // 四个动作按钮（Pin / 重命名 / 在中间部分显示 / 删除）
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('点击「在中间部分显示」触发对应动作', async () => {
    const { onOpenInCenter } = renderMenu();
    await userEvent.click(screen.getAllByRole('button')[2]);
    expect(onOpenInCenter).toHaveBeenCalledTimes(1);
  });

  it('点击菜单外部关闭菜单（此前菜单会一直悬留）', () => {
    const { onClose } = renderMenu();
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('菜单内部点击不触发 onClose（由动作项自身处理）', async () => {
    const { onClose, onRename } = renderMenu();
    await userEvent.click(screen.getAllByRole('button')[1]);
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('按 Esc 关闭菜单', () => {
    const { onClose } = renderMenu();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('其他按键不关闭菜单', () => {
    const { onClose } = renderMenu();
    fireEvent.keyDown(document, { key: 'a' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
