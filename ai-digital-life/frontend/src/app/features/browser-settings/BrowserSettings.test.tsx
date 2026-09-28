import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { CopyDict } from '../../i18n';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { useAppStore } from '../../stores/slicedStore';
import { BrowserSettings } from './BrowserSettings';

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

// 确认框文案覆盖：formatT 以 {group} 插值，块级确认走通用 settingsResetGroupConfirm* 键。
// Proxy 基底保证未覆盖键回落为 key 本身（组件内 .replace 调用不因缺键崩溃）。
const confirmT = new Proxy({} as Record<string, string>, {
  get: (_, key) => {
    switch (key) {
      case 'settingsResetGroupConfirmTitle':
        return 'Reset {group}?';
      case 'settingsResetGroupConfirmMessage':
        return '{group} group will reset';
      case 'confirm':
        return 'confirm-btn';
      case 'cancel':
        return 'cancel-btn';
      case 'browserSettingsSuspendTitle':
        return 'Suspend delay';
      case 'browserDownloadSettingsTitle':
        return 'Download Settings';
      default:
        return typeof key === 'string' ? key : '';
    }
  },
}) as unknown as CopyDict;

function renderBrowser(t: CopyDict = mockT) {
  return render(
    <TCopyProvider t={t} locale="en-US">
      <BrowserSettings />
    </TCopyProvider>,
  );
}

/** block 恢复默认按钮（按 testid 取，aria-label 在 mockT 下各块同名不可用）。 */
function resetButton(testId: string): HTMLButtonElement {
  const btn = document.querySelector(`[data-testid="${testId}"]`);
  expect(btn, testId).not.toBeNull();
  return btn as HTMLButtonElement;
}

/** 全量 config 播种（StorageSettings.test 同构字面量），挂起时长可覆盖。 */
function setConfig(suspendMs: number) {
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
        browserInactiveTabSuspendMs: suspendMs,
        terminalHistoryBudgetBytes: 1 << 30,
      },
      currentWorkspace: undefined,
      recentLogs: [],
    },
  });
}

function setDownload(mode: 'auto' | 'ask', loaded: boolean) {
  useAppStore.setState({
    downloadSettings: { mode, default_path: '', auto_migrate_on_path_change: false },
    downloadSettingsLoaded: loaded,
  });
}

const updatePreferences = vi.fn();
const updateDownloadSettings = vi.fn();

describe('Browser settings group blocks', () => {
  beforeEach(() => {
    updatePreferences.mockReset().mockResolvedValue(true);
    updateDownloadSettings.mockReset().mockResolvedValue({ ok: true, data: undefined });
    useAppStore.setState({
      appInfo: undefined,
      isLoadingSettings: false,
      updatePreferences: updatePreferences as never,
      updateDownloadSettings: updateDownloadSettings as never,
    });
    setDownload('ask', true);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useAppStore.setState({
      appInfo: undefined,
      downloadSettings: { mode: 'ask', default_path: '', auto_migrate_on_path_change: false },
      downloadSettingsLoaded: false,
      isLoadingSettings: false,
      browserGroupResetPending: false,
      browserBlocksAtDefault: null,
    });
  });

  it('renders block headers above their cards with block-level reset buttons', () => {
    renderBrowser();
    const wrapper = document.querySelector('.adl-settings-section.adl-settings-browser');
    expect(wrapper).not.toBeNull();
    const headers = wrapper!.querySelectorAll('.adl-settings-browser__header');
    expect(headers).toHaveLength(2);
    for (const header of headers) {
      // 块头在卡片之外（标题移到块上方左侧）。
      expect(header.closest('.adl-settings-card')).toBeNull();
      expect(header.querySelector('.adl-settings-header')).not.toBeNull();
    }
    expect(headers[0].querySelector('[data-testid="suspend-reset"]')).not.toBeNull();
    expect(headers[1].querySelector('[data-testid="download-mode-reset"]')).not.toBeNull();
    // 挂起 / 下载模式 / 下载路径三张卡片与块头同级。
    expect(wrapper!.querySelectorAll(':scope > .adl-settings-card')).toHaveLength(3);
  });

  it('keeps subtitle and description inside each card', () => {
    renderBrowser();
    // 挂起块：标题重复为卡内副标题（用户指定保留），描述在副标题下。
    expect(screen.getAllByText('browserSettingsSuspendTitle').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('browserSettingsSuspendDesc')).toBeTruthy();
    // 下载模式块：块头「下载设置」+ 卡内副标题「下载模式」+ 合并后的描述。
    expect(screen.getByText('browserDownloadSettingsTitle')).toBeTruthy();
    expect(screen.getByText('browserDownloadSettingsMode')).toBeTruthy();
    expect(screen.getByText('browserDownloadSettingsModeHint')).toBeTruthy();
    // 被合并删除的旧描述键不再渲染。
    expect(screen.queryByText('browserDownloadSettingsDesc')).toBeNull();
    expect(screen.queryByText('browserDownloadSettingsModeDesc')).toBeNull();
  });

  it('suspend reset asks for confirmation before writing the product default', async () => {
    setConfig(3_600_000);
    renderBrowser(confirmT);
    const btn = resetButton('suspend-reset');
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(screen.getByText('Reset Suspend delay?')).toBeTruthy();
    expect(updatePreferences).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'confirm-btn' }));
    await waitFor(() =>
      expect(updatePreferences).toHaveBeenCalledWith({ browserInactiveTabSuspendMs: 900_000 }),
    );
    await waitFor(() => expect(screen.queryByText('Reset Suspend delay?')).toBeNull());
  });

  it('cancelling the suspend reset dialog writes nothing', () => {
    setConfig(3_600_000);
    renderBrowser(confirmT);
    fireEvent.click(resetButton('suspend-reset'));
    fireEvent.click(screen.getByRole('button', { name: 'cancel-btn' }));
    expect(updatePreferences).not.toHaveBeenCalled();
    expect(screen.queryByText('Reset Suspend delay?')).toBeNull();
  });

  it('suspend reset is disabled at the 15-minute default, enabled on deviation (fail-open)', () => {
    setConfig(900_000);
    renderBrowser();
    expect(resetButton('suspend-reset').disabled).toBe(true);
    cleanup();
    setConfig(3_600_000);
    renderBrowser();
    expect(resetButton('suspend-reset').disabled).toBe(false);
    cleanup();
    // config 未加载 → 未知不禁用（fail-open）。
    useAppStore.setState({ appInfo: undefined });
    renderBrowser();
    expect(resetButton('suspend-reset').disabled).toBe(false);
  });

  it('selecting Custom… reveals the amount input and commits through the debounce', async () => {
    vi.useFakeTimers();
    setConfig(900_000);
    renderBrowser();
    fireEvent.click(screen.getByRole('button', { name: 'browserSettingsSuspendTitle' }));
    fireEvent.click(screen.getByRole('option', { name: 'browserSettingsSuspendCustom' }));
    const input = screen.getByRole('spinbutton', { name: 'browserSettingsSuspendCustom' });
    expect((input as HTMLInputElement).value).toBe('15');
    fireEvent.change(input, { target: { value: '90' } });
    expect(updatePreferences).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(updatePreferences).toHaveBeenCalledWith({ browserInactiveTabSuspendMs: 5_400_000 });
  });

  it('switching the custom unit converts the in-flight draft', async () => {
    vi.useFakeTimers();
    setConfig(900_000);
    renderBrowser();
    fireEvent.click(screen.getByRole('button', { name: 'browserSettingsSuspendTitle' }));
    fireEvent.click(screen.getByRole('option', { name: 'browserSettingsSuspendCustom' }));
    const input = screen.getByRole('spinbutton', { name: 'browserSettingsSuspendCustom' });
    fireEvent.change(input, { target: { value: '90' } });
    // 输入中切单位：90 分钟 → 1.5 小时（同一草稿换算，防抖重排）。
    fireEvent.click(screen.getByRole('button', { name: 'browserSettingsSuspendUnitLabel' }));
    fireEvent.click(screen.getByRole('option', { name: 'browserSettingsSuspendUnitHour' }));
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('1.5');
    expect(updatePreferences).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(updatePreferences).toHaveBeenCalledWith({ browserInactiveTabSuspendMs: 5_400_000 });
  });

  it('a non-preset stored value shows a seeded custom draft instead of snapping to a preset', () => {
    setConfig(420_000); // 7 分钟：非档位值 → 自定义态承接。
    renderBrowser();
    // 自定义态有两个下拉（单位在前、预设档在右）：断言预设档触发器（按可及名定位）。
    const trigger = screen.getByRole('button', { name: 'browserSettingsSuspendTitle' });
    expect(trigger.querySelector('.adl-settings-dropdown__value')?.textContent).toBe(
      'browserSettingsSuspendCustom',
    );
    const input = screen.getByRole('spinbutton', { name: 'browserSettingsSuspendCustom' });
    expect((input as HTMLInputElement).value).toBe('7');
  });

  it('falls back to the 15-minute product default when config is not loaded', () => {
    const t = {
      ...mockT,
      browserSettingsSuspendMin: '{n} min',
      browserSettingsSuspendOff: 'Off',
    } as unknown as CopyDict;
    renderBrowser(t);
    const value = document.querySelector('.adl-settings-dropdown__value');
    expect(value?.textContent).toBe('15 min');
  });

  it('download mode reset asks for confirmation and writes auto-save', async () => {
    setDownload('ask', true);
    renderBrowser(confirmT);
    const btn = resetButton('download-mode-reset');
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(screen.getByText('Reset Download Settings?')).toBeTruthy();
    expect(updateDownloadSettings).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'confirm-btn' }));
    await waitFor(() => expect(updateDownloadSettings).toHaveBeenCalledWith('auto'));
    await waitFor(() => expect(screen.queryByText('Reset Download Settings?')).toBeNull());
  });

  it('download mode reset is disabled only when loaded and already auto-save (fail-open)', () => {
    setDownload('auto', true);
    renderBrowser();
    expect(resetButton('download-mode-reset').disabled).toBe(true);
    cleanup();
    // 加载失败/未加载 → 未知不禁用。
    setDownload('auto', false);
    renderBrowser();
    expect(resetButton('download-mode-reset').disabled).toBe(false);
    cleanup();
    setDownload('ask', true);
    renderBrowser();
    expect(resetButton('download-mode-reset').disabled).toBe(false);
  });

  it('renders the shared download path block (same store as storage group)', () => {
    renderBrowser();
    expect(document.querySelector('[data-testid="download-path-reset"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="download-path-row"]')).not.toBeNull();
    expect(document.querySelector('.adl-settings-storage__header--section')).not.toBeNull();
  });
});

describe('Browser settings group reset (own confirm dialog)', () => {
  beforeEach(() => {
    updatePreferences.mockReset().mockResolvedValue(true);
    updateDownloadSettings.mockReset().mockResolvedValue({ ok: true, data: undefined });
    useAppStore.setState({
      appInfo: undefined,
      isLoadingSettings: false,
      updatePreferences: updatePreferences as never,
      updateDownloadSettings: updateDownloadSettings as never,
      browserGroupResetPending: false,
      browserBlocksAtDefault: null,
    });
    setDownload('ask', true);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useAppStore.setState({
      appInfo: undefined,
      downloadSettings: { mode: 'ask', default_path: '', auto_migrate_on_path_change: false },
      downloadSettingsLoaded: false,
      isLoadingSettings: false,
      browserGroupResetPending: false,
      browserBlocksAtDefault: null,
    });
  });

  it('mount consumes the pending signal and opens the group confirm dialog', () => {
    useAppStore.setState({ browserGroupResetPending: true });
    renderBrowser();
    expect(screen.getByText('browserGroupResetTitle')).toBeTruthy();
    expect(useAppStore.getState().browserGroupResetPending).toBe(false);
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it('group message shows the migrate note only when the toggle was on at open', () => {
    useAppStore.setState({
      downloadSettings: {
        mode: 'ask',
        default_path: 'C:/dl',
        auto_migrate_on_path_change: true,
      },
      downloadSettingsLoaded: true,
      browserGroupResetPending: true,
    });
    renderBrowser();
    const msg = document.querySelector('.adl-confirm-dialog__message');
    expect(msg?.textContent).toContain('browserGroupResetMigrateOnNote');
  });

  it('group message omits the migrate note when the toggle was off at open', () => {
    useAppStore.setState({
      downloadSettings: {
        mode: 'ask',
        default_path: 'C:/dl',
        auto_migrate_on_path_change: false,
      },
      downloadSettingsLoaded: true,
      browserGroupResetPending: true,
    });
    renderBrowser();
    const msg = document.querySelector('.adl-confirm-dialog__message');
    expect(msg?.textContent).not.toContain('browserGroupResetMigrateOnNote');
  });

  it('confirm executes suspend → mode → path in order and closes on success', async () => {
    const changeDownloadPath = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    useAppStore.setState({
      changeDownloadPath: changeDownloadPath as never,
      downloadSettings: {
        mode: 'ask',
        default_path: 'C:/dl',
        auto_migrate_on_path_change: false,
      },
      downloadSettingsLoaded: true,
      browserGroupResetPending: true,
    });
    renderBrowser(confirmT);
    fireEvent.click(screen.getByRole('button', { name: 'confirm-btn' }));
    await waitFor(() => {
      expect(updatePreferences).toHaveBeenCalledWith({ browserInactiveTabSuspendMs: 900_000 });
      expect(updateDownloadSettings).toHaveBeenCalledWith('auto');
      expect(changeDownloadPath).toHaveBeenCalledWith('', false);
    });
    await waitFor(() => expect(screen.queryByText('browserGroupResetTitle')).toBeNull());
    expect(updatePreferences.mock.invocationCallOrder[0]).toBeLessThan(
      updateDownloadSettings.mock.invocationCallOrder[0],
    );
    expect(updateDownloadSettings.mock.invocationCallOrder[0]).toBeLessThan(
      changeDownloadPath.mock.invocationCallOrder[0],
    );
  });

  it('keeps the dialog open and stops the sequence when a step fails', async () => {
    updatePreferences.mockResolvedValueOnce(false);
    useAppStore.setState({ browserGroupResetPending: true });
    renderBrowser(confirmT);
    fireEvent.click(screen.getByRole('button', { name: 'confirm-btn' }));
    await waitFor(() => expect(updatePreferences).toHaveBeenCalled());
    expect(screen.getByText('browserGroupResetTitle')).toBeTruthy();
    expect(updateDownloadSettings).not.toHaveBeenCalled();
  });

  it('cancelling the group confirm writes nothing', () => {
    useAppStore.setState({ browserGroupResetPending: true });
    renderBrowser(confirmT);
    fireEvent.click(screen.getByRole('button', { name: 'cancel-btn' }));
    expect(screen.queryByText('browserGroupResetTitle')).toBeNull();
    expect(updatePreferences).not.toHaveBeenCalled();
    expect(updateDownloadSettings).not.toHaveBeenCalled();
  });

  it('group reset discards an in-flight custom draft instead of letting it overwrite the default', async () => {
    // F1：自定义草稿防抖在途时组级恢复确认写默认，旧草稿到期不得覆盖。
    vi.useFakeTimers();
    const changeDownloadPath = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    // mock 写穿 store，使 raw 真正变化（复现外部写入路径）。
    updatePreferences.mockImplementation(async (patch) => {
      useAppStore.setState((s) => ({
        appInfo: s.appInfo
          ? { ...s.appInfo, config: { ...s.appInfo.config, ...patch } }
          : s.appInfo,
      }));
      return true;
    });
    setConfig(3_600_000);
    setDownload('auto', true);
    useAppStore.setState({ changeDownloadPath: changeDownloadPath as never });
    renderBrowser(confirmT);
    // 先键入自定义草稿（500ms 防抖尚未提交）。
    fireEvent.click(screen.getByRole('button', { name: 'Suspend delay' }));
    fireEvent.click(screen.getByRole('option', { name: 'browserSettingsSuspendCustom' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'browserSettingsSuspendCustom' }), {
      target: { value: '90' },
    });
    expect(updatePreferences).not.toHaveBeenCalled();
    // 草稿在途时触发组级恢复并确认。
    act(() => {
      useAppStore.setState({ browserGroupResetPending: true });
    });
    expect(screen.getByText('browserGroupResetTitle')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'confirm-btn' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    // 只写一次默认值，旧草稿（90 分钟 = 5_400_000）不得覆盖。
    expect(updatePreferences).toHaveBeenCalledTimes(1);
    expect(updatePreferences).toHaveBeenCalledWith({ browserInactiveTabSuspendMs: 900_000 });
    expect(screen.queryByText('browserGroupResetTitle')).toBeNull();
    // 组恢复成功后挂起块回到预设显示（H-1 回归锁定）：自定义输入消失。
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('seeds the product default instead of 0 when entering custom from Off', () => {
    // F6：Off（0ms）进自定义时播种 15（与 number input min=1 一致），而非 '0'。
    setConfig(0);
    renderBrowser();
    fireEvent.click(screen.getByRole('button', { name: 'browserSettingsSuspendTitle' }));
    fireEvent.click(screen.getByRole('option', { name: 'browserSettingsSuspendCustom' }));
    expect(
      (screen.getByRole('spinbutton', { name: 'browserSettingsSuspendCustom' }) as HTMLInputElement)
        .value,
    ).toBe('15');
  });

  it('converts the seeded display when switching units without typing (U1)', () => {
    // 7 分钟存量播种为 7 分钟；未键入即切小时，显示须换算（0.1167）而非保留 7。
    setConfig(420_000);
    renderBrowser();
    const input = screen.getByRole('spinbutton', {
      name: 'browserSettingsSuspendCustom',
    }) as HTMLInputElement;
    expect(input.value).toBe('7');
    fireEvent.click(screen.getByRole('button', { name: 'browserSettingsSuspendUnitLabel' }));
    fireEvent.click(screen.getByRole('option', { name: 'browserSettingsSuspendUnitHour' }));
    expect(
      (screen.getByRole('spinbutton', { name: 'browserSettingsSuspendCustom' }) as HTMLInputElement)
        .value,
    ).toBe('0.1167');
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it('disables the suspend reset while settings are loading (U2)', () => {
    setConfig(3_600_000);
    useAppStore.setState({ isLoadingSettings: true });
    renderBrowser();
    expect(resetButton('suspend-reset').disabled).toBe(true);
    // 预设下拉与模式块下拉口径一致，加载中同样禁用（R1）。
    expect(
      (screen.getByRole('button', { name: 'browserSettingsSuspendTitle' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('keeps the custom draft when the suspend reset write fails', async () => {
    // L-2：恢复写桥失败时对话框保持打开，且用户草稿保留可直接重试。
    vi.useFakeTimers();
    updatePreferences.mockResolvedValue(false);
    setConfig(3_600_000);
    renderBrowser(confirmT);
    fireEvent.click(screen.getByRole('button', { name: 'Suspend delay' }));
    fireEvent.click(screen.getByRole('option', { name: 'browserSettingsSuspendCustom' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'browserSettingsSuspendCustom' }), {
      target: { value: '90' },
    });
    fireEvent.click(resetButton('suspend-reset'));
    fireEvent.click(screen.getByRole('button', { name: 'confirm-btn' }));
    await act(async () => {});
    expect(screen.getByText('Reset Suspend delay?')).toBeTruthy();
    expect(
      (screen.getByRole('spinbutton', { name: 'browserSettingsSuspendCustom' }) as HTMLInputElement)
        .value,
    ).toBe('90');
  });

  it('drops the pending signal while the download path block confirm is open (entry guard)', () => {
    useAppStore.setState({
      downloadSettings: {
        mode: 'ask',
        default_path: 'C:/dl',
        auto_migrate_on_path_change: false,
      },
      downloadSettingsLoaded: true,
    });
    renderBrowser();
    fireEvent.click(resetButton('download-path-reset'));
    expect(document.querySelector('.adl-confirm-overlay')).not.toBeNull();
    act(() => {
      useAppStore.setState({ browserGroupResetPending: true });
    });
    expect(useAppStore.getState().browserGroupResetPending).toBe(false);
    expect(screen.queryByText('browserGroupResetTitle')).toBeNull();
  });

  it('drops the pending signal while the suspend block confirm is open (entry guard)', () => {
    setConfig(3_600_000);
    renderBrowser();
    fireEvent.click(resetButton('suspend-reset'));
    act(() => {
      useAppStore.setState({ browserGroupResetPending: true });
    });
    expect(useAppStore.getState().browserGroupResetPending).toBe(false);
    expect(screen.queryByText('browserGroupResetTitle')).toBeNull();
  });

  it('reports the aggregate all-default signal while mounted and keeps it on unmount', () => {
    setConfig(900_000);
    setDownload('auto', true);
    renderBrowser();
    expect(useAppStore.getState().browserBlocksAtDefault).toBe(true);
    cleanup();
    // 卸载不清（事项 12c）：保留最后已知聚合供侧边栏禁用判定，
    // 切出后由 SettingsPanel 未激活校正刷新。
    expect(useAppStore.getState().browserBlocksAtDefault).toBe(true);
  });

  it('aggregate reports non-default when any block deviates', () => {
    setConfig(3_600_000);
    setDownload('auto', true);
    renderBrowser();
    expect(useAppStore.getState().browserBlocksAtDefault).toBe(false);
  });
});
