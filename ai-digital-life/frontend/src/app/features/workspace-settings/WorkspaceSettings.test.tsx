import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import type { CopyDict } from '../../i18n';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { useAppStore } from '../../stores/slicedStore';
import { WorkspaceSettings } from './WorkspaceSettings';
import {
  DEFAULT_MAX_CONCURRENT_WORKSPACES,
  DEFAULT_WORKSPACE_PRIORITY_IDS,
  DEFAULT_WORKSPACE_DEFERRED_IDS,
} from '../../../shared/defaultPreferences';

// 组文案配含 {group} 的真模板，使 formatT 插值得以被覆盖（与 SettingsPanel.test 同法）。
const GROUP_TEMPLATES: Record<string, string> = {
  settingsResetGroupToDefault: 'Reset {group} all defaults',
  settingsResetGroupConfirmTitle: 'Reset {group}?',
  settingsResetGroupConfirmMessage: '{group} group will reset',
};

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? (GROUP_TEMPLATES[key] ?? key) : ''),
}) as unknown as CopyDict;

function TestProvider({ children }: { children: React.ReactNode }) {
  return (
    <TCopyProvider t={mockT} locale="en-US">
      {children}
    </TCopyProvider>
  );
}

interface ConfigPatch {
  maxConcurrentWorkspaces?: number;
  workspacePriorityIds?: string[];
  workspaceDeferredIds?: string[];
  workspaceNaturalOrder?: string[];
}

function setupStore(configOverrides: ConfigPatch = {}) {
  const updatePreferences = vi.fn(async () => true);
  const showToast = vi.fn();
  useAppStore.setState({
    updatePreferences,
    showToast,
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
        ...configOverrides,
      },
      currentWorkspace: undefined,
      recentLogs: [],
    },
    recentWorkspaces: [],
  });
  return { updatePreferences, showToast };
}

function renderSettings() {
  return render(
    <TestProvider>
      <WorkspaceSettings />
    </TestProvider>,
  );
}

describe('WorkspaceSettings merged block', () => {
  afterEach(() => {
    cleanup();
    useAppStore.setState({
      appInfo: undefined,
      recentWorkspaces: [],
    });
  });

  it('renders the main title outside the card with a reset button on its left', () => {
    setupStore();
    renderSettings();

    const header = document.querySelector('.adl-settings-workspace__header');
    expect(header).not.toBeNull();
    // 主标题在卡外（不在任何 adl-settings-card 内部）
    expect(header?.closest('.adl-settings-card')).toBeNull();
    expect(header?.textContent).toContain('settingsWorkspaceLoad');

    const resetBtn = screen.getByRole('button', {
      name: 'Reset settingsWorkspaceLoad all defaults',
    });
    expect(header?.contains(resetBtn)).toBe(true);
    const titleEl = header?.querySelector('.adl-settings-header__title');
    expect(titleEl).not.toBeNull();
    // 恢复默认按钮位于主标题左侧
    expect(
      resetBtn.compareDocumentPosition(titleEl!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('block reset button is disabled when values equal defaults', () => {
    setupStore();
    renderSettings();

    const resetBtn = screen.getByRole('button', {
      name: 'Reset settingsWorkspaceLoad all defaults',
    });
    expect(resetBtn.hasAttribute('disabled')).toBe(true);
  });

  it('block reset button enables when a value differs from defaults', () => {
    setupStore({ maxConcurrentWorkspaces: 3 });
    renderSettings();

    const resetBtn = screen.getByRole('button', {
      name: 'Reset settingsWorkspaceLoad all defaults',
    });
    expect(resetBtn.hasAttribute('disabled')).toBe(false);
  });

  it('block reset stays enabled while config is loading (fail-open)', () => {
    setupStore();
    useAppStore.setState({ appInfo: undefined });
    renderSettings();

    const resetBtn = screen.getByRole('button', {
      name: 'Reset settingsWorkspaceLoad all defaults',
    });
    expect(resetBtn.hasAttribute('disabled')).toBe(false);
  });

  it('renders one card with three list sections and no grid cards', () => {
    setupStore();
    renderSettings();

    // 四块合一：仅一张卡
    const cards = document.querySelectorAll('.adl-settings-workspace .adl-settings-card');
    expect(cards).toHaveLength(1);
    expect(document.querySelector('[data-testid="workspace-load-card"]')).not.toBeNull();

    // 三个列表 section 仍在
    expect(document.querySelectorAll('.adl-sortable-section')).toHaveLength(3);

    // 不再有 3 张 grid 小卡
    expect(document.querySelectorAll('.adl-settings-card--grid')).toHaveLength(0);
    expect(document.querySelectorAll('.workspace-grid .adl-settings-card')).toHaveLength(0);

    // dnd 三列落点网格必须保留
    expect(document.querySelector('.workspace-grid')).not.toBeNull();
    expect(document.querySelector('[data-droppable="priority"]')).not.toBeNull();
    expect(document.querySelector('[data-droppable="deferred"]')).not.toBeNull();
    expect(document.querySelector('[data-droppable="natural"]')).not.toBeNull();
  });

  it('renders the max-concurrent input with the narrow modifier', () => {
    setupStore();
    renderSettings();

    const input = document.querySelector(
      'input.adl-settings-input--narrow',
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input?.value).toBe(String(DEFAULT_MAX_CONCURRENT_WORKSPACES));
    // 不应再挂无修饰的宽输入类以外的宽度来源——narrow 修饰必须存在
    expect(input?.classList.contains('adl-settings-input')).toBe(true);
  });

  it('places the hint icon before the row label text', () => {
    setupStore();
    renderSettings();

    const labelRow = document.querySelector('.adl-settings-row__label-text');
    expect(labelRow).not.toBeNull();
    const children = Array.from(labelRow!.children);
    const infoIndex = children.findIndex(
      (c) =>
        c.classList.contains('adl-icon-button--info') || c.querySelector('.adl-icon-button--info'),
    );
    const textIndex = children.findIndex((c) => c.textContent === 'maxConcurrentWorkspaces');
    expect(infoIndex).toBeGreaterThanOrEqual(0);
    expect(textIndex).toBeGreaterThanOrEqual(0);
    expect(infoIndex).toBeLessThan(textIndex);
  });

  it('block reset opens confirm dialog and persists workspace defaults on confirm', async () => {
    const { updatePreferences, showToast } = setupStore({
      maxConcurrentWorkspaces: 12,
      workspacePriorityIds: ['a'],
      workspaceDeferredIds: ['b'],
      workspaceNaturalOrder: ['c'],
    });
    renderSettings();

    fireEvent.click(
      screen.getByRole('button', { name: 'Reset settingsWorkspaceLoad all defaults' }),
    );
    expect(screen.getByText('Reset settingsWorkspaceLoad?')).toBeInTheDocument();
    expect(screen.getByText('settingsWorkspaceLoad group will reset')).toBeInTheDocument();
    expect(updatePreferences).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => {
      expect(updatePreferences).toHaveBeenCalledTimes(1);
    });
    expect(updatePreferences).toHaveBeenCalledWith({
      maxConcurrentWorkspaces: DEFAULT_MAX_CONCURRENT_WORKSPACES,
      workspacePriorityIds: [...DEFAULT_WORKSPACE_PRIORITY_IDS],
      workspaceDeferredIds: [...DEFAULT_WORKSPACE_DEFERRED_IDS],
    });
    expect(showToast).toHaveBeenCalledWith('settingsResetComplete', 'success');
    expect(screen.queryByText('Reset settingsWorkspaceLoad?')).toBeNull();
    // 本地状态立即回到默认（不等 200ms debounce 回写）
    const input = document.querySelector('input.adl-settings-input--narrow') as HTMLInputElement;
    expect(input.value).toBe(String(DEFAULT_MAX_CONCURRENT_WORKSPACES));
  });

  it('block reset cancel keeps values and does not persist', () => {
    const { updatePreferences } = setupStore({ maxConcurrentWorkspaces: 12 });
    renderSettings();

    fireEvent.click(
      screen.getByRole('button', { name: 'Reset settingsWorkspaceLoad all defaults' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    expect(updatePreferences).not.toHaveBeenCalled();
    expect(screen.queryByText('Reset settingsWorkspaceLoad?')).toBeNull();
    const input = document.querySelector('input.adl-settings-input--narrow') as HTMLInputElement;
    expect(input.value).toBe('12');
  });

  it('block reset failure surfaces an error toast and rolls local values back', async () => {
    const { updatePreferences, showToast } = setupStore({ maxConcurrentWorkspaces: 12 });
    updatePreferences.mockResolvedValue(false);
    renderSettings();

    fireEvent.click(
      screen.getByRole('button', { name: 'Reset settingsWorkspaceLoad all defaults' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('settingsUpdateFailed', 'error');
    });
    expect(showToast).not.toHaveBeenCalledWith('settingsResetComplete', 'success');
    // 失败回滚：本地回到落盘值 12，不与 store 脱节
    const input = document.querySelector('input.adl-settings-input--narrow') as HTMLInputElement;
    expect(input.value).toBe('12');
  });

  it('keeps an in-flight edit when an equal-content external update arrives', async () => {
    vi.useFakeTimers();
    try {
      const { updatePreferences } = setupStore({ maxConcurrentWorkspaces: 6 });
      renderSettings();

      const input = document.querySelector('input.adl-settings-input--narrow') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '12' } });
      expect(input.value).toBe('12');

      // 外部同内容更新（新数组身份）：其它来源回写了相同值，不得清掉在途 debounce。
      // setState 包进同步 act，确保外部 effect 先于 advanceTimers 执行（否则重渲染被推迟、timer 先开火，测不到竞态）。
      act(() => {
        useAppStore.setState((s) => ({
          appInfo: s.appInfo
            ? {
                ...s.appInfo,
                config: {
                  ...s.appInfo.config,
                  maxConcurrentWorkspaces: 12,
                  workspacePriorityIds: [],
                  workspaceDeferredIds: [],
                  workspaceNaturalOrder: [],
                },
              }
            : s.appInfo,
        }));
      });

      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      expect(updatePreferences).toHaveBeenCalledWith({
        maxConcurrentWorkspaces: 12,
        workspacePriorityIds: [],
        workspaceDeferredIds: [],
        workspaceNaturalOrder: [],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('syncs local state when external config changes (e.g. group reset elsewhere)', async () => {
    setupStore({ maxConcurrentWorkspaces: 6 });
    renderSettings();

    const input = document.querySelector('input.adl-settings-input--narrow') as HTMLInputElement;
    expect(input.value).toBe('6');

    // 外部更新 config（模拟侧栏组级重置或其它来源回写）
    useAppStore.setState((s) => ({
      appInfo: s.appInfo
        ? { ...s.appInfo, config: { ...s.appInfo.config, maxConcurrentWorkspaces: 10 } }
        : s.appInfo,
    }));

    await waitFor(() => {
      const next = document.querySelector('input.adl-settings-input--narrow') as HTMLInputElement;
      expect(next.value).toBe('10');
    });
  });
});
