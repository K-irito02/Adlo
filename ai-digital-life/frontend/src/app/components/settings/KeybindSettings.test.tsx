import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import type { CopyDict } from '../../i18n';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { useAppStore } from '../../stores/slicedStore';
import { KeybindSettings } from './KeybindSettings';

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

function getKeybindButtons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll('button.adl-settings-keybind'));
}

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
          browserInactiveTabSuspendMs: 3_600_000,
          terminalHistoryBudgetBytes: 1 << 30,
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
    expect(screen.getByText('commandWorkspaceNew')).toBeDefined();
    expect(screen.getByText('commandWorkspaceOpen')).toBeDefined();
    expect(screen.getByText('commandSettingsOpen')).toBeDefined();

    // Group labels (workspace.new/open → navigation group, settings.open → general group)
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

  it('wraps each visible command group in an adl-settings-card', () => {
    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    const groupCards = document.querySelectorAll(
      '.adl-settings-keybinds__group > .adl-settings-card',
    );
    expect(groupCards.length).toBeGreaterThan(1);
    for (const card of groupCards) {
      expect(card.querySelector('.adl-settings-keybinds__list')).not.toBeNull();
    }
  });

  it('renders group headers outside the cards (workspace/storage pattern)', () => {
    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    const groups = document.querySelectorAll('.adl-settings-keybinds__group');
    expect(groups.length).toBe(2);
    for (const group of groups) {
      const header = group.querySelector(':scope > .adl-settings-keybinds__group-header');
      const card = group.querySelector(':scope > .adl-settings-card');
      expect(header).not.toBeNull();
      expect(card).not.toBeNull();
      // Header must not be nested inside the card
      expect(card?.querySelector('.adl-settings-keybinds__group-header')).toBeNull();
      expect(header?.querySelector('.adl-settings-keybinds__group-title')).not.toBeNull();
    }
  });

  it('renders a sticky toolbar (not a card) with reset-all + search label + search input', () => {
    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    const toolbar = document.querySelector('.adl-settings-keybinds__toolbar');
    expect(toolbar).not.toBeNull();
    expect(toolbar?.classList.contains('adl-settings-card')).toBe(false);
    // Top reset-all button uses the shortcuts-scoped label
    expect(screen.getByLabelText('settingsShortcutsResetAllShortcuts')).toBeDefined();
    // Visible "search shortcuts" text label (i18n, not hardcoded)
    expect(screen.getByText('settingsShortcutsSearchLabel')).toBeDefined();
    expect(toolbar?.querySelector('.adl-settings-keybinds__search')).not.toBeNull();
  });

  it('renders only groups that have commands (no empty placeholder groups)', () => {
    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    const groupCards = document.querySelectorAll(
      '.adl-settings-keybinds__group > .adl-settings-card',
    );
    expect(groupCards.length).toBe(2);
  });

  it('renders a group-level reset button per block', () => {
    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    const groupResets = document.querySelectorAll('.adl-settings-keybinds__group-reset');
    expect(groupResets.length).toBe(2);
  });

  it('renders a per-row reset button before each shortcut name', () => {
    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    const rowResets = screen.getAllByLabelText('settingsShortcutsResetOne');
    expect(rowResets.length).toBe(3);
  });

  it('filters commands by keybind text (raw mod+n)', () => {
    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    const search = screen.getByPlaceholderText('settingsShortcutsSearch') as HTMLInputElement;
    act(() => {
      fireEvent.change(search, { target: { value: 'mod+n' } });
    });

    expect(screen.getByText('commandWorkspaceNew')).toBeDefined();
    expect(screen.queryByText('commandSettingsOpen')).toBeNull();
  });

  it('filters commands by formatted keybind text (Ctrl+N)', () => {
    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    const search = screen.getByPlaceholderText('settingsShortcutsSearch') as HTMLInputElement;
    act(() => {
      fireEvent.change(search, { target: { value: 'Ctrl+N' } });
    });

    expect(screen.getByText('commandWorkspaceNew')).toBeDefined();
    expect(screen.queryByText('commandSettingsOpen')).toBeNull();
  });

  it('filters commands by search query', () => {
    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    const search = screen.getByPlaceholderText('settingsShortcutsSearch') as HTMLInputElement;
    act(() => {
      fireEvent.change(search, { target: { value: 'commandWorkspace' } });
    });

    expect(screen.getByText('commandWorkspaceNew')).toBeDefined();
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
          keybinds: { 'settings.open': 'none' },
          fonts: { uiFont: '', codeFont: '', terminalFont: '' },
          maxConcurrentWorkspaces: 6,
          workspacePriorityIds: [],
          workspaceDeferredIds: [],
          workspaceNaturalOrder: [],
          browserInactiveTabSuspendMs: 3_600_000,
          terminalHistoryBudgetBytes: 1 << 30,
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

    const keybindButton = getKeybindButtons()[0];

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
    const keybindButton = getKeybindButtons()[0];
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
    // workspace.new has default 'mod+n'. Try to set workspace.open to 'mod+n' -
    // should conflict with workspace.new.
    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    // Find workspace.open's button via its KeybindControl and press mod+n,
    // which conflicts with workspace.new's default.
    const keybindButtons = getKeybindButtons();
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

    // Press mod+n (conflicts with workspace.new's default)
    await act(async () => {
      const event = new KeyboardEvent('keydown', {
        key: 'n',
        ctrlKey: true,
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

    const keybindButton = getKeybindButtons()[0];
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

    const keybindButton = getKeybindButtons()[0];
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

  it('row reset restores a single shortcut without a confirm dialog', async () => {
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
          keybinds: { 'settings.open': 'mod+k' },
          fonts: { uiFont: '', codeFont: '', terminalFont: '' },
          maxConcurrentWorkspaces: 6,
          workspacePriorityIds: [],
          workspaceDeferredIds: [],
          workspaceNaturalOrder: [],
          browserInactiveTabSuspendMs: 3_600_000,
          terminalHistoryBudgetBytes: 1 << 30,
        },
        currentWorkspace: undefined,
        recentLogs: [],
      },
    });
    const updatePreferencesSpy = vi
      .spyOn(useAppStore.getState(), 'updatePreferences')
      .mockResolvedValue(true);

    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    const rowReset = screen.getAllByLabelText('settingsShortcutsResetOne')[0];
    await act(async () => {
      fireEvent.click(rowReset);
    });

    expect(updatePreferencesSpy).toHaveBeenCalledTimes(1);
    const call = updatePreferencesSpy.mock.calls[0][0];
    expect(call.keybinds?.['settings.open']).toBe('mod+shift+comma');
    updatePreferencesSpy.mockRestore();
  });

  it('group reset opens a confirm dialog and resets the group on confirm', async () => {
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
          keybinds: { 'workspace.new': 'mod+k', 'workspace.open': 'mod+j' },
          fonts: { uiFont: '', codeFont: '', terminalFont: '' },
          maxConcurrentWorkspaces: 6,
          workspacePriorityIds: [],
          workspaceDeferredIds: [],
          workspaceNaturalOrder: [],
          browserInactiveTabSuspendMs: 3_600_000,
          terminalHistoryBudgetBytes: 1 << 30,
        },
        currentWorkspace: undefined,
        recentLogs: [],
      },
    });
    const updatePreferencesSpy = vi
      .spyOn(useAppStore.getState(), 'updatePreferences')
      .mockResolvedValue(true);

    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    const groupResets = document.querySelectorAll('.adl-settings-keybinds__group-reset');
    expect(groupResets.length).toBe(2);
    // navigation group is second; its reset restores workspace.new/open defaults
    await act(async () => {
      fireEvent.click(groupResets[1]);
    });

    const confirmButton = screen.getByText('confirm');
    await act(async () => {
      fireEvent.click(confirmButton);
    });

    expect(updatePreferencesSpy).toHaveBeenCalledTimes(1);
    const call = updatePreferencesSpy.mock.calls[0][0];
    expect(call.keybinds?.['workspace.new']).toBe('mod+n');
    expect(call.keybinds?.['workspace.open']).toBe('mod+o');
    updatePreferencesSpy.mockRestore();
  });

  it('top reset-all opens a confirm dialog and resets all shortcuts on confirm', async () => {
    const updatePreferencesSpy = vi
      .spyOn(useAppStore.getState(), 'updatePreferences')
      .mockResolvedValue(true);

    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByLabelText('settingsShortcutsResetAllShortcuts'));
    });

    const confirmButton = screen.getByText('confirm');
    await act(async () => {
      fireEvent.click(confirmButton);
    });

    expect(updatePreferencesSpy).toHaveBeenCalledTimes(1);
    const call = updatePreferencesSpy.mock.calls[0][0];
    expect(call.keybinds?.['workspace.new']).toBe('mod+n');
    expect(call.keybinds?.['workspace.open']).toBe('mod+o');
    expect(call.keybinds?.['settings.open']).toBe('mod+shift+comma');
    updatePreferencesSpy.mockRestore();
  });
});
