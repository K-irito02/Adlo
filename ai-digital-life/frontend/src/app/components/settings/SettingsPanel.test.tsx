import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { CopyDict } from '../../i18n';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { useAppStore } from '../../stores/slicedStore';
import { SettingsPanel } from './SettingsPanel';
import { resetStorageSettingsCache } from '../../features/storage-settings/storageStatusCache';
import {
  DEFAULT_DEBUG_LOG_MODE,
  DEFAULT_FONTS,
  DEFAULT_KEYBINDS,
  DEFAULT_LANGUAGE,
  DEFAULT_LOG_LEVEL,
  DEFAULT_MAX_CONCURRENT_WORKSPACES,
  DEFAULT_TERMINAL_LOG_MODE,
  DEFAULT_THEME_MODE,
  DEFAULT_WORKSPACE_DEFERRED_IDS,
  DEFAULT_WORKSPACE_NATURAL_ORDER,
  DEFAULT_WORKSPACE_PRIORITY_IDS,
  getDefaultPreferences,
} from '../../../shared/defaultPreferences';

// 组文案配含 {group} 的真模板，使 formatT 插值得以被覆盖（裸 key 回退测不到插值）。
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

function setupStore() {
  const updatePreferences = vi.fn(async () => true);
  const showToast = vi.fn();
  useAppStore.setState((s) => ({
    settingsSearchQuery: '',
    activeSettingsGroup: 'general',
    navigatorCollapsedByTool: { ...s.navigatorCollapsedByTool, settings: false },
    settingsNavigatorWidth: 200,
    updatePreferences,
    showToast,
  }));
  return { updatePreferences, showToast };
}

function renderPanel() {
  return render(
    <TestProvider>
      <SettingsPanel settings={[]} onChangeSetting={() => {}} />
    </TestProvider>,
  );
}

// 存储进场缓存为模块级状态：每例冷启动，避免命中缓存跳过加载路径干扰断言。
beforeEach(() => {
  resetStorageSettingsCache();
});

describe('SettingsPanel shell header', () => {
  afterEach(() => {
    cleanup();
    useAppStore.setState((s) => ({
      settingsSearchQuery: '',
      navigatorCollapsedByTool: { ...s.navigatorCollapsedByTool, settings: false },
    }));
  });

  it('初始只渲染搜索图标按钮，不展开输入框', () => {
    setupStore();
    renderPanel();
    expect(screen.getByRole('button', { name: 'settingsSearchLabel' })).not.toBeNull();
    expect(document.querySelector('#adl-settings-search-input')).toBeNull();
  });

  it('点击搜索图标后展开输入框并聚焦', () => {
    setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsSearchLabel' }));
    const input = document.querySelector('#adl-settings-search-input') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('输入框按 Escape 收起并清空关键词，焦点回到搜索图标', () => {
    setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsSearchLabel' }));
    const input = document.querySelector('#adl-settings-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'theme' } });
    expect(useAppStore.getState().settingsSearchQuery).toBe('theme');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(useAppStore.getState().settingsSearchQuery).toBe('');
    expect(document.querySelector('#adl-settings-search-input')).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'settingsSearchLabel' }),
    );
  });

  it('输入框失焦到面板外收起并清空关键词', () => {
    setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsSearchLabel' }));
    const input = document.querySelector('#adl-settings-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'theme' } });
    fireEvent.blur(input, { relatedTarget: document.body });
    expect(useAppStore.getState().settingsSearchQuery).toBe('');
    expect(document.querySelector('#adl-settings-search-input')).toBeNull();
  });

  it('输入框失焦收起并清空关键词', () => {
    setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsSearchLabel' }));
    const input = document.querySelector('#adl-settings-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'theme' } });
    fireEvent.blur(input);
    expect(useAppStore.getState().settingsSearchQuery).toBe('');
    expect(document.querySelector('#adl-settings-search-input')).toBeNull();
  });

  it('toggle 右侧带有中段分隔线', () => {
    setupStore();
    renderPanel();
    const header = document.querySelector('.adl-settings-panel__header');
    expect(header?.querySelector('.adl-tool-context__separator')).not.toBeNull();
  });

  it('点击恢复全部默认先弹确认框，不直接执行', () => {
    const { updatePreferences } = setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    expect(screen.getByText('settingsResetConfirmTitle')).not.toBeNull();
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it('确认框点确认执行恢复并关闭，点取消不执行', async () => {
    const { updatePreferences, showToast } = setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => {
      expect(updatePreferences).toHaveBeenCalledTimes(1);
      expect(updatePreferences).toHaveBeenCalledWith(getDefaultPreferences());
      // 恢复全部确含挂起默认值（F7：getDefaultPreferences 自引恒过，此断言锁行为）。
      expect(updatePreferences).toHaveBeenCalledWith(
        expect.objectContaining({ browserInactiveTabSuspendMs: 900_000 }),
      );
      expect(showToast).toHaveBeenCalled();
    });
    expect(screen.queryByText('settingsResetConfirmTitle')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    expect(screen.getByText('settingsResetConfirmTitle')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    expect(updatePreferences).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('settingsResetConfirmTitle')).toBeNull();
  });

  it('blur 到面板内控件保持过滤与展开', () => {
    setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsSearchLabel' }));
    const input = document.querySelector('#adl-settings-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'theme' } });
    fireEvent.blur(input, {
      relatedTarget: screen.getByRole('button', { name: 'settingsResetAll' }),
    });
    expect(useAppStore.getState().settingsSearchQuery).toBe('theme');
    expect(document.querySelector('#adl-settings-search-input')).not.toBeNull();
  });

  it('恢复失败弹错误提示而非成功提示', async () => {
    const { updatePreferences, showToast } = setupStore();
    updatePreferences.mockResolvedValue(false);
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('settingsUpdateFailed', 'error');
    });
    expect(showToast).not.toHaveBeenCalledWith('settingsResetComplete', 'success');
  });

  it('对话框按 Escape 与点 overlay 关闭且不执行', () => {
    const { updatePreferences } = setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(updatePreferences).not.toHaveBeenCalled();
    expect(screen.queryByText('settingsResetConfirmTitle')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    fireEvent.click(screen.getByRole('dialog'));
    expect(updatePreferences).not.toHaveBeenCalled();
    expect(screen.queryByText('settingsResetConfirmTitle')).toBeNull();
  });

  it('点击对话框内层不关闭', () => {
    const { updatePreferences } = setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    const inner = document.querySelector('.adl-confirm-dialog') as HTMLElement;
    expect(inner).not.toBeNull();
    fireEvent.click(inner);
    expect(updatePreferences).not.toHaveBeenCalled();
    expect(screen.getByText('settingsResetConfirmTitle')).not.toBeNull();
  });

  it('确认框打开时搜索框 Escape 只关框不清空关键词', () => {
    setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    expect(screen.getByText('settingsResetConfirmTitle')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'settingsSearchLabel' }));
    const input = document.querySelector('#adl-settings-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'theme' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByText('settingsResetConfirmTitle')).toBeNull();
    expect(useAppStore.getState().settingsSearchQuery).toBe('theme');
    expect(document.querySelector('#adl-settings-search-input')).not.toBeNull();
  });

  it('内外各仅一处 settings-nav 类（防嵌套回归）', () => {
    setupStore();
    renderPanel();
    expect(document.querySelectorAll('.adl-settings-nav').length).toBe(1);
    const innerNav = document.querySelector('.adl-settings-panel__body nav:not([class])');
    expect(innerNav).not.toBeNull();
    expect(innerNav?.getAttribute('aria-label')).toBe('settingsTitle');
  });
});

describe('SettingsPanel group reset', () => {
  afterEach(() => {
    cleanup();
    useAppStore.setState((s) => ({
      settingsSearchQuery: '',
      navigatorCollapsedByTool: { ...s.navigatorCollapsedByTool, settings: false },
    }));
  });

  it('组级重置弹分组文案（含组名插值）而非“恢复全部”文案', async () => {
    const { updatePreferences } = setupStore();
    renderPanel();
    // mockT 组模板含 {group}：断言插值后文本，覆盖 formatT 真路径。
    fireEvent.click(screen.getByRole('button', { name: 'Reset settingsGeneral all defaults' }));
    expect(screen.getByText('Reset settingsGeneral?')).not.toBeNull();
    expect(screen.getByText('settingsGeneral group will reset')).not.toBeNull();
    expect(screen.queryByText('settingsResetConfirmTitle')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => {
      expect(updatePreferences).toHaveBeenCalledTimes(1);
    });
    // 组级 patch 全值断言：只含 general 组 6 项（不含 keybinds 等全局项），fonts 为全量默认。
    expect(updatePreferences).toHaveBeenCalledWith({
      language: DEFAULT_LANGUAGE,
      themeMode: DEFAULT_THEME_MODE,
      logLevel: DEFAULT_LOG_LEVEL,
      terminalLogMode: DEFAULT_TERMINAL_LOG_MODE,
      debugLogMode: DEFAULT_DEBUG_LOG_MODE,
      fonts: { ...DEFAULT_FONTS },
    });
    expect(screen.queryByText('Reset settingsGeneral?')).toBeNull();
  });

  it('组级重置成功弹成功提示；取消不执行且重开回全局文案', async () => {
    const { updatePreferences, showToast } = setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Reset settingsGeneral all defaults' }));
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    expect(updatePreferences).not.toHaveBeenCalled();
    expect(screen.queryByText('Reset settingsGeneral?')).toBeNull();

    // 重开应回到全局文案（pendingResetGroup 已清零）。
    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    expect(screen.getByText('settingsResetConfirmTitle')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));

    fireEvent.click(screen.getByRole('button', { name: 'Reset settingsGeneral all defaults' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('settingsResetComplete', 'success');
    });
  });

  it('组级重置失败弹错误提示', async () => {
    const { updatePreferences, showToast } = setupStore();
    updatePreferences.mockResolvedValue(false);
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Reset settingsGeneral all defaults' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('settingsUpdateFailed', 'error');
    });
  });

  it('组级重置传输抛错弹错误提示而不崩溃', async () => {
    const { updatePreferences, showToast } = setupStore();
    updatePreferences.mockRejectedValue(new Error('transport down'));
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Reset settingsGeneral all defaults' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('settingsUpdateFailed', 'error');
    });
  });

  it('恢复全部传输抛错弹错误提示而不崩溃', async () => {
    const { showToast } = setupStore();
    const updatePreferences = vi.fn().mockRejectedValue(new Error('transport down'));
    useAppStore.setState({ updatePreferences });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('settingsUpdateFailed', 'error');
    });
  });

  it('工作区组级重置弹分组文案并提交工作区默认 patch', async () => {
    const { updatePreferences, showToast } = setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Reset settingsWorkspace all defaults' }));
    expect(screen.getByText('Reset settingsWorkspace?')).not.toBeNull();
    expect(screen.getByText('settingsWorkspace group will reset')).not.toBeNull();
    expect(screen.queryByText('settingsResetConfirmTitle')).toBeNull();
    expect(updatePreferences).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => {
      expect(updatePreferences).toHaveBeenCalledTimes(1);
    });
    // 工作区组 patch 全值断言：仅 4 个工作区字段，均为默认值。
    expect(updatePreferences).toHaveBeenCalledWith({
      maxConcurrentWorkspaces: DEFAULT_MAX_CONCURRENT_WORKSPACES,
      workspacePriorityIds: [...DEFAULT_WORKSPACE_PRIORITY_IDS],
      workspaceDeferredIds: [...DEFAULT_WORKSPACE_DEFERRED_IDS],
      workspaceNaturalOrder: [...DEFAULT_WORKSPACE_NATURAL_ORDER],
    });
    expect(showToast).toHaveBeenCalledWith('settingsResetComplete', 'success');
    expect(screen.queryByText('Reset settingsWorkspace?')).toBeNull();
  });

  it('storage nav reset disabled only when storage aggregate reports all-default', () => {
    setupStore();
    const prevAppInfo = useAppStore.getState().appInfo;
    const prevAggregate = useAppStore.getState().storageBlocksAtDefault;
    setNavConfig();
    useAppStore.setState({ storageBlocksAtDefault: true });
    try {
      renderPanel();
      expect(navResetDisabled('Reset storageTitle all defaults')).toBe(true);
    } finally {
      useAppStore.setState({ storageBlocksAtDefault: prevAggregate, appInfo: prevAppInfo });
    }
  });

  it('storage nav reset stays enabled when aggregate unknown', () => {
    setupStore();
    const prevAppInfo = useAppStore.getState().appInfo;
    const prevAggregate = useAppStore.getState().storageBlocksAtDefault;
    setNavConfig();
    useAppStore.setState({ storageBlocksAtDefault: null });
    try {
      renderPanel();
      expect(navResetDisabled('Reset storageTitle all defaults')).toBe(false);
    } finally {
      useAppStore.setState({ storageBlocksAtDefault: prevAggregate, appInfo: prevAppInfo });
    }
  });

  it('storage nav reset stays enabled when aggregate reports non-default', () => {
    setupStore();
    const prevAppInfo = useAppStore.getState().appInfo;
    const prevAggregate = useAppStore.getState().storageBlocksAtDefault;
    setNavConfig();
    useAppStore.setState({ storageBlocksAtDefault: false });
    try {
      renderPanel();
      expect(navResetDisabled('Reset storageTitle all defaults')).toBe(false);
    } finally {
      useAppStore.setState({ storageBlocksAtDefault: prevAggregate, appInfo: prevAppInfo });
    }
  });

  it('browser nav reset disabled only when browser aggregate reports all-default', () => {
    setupStore();
    const prevAppInfo = useAppStore.getState().appInfo;
    const prevAggregate = useAppStore.getState().browserBlocksAtDefault;
    setNavConfig();
    useAppStore.setState({ browserBlocksAtDefault: true });
    try {
      renderPanel();
      expect(navResetDisabled('Reset settingsBrowser all defaults')).toBe(true);
    } finally {
      useAppStore.setState({ browserBlocksAtDefault: prevAggregate, appInfo: prevAppInfo });
    }
  });

  it('browser nav reset stays enabled when aggregate unknown', () => {
    setupStore();
    const prevAppInfo = useAppStore.getState().appInfo;
    const prevAggregate = useAppStore.getState().browserBlocksAtDefault;
    setNavConfig();
    useAppStore.setState({ browserBlocksAtDefault: null });
    try {
      renderPanel();
      expect(navResetDisabled('Reset settingsBrowser all defaults')).toBe(false);
    } finally {
      useAppStore.setState({ browserBlocksAtDefault: prevAggregate, appInfo: prevAppInfo });
    }
  });

  it('browser nav reset stays enabled when aggregate reports non-default', () => {
    setupStore();
    const prevAppInfo = useAppStore.getState().appInfo;
    const prevAggregate = useAppStore.getState().browserBlocksAtDefault;
    setNavConfig();
    useAppStore.setState({ browserBlocksAtDefault: false });
    try {
      renderPanel();
      expect(navResetDisabled('Reset settingsBrowser all defaults')).toBe(false);
    } finally {
      useAppStore.setState({ browserBlocksAtDefault: prevAggregate, appInfo: prevAppInfo });
    }
  });

  it('快捷键组级重置经侧边栏按钮弹分组文案并提交快捷键默认 patch', async () => {
    const { updatePreferences, showToast } = setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Reset settingsShortcuts all defaults' }));
    expect(screen.getByText('Reset settingsShortcuts?')).not.toBeNull();
    expect(screen.queryByText('settingsResetConfirmTitle')).toBeNull();
    expect(updatePreferences).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => {
      expect(updatePreferences).toHaveBeenCalledTimes(1);
    });
    // 快捷键组 patch 只含 keybinds 全量默认。
    expect(updatePreferences).toHaveBeenCalledWith({ keybinds: { ...DEFAULT_KEYBINDS } });
    expect(showToast).toHaveBeenCalledWith('settingsResetComplete', 'success');
  });

  it('工作区组级重置取消不执行', () => {
    const { updatePreferences } = setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Reset settingsWorkspace all defaults' }));
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    expect(updatePreferences).not.toHaveBeenCalled();
    expect(screen.queryByText('Reset settingsWorkspace?')).toBeNull();
  });

  it('重置按钮集合与 patch 工厂同源（单注册表；storage/browser/dsh 例外走自有流程）', async () => {
    const groups = await import('./settingsGroups');
    const factories = (groups as Record<string, unknown>).GROUP_RESET_PATCHES as
      | Record<string, () => unknown>
      | undefined;
    expect(factories, 'GROUP_RESET_PATCHES missing').toBeDefined();
    expect(new Set(Object.keys(factories!))).toEqual(
      new Set(['general', 'workspace', 'shortcuts']),
    );
    // 访问器口径：工厂组返回 patch，storage/browser/dsh 返回 null（调用方走自有流程）。
    expect(groups.getGroupResetPatch('general')).toBeDefined();
    expect(groups.getGroupResetPatch('workspace')).toBeDefined();
    expect(groups.getGroupResetPatch('shortcuts')).toBeDefined();
    expect(groups.getGroupResetPatch('storage')).toBeNull();
    expect(groups.getGroupResetPatch('browser')).toBeNull();
    expect(groups.getGroupResetPatch('dsh')).toBeNull();
    // storage/browser/dsh 无统一偏好 patch（跨桥写入），但侧边栏同样渲染按钮并走自有确认对话框。
    expect(groups.RESETTABLE_GROUPS.has('storage')).toBe(true);
    expect(groups.RESETTABLE_GROUPS.has('browser')).toBe(true);
    expect(groups.RESETTABLE_GROUPS.has('dsh')).toBe(true);
    expect(groups.RESETTABLE_GROUPS.has('general')).toBe(true);
    expect(groups.RESETTABLE_GROUPS.has('workspace')).toBe(true);
  });

  it('存储组级重置切组并发信号，不弹通用确认框、不调 updatePreferences（含首跳集成）', async () => {
    const { updatePreferences } = setupStore();
    // H1 集成：StorageSettings 在点击前未挂载（当前在 general）。提供最小存储桥，
    // 断言切组+信号后组对话框立即出现（pending 被挂载的 StorageSettings 消费，不漏弹）。
    const preflight = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        errors: [],
        warnings: [],
        totalFiles: 0,
        totalBytes: 0,
        freeBytes: 0,
      },
    });
    (window as unknown as { digitalLife?: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            mode: 'unified',
            root: '',
            locatorPath: '',
            categories: [],
            pending: null,
            lastReport: null,
          },
        }),
        scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        preflight,
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
      },
    };
    useAppStore.setState({ activeSettingsGroup: 'general', storageGroupResetPending: false });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Reset storageTitle all defaults' }));
    // 切到存储组 + pending 已置位并被挂载的 StorageSettings 消费。
    expect(useAppStore.getState().activeSettingsGroup).toBe('storage');
    expect(useAppStore.getState().storageGroupResetPending).toBe(false);
    expect(updatePreferences).not.toHaveBeenCalled();
    expect(screen.queryByText('Reset storageTitle?')).toBeNull();
    expect(screen.queryByText('settingsResetConfirmTitle')).toBeNull();
    // 首跳不漏弹：组对话框出现（H1 回归）。
    expect(await screen.findByText('storageGroupResetTitle')).toBeTruthy();
    delete (window as unknown as { digitalLife?: unknown }).digitalLife;
  });

  it('storage branch closes an open generic group confirm before switching (rev2 I4-N1)', () => {
    setupStore();
    renderPanel();
    // 先打开通用组确认框（general）。
    fireEvent.click(screen.getByRole('button', { name: 'Reset settingsGeneral all defaults' }));
    expect(screen.getByText('Reset settingsGeneral?')).toBeTruthy();
    // 通用框开着时点存储组重置（键盘路径可达）：先关通用框，再切组+发信号。
    fireEvent.click(screen.getByRole('button', { name: 'Reset storageTitle all defaults' }));
    expect(screen.queryByText('Reset settingsGeneral?')).toBeNull();
    expect(useAppStore.getState().activeSettingsGroup).toBe('storage');
    // 切组后 StorageSettings 随即挂载并消费 pending（与首跳集成同语义）。
    expect(useAppStore.getState().storageGroupResetPending).toBe(false);
    // 通用确认框未被误执行。
    expect(useAppStore.getState().updatePreferences).not.toHaveBeenCalled();
  });

  it('browser nav reset switches group and fires the browser pending signal (own confirm dialog)', () => {
    const { updatePreferences } = setupStore();
    useAppStore.setState({ activeSettingsGroup: 'general', browserGroupResetPending: false });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Reset settingsBrowser all defaults' }));
    // 切到浏览器组 + pending 已置位并被挂载的 BrowserSettings 消费。
    expect(useAppStore.getState().activeSettingsGroup).toBe('browser');
    expect(useAppStore.getState().browserGroupResetPending).toBe(false);
    expect(updatePreferences).not.toHaveBeenCalled();
    // 不弹通用组确认框，改由 BrowserSettings 自有确认对话框承接（首跳不漏弹）。
    expect(screen.queryByText('Reset settingsBrowser?')).toBeNull();
    expect(screen.getByText('browserGroupResetTitle')).toBeTruthy();
  });

  it('browser branch closes an open generic group confirm before switching', () => {
    setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Reset settingsGeneral all defaults' }));
    expect(screen.getByText('Reset settingsGeneral?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset settingsBrowser all defaults' }));
    expect(screen.queryByText('Reset settingsGeneral?')).toBeNull();
    expect(useAppStore.getState().activeSettingsGroup).toBe('browser');
    expect(useAppStore.getState().browserGroupResetPending).toBe(false);
    expect(useAppStore.getState().updatePreferences).not.toHaveBeenCalled();
  });

  it('dsh nav reset switches group and fires the dsh pending signal (own confirm dialog)', async () => {
    const { updatePreferences } = setupStore();
    // DshSettings 切组后挂载即拉取下载源状态：提供最小 dsh 桥。
    (window as unknown as { digitalLife?: unknown }).digitalLife = {
      dsh: {
        getSourceStatus: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            bundled: null,
            system: null,
            running: null,
            config: {
              npm_registry: 'https://registry.npmjs.org',
              dsh_mirror: null,
              source_mode: 'manual',
              proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
            },
          },
        }),
        saveSourceConfig: vi.fn().mockResolvedValue({ ok: true, data: true }),
        testSource: vi.fn().mockResolvedValue({
          ok: true,
          data: { reachable: true, latency_ms: 10, error: null },
        }),
      },
    };
    useAppStore.setState({
      activeSettingsGroup: 'general',
      dshGroupResetPending: false,
      sourceStatus: null,
    });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Reset settingsDsh all defaults' }));
    // 切到 DSH 组 + pending 已置位并被挂载的 DshSettings 消费。
    expect(useAppStore.getState().activeSettingsGroup).toBe('dsh');
    expect(useAppStore.getState().dshGroupResetPending).toBe(false);
    // 不走偏好 patch（DSH 配置写 saveSourceConfig 桥）。
    expect(updatePreferences).not.toHaveBeenCalled();
    // 自有确认对话框承接（首跳不漏弹），不弹通用组确认框。
    expect(await screen.findByRole('dialog')).toBeTruthy();
    delete (window as unknown as { digitalLife?: unknown }).digitalLife;
  });

  // 侧边栏聚合 disabled（Task 4 + 存储聚合）：general/workspace/shortcuts 行在组全默认时禁用、
  // 有偏离时启用；storage 行由 StorageSettings 维护的聚合信号驱动，未知时保持启用。
  function setNavConfig(patch: Record<string, unknown> = {}) {
    const base = getDefaultPreferences();
    useAppStore.setState((s) => ({
      appInfo: {
        ...((s.appInfo ?? {}) as Record<string, unknown>),
        config: {
          resolvedTheme: 'light',
          maxRecentWorkspaces: 10,
          modelPreferences: { providers: {} },
          browserInactiveTabSuspendMs: 0,
          ...((s.appInfo?.config ?? {}) as Record<string, unknown>),
          ...base,
          ...patch,
        },
      } as never,
    }));
  }

  function navResetDisabled(name: string): boolean {
    return (screen.getByRole('button', { name }) as HTMLButtonElement).disabled;
  }

  it('disables general nav reset when prefs equal defaults', () => {
    setupStore();
    setNavConfig();
    renderPanel();
    expect(navResetDisabled('Reset settingsGeneral all defaults')).toBe(true);
  });

  it('enables general nav reset when a pref differs', () => {
    setupStore();
    setNavConfig({ language: 'en-US' });
    renderPanel();
    expect(navResetDisabled('Reset settingsGeneral all defaults')).toBe(false);
  });

  it('disables workspace nav reset when prefs equal defaults', () => {
    setupStore();
    setNavConfig();
    renderPanel();
    expect(navResetDisabled('Reset settingsWorkspace all defaults')).toBe(true);
  });

  it('enables workspace nav reset when a pref differs', () => {
    setupStore();
    setNavConfig({ maxConcurrentWorkspaces: 99 });
    renderPanel();
    expect(navResetDisabled('Reset settingsWorkspace all defaults')).toBe(false);
  });

  it('disables shortcuts nav reset when keybinds equal defaults', () => {
    setupStore();
    setNavConfig();
    renderPanel();
    expect(navResetDisabled('Reset settingsShortcuts all defaults')).toBe(true);
  });

  it('enables shortcuts nav reset when a keybind differs', () => {
    setupStore();
    setNavConfig({ keybinds: { ...DEFAULT_KEYBINDS, 'workspace.new': 'ctrl+alt+n' } });
    renderPanel();
    expect(navResetDisabled('Reset settingsShortcuts all defaults')).toBe(false);
  });
});

describe('SettingsPanel storage prefetch wiring', () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { digitalLife?: unknown }).digitalLife;
  });

  it('悬停侧边栏存储行触发存储预取（onHoverGroup 接线）', async () => {
    setupStore();
    const getStatus = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        mode: 'unified',
        root: '',
        locatorPath: '',
        categories: [],
        pending: null,
        lastReport: null,
      },
    });
    const getTreeCacheStats = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        workspaceCount: 0,
        totalBytes: 0,
        oldestCapturedAt: null,
        newestCapturedAt: null,
        enabled: true,
        ttlMinutes: 15,
      },
    });
    (window as unknown as { digitalLife?: unknown }).digitalLife = {
      storage: { getStatus, getTreeCacheStats },
    };
    renderPanel();
    // 挂载预取先完成并填充缓存（本用例只验证 hover 接线，绕开冷填充 no-op）。
    await waitFor(() => expect(getStatus).toHaveBeenCalledTimes(1));
    resetStorageSettingsCache();
    const row = screen.getByRole('button', { name: 'storageTitle' }).closest('li');
    expect(row).not.toBeNull();
    fireEvent.pointerEnter(row as HTMLElement);
    await waitFor(() => expect(getStatus).toHaveBeenCalledTimes(2));
  });
});
