import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import type { CopyDict } from '../../i18n';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { useAppStore } from '../../stores/slicedStore';
import { commandRegistry } from '../../commands/commandRegistry';
import { KeybindSettings } from './KeybindSettings';

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

function TestProvider({ children }: { children: React.ReactNode }) {
  return (
    <TCopyProvider t={mockT} locale="en-US">
      {children}
    </TCopyProvider>
  );
}

describe('KeybindSettings', () => {
  let originalPlatform: string;

  beforeEach(() => {
    originalPlatform = navigator.platform;
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true });
    commandRegistry.reset();
    useAppStore.setState({
      appInfo: {
        appName: 'test',
        version: '0.0.0',
        config: {
          language: 'en-US',
          themeMode: 'system',
          resolvedTheme: 'light',
          logLevel: 'info',
          terminalLogMode: 'overwrite',
          debugLogMode: 'overwrite',
          maxRecentWorkspaces: 5,
          modelPreferences: { providers: {} },
          keybinds: {},
          fonts: { uiFont: '', codeFont: '', terminalFont: '' },
          maxConcurrentWorkspaces: 6,
          workspacePriorityIds: [],
          workspaceDeferredIds: [],
          workspaceNaturalOrder: [],
        },
        currentWorkspace: undefined,
        recentLogs: [],
      },
      toasts: [],
    });
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(navigator, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
    useAppStore.setState({
      appInfo: undefined,
      toasts: [],
    });
  });

  it('renders all default commands grouped by group label', () => {
    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    // Command titles
    expect(screen.getByText('commandSessionNew')).toBeDefined();
    expect(screen.getByText('commandWorkspaceNew')).toBeDefined();
    expect(screen.getByText('commandWorkspaceOpen')).toBeDefined();
    expect(screen.getByText('commandSettingsOpen')).toBeDefined();

    // Group labels (session.new → session group, workspace.new/open → navigation group, settings.open → general group)
    expect(screen.getByText('settingsShortcutsGroupSession')).toBeDefined();
    expect(screen.getByText('settingsShortcutsGroupNavigation')).toBeDefined();
    expect(screen.getByText('settingsShortcutsGroupGeneral')).toBeDefined();
  });

  it('renders search input', () => {
    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    const search = screen.getByPlaceholderText('settingsShortcutsSearch');
    expect(search).toBeDefined();
  });

  it('filters commands by search query', () => {
    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    const search = screen.getByPlaceholderText('settingsShortcutsSearch') as HTMLInputElement;
    act(() => {
      fireEvent.change(search, { target: { value: 'commandSession' } });
    });

    expect(screen.getByText('commandSessionNew')).toBeDefined();
    expect(screen.queryByText('commandWorkspaceNew')).toBeNull();
    expect(screen.queryByText('commandWorkspaceOpen')).toBeNull();
    expect(screen.queryByText('commandSettingsOpen')).toBeNull();
  });

  it('KeybindControl shows Unassigned when no keybind set', () => {
    useAppStore.setState({
      appInfo: {
        appName: 'test',
        version: '0.0.0',
        config: {
          language: 'en-US',
          themeMode: 'system',
          resolvedTheme: 'light',
          logLevel: 'info',
          terminalLogMode: 'overwrite',
          debugLogMode: 'overwrite',
          maxRecentWorkspaces: 5,
          modelPreferences: { providers: {} },
          keybinds: { 'session.new': 'none' },
          fonts: { uiFont: '', codeFont: '', terminalFont: '' },
          maxConcurrentWorkspaces: 6,
          workspacePriorityIds: [],
          workspaceDeferredIds: [],
          workspaceNaturalOrder: [],
        },
        currentWorkspace: undefined,
        recentLogs: [],
      },
    });

    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    expect(screen.getByLabelText('settingsShortcutsUnassigned')).toBeDefined();
  });

  it('clicking KeybindControl enters recording mode (aria-label changes to Press keys)', () => {
    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    const buttons = screen.getAllByRole('button');
    const keybindButton =
      buttons.find((b) => b.getAttribute('aria-label') !== 'settingsShortcutsUnassigned') ??
      buttons[0];

    act(() => {
      fireEvent.click(keybindButton);
    });

    expect(screen.getByLabelText('settingsShortcutsPressKeys')).toBeDefined();
  });

  it('records new keybind and calls updatePreferences', async () => {
    const updatePreferencesSpy = vi
      .spyOn(useAppStore.getState(), 'updatePreferences')
      .mockResolvedValue(true);

    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    // Click first keybind button to start recording (settings.open in general group)
    const keybindButton = screen.getAllByRole('button')[0];
    act(() => {
      fireEvent.click(keybindButton);
    });

    // Dispatch keydown for mod+k (does not conflict with any default keybind)
    await act(async () => {
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
    });

    expect(updatePreferencesSpy).toHaveBeenCalledTimes(1);
    const call = updatePreferencesSpy.mock.calls[0][0];
    expect(call.keybinds).toBeDefined();
    if (call.keybinds) {
      expect(call.keybinds['settings.open']).toBe('mod+k');
    }
    updatePreferencesSpy.mockRestore();
  });

  it('shows toast on conflict (keybind matches another command default)', async () => {
    const showToastSpy = vi.spyOn(useAppStore.getState(), 'showToast').mockReturnValue('id');

    // Initial state: no keybind overrides - all defaults are in effect.
    // workspace.open has default 'mod+o'. session.new has default 'mod+shift+n'.
    // Try to set workspace.open to 'mod+shift+n' - should conflict with session.new.
    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    // Find workspace.open's button (it shows "Ctrl+Shift+N" via formatKeybind, but we use mock t so it's the formatted string)
    // Use the workspace.open command title to locate its row.
    const allButtons = screen.getAllByRole('button');
    // Click the second button (workspace.open's keybind button). The exact index may vary by group order.
    // To be robust: find a button that is NOT the search input and click it.
    const keybindButtons = allButtons.filter((b) => b.tagName === 'BUTTON');
    // We want to click the workspace.open keybind (which is in the navigation group, after session group)
    // Find by clicking each button until recording mode starts.
    let clicked = false;
    for (const btn of keybindButtons) {
      act(() => {
        fireEvent.click(btn);
      });
      if (screen.queryByLabelText('settingsShortcutsPressKeys')) {
        clicked = true;
        break;
      }
    }
    expect(clicked).toBe(true);

    // Press mod+shift+n (conflicts with session.new's default)
    await act(async () => {
      const event = new KeyboardEvent('keydown', {
        key: 'n',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
    });

    expect(showToastSpy).toHaveBeenCalledTimes(1);
    expect(showToastSpy.mock.calls[0][0]).toContain('settingsShortcutsConflictDesc');
    expect(showToastSpy.mock.calls[0][1]).toBe('warning');
    showToastSpy.mockRestore();
  });

  it('Escape stops recording without saving', async () => {
    const updatePreferencesSpy = vi
      .spyOn(useAppStore.getState(), 'updatePreferences')
      .mockResolvedValue(true);

    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    const keybindButton = screen.getAllByRole('button')[0];
    act(() => {
      fireEvent.click(keybindButton);
    });
    expect(screen.getByLabelText('settingsShortcutsPressKeys')).toBeDefined();

    await act(async () => {
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
    });

    // Recording mode should end - "Press keys" label gone
    expect(screen.queryByLabelText('settingsShortcutsPressKeys')).toBeNull();
    expect(updatePreferencesSpy).not.toHaveBeenCalled();
    updatePreferencesSpy.mockRestore();
  });

  it('Backspace without modifiers clears the binding', async () => {
    const updatePreferencesSpy = vi
      .spyOn(useAppStore.getState(), 'updatePreferences')
      .mockResolvedValue(true);

    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    const keybindButton = screen.getAllByRole('button')[0];
    act(() => {
      fireEvent.click(keybindButton);
    });

    await act(async () => {
      const event = new KeyboardEvent('keydown', {
        key: 'Backspace',
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
    });

    expect(updatePreferencesSpy).toHaveBeenCalledTimes(1);
    const call = updatePreferencesSpy.mock.calls[0][0];
    expect(call.keybinds).toBeDefined();
    if (call.keybinds) {
      expect(call.keybinds['settings.open']).toBe('none');
    }
    updatePreferencesSpy.mockRestore();
  });
});
