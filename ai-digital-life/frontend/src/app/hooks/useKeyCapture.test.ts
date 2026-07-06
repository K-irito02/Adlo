import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import type { CommandMeta } from '../commands/defaultCommands';
import { useKeyCapture, type UseKeyCaptureArgs } from './useKeyCapture';

const TEST_COMMANDS: CommandMeta[] = [
  {
    id: 'session.new',
    titleKey: 'commandSessionNew',
    group: 'session',
    defaultKeybind: 'mod+shift+n',
  },
  {
    id: 'workspace.new',
    titleKey: 'commandWorkspaceNew',
    group: 'navigation',
    defaultKeybind: 'mod+n',
  },
  {
    id: 'workspace.open',
    titleKey: 'commandWorkspaceOpen',
    group: 'navigation',
    defaultKeybind: 'mod+o',
  },
  {
    id: 'settings.open',
    titleKey: 'commandSettingsOpen',
    group: 'general',
    defaultKeybind: 'mod+shift+comma',
  },
];

function dispatchKey(key: string, opts: KeyboardEventInit = {}): void {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...opts,
  });
  document.dispatchEvent(event);
}

function makeArgs(overrides: Partial<UseKeyCaptureArgs> = {}): UseKeyCaptureArgs {
  return {
    activeId: null,
    commands: TEST_COMMANDS,
    keybinds: {},
    onRecord: vi.fn(),
    onConflict: vi.fn(),
    onStop: vi.fn(),
    ...overrides,
  };
}

describe('useKeyCapture', () => {
  let originalPlatform: string;

  beforeEach(() => {
    originalPlatform = navigator.platform;
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true });
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(navigator, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
  });

  it('does not invoke callbacks when activeId is null', () => {
    const onRecord = vi.fn();
    const onStop = vi.fn();
    renderHook(() => useKeyCapture(makeArgs({ activeId: null, onRecord, onStop })));

    dispatchKey('n', { ctrlKey: true, shiftKey: true });
    dispatchKey('Escape');

    expect(onRecord).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
  });

  it('records keybind when active and key pressed', () => {
    const onRecord = vi.fn();
    renderHook(() => useKeyCapture(makeArgs({ activeId: 'session.new', onRecord })));

    dispatchKey('n', { ctrlKey: true, shiftKey: true });
    expect(onRecord).toHaveBeenCalledWith('session.new', 'mod+shift+n');
  });

  it('stops recording on Escape', () => {
    const onStop = vi.fn();
    renderHook(() => useKeyCapture(makeArgs({ activeId: 'session.new', onStop })));

    dispatchKey('Escape');
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('clears binding on Backspace without modifiers', () => {
    const onRecord = vi.fn();
    renderHook(() => useKeyCapture(makeArgs({ activeId: 'session.new', onRecord })));

    dispatchKey('Backspace');
    expect(onRecord).toHaveBeenCalledWith('session.new', 'none');
  });

  it('clears binding on Delete without modifiers', () => {
    const onRecord = vi.fn();
    renderHook(() => useKeyCapture(makeArgs({ activeId: 'session.new', onRecord })));

    dispatchKey('Delete');
    expect(onRecord).toHaveBeenCalledWith('session.new', 'none');
  });

  it('does not clear binding on Backspace with modifiers (records instead)', () => {
    const onRecord = vi.fn();
    renderHook(() => useKeyCapture(makeArgs({ activeId: 'session.new', onRecord })));

    dispatchKey('Backspace', { shiftKey: true });
    expect(onRecord).not.toHaveBeenCalledWith('session.new', 'none');
    expect(onRecord).toHaveBeenCalledWith('session.new', 'shift+backspace');
  });

  it('continues waiting when only modifier pressed', () => {
    const onRecord = vi.fn();
    renderHook(() => useKeyCapture(makeArgs({ activeId: 'session.new', onRecord })));

    dispatchKey('Shift', { shiftKey: true });
    dispatchKey('Control', { ctrlKey: true });
    dispatchKey('Alt', { altKey: true });
    dispatchKey('Meta', { metaKey: true });

    expect(onRecord).not.toHaveBeenCalled();
  });

  it('detects conflict with another command binding', () => {
    const onConflict = vi.fn();
    const onRecord = vi.fn();
    renderHook(() =>
      useKeyCapture(
        makeArgs({
          activeId: 'workspace.open',
          keybinds: { 'session.new': 'mod+shift+n' },
          onRecord,
          onConflict,
        })
      )
    );

    dispatchKey('n', { ctrlKey: true, shiftKey: true });
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(onConflict.mock.calls[0][0]).toBe('workspace.open');
    expect(onConflict.mock.calls[0][1]).toBe('mod+shift+n');
    const conflicts = onConflict.mock.calls[0][2] as CommandMeta[];
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].id).toBe('session.new');
    expect(onRecord).not.toHaveBeenCalled();
  });

  it('detects conflict with another command default keybind', () => {
    const onConflict = vi.fn();
    renderHook(() =>
      useKeyCapture(
        makeArgs({
          activeId: 'workspace.open',
          keybinds: {},
          onConflict,
        })
      )
    );

    dispatchKey('n', { ctrlKey: true, shiftKey: true });
    expect(onConflict).toHaveBeenCalledTimes(1);
    const conflicts = onConflict.mock.calls[0][2] as CommandMeta[];
    expect(conflicts[0].id).toBe('session.new');
  });

  it('records comma key as `comma` (matches default settings.open keybind)', () => {
    const onRecord = vi.fn();
    renderHook(() =>
      useKeyCapture(
        makeArgs({
          activeId: 'settings.open',
          onRecord,
        })
      )
    );

    dispatchKey(',', { ctrlKey: true, shiftKey: true });
    expect(onRecord).toHaveBeenCalledWith('settings.open', 'mod+shift+comma');
  });

  it('does not conflict with self (same command id)', () => {
    const onConflict = vi.fn();
    const onRecord = vi.fn();
    renderHook(() =>
      useKeyCapture(
        makeArgs({
          activeId: 'session.new',
          keybinds: { 'session.new': 'mod+shift+n' },
          onRecord,
          onConflict,
        })
      )
    );

    dispatchKey('n', { ctrlKey: true, shiftKey: true });
    expect(onConflict).not.toHaveBeenCalled();
    expect(onRecord).toHaveBeenCalledWith('session.new', 'mod+shift+n');
  });

  it('removes listener when activeId becomes null', () => {
    const onRecord = vi.fn();
    const { rerender } = renderHook((props: UseKeyCaptureArgs) => useKeyCapture(props), {
      initialProps: makeArgs({ activeId: 'session.new', onRecord }),
    });

    rerender(makeArgs({ activeId: null, onRecord }));

    dispatchKey('n', { ctrlKey: true, shiftKey: true });
    expect(onRecord).not.toHaveBeenCalled();
  });

  it('uses latest keybinds when checking conflicts (argsRef pattern)', () => {
    const onConflict = vi.fn();
    const onRecord = vi.fn();
    const { rerender } = renderHook((props: UseKeyCaptureArgs) => useKeyCapture(props), {
      initialProps: makeArgs({
        activeId: 'workspace.open',
        keybinds: {},
        onRecord,
        onConflict,
      }),
    });

    // Initially session.new has no override - mod+o pressed would not conflict
    dispatchKey('o', { ctrlKey: true });
    expect(onConflict).not.toHaveBeenCalled();
    expect(onRecord).toHaveBeenCalledWith('workspace.open', 'mod+o');

    // Update keybinds: now session.new is bound to mod+o (conflicts with workspace.open's press)
    onRecord.mockClear();
    onConflict.mockClear();
    rerender(
      makeArgs({
        activeId: 'workspace.open',
        keybinds: { 'session.new': 'mod+o' },
        onRecord,
        onConflict,
      })
    );

    dispatchKey('o', { ctrlKey: true });
    expect(onConflict).toHaveBeenCalledTimes(1);
    const conflicts = onConflict.mock.calls[0][2] as CommandMeta[];
    expect(conflicts[0].id).toBe('session.new');
    expect(onRecord).not.toHaveBeenCalled();
  });

  it('treats `none` keybinds as no conflict', () => {
    const onConflict = vi.fn();
    const onRecord = vi.fn();
    renderHook(() =>
      useKeyCapture(
        makeArgs({
          activeId: 'workspace.open',
          keybinds: { 'session.new': 'none' },
          onRecord,
          onConflict,
        })
      )
    );

    dispatchKey('n', { ctrlKey: true, shiftKey: true });
    expect(onConflict).not.toHaveBeenCalled();
    expect(onRecord).toHaveBeenCalledWith('workspace.open', 'mod+shift+n');
  });

  it('prevents default and stops propagation while recording', () => {
    renderHook(() => useKeyCapture(makeArgs({ activeId: 'session.new' })));

    const event = new KeyboardEvent('keydown', {
      key: 'n',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    const stopPropagationSpy = vi.spyOn(event, 'stopPropagation');
    const stopImmediateSpy = vi.spyOn(event, 'stopImmediatePropagation');

    document.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
    expect(stopPropagationSpy).toHaveBeenCalledTimes(1);
    expect(stopImmediateSpy).toHaveBeenCalledTimes(1);
  });
});
