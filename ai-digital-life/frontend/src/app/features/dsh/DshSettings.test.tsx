import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor, act, screen } from '@testing-library/react';
import type { CopyDict } from '../../i18n';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { dshZh } from '../../i18n/zh-CN/dsh';
import { useAppStore } from '../../stores/slicedStore';
import { DshSettings } from './DshSettings';
import type { DshSourceStatus } from '../../../shared/ipc/dsh';

const fetchSourceStatus = vi.fn();
const testSource = vi.fn();
const saveSourceConfig = vi.fn();
// 版本管理块（DshVersionManagement）挂载即拉取版本状态 + 目录 + 下载源状态：静默桩。
// update/revert/uninstall/reinstall/install 仅由点击处理器调用（本套件不触发），
// 保留以维持 useAppActions mock 形状完整。
const fetchDshVersionStatus = vi.fn();
const fetchVersionCatalog = vi.fn();
const fetchDshSettingsSnapshot = vi.fn();
const fetchDshRunning = vi.fn();
const fetchVersionTask = vi.fn();
const cancelVersionTask = vi.fn();
const updateDsh = vi.fn();
const revertDsh = vi.fn();
const uninstallDsh = vi.fn();
const reinstallDsh = vi.fn();
const installDshVersion = vi.fn();

vi.mock('../../hooks/useAppActions', () => {
  // 单例对象：保持 useAppActions 返回引用稳定（真实实现经 useShallow 也稳定），
  // 否则组件挂载 effect 依赖 [actions] 会在每次重渲染时重复拉取快照。
  const actions = {
    fetchSourceStatus: (...args: unknown[]) => fetchSourceStatus(...args),
    testSource: (...args: unknown[]) => testSource(...args),
    saveSourceConfig: (...args: unknown[]) => saveSourceConfig(...args),
    fetchDshVersionStatus: (...args: unknown[]) => fetchDshVersionStatus(...args),
    fetchVersionCatalog: (...args: unknown[]) => fetchVersionCatalog(...args),
    fetchDshSettingsSnapshot: (...args: unknown[]) => fetchDshSettingsSnapshot(...args),
    fetchDshRunning: (...args: unknown[]) => fetchDshRunning(...args),
    fetchVersionTask: (...args: unknown[]) => fetchVersionTask(...args),
    cancelVersionTask: (...args: unknown[]) => cancelVersionTask(...args),
    updateDsh: (...args: unknown[]) => updateDsh(...args),
    revertDsh: (...args: unknown[]) => revertDsh(...args),
    uninstallDsh: (...args: unknown[]) => uninstallDsh(...args),
    reinstallDsh: (...args: unknown[]) => reinstallDsh(...args),
    installDshVersion: (...args: unknown[]) => installDshVersion(...args),
  };
  return { useAppActions: () => actions };
});

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

/**
 * 摘要行用真实中文模板（mockT 按 key 原样返回，`formatT` 占位符渲不出 registry）；
 * 其余键保持 key 形态以便按 key 选中元素（照抄 DshVersionManagement.test 的 emptyNoteT）。
 */
const summaryT = new Proxy({} as Record<string, string>, {
  get: (_, key) =>
    typeof key === 'string' && key.startsWith('dshSourceSummary')
      ? ((dshZh as Record<string, string>)[key] ?? key)
      : typeof key === 'string'
        ? key
        : '',
}) as unknown as CopyDict;

function renderSettingsWithSummary() {
  return render(
    <TCopyProvider t={summaryT} locale="zh-CN">
      <DshSettings />
    </TCopyProvider>,
  );
}

const NPMJS_URL = 'https://registry.npmjs.org';

function makeStatus(patch: Partial<DshSourceStatus['config']> = {}): DshSourceStatus {
  return {
    system: null,
    running: null,
    versionSource: {
      mode: 'auto',
      effective: 'host',
      resolvedByMode: { auto: 'host', host: 'host', system: 'none' },
      hostVersion: '0.1.0',
    },
    config: {
      npm_registry: NPMJS_URL,
      dsh_mirror: null,
      source_mode: 'manual',
      version_source: 'auto',
      proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
      ...patch,
    },
  };
}

function renderSettings() {
  return render(
    <TestProvider>
      <DshSettings />
    </TestProvider>,
  );
}

describe('DshSettings', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    fetchSourceStatus.mockReset();
    testSource.mockReset();
    saveSourceConfig.mockReset();
    fetchDshVersionStatus.mockReset();
    fetchDshSettingsSnapshot.mockReset();
    fetchDshRunning.mockReset();
    updateDsh.mockReset();
    revertDsh.mockReset();
    uninstallDsh.mockReset();
    reinstallDsh.mockReset();
    fetchSourceStatus.mockResolvedValue(true);
    fetchDshSettingsSnapshot.mockResolvedValue(true);
    fetchDshRunning.mockResolvedValue(true);
    testSource.mockResolvedValue({ reachable: true, latency_ms: 12, error: null });
    saveSourceConfig.mockResolvedValue(true);
    fetchDshVersionStatus.mockResolvedValue(true);
    useAppStore.setState({
      sourceStatus: null,
      dshGroupResetPending: false,
      dshBlocksAtDefault: null,
      activeSettingsGroup: 'general',
      toasts: [],
    });
  });

  it('版本块结构：单个块头 + 版本管理卡片（源/代理/测试三块已搬入网络组）', () => {
    useAppStore.setState({ sourceStatus: makeStatus() });
    renderSettings();
    const root = document.querySelector('.adl-dsh-settings');
    expect(root).not.toBeNull();
    const headers = root?.querySelectorAll('.adl-dsh-settings__header') ?? [];
    expect(headers.length).toBe(1);
    // 源/代理/测试三块的恢复按钮与测试按钮均已搬走。
    expect(root?.querySelector('[data-testid="dsh-source-reset"]')).toBeNull();
    expect(root?.querySelector('[data-testid="dsh-proxy-reset"]')).toBeNull();
    expect(root?.querySelector('[data-testid="dsh-test-button"]')).toBeNull();
    // 版本块：装饰图标 + 版本管理标题 + 版本管理组件。
    expect(headers[0]?.textContent).toContain('dshVersionManagement');
    expect(headers[0]?.querySelector('button')).toBeNull();
    expect(
      headers[0]?.querySelector('span.adl-settings-row__reset--static[aria-hidden="true"]'),
    ).not.toBeNull();
    // 检查更新行渲染文字按钮（设置组操作按钮样式）且带行内提示说明图标。
    const versionRow = root?.querySelector('[data-settings-row="dshCheckUpdate"]');
    expect(versionRow).not.toBeNull();
    expect(versionRow?.querySelector('.adl-dsh-settings__action-btn')).not.toBeNull();
    expect(versionRow?.querySelector('.adl-icon-button--info')).not.toBeNull();
    const currentRow = root?.querySelector('[data-settings-row="dshCurrentVersionLabel"]');
    expect(currentRow?.querySelector('.adl-icon-button--info')).not.toBeNull();
  });

  it('版本管理块挂载即拉取首屏原子快照（DshSettings 不再重复拉取 sourceStatus）', () => {
    renderSettings();
    // 首屏数据由内嵌版本块的原子快照一次供给，避免两路并发返回时序造成块内跳动。
    expect(fetchDshSettingsSnapshot).toHaveBeenCalledTimes(1);
    expect(fetchSourceStatus).not.toHaveBeenCalled();
  });

  it('组级恢复：承接 pending 开自有确认框，确认后只写版本来源并消费信号', async () => {
    useAppStore.setState({
      sourceStatus: makeStatus({
        source_mode: 'manual',
        npm_registry: 'https://custom.example',
        version_source: 'host',
        proxy: {
          mode: 'manual',
          http_proxy: 'http://old:1',
          https_proxy: null,
          no_proxy: null,
        },
      }),
    });
    renderSettings();
    act(() => {
      useAppStore.setState({ dshGroupResetPending: true });
    });
    // 首跳不漏弹：自有确认框承接（标题与通用键同模板，但执行走 saveSourceConfig）。
    expect(await screen.findByText('settingsResetGroupConfirmTitle')).not.toBeNull();
    expect(useAppStore.getState().dshGroupResetPending).toBe(false);
    expect(saveSourceConfig).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => {
      // Task 5 拆分：本组只写版本来源（源/代理归网络组单计划）。
      expect(saveSourceConfig).toHaveBeenCalledWith({ version_source: 'auto' });
    });
    expect(saveSourceConfig).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(useAppStore.getState().toasts.some((t) => t.message === 'settingsResetComplete')).toBe(
        true,
      );
    });
  });

  it('组级恢复失败：弹失败提示', async () => {
    useAppStore.setState({ sourceStatus: makeStatus({ version_source: 'host' }) });
    saveSourceConfig.mockResolvedValue(false);
    renderSettings();
    act(() => {
      useAppStore.setState({ dshGroupResetPending: true });
    });
    expect(await screen.findByText('settingsResetGroupConfirmTitle')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => {
      expect(useAppStore.getState().toasts.some((t) => t.message === 'dshSettingsSaveFailed')).toBe(
        true,
      );
    });
  });

  it('版本来源默认写聚合信号 dshBlocksAtDefault，卸载保留', async () => {
    useAppStore.setState({
      sourceStatus: makeStatus({ version_source: 'auto' }),
    });
    const { unmount } = renderSettings();
    await waitFor(() => {
      expect(useAppStore.getState().dshBlocksAtDefault).toBe(true);
    });
    unmount();
    // 卸载不清（事项 12d）：保留最后已知聚合供侧边栏禁用判定，
    // 切出后由 SettingsPanel 未激活校正随 store 变化刷新。
    expect(useAppStore.getState().dshBlocksAtDefault).toBe(true);
  });

  it('版本来源非默认时聚合信号为 false（源/代理偏离不再影响本组）', async () => {
    useAppStore.setState({
      sourceStatus: makeStatus({
        source_mode: 'manual',
        proxy: { mode: 'manual', http_proxy: 'http://old:1', https_proxy: null, no_proxy: null },
        version_source: 'host',
      }),
    });
    renderSettings();
    await waitFor(() => {
      expect(useAppStore.getState().dshBlocksAtDefault).toBe(false);
    });
  });

  it('版本来源默认时源/代理偏离不拉低聚合（只看版本来源）', async () => {
    useAppStore.setState({
      sourceStatus: makeStatus({
        source_mode: 'manual',
        proxy: { mode: 'manual', http_proxy: 'http://old:1', https_proxy: null, no_proxy: null },
        version_source: 'auto',
      }),
    });
    renderSettings();
    await waitFor(() => {
      expect(useAppStore.getState().dshBlocksAtDefault).toBe(true);
    });
  });

  it('顶部摘要行只读展示当前源，点击前往修改跳转网络组', () => {
    useAppStore.setState({ sourceStatus: makeStatus(), activeSettingsGroup: 'dsh' });
    renderSettingsWithSummary();
    // 只读：registry 来自 sourceStatus.config；延迟无常驻数据源，恒为未知。
    expect(screen.getByText(`当前源：${NPMJS_URL}（延迟 —）`)).not.toBeNull();
    expect(saveSourceConfig).not.toHaveBeenCalled();
    expect(fetchSourceStatus).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '前往修改' }));
    expect(useAppStore.getState().activeSettingsGroup).toBe('network');
  });

  it('摘要行 sourceStatus 未知时 fail-open 显示未知符', () => {
    useAppStore.setState({ sourceStatus: null });
    renderSettingsWithSummary();
    expect(screen.getByText('当前源：—（延迟 —）')).not.toBeNull();
  });
});
