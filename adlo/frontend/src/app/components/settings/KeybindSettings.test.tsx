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
          linkOpenMethod: 'panel',
          fileOpenMethod: 'panel',
          agentLinkIntercept: false,
          agentSiteWhitelist: [],
          browserSuspendWhitelistEnabled: false,
          browserSuspendWhitelist: [],
        },
        currentWorkspace: undefined,
        recentLogs: [],
        runtime: {
          shell: 'browser',
          tauriVersion: null,
          webviewVersion: null,
          os: 'windows',
          arch: 'x86_64',
          logDir: '',
        },
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

    const search = screen.getByLabelText('settingsShortcutsSearchLabel');
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
    expect(groups.length).toBe(5);
    for (const group of groups) {
      const header = group.querySelector(':scope > .adl-settings-keybinds__group-header');
      const card = group.querySelector(':scope > .adl-settings-card');
      expect(header).not.toBeNull();
      expect(card).not.toBeNull();
      // Header must not be nested inside the card
      expect(card?.querySelector('.adl-settings-keybinds__group-header')).toBeNull();
      // Storage-style title via SettingsHeader (no legacy uppercase group-title, no divider)
      expect(header?.querySelector('.adl-settings-header__title')).not.toBeNull();
      expect(header?.querySelector('.adl-settings-keybinds__group-title')).toBeNull();
    }
  });

  it('renders a sticky toolbar (not a card) with search label + input + keypress-capture button', () => {
    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    const toolbar = document.querySelector('.adl-settings-keybinds__toolbar');
    expect(toolbar).not.toBeNull();
    expect(toolbar?.classList.contains('adl-settings-card')).toBe(false);
    // Top reset-all moved to the settings nav row — no reset button in the toolbar
    expect(screen.queryByLabelText('settingsShortcutsResetAllShortcuts')).toBeNull();
    // Visible "search shortcuts" text label (i18n, not hardcoded)
    expect(screen.getByText('settingsShortcutsSearchLabel')).toBeDefined();
    expect(toolbar?.querySelector('.adl-settings-keybinds__search')).not.toBeNull();
    expect(screen.getByLabelText('settingsShortcutsSearchByKeypress')).toBeDefined();
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
    expect(groupCards.length).toBe(5);
  });

  it('renders a group-level reset button per block', () => {
    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    const groupResets = document.querySelectorAll('.adl-settings-keybinds__group-reset');
    expect(groupResets.length).toBe(5);
  });

  it('renders a per-row reset button before each shortcut name', () => {
    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    const rowResets = screen.getAllByLabelText('settingsShortcutsResetOneFor');
    expect(rowResets.length).toBe(16);
  });

  it('filters commands by keybind text (raw mod+n)', () => {
    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    const search = screen.getByLabelText('settingsShortcutsSearchLabel') as HTMLInputElement;
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

    const search = screen.getByLabelText('settingsShortcutsSearchLabel') as HTMLInputElement;
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

    const search = screen.getByLabelText('settingsShortcutsSearchLabel') as HTMLInputElement;
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
          linkOpenMethod: 'panel',
          fileOpenMethod: 'panel',
          agentLinkIntercept: false,
          agentSiteWhitelist: [],
          browserSuspendWhitelistEnabled: false,
          browserSuspendWhitelist: [],
        },
        currentWorkspace: undefined,
        recentLogs: [],
        runtime: {
          shell: 'browser',
          tauriVersion: null,
          webviewVersion: null,
          os: 'windows',
          arch: 'x86_64',
          logDir: '',
        },
      },
    });

    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    expect(screen.getAllByLabelText('settingsShortcutsUnassigned')).toHaveLength(3);
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
          linkOpenMethod: 'panel',
          fileOpenMethod: 'panel',
          agentLinkIntercept: false,
          agentSiteWhitelist: [],
          browserSuspendWhitelistEnabled: false,
          browserSuspendWhitelist: [],
        },
        currentWorkspace: undefined,
        recentLogs: [],
        runtime: {
          shell: 'browser',
          tauriVersion: null,
          webviewVersion: null,
          os: 'windows',
          arch: 'x86_64',
          logDir: '',
        },
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

    const rowReset = screen.getAllByLabelText('settingsShortcutsResetOneFor')[0];
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
          linkOpenMethod: 'panel',
          fileOpenMethod: 'panel',
          agentLinkIntercept: false,
          agentSiteWhitelist: [],
          browserSuspendWhitelistEnabled: false,
          browserSuspendWhitelist: [],
        },
        currentWorkspace: undefined,
        recentLogs: [],
        runtime: {
          shell: 'browser',
          tauriVersion: null,
          webviewVersion: null,
          os: 'windows',
          arch: 'x86_64',
          logDir: '',
        },
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
    expect(groupResets.length).toBe(5);
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

  it('group reset buttons are disabled when nothing in the group changed', () => {
    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    const groupResets = Array.from(
      document.querySelectorAll('.adl-settings-keybinds__group-reset'),
    ) as HTMLButtonElement[];
    expect(groupResets.length).toBe(5);
    for (const btn of groupResets) {
      expect(btn.disabled).toBe(true);
    }
  });

  it('group reset button enables only for the group that changed', () => {
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
          keybinds: { 'workspace.new': 'mod+k' },
          fonts: { uiFont: '', codeFont: '', terminalFont: '' },
          maxConcurrentWorkspaces: 6,
          workspacePriorityIds: [],
          workspaceDeferredIds: [],
          workspaceNaturalOrder: [],
          browserInactiveTabSuspendMs: 3_600_000,
          linkOpenMethod: 'panel',
          fileOpenMethod: 'panel',
          agentLinkIntercept: false,
          agentSiteWhitelist: [],
          browserSuspendWhitelistEnabled: false,
          browserSuspendWhitelist: [],
        },
        currentWorkspace: undefined,
        recentLogs: [],
        runtime: {
          shell: 'browser',
          tauriVersion: null,
          webviewVersion: null,
          os: 'windows',
          arch: 'x86_64',
          logDir: '',
        },
      },
    });

    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    const groupResets = Array.from(
      document.querySelectorAll('.adl-settings-keybinds__group-reset'),
    ) as HTMLButtonElement[];
    // general, navigation, view, zoom, file — only navigation changed
    const enabled = groupResets.map((btn) => btn.disabled);
    expect(enabled).toEqual([true, false, true, true, true]);
  });

  it('keypress-capture button enters capture mode with a distinct prompt', () => {
    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    const search = screen.getByLabelText('settingsShortcutsSearchLabel') as HTMLInputElement;
    act(() => {
      fireEvent.click(screen.getByLabelText('settingsShortcutsSearchByKeypress'));
    });

    expect(search.placeholder).toBe('settingsShortcutsSearchCapturing');
  });

  it('captured keypress is written into the search box as formatted text', async () => {
    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    act(() => {
      fireEvent.click(screen.getByLabelText('settingsShortcutsSearchByKeypress'));
    });

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true, cancelable: true }),
      );
    });

    const search = screen.getByLabelText('settingsShortcutsSearchLabel') as HTMLInputElement;
    expect(search.value).toBe('Ctrl+N');
    expect(screen.getByText('commandWorkspaceNew')).toBeDefined();
  });

  it('Escape cancels capture mode and restores the previous query', async () => {
    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    const search = screen.getByLabelText('settingsShortcutsSearchLabel') as HTMLInputElement;
    act(() => {
      fireEvent.change(search, { target: { value: 'workspace' } });
    });
    act(() => {
      fireEvent.click(screen.getByLabelText('settingsShortcutsSearchByKeypress'));
    });

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
    });

    expect(search.value).toBe('workspace');
    expect(search.placeholder).toBe('');
  });

  it('modifier-only press previews held keys and keeps waiting', async () => {
    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    act(() => {
      fireEvent.click(screen.getByLabelText('settingsShortcutsSearchByKeypress'));
    });

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Control',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    const search = screen.getByLabelText('settingsShortcutsSearchLabel') as HTMLInputElement;
    // 回显已按下的部分，仍在捕获态（提示语不变）
    expect(search.value).toBe('Ctrl+…');
    expect(search.placeholder).toBe('settingsShortcutsSearchCapturing');
    // 预览同步参与过滤：唯一不含修饰键的命令被滤掉，其余仍在
    expect(screen.getByText('commandWorkspaceNew')).toBeDefined();
    expect(screen.queryByText('fileLineNumbers')).toBeNull();

    // 接着按完组合键，正常提交
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true, cancelable: true }),
      );
    });
    expect(search.value).toBe('Ctrl+N');
  });

  it('group reset reflects hidden rows under an active filter', () => {
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
          // 可见行（workspace.new）为默认，被滤掉的 workspace.open 被改过。
          keybinds: { 'workspace.open': 'mod+k' },
          fonts: { uiFont: '', codeFont: '', terminalFont: '' },
          maxConcurrentWorkspaces: 6,
          workspacePriorityIds: [],
          workspaceDeferredIds: [],
          workspaceNaturalOrder: [],
          browserInactiveTabSuspendMs: 3_600_000,
          linkOpenMethod: 'panel',
          fileOpenMethod: 'panel',
          agentLinkIntercept: false,
          agentSiteWhitelist: [],
          browserSuspendWhitelistEnabled: false,
          browserSuspendWhitelist: [],
        },
        currentWorkspace: undefined,
        recentLogs: [],
        runtime: {
          shell: 'browser',
          tauriVersion: null,
          webviewVersion: null,
          os: 'windows',
          arch: 'x86_64',
          logDir: '',
        },
      },
    });

    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    // 过滤到只剩 workspace.new（默认），但 navigation 块按钮仍启用（整组判定）。
    const search = screen.getByLabelText('settingsShortcutsSearchLabel') as HTMLInputElement;
    act(() => {
      fireEvent.change(search, { target: { value: 'workspace.new' } });
    });
    expect(screen.queryByText('commandWorkspaceOpen')).toBeNull();
    const groupResets = Array.from(
      document.querySelectorAll('.adl-settings-keybinds__group-reset'),
    ) as HTMLButtonElement[];
    expect(groupResets.length).toBe(1);
    expect(groupResets[0].disabled).toBe(false);
  });

  it('renders the search hint button next to the label', () => {
    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    expect(screen.getByLabelText('settingsShortcutsSearchHintLabel')).toBeDefined();
  });

  it('matches cmd+n and command+n alias queries without lookbehind', () => {
    render(
      <TestProvider>
        <KeybindSettings />
      </TestProvider>,
    );

    const search = screen.getByLabelText('settingsShortcutsSearchLabel') as HTMLInputElement;
    act(() => {
      fireEvent.change(search, { target: { value: 'cmd+n' } });
    });
    expect(screen.getByText('commandWorkspaceNew')).toBeDefined();
    act(() => {
      fireEvent.change(search, { target: { value: 'command+n' } });
    });
    expect(screen.getByText('commandWorkspaceNew')).toBeDefined();
  });

  it('resetting a command without default removes its key instead of writing none', async () => {
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
          keybinds: { 'file.toggle-line-numbers': 'alt+l' },
          fonts: { uiFont: '', codeFont: '', terminalFont: '' },
          maxConcurrentWorkspaces: 6,
          workspacePriorityIds: [],
          workspaceDeferredIds: [],
          workspaceNaturalOrder: [],
          browserInactiveTabSuspendMs: 3_600_000,
          linkOpenMethod: 'panel',
          fileOpenMethod: 'panel',
          agentLinkIntercept: false,
          agentSiteWhitelist: [],
          browserSuspendWhitelistEnabled: false,
          browserSuspendWhitelist: [],
        },
        currentWorkspace: undefined,
        recentLogs: [],
        runtime: {
          shell: 'browser',
          tauriVersion: null,
          webviewVersion: null,
          os: 'windows',
          arch: 'x86_64',
          logDir: '',
        },
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

    const buttons = screen.getAllByLabelText('settingsShortcutsResetOneFor');
    const target = buttons.find(
      (b) => b.closest('li')?.textContent?.includes('fileLineNumbers') ?? false,
    );
    expect(target).toBeDefined();
    await act(async () => {
      fireEvent.click(target!);
    });

    expect(updatePreferencesSpy).toHaveBeenCalledTimes(1);
    const call = updatePreferencesSpy.mock.calls[0][0];
    expect(call.keybinds).toBeDefined();
    expect('file.toggle-line-numbers' in (call.keybinds ?? {})).toBe(false);
    updatePreferencesSpy.mockRestore();
  });
});
