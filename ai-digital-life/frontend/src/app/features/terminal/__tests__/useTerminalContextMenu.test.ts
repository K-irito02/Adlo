import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTerminalContextMenu } from '../useTerminalContextMenu';
import type { TerminalTabState } from '@stores/slices/terminalSlice';

const tabs = [
  { id: 't1', title: 'Terminal 1' } as TerminalTabState,
  { id: 't2', title: 'Terminal 2' } as TerminalTabState,
];

function setup() {
  const handleDoubleClick = vi.fn();
  const terminalTogglePin = vi.fn();
  const handleCloseTab = vi.fn();
  const hook = renderHook(() =>
    useTerminalContextMenu(tabs, handleDoubleClick, terminalTogglePin, handleCloseTab),
  );
  const openMenu = () =>
    act(() =>
      hook.result.current.handleContextMenu(
        { preventDefault: () => {}, stopPropagation: () => {}, clientX: 5, clientY: 6 } as never,
        't1',
        false,
      ),
    );
  return { hook, openMenu, handleDoubleClick, terminalTogglePin, handleCloseTab };
}

describe('useTerminalContextMenu', () => {
  it('打开菜单记录目标标签与坐标', () => {
    const { hook, openMenu } = setup();
    openMenu();
    expect(hook.result.current.contextMenu).toMatchObject({ open: true, tabId: 't1' });
  });

  it('重命名动作后关闭菜单（否则菜单会一直悬留）', () => {
    const { hook, openMenu, handleDoubleClick } = setup();
    openMenu();
    act(() => hook.result.current.handleRenameFromMenu());
    expect(handleDoubleClick).toHaveBeenCalledWith('t1', 'Terminal 1');
    expect(hook.result.current.contextMenu.open).toBe(false);
  });

  it('删除动作走完整关闭路径并关闭菜单', () => {
    const { hook, openMenu, handleCloseTab } = setup();
    openMenu();
    act(() => hook.result.current.handleDeleteFromMenu());
    expect(handleCloseTab).toHaveBeenCalledWith('t1');
    expect(hook.result.current.contextMenu.open).toBe(false);
  });

  it('Pin 动作后关闭菜单', () => {
    const { hook, openMenu, terminalTogglePin } = setup();
    openMenu();
    act(() => hook.result.current.handleTogglePin());
    expect(terminalTogglePin).toHaveBeenCalledWith('t1');
    expect(hook.result.current.contextMenu.open).toBe(false);
  });

  it('closeContextMenu 单独关闭菜单（外部点击 / Esc 走它）', () => {
    const { hook, openMenu } = setup();
    openMenu();
    act(() => hook.result.current.closeContextMenu());
    expect(hook.result.current.contextMenu.open).toBe(false);
  });
});
