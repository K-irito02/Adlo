import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { SettingItem } from '@shared/ipc';
import type { CopyDict } from '../../i18n';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { useAppStore } from '../../stores/slicedStore';
import { SettingsPanel } from './SettingsPanel';
import {
  resetStorageSettingsCache,
  setCachedStorageStatus,
  setCachedTreeStats,
} from '../../features/storage-settings/storageStatusCache';
import {
  DEFAULT_DEBUG_LOG_MODE,
  DEFAULT_FONTS,
  DEFAULT_KEYBINDS,
  DEFAULT_LOG_LEVEL,
  DEFAULT_MAX_CONCURRENT_WORKSPACES,
  DEFAULT_TERMINAL_LOG_MODE,
  DEFAULT_WORKSPACE_DEFERRED_IDS,
  DEFAULT_WORKSPACE_PRIORITY_IDS,
  getDefaultPreferences,
} from '../../../shared/defaultPreferences';

// 组文案配含 {group} 的真模板，使 formatT 插值得以被覆盖（裸 key 回退测不到插值）。
const GROUP_TEMPLATES: Record<string, string> = {
  settingsResetGroupToDefault: 'Reset {group} all defaults',
  settingsResetGroupConfirmTitle: 'Reset {group}?',
  settingsResetGroupConfirmMessage: '{group} group will reset',
  // 聚合恢复汇总用真模板：裸 key 回退测不到 {done}/{group}/{reason}/{groups} 的替换。
  settingsResetAllFailedSummary: 'Reset: {done}; failed: {group} ({reason})',
  settingsResetAllFailedSummaryNoDone: 'Failed: {group} ({reason})',
  settingsResetAllSkippedNote: 'Not executed: {groups}',
  // preferences 组无单组标签（general+workspace+shortcuts 合称），用范围清单首条作为展示名。
  settingsResetAllScopePreferences: 'Preferences',
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

/**
 * 聚合恢复（顶部按钮）会经 store 实时取浏览器/DSH 的写 action：装成功桩并返回还原函数，
 * 避免 jsdom 无桥导致的假失败与跨用例泄漏（偏好 action 由 setupStore 负责）。
 */
function installResetAllActions() {
  const prev = {
    updateDownloadSettings: useAppStore.getState().updateDownloadSettings,
    changeDownloadPath: useAppStore.getState().changeDownloadPath,
    saveSourceConfig: useAppStore.getState().saveSourceConfig,
  };
  useAppStore.setState({
    updateDownloadSettings: vi.fn(async () => ({ ok: true, data: undefined })) as never,
    changeDownloadPath: vi.fn(async () => ({ ok: true, data: undefined })) as never,
    saveSourceConfig: vi.fn(async () => true) as never,
  });
  return () => useAppStore.setState(prev as never);
}

/**
 * 聚合恢复的存储桥桩：核心路径非默认（plan.coreNeeded=true）+ setPaths 报 restartRequired，
 * 用于验证「立即迁移并重启」路径。`restartApp` 由用例定制成败。
 */
function mockStorageBridge(restartApp: () => Promise<unknown>) {
  return {
    getStatus: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        mode: 'unified',
        root: '/custom',
        defaultRoot: '/data',
        locatorPath: '',
        categories: [],
        pending: null,
        lastReport: null,
      },
    }),
    preflight: vi.fn().mockResolvedValue({
      ok: true,
      data: { ok: true, errors: [], warnings: [], totalFiles: 1, totalBytes: 1, freeBytes: 0 },
    }),
    setPaths: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        restartRequired: true,
        preflight: {
          ok: true,
          errors: [],
          warnings: [],
          totalFiles: 0,
          totalBytes: 0,
          freeBytes: 0,
        },
      },
    }),
    getTreeCacheStats: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        workspaceCount: 0,
        totalBytes: 0,
        oldestCapturedAt: null,
        newestCapturedAt: null,
        enabled: true,
        ttlMinutes: 15,
      },
    }),
    setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    restartApp,
  };
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

  it('点击恢复全部默认先弹确认框，不直接执行', async () => {
    const { updatePreferences } = setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    // 开框前预计算存储计划（异步）：等算好后对话框才出现，无框内“计算中”闪烁。
    expect(await screen.findByText('settingsResetConfirmTitle')).not.toBeNull();
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it('预计算在途按钮禁用并 aria-busy，算好后恢复可用', async () => {
    setupStore();
    renderPanel();
    const btn = screen.getByRole('button', { name: 'settingsResetAll' }) as HTMLButtonElement;
    fireEvent.click(btn);
    // 同步段已置 preparing：按钮禁用 + aria-busy（可感知反馈 + 防重复点击）。
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-busy')).toBe('true');
    await screen.findByText('settingsResetConfirmTitle');
    await waitFor(() => expect(btn.disabled).toBe(false));
  });

  it('对话框关闭后焦点归还触发按钮（预计算禁用不丢 opener）', async () => {
    setupStore();
    renderPanel();
    const btn = screen.getByRole('button', { name: 'settingsResetAll' }) as HTMLButtonElement;
    fireEvent.click(btn);
    await screen.findByText('settingsResetConfirmTitle');
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    await waitFor(() => expect(document.activeElement).toBe(btn));
  });

  it('聚合对话框确认后提交偏好默认 patch 并汇总提示，点取消不执行', async () => {
    const { updatePreferences, showToast } = setupStore();
    const restoreActions = installResetAllActions();
    try {
      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
      expect(await screen.findByText('settingsResetConfirmTitle')).not.toBeNull();
      expect(updatePreferences).not.toHaveBeenCalled();
      // 无存储桥 → 计划为 null → 单确认键（其余三组照常执行）。
      fireEvent.click(await screen.findByRole('button', { name: 'storageGroupResetConfirm' }));
      await waitFor(() => {
        // 恢复全部确含挂起默认值（F7：getDefaultPreferences 自引恒过，此断言锁行为）。
        expect(updatePreferences).toHaveBeenCalledWith(getDefaultPreferences());
        expect(updatePreferences).toHaveBeenCalledWith(
          expect.objectContaining({ browserInactiveTabSuspendMs: 900_000 }),
        );
        expect(showToast).toHaveBeenCalledWith('settingsResetAllDoneAll', 'success');
      });
      expect(screen.queryByText('settingsResetConfirmTitle')).toBeNull();

      const callsAfterConfirm = updatePreferences.mock.calls.length;
      fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
      expect(await screen.findByText('settingsResetConfirmTitle')).not.toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
      expect(updatePreferences.mock.calls.length).toBe(callsAfterConfirm);
      expect(screen.queryByText('settingsResetConfirmTitle')).toBeNull();
    } finally {
      restoreActions();
    }
  });

  it('聚合恢复「立即迁移并重启」调用重启桥（成功→重启提示）', async () => {
    const { showToast } = setupStore();
    const restoreActions = installResetAllActions();
    const restartApp = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    (window as unknown as { digitalLife?: unknown }).digitalLife = {
      storage: mockStorageBridge(restartApp),
    };
    try {
      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
      fireEvent.click(await screen.findByRole('button', { name: 'storageMigrateNow' }));
      await waitFor(() => expect(restartApp).toHaveBeenCalledTimes(1));
      expect(showToast).toHaveBeenCalledWith('storageRestartRequired', 'success');
      expect(showToast).not.toHaveBeenCalledWith('storageRestartUnavailableInBrowser', 'error');
    } finally {
      restoreActions();
      delete (window as unknown as { digitalLife?: unknown }).digitalLife;
    }
  });

  it('聚合恢复「立即迁移并重启」：桥拒绝重启时提示浏览器不可重启', async () => {
    const { showToast } = setupStore();
    const restoreActions = installResetAllActions();
    const restartApp = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'NOT_SUPPORTED', message: 'no restart' } });
    (window as unknown as { digitalLife?: unknown }).digitalLife = {
      storage: mockStorageBridge(restartApp),
    };
    try {
      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
      fireEvent.click(await screen.findByRole('button', { name: 'storageMigrateNow' }));
      await waitFor(() => expect(restartApp).toHaveBeenCalledTimes(1));
      expect(showToast).toHaveBeenCalledWith('storageRestartUnavailableInBrowser', 'error');
      expect(showToast).not.toHaveBeenCalledWith('storageRestartRequired', 'success');
    } finally {
      restoreActions();
      delete (window as unknown as { digitalLife?: unknown }).digitalLife;
    }
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

  it('聚合恢复失败弹错误汇总而非成功提示（首组失败：无已完成组变体）', async () => {
    const { updatePreferences, showToast } = setupStore();
    updatePreferences.mockResolvedValue(false);
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    fireEvent.click(await screen.findByRole('button', { name: 'storageGroupResetConfirm' }));
    await waitFor(() => {
      // 首组（preferences）失败 → done 为空 → 用「无已完成组」变体，避免「已恢复：；」残缺文案。
      // 返回式失败无结构化 error → reason 回退 t.settingsUpdateFailed（真模板插值）。
      expect(showToast).toHaveBeenCalledWith('Failed: Preferences (settingsUpdateFailed)', 'error');
      // 失败即停：未执行的组以 skipped 提示补出。
      expect(showToast).toHaveBeenCalledWith(
        'Not executed: settingsBrowser, settingsDsh, storageTitle',
        'warning',
      );
    });
    expect(showToast).not.toHaveBeenCalledWith('settingsResetAllDoneAll', 'success');
  });

  it('聚合恢复失败汇总：已有已完成组时用 {done} 变体（含完成组清单）', async () => {
    const { updatePreferences, showToast } = setupStore();
    // preferences 成功、browser 挂起步失败 → done=['preferences']、failedAt='browser'。
    updatePreferences.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    fireEvent.click(await screen.findByRole('button', { name: 'storageGroupResetConfirm' }));
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        'Reset: Preferences; failed: settingsBrowser (settingsUpdateFailed)',
        'error',
      );
    });
  });

  it('对话框按 Escape 与点 overlay 关闭且不执行', async () => {
    const { updatePreferences } = setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    await screen.findByText('settingsResetConfirmTitle');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(updatePreferences).not.toHaveBeenCalled();
    expect(screen.queryByText('settingsResetConfirmTitle')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('dialog'));
    expect(updatePreferences).not.toHaveBeenCalled();
    expect(screen.queryByText('settingsResetConfirmTitle')).toBeNull();
  });

  it('点击对话框内层不关闭', async () => {
    const { updatePreferences } = setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    await screen.findByText('settingsResetConfirmTitle');
    const inner = document.querySelector('.adl-confirm-dialog') as HTMLElement;
    expect(inner).not.toBeNull();
    fireEvent.click(inner);
    expect(updatePreferences).not.toHaveBeenCalled();
    expect(screen.getByText('settingsResetConfirmTitle')).not.toBeNull();
  });

  it('确认框打开时搜索框 Escape 只关框不清空关键词', async () => {
    setupStore();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    expect(await screen.findByText('settingsResetConfirmTitle')).not.toBeNull();
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
    // 组级 patch 全值断言：只含 general 组 4 项（不含 keybinds 等全局项），fonts 为
    // 全量默认；语言/主题是用户个人基线，组级恢复不改动（产品决策 2026-09-27）。
    expect(updatePreferences).toHaveBeenCalledWith({
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
    expect(await screen.findByText('settingsResetConfirmTitle')).not.toBeNull();
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

  it('聚合恢复传输抛错弹错误汇总而不崩溃（reason 取结构化 error 消息）', async () => {
    const { showToast } = setupStore();
    const updatePreferences = vi.fn().mockRejectedValue(new Error('transport down'));
    useAppStore.setState({ updatePreferences });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    fireEvent.click(await screen.findByRole('button', { name: 'storageGroupResetConfirm' }));
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Failed: Preferences (transport down)', 'error');
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
    // 工作区组 patch 全值断言：3 个工作区字段均为默认值（加载顺序不参与，事项 12b）。
    expect(updatePreferences).toHaveBeenCalledWith({
      maxConcurrentWorkspaces: DEFAULT_MAX_CONCURRENT_WORKSPACES,
      workspacePriorityIds: [...DEFAULT_WORKSPACE_PRIORITY_IDS],
      workspaceDeferredIds: [...DEFAULT_WORKSPACE_DEFERRED_IDS],
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

  it('initializes the storage aggregate from prefetch on first open (Phase 4 R1-7.1)', async () => {
    // 从未进过存储组：挂载预热填充缓存后，校正 effect 重算并写入聚合
    //（此前同步读空缓存恒 null，直到首次进组才收敛）。
    setupStore();
    const prevAppInfo = useAppStore.getState().appInfo;
    const prevAggregate = useAppStore.getState().storageBlocksAtDefault;
    const prevDownload = useAppStore.getState().downloadSettings;
    const prevDownloadLoaded = useAppStore.getState().downloadSettingsLoaded;
    const prevBridge = (window as unknown as { digitalLife?: unknown }).digitalLife;
    setNavConfig();
    useAppStore.setState({
      downloadSettings: { mode: 'auto', default_path: '', auto_migrate_on_path_change: false },
      downloadSettingsLoaded: true,
      storageBlocksAtDefault: null,
    });
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            mode: 'unified',
            root: 'C:/data',
            defaultRoot: 'C:/data',
            categories: [],
            locatorPath: 'C:/data/storage-locator.json',
            pending: null,
            lastReport: null,
          },
        }),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
      },
    };
    try {
      renderPanel();
      await waitFor(() => {
        expect(useAppStore.getState().storageBlocksAtDefault).toBe(true);
      });
      expect(navResetDisabled('Reset storageTitle all defaults')).toBe(true);
    } finally {
      useAppStore.setState({
        storageBlocksAtDefault: prevAggregate,
        appInfo: prevAppInfo,
        downloadSettings: prevDownload,
        downloadSettingsLoaded: prevDownloadLoaded,
      });
      (window as unknown as { digitalLife?: unknown }).digitalLife = prevBridge;
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

  it('corrects the browser aggregate from the store when the browser group is inactive', () => {
    // 挂起时长默认 + 下载设置全默认 → 聚合应从过期 false 校正为 true（事项 12c）。
    setupStore();
    const prevAppInfo = useAppStore.getState().appInfo;
    const prevAggregate = useAppStore.getState().browserBlocksAtDefault;
    const prevDownload = useAppStore.getState().downloadSettings;
    const prevDownloadLoaded = useAppStore.getState().downloadSettingsLoaded;
    setNavConfig();
    useAppStore.setState({
      downloadSettings: { mode: 'auto', default_path: '', auto_migrate_on_path_change: false },
      downloadSettingsLoaded: true,
      browserBlocksAtDefault: false,
    });
    try {
      renderPanel();
      expect(useAppStore.getState().browserBlocksAtDefault).toBe(true);
    } finally {
      useAppStore.setState({
        browserBlocksAtDefault: prevAggregate,
        appInfo: prevAppInfo,
        downloadSettings: prevDownload,
        downloadSettingsLoaded: prevDownloadLoaded,
      });
    }
  });

  it('keeps the browser aggregate untouched when the store cannot determine it', () => {
    // 下载设置未回读 → 未知（null）不写，保留最后已知值（事项 12c）。
    setupStore();
    const prevAppInfo = useAppStore.getState().appInfo;
    const prevAggregate = useAppStore.getState().browserBlocksAtDefault;
    const prevDownload = useAppStore.getState().downloadSettings;
    const prevDownloadLoaded = useAppStore.getState().downloadSettingsLoaded;
    setNavConfig();
    useAppStore.setState({ downloadSettingsLoaded: false, browserBlocksAtDefault: false });
    try {
      renderPanel();
      expect(useAppStore.getState().browserBlocksAtDefault).toBe(false);
    } finally {
      useAppStore.setState({
        browserBlocksAtDefault: prevAggregate,
        appInfo: prevAppInfo,
        downloadSettings: prevDownload,
        downloadSettingsLoaded: prevDownloadLoaded,
      });
    }
  });

  it('corrects the dsh aggregate from the store when the dsh group is inactive', () => {
    // 源=auto 且代理=auto → 聚合应从过期 false 校正为 true（事项 12d）。
    setupStore();
    const prevAppInfo = useAppStore.getState().appInfo;
    const prevAggregate = useAppStore.getState().dshBlocksAtDefault;
    const prevSource = useAppStore.getState().sourceStatus;
    setNavConfig();
    useAppStore.setState({
      sourceStatus: {
        bundled: null,
        system: null,
        running: null,
        config: {
          npm_registry: 'https://registry.npmjs.org',
          dsh_mirror: null,
          source_mode: 'auto',
          proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
        },
      },
      dshBlocksAtDefault: false,
    });
    try {
      renderPanel();
      expect(useAppStore.getState().dshBlocksAtDefault).toBe(true);
    } finally {
      useAppStore.setState({
        dshBlocksAtDefault: prevAggregate,
        appInfo: prevAppInfo,
        sourceStatus: prevSource,
      });
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
            defaultRoot: '',
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
    // 判据取 general patch 内字段（语言/主题已剔除，见下一条负例）。
    setNavConfig({ logLevel: 'debug' });
    renderPanel();
    expect(navResetDisabled('Reset settingsGeneral all defaults')).toBe(false);
  });

  it('general nav reset stays disabled when only language/theme differ (user baseline)', () => {
    // 语言/主题是用户个人基线，不参与组默认性判定（产品决策 2026-09-27）。
    setupStore();
    setNavConfig({ language: 'en-US', themeMode: 'dark' });
    renderPanel();
    expect(navResetDisabled('Reset settingsGeneral all defaults')).toBe(true);
  });

  it('disables general nav reset when config fonts is null (Rust Option::None)', () => {
    // config.fonts 为 null（Rust Option::None 序列化）与「空串」默认等价（事项 12a）。
    setupStore();
    setNavConfig({ fonts: null });
    renderPanel();
    expect(navResetDisabled('Reset settingsGeneral all defaults')).toBe(true);
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

  it('workspace nav stays disabled when only the auto-synced natural order differs', () => {
    // 加载顺序被自动同步自动写入（有工作区即非空），不参与组默认性判定（事项 12b）。
    setupStore();
    setNavConfig({ workspaceNaturalOrder: ['ws-auto'] });
    renderPanel();
    expect(navResetDisabled('Reset settingsWorkspace all defaults')).toBe(true);
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

  // 事项 7：存储组从未进入时，聚合由预取缓存 + store 一次性初始化（不再停留 null）。
  it('initializes the storage aggregate from the prefetch cache before the storage group is opened', () => {
    setupStore();
    const prevAppInfo = useAppStore.getState().appInfo;
    const prevAggregate = useAppStore.getState().storageBlocksAtDefault;
    const prevDownload = useAppStore.getState().downloadSettings;
    const prevLoaded = useAppStore.getState().downloadSettingsLoaded;
    setNavConfig();
    setCachedStorageStatus({
      mode: 'unified',
      root: 'C:/AppDefaults/ai-digital-life',
      defaultRoot: 'C:/AppDefaults/ai-digital-life',
      locatorPath: 'C:/AppDefaults/ai-digital-life/storage-locator.json',
      categories: [],
      pending: null,
      lastReport: null,
    });
    setCachedTreeStats({
      workspaceCount: 0,
      totalBytes: 0,
      oldestCapturedAt: null,
      newestCapturedAt: null,
      enabled: true,
      ttlMinutes: 15,
    });
    useAppStore.setState({
      downloadSettings: { mode: 'ask', default_path: '', auto_migrate_on_path_change: false },
      downloadSettingsLoaded: true,
      storageBlocksAtDefault: null,
    });
    try {
      renderPanel();
      // 全默认快照（核心根=默认根、树默认、预算默认 setNavConfig 基线、下载空串）→ true。
      expect(useAppStore.getState().storageBlocksAtDefault).toBe(true);
      expect(navResetDisabled('Reset storageTitle all defaults')).toBe(true);
    } finally {
      useAppStore.setState({
        storageBlocksAtDefault: prevAggregate,
        appInfo: prevAppInfo,
        downloadSettings: prevDownload,
        downloadSettingsLoaded: prevLoaded,
      });
      resetStorageSettingsCache();
    }
  });

  it('computes the cached storage aggregate as non-default when the core root differs (7)', () => {
    setupStore();
    const prevAppInfo = useAppStore.getState().appInfo;
    const prevAggregate = useAppStore.getState().storageBlocksAtDefault;
    const prevDownload = useAppStore.getState().downloadSettings;
    const prevLoaded = useAppStore.getState().downloadSettingsLoaded;
    setNavConfig();
    setCachedStorageStatus({
      mode: 'unified',
      root: 'D:/custom-root',
      defaultRoot: 'C:/AppDefaults/ai-digital-life',
      locatorPath: 'C:/AppDefaults/ai-digital-life/storage-locator.json',
      categories: [],
      pending: null,
      lastReport: null,
    });
    setCachedTreeStats({
      workspaceCount: 0,
      totalBytes: 0,
      oldestCapturedAt: null,
      newestCapturedAt: null,
      enabled: true,
      ttlMinutes: 15,
    });
    useAppStore.setState({
      downloadSettings: { mode: 'ask', default_path: '', auto_migrate_on_path_change: false },
      downloadSettingsLoaded: true,
      storageBlocksAtDefault: null,
    });
    try {
      renderPanel();
      expect(useAppStore.getState().storageBlocksAtDefault).toBe(false);
      expect(navResetDisabled('Reset storageTitle all defaults')).toBe(false);
    } finally {
      useAppStore.setState({
        storageBlocksAtDefault: prevAggregate,
        appInfo: prevAppInfo,
        downloadSettings: prevDownload,
        downloadSettingsLoaded: prevLoaded,
      });
      resetStorageSettingsCache();
    }
  });

  it('刷新存储缓存后重算侧栏存储聚合（仅核心路径变更场景，low-3 回归）', async () => {
    // 初始缓存核心根非默认 → 聚合 false；打开聚合对话框触发 refreshStatus（getStatus）
    // 写回默认快照。存储聚合重算 effect 须据「刷新版本」再次运行并收敛为 true
    //（修复前该 effect 不依赖缓存，会停留 false，直至切组或其它依赖变化）。
    setupStore();
    const prevAppInfo = useAppStore.getState().appInfo;
    const prevAggregate = useAppStore.getState().storageBlocksAtDefault;
    const prevDownload = useAppStore.getState().downloadSettings;
    const prevLoaded = useAppStore.getState().downloadSettingsLoaded;
    const prevBridge = (window as unknown as { digitalLife?: unknown }).digitalLife;
    setNavConfig();
    setCachedStorageStatus({
      mode: 'unified',
      root: 'D:/custom-root',
      defaultRoot: 'C:/AppDefaults/ai-digital-life',
      locatorPath: 'C:/AppDefaults/ai-digital-life/storage-locator.json',
      categories: [],
      pending: null,
      lastReport: null,
    });
    setCachedTreeStats({
      workspaceCount: 0,
      totalBytes: 0,
      oldestCapturedAt: null,
      newestCapturedAt: null,
      enabled: true,
      ttlMinutes: 15,
    });
    useAppStore.setState({
      downloadSettings: { mode: 'ask', default_path: '', auto_migrate_on_path_change: false },
      downloadSettingsLoaded: true,
      storageBlocksAtDefault: null,
    });
    // 刷新返回默认根：写回缓存即代表「核心路径已恢复默认」。
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            mode: 'unified',
            root: 'C:/AppDefaults/ai-digital-life',
            defaultRoot: 'C:/AppDefaults/ai-digital-life',
            locatorPath: 'C:/AppDefaults/ai-digital-life/storage-locator.json',
            categories: [],
            pending: null,
            lastReport: null,
          },
        }),
        preflight: vi.fn().mockResolvedValue({
          ok: true,
          data: { ok: true, errors: [], warnings: [], totalFiles: 0, totalBytes: 0, freeBytes: 0 },
        }),
        setPaths: vi.fn(),
        changeDownloadPath: vi.fn(),
      },
    };
    try {
      renderPanel();
      expect(useAppStore.getState().storageBlocksAtDefault).toBe(false);
      fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
      await waitFor(() => {
        expect(useAppStore.getState().storageBlocksAtDefault).toBe(true);
      });
      expect(navResetDisabled('Reset storageTitle all defaults')).toBe(true);
    } finally {
      useAppStore.setState({
        storageBlocksAtDefault: prevAggregate,
        appInfo: prevAppInfo,
        downloadSettings: prevDownload,
        downloadSettingsLoaded: prevLoaded,
      });
      (window as unknown as { digitalLife?: unknown }).digitalLife = prevBridge;
      resetStorageSettingsCache();
    }
  });

  // 顶部「恢复全部默认」按钮禁用口径：六组全默认才禁用（与侧边栏行同源聚合）。
  function topResetDisabled(): boolean {
    return (screen.getByRole('button', { name: 'settingsResetAll' }) as HTMLButtonElement).disabled;
  }

  it('六组全默认时顶部恢复全部默认按钮禁用', () => {
    setupStore();
    const prevAppInfo = useAppStore.getState().appInfo;
    const prevStorage = useAppStore.getState().storageBlocksAtDefault;
    const prevBrowser = useAppStore.getState().browserBlocksAtDefault;
    const prevDsh = useAppStore.getState().dshBlocksAtDefault;
    const prevSource = useAppStore.getState().sourceStatus;
    setNavConfig();
    useAppStore.setState({
      storageBlocksAtDefault: true,
      browserBlocksAtDefault: true,
      dshBlocksAtDefault: true,
      // 源状态置空：跳过未激活 dsh 组的校正 effect（否则会用残留 sourceStatus 覆写聚合）。
      sourceStatus: null,
    });
    try {
      renderPanel();
      expect(topResetDisabled()).toBe(true);
    } finally {
      useAppStore.setState({
        appInfo: prevAppInfo,
        storageBlocksAtDefault: prevStorage,
        browserBlocksAtDefault: prevBrowser,
        dshBlocksAtDefault: prevDsh,
        sourceStatus: prevSource,
      });
    }
  });

  it('任一组非默认时顶部恢复全部默认按钮保持可用', () => {
    setupStore();
    const prevAppInfo = useAppStore.getState().appInfo;
    const prevStorage = useAppStore.getState().storageBlocksAtDefault;
    setNavConfig({ logLevel: 'debug' });
    useAppStore.setState({ storageBlocksAtDefault: true });
    try {
      renderPanel();
      expect(topResetDisabled()).toBe(false);
    } finally {
      useAppStore.setState({ appInfo: prevAppInfo, storageBlocksAtDefault: prevStorage });
    }
  });
});

describe('SettingsPanel storage prefetch wiring', () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { digitalLife?: unknown }).digitalLife;
  });

  it('悬停侧边栏存储行触发存储预取（onPreheatGroup 接线）', async () => {
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

  it('悬停/聚焦非存储行不触发存储预取（负例）', async () => {
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
    (window as unknown as { digitalLife?: unknown }).digitalLife = {
      storage: { getStatus },
    };
    renderPanel();
    await waitFor(() => expect(getStatus).toHaveBeenCalledTimes(1));
    resetStorageSettingsCache();
    const row = screen.getByRole('button', { name: 'settingsGeneral' }).closest('li');
    expect(row).not.toBeNull();
    fireEvent.pointerEnter(row as HTMLElement);
    fireEvent.focus(screen.getByRole('button', { name: 'settingsWorkspace' }));
    // 预热只认存储组：给微任务/macrotask 刷新机会后仍为 1 次。
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(getStatus).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsPanel cross-group search', () => {
  const generalItems: SettingItem[] = [
    {
      id: 'language',
      groupId: 'general',
      label: 'Language',
      description: 'Display language',
      type: 'select',
      value: 'en-US',
      options: [{ value: 'en-US', label: 'English' }],
    },
  ];

  afterEach(() => {
    cleanup();
    delete (window as unknown as { digitalLife?: unknown }).digitalLife;
    useAppStore.setState((s) => ({
      settingsSearchQuery: '',
      activeSettingsGroup: 'general',
      navigatorCollapsedByTool: { ...s.navigatorCollapsedByTool, settings: false },
    }));
  });

  function renderSearchPanel(items: SettingItem[] = generalItems) {
    return render(
      <TestProvider>
        <SettingsPanel settings={items} onChangeSetting={() => {}} />
      </TestProvider>,
    );
  }

  function typeQuery(value: string): HTMLInputElement {
    fireEvent.click(screen.getByRole('button', { name: 'settingsSearchLabel' }));
    const input = document.querySelector('#adl-settings-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value } });
    return input;
  }

  it('输入查询后渲染按组分组的结果（而非扁平列表），且侧栏导航保持可见', () => {
    setupStore();
    renderSearchPanel();
    typeQuery('language');
    expect(document.querySelector('.adl-settings-search-results')).not.toBeNull();
    expect(document.querySelector('.adl-settings-controls')).toBeNull();
    const titles = Array.from(document.querySelectorAll('.adl-settings-search-results__title')).map(
      (el) => el.textContent,
    );
    expect(titles).toEqual(['settingsGeneral']);
    expect(screen.getByRole('button', { name: 'Language' })).not.toBeNull();
    // 跳转式 UX：搜索态下侧栏导航保持可见（不再隐藏）。
    expect(document.querySelector('.adl-settings-nav')).not.toBeNull();
  });

  it('点击结果切换到该条目所属组，并给锚点打上高亮类', async () => {
    setupStore();
    renderSearchPanel([]);
    typeQuery('maxconcurrent');
    // 命中词被 <mark> 拆成两个节点，计算出的可访问名带空格；按去空白归一匹配。
    fireEvent.click(
      screen.getByRole('button', {
        name: (name) => name.replace(/\s+/g, '').toLowerCase() === 'maxconcurrentworkspaces',
      }),
    );
    expect(useAppStore.getState().activeSettingsGroup).toBe('workspace');
    await waitFor(() => {
      const anchor = document.querySelector(
        '[data-settings-anchor="workspace:maxConcurrentWorkspaces"]',
      );
      expect(anchor).not.toBeNull();
      expect(anchor?.classList.contains('adl-settings-search-highlight')).toBe(true);
      // F3：跳转命中后焦点移交给落点锚点（结果项卸载不再把焦点丢给 <body>）。
      expect(document.activeElement).toBe(anchor);
    });
  });

  it('搜索态点击侧栏组重置按钮：先收起搜索再切组（M2 同族）', () => {
    setupStore();
    renderSearchPanel();
    typeQuery('language');
    expect(useAppStore.getState().settingsSearchQuery).toBe('language');
    fireEvent.click(screen.getByRole('button', { name: 'Reset settingsBrowser all defaults' }));
    // 收起搜索：否则目标组组件未挂载，重置信号无人消费、对话框迟到弹出。
    expect(useAppStore.getState().settingsSearchQuery).toBe('');
    expect(useAppStore.getState().activeSettingsGroup).toBe('browser');
  });

  it('无匹配查询渲染共享空态（settingsNoResults）', () => {
    setupStore();
    renderSearchPanel();
    typeQuery('zzz-no-such-setting');
    expect(document.querySelector('.adl-settings-search-results')).toBeNull();
    const empty = document.querySelector('.adl-empty-row');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain('settingsNoResults');
  });

  it('面板内 mod+F 打开搜索输入框并阻断默认查找', () => {
    setupStore();
    renderSearchPanel();
    const panel = document.querySelector('.adl-settings-panel') as HTMLElement;
    const bubbled: string[] = [];
    const onDocumentKeyDown = (e: KeyboardEvent) => bubbled.push(e.key);
    document.addEventListener('keydown', onDocumentKeyDown);
    const notPrevented = fireEvent.keyDown(panel, { key: 'f', ctrlKey: true });
    document.removeEventListener('keydown', onDocumentKeyDown);
    // preventDefault 已调用（dispatchEvent 返回 false）；stopPropagation 已调用（未冒泡到 document）。
    expect(notPrevented).toBe(false);
    expect(bubbled).toEqual([]);
    expect(document.querySelector('#adl-settings-search-input')).not.toBeNull();
  });

  it('面板外普通元素的 mod+F 不响应（事件确已派发并冒泡到 document，非空洞）', () => {
    setupStore();
    renderSearchPanel();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    const seen: string[] = [];
    const onDocumentKeyDown = (e: KeyboardEvent) => seen.push(e.key);
    document.addEventListener('keydown', onDocumentKeyDown);
    fireEvent.keyDown(outside, { key: 'f', ctrlKey: true });
    document.removeEventListener('keydown', onDocumentKeyDown);
    outside.remove();
    // 事件真实发生并冒泡到 document；但目标在面板 DOM 外，面板不打开搜索。
    expect(seen).toEqual(['f']);
    expect(document.querySelector('#adl-settings-search-input')).toBeNull();
  });

  it('portal 对话框（React 树内、DOM 在面板外）内的 mod+F 不响应', async () => {
    setupStore();
    renderSearchPanel();
    fireEvent.click(screen.getByRole('button', { name: 'settingsResetAll' }));
    const dialog = await screen.findByRole('dialog');
    const notPrevented = fireEvent.keyDown(dialog, { key: 'f', metaKey: true });
    expect(notPrevented).toBe(true);
    expect(document.querySelector('#adl-settings-search-input')).toBeNull();
  });

  it('冷缓存下选择异步挂载的 treeCache 锚点：待 stats 回包后仍滚动并高亮（R15）', async () => {
    setupStore();
    // 冷缓存：清空模块级 tree stats 缓存 → StorageSettings 挂载时 treeStats=null，
    // treeCache 块（含锚点）须等 getTreeCacheStats 异步回包后才渲染。
    resetStorageSettingsCache();
    // 故意让 stats 跨 3 个动画帧才回包：保证「首帧 rAF 时锚点尚不存在」，
    // 从而真实复现单帧实现静默 no-op（不依赖挂钟时间，只依赖帧顺序）。
    const getTreeCacheStats = vi.fn(
      () =>
        new Promise((resolve) => {
          let frames = 0;
          const poll = () => {
            frames += 1;
            if (frames >= 3) {
              resolve({
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
              return;
            }
            window.requestAnimationFrame(poll);
          };
          window.requestAnimationFrame(poll);
        }),
    );
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            mode: 'unified',
            root: '',
            defaultRoot: '',
            locatorPath: '',
            categories: [],
            pending: null,
            lastReport: null,
          },
        }),
        getTreeCacheStats,
      },
    };
    renderSearchPanel([]);
    // 切组前锚点不存在：确保本用例走的是「锚点异步挂载」路径。
    expect(document.querySelector('[data-settings-anchor="storage:treeCache"]')).toBeNull();
    typeQuery('treecache');
    fireEvent.click(
      screen.getByRole('button', {
        name: (name) => name.replace(/\s+/g, '').toLowerCase() === 'treecachetitle',
      }),
    );
    expect(useAppStore.getState().activeSettingsGroup).toBe('storage');
    await waitFor(() => {
      const anchor = document.querySelector('[data-settings-anchor="storage:treeCache"]');
      expect(anchor).not.toBeNull();
      expect(anchor?.classList.contains('adl-settings-search-highlight')).toBe(true);
    });
  });
});
