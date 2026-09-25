import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { useFilesPanelShortcuts } from './useFilesPanelShortcuts';

function dispatchKey(key: string, opts: KeyboardEventInit = {}, target: Element): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
}

describe('useFilesPanelShortcuts', () => {
  it('copies relative path on Ctrl+Shift+C inside panel with selection', () => {
    const handleCopyPath = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { result, unmount } = renderHook(() => {
      const panelRef = useRef<HTMLDivElement | null>(null);
      (panelRef as { current: HTMLDivElement | null }).current = container;
      return useFilesPanelShortcuts({
        panelRef,
        selectedFilePath: 'a/b.ts',
        selectedAbsolutePath: '/root/a/b.ts',
        editorOptions: {
          wordWrapEnabled: false,
          setWordWrapEnabled: vi.fn(),
          lineNumbersEnabled: true,
          setLineNumbersEnabled: vi.fn(),
        },
        handleCopyPath,
        keybinds: {},
      });
    });
    void result;
    dispatchKey('C', { ctrlKey: true, shiftKey: true }, container);
    expect(handleCopyPath).toHaveBeenCalledWith('a/b.ts');
    unmount();
    container.remove();
  });

  it('ignores presses outside the panel and without selection', () => {
    const handleCopyPath = vi.fn();
    const container = document.createElement('div');
    const outside = document.createElement('div');
    document.body.appendChild(container);
    document.body.appendChild(outside);
    const { unmount } = renderHook(() => {
      const panelRef = useRef<HTMLDivElement | null>(null);
      (panelRef as { current: HTMLDivElement | null }).current = container;
      return useFilesPanelShortcuts({
        panelRef,
        selectedFilePath: undefined,
        selectedAbsolutePath: undefined,
        editorOptions: {
          wordWrapEnabled: false,
          setWordWrapEnabled: vi.fn(),
          lineNumbersEnabled: true,
          setLineNumbersEnabled: vi.fn(),
        },
        handleCopyPath,
        keybinds: {},
      });
    });
    dispatchKey('C', { ctrlKey: true, shiftKey: true }, container);
    dispatchKey('C', { ctrlKey: true, shiftKey: true }, outside);
    expect(handleCopyPath).not.toHaveBeenCalled();
    unmount();
    container.remove();
    outside.remove();
  });

  it('toggles word wrap on Alt+Z inside panel', () => {
    const setWordWrapEnabled = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { unmount } = renderHook(() => {
      const panelRef = useRef<HTMLDivElement | null>(null);
      (panelRef as { current: HTMLDivElement | null }).current = container;
      return useFilesPanelShortcuts({
        panelRef,
        selectedFilePath: undefined,
        selectedAbsolutePath: undefined,
        editorOptions: {
          wordWrapEnabled: false,
          setWordWrapEnabled,
          lineNumbersEnabled: true,
          setLineNumbersEnabled: vi.fn(),
        },
        handleCopyPath: vi.fn(),
        keybinds: {},
      });
    });
    dispatchKey('z', { altKey: true }, container);
    expect(setWordWrapEnabled).toHaveBeenCalledTimes(1);
    unmount();
    container.remove();
  });
});
