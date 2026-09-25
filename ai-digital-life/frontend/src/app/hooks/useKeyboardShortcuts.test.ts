import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { findMatchingCommand } from './useKeyboardShortcuts';
import { DEFAULT_COMMANDS } from '../commands/defaultCommands';

function dispatchKey(key: string, opts: KeyboardEventInit = {}): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
}

function fullCallbacks(overrides = {}) {
  return {
    openCreateWorkspaceDialog: vi.fn(),
    openWorkspace: vi.fn(),
    openSettings: vi.fn(),
    openFilesView: vi.fn(),
    openChangesView: vi.fn(),
    openBrowserView: vi.fn(),
    openTerminalView: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    resetZoom: vi.fn(),
    ...overrides,
  };
}

describe('useKeyboardShortcuts extended dispatch', () => {
  it('dispatches view.terminal on Ctrl+Shift+`', () => {
    const onOpenTerminalView = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts(fullCallbacks({ openTerminalView: onOpenTerminalView })),
    );
    dispatchKey('`', { ctrlKey: true, shiftKey: true });
    expect(onOpenTerminalView).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('dispatches zoom.in on Ctrl+Shift+= (plus key)', () => {
    const zoomIn = vi.fn();
    const { unmount } = renderHook(() => useKeyboardShortcuts(fullCallbacks({ zoomIn })));
    dispatchKey('+', { ctrlKey: true, shiftKey: true });
    expect(zoomIn).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('findMatchingCommand is exported and reusable', () => {
    const match = findMatchingCommand(
      new KeyboardEvent('keydown', { key: '0', ctrlKey: true }),
      DEFAULT_COMMANDS,
      {},
    );
    expect(match?.id).toBe('zoom.reset');
  });
});
