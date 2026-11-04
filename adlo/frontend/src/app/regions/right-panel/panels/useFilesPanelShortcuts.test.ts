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
        handleSaveFile: vi.fn(),
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
        handleSaveFile: vi.fn(),
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
        handleSaveFile: vi.fn(),
        keybinds: {},
      });
    });
    dispatchKey('z', { altKey: true }, container);
    expect(setWordWrapEnabled).toHaveBeenCalledTimes(1);
    unmount();
    container.remove();
  });

  it('does not steal keystrokes from CodeMirror contenteditable inside panel', () => {
    const setWordWrapEnabled = vi.fn();
    const container = document.createElement('div');
    const editor = document.createElement('div');
    editor.className = 'cm-editor';
    const content = document.createElement('div');
    content.setAttribute('contenteditable', 'true');
    editor.appendChild(content);
    container.appendChild(editor);
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
        handleSaveFile: vi.fn(),
        keybinds: {},
      });
    });
    dispatchKey('z', { altKey: true }, content);
    expect(setWordWrapEnabled).not.toHaveBeenCalled();
    unmount();
    container.remove();
  });

  it('respects keybinds set to none', () => {
    const handleCopyPath = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { unmount } = renderHook(() => {
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
        handleSaveFile: vi.fn(),
        keybinds: { 'file.copy-relative': 'none' },
      });
    });
    dispatchKey('C', { ctrlKey: true, shiftKey: true }, container);
    expect(handleCopyPath).not.toHaveBeenCalled();
    unmount();
    container.remove();
  });

  it('respects a custom rebind', () => {
    const setLineNumbersEnabled = vi.fn();
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
          setWordWrapEnabled: vi.fn(),
          lineNumbersEnabled: true,
          setLineNumbersEnabled,
        },
        handleCopyPath: vi.fn(),
        handleSaveFile: vi.fn(),
        keybinds: { 'file.toggle-line-numbers': 'alt+l' },
      });
    });
    dispatchKey('l', { altKey: true }, container);
    expect(setLineNumbersEnabled).toHaveBeenCalledTimes(1);
    unmount();
    container.remove();
  });

  it('saves on Ctrl+S even inside CodeMirror editable surface', () => {
    const handleSaveFile = vi.fn();
    const container = document.createElement('div');
    const editor = document.createElement('div');
    editor.className = 'cm-editor';
    const content = document.createElement('div');
    content.setAttribute('contenteditable', 'true');
    editor.appendChild(content);
    container.appendChild(editor);
    document.body.appendChild(container);
    const { unmount } = renderHook(() => {
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
        handleCopyPath: vi.fn(),
        handleSaveFile,
        keybinds: {},
      });
    });
    dispatchKey('s', { ctrlKey: true }, content);
    expect(handleSaveFile).toHaveBeenCalledTimes(1);
    unmount();
    container.remove();
  });

  it('respects file.save set to none', () => {
    const handleSaveFile = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { unmount } = renderHook(() => {
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
        handleCopyPath: vi.fn(),
        handleSaveFile,
        keybinds: { 'file.save': 'none' },
      });
    });
    dispatchKey('s', { ctrlKey: true }, container);
    expect(handleSaveFile).not.toHaveBeenCalled();
    unmount();
    container.remove();
  });

  it('ignores global-command chords pressed inside the panel', () => {
    const handleCopyPath = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { unmount } = renderHook(() => {
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
        handleSaveFile: vi.fn(),
        keybinds: {},
      });
    });
    // settings.open 默认 chord 在面板内按下：file hook 不得吞掉（无 preventDefault 副作用可直接观测；
    // 此处断言 file 动作未触发，全局派发由 useKeyboardShortcuts 自有单测覆盖）。
    const event = new KeyboardEvent('keydown', {
      key: ',',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    container.dispatchEvent(event);
    expect(handleCopyPath).not.toHaveBeenCalled();
    expect(preventSpy).not.toHaveBeenCalled();
    unmount();
    container.remove();
  });
});
