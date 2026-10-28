import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor, act, screen } from '@testing-library/react';
import type { CopyDict } from '../../i18n';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { dshZh } from '../../i18n/zh-CN/dsh';
import { useAppStore } from '../../stores/slicedStore';
import { DshSettings } from './DshSettings';
import type { DshSourceStatus, DshVersionStatus } from '../../../shared/ipc/dsh';

const fetchSourceStatus = vi.fn();
const testSource = vi.fn();
const saveSourceConfig = vi.fn();
// 版本块（通用版本卡片）挂载即拉取首屏原子快照 + 运行态轮询：静默桩。
// update/revert/uninstall/reinstall/install 仅由卡片点击处理器调用（本套件不触发），
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
const restartDsh = vi.fn();

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
    restartDsh: (...args: unknown[]) => restartDsh(...args),
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
 * 摘要行与运行态读数用真实中文模板（mockT 按 key 原样返回，`formatT` 占位符
 * 渲不出 registry/mode/地址）；其余键保持 key 形态以便按 key 选中元素。
 * 自动检测标签（dshSettingsSourceAuto）同样取真实中文，否则 mode 位只剩 key。
 */
const READOUT_KEYS = new Set([
  'dshSourceSummary',
  'dshSourceSummaryTitle',
  'dshSourceSummaryMode',
  'dshSourceSummaryManual',
  'dshSourceSummaryUnknown',
  'dshSourceSummaryGoModify',
  'dshSettingsSourceAuto',
  'dshEffectiveRunning',
  'dshEffectiveRunningSystem',
  'dshRunningExternalNote',
  'dshEffectiveSystem',
  'dshVersionUnknown',
  'dshCurrentVersionNone',
  'dshLatest',
]);

const summaryT = new Proxy({} as Record<string, string>, {
  get: (_, key) =>
    typeof key === 'string' && READOUT_KEYS.has(key)
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

/** 卡片按钮只在底层桥可用时响应：动作类用例给一个空 dsh 桥（load 走打桩 actions）。 */
function seedDshBridge() {
  (window as unknown as { digitalLife?: unknown }).digitalLife = { dsh: {} };
}

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

function makeVersionStatus(overrides: Partial<DshVersionStatus> = {}): DshVersionStatus {
  return {
    currentSelected: '1.2.3',
    installed: ['1.2.3'],
    latestAvailable: '1.3.0',
    hasUpdate: true,
    prereleaseAvailable: null,
    hasPrereleaseUpdate: false,
    prereleaseUnknown: false,
    ...overrides,
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
    installDshVersion.mockReset();
    fetchVersionTask.mockReset();
    cancelVersionTask.mockReset();
    restartDsh.mockReset();
    fetchSourceStatus.mockResolvedValue(true);
    fetchDshSettingsSnapshot.mockResolvedValue(true);
    fetchDshRunning.mockResolvedValue(true);
    testSource.mockResolvedValue({ reachable: true, latency_ms: 12, error: null });
    saveSourceConfig.mockResolvedValue(true);
    fetchDshVersionStatus.mockResolvedValue(true);
    installDshVersion.mockResolvedValue(true);
    fetchVersionTask.mockResolvedValue(undefined);
    cancelVersionTask.mockResolvedValue(true);
    restartDsh.mockResolvedValue({ restarted: false, url: null, failed: false });
    delete (window as unknown as { digitalLife?: unknown }).digitalLife;
    useAppStore.setState({
      sourceStatus: null,
      versionStatus: null,
      versionCatalog: null,
      versionCatalogFailed: false,
      settingsSnapshotFailed: false,
      dshVersionSourceDeferred: false,
      dshVersionSourcePending: null,
      dshGroupResetPending: false,
      dshBlocksAtDefault: null,
      activeSettingsGroup: 'general',
      dshRestarting: false,
      versionTask: null,
      versionTaskCancelRequested: false,
      toasts: [],
    });
  });

  it('版本块结构：单个块头 + 通用版本卡片（旧版本组件不再渲染）', () => {
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
    // 块头：问号提示 + 版本管理标题（问号替代已删除的恢复默认按钮）。
    expect(headers[0]?.textContent).toContain('dshVersionManagement');
    expect(headers[0]?.querySelector('.adl-icon-button--info')).not.toBeNull();
    expect(
      headers[0]?.querySelector('span.adl-settings-row__reset--static[aria-hidden="true"]'),
    ).toBeNull();
    // 版本区换成通用卡片：卡片自带块头被隐藏（组内只有上面一个块头）。
    expect(root?.querySelector('.adl-harness-version')).not.toBeNull();
    expect(
      root?.querySelectorAll('.adl-harness-version .adl-settings-storage__header'),
    ).toHaveLength(0);
    // 通用卡片的行标记（数据源同 `harnessVersion*` 文案），旧 DSH 行标记已消失。
    const updateRow = root?.querySelector('[data-settings-row="harnessVersionUpdate"]');
    expect(updateRow).not.toBeNull();
    expect(updateRow?.querySelector('.adl-harness-version__action-btn')).not.toBeNull();
    expect(root?.querySelector('[data-settings-row="harnessVersionCurrent"]')).not.toBeNull();
    expect(root?.querySelector('[data-settings-row="dshCheckUpdate"]')).toBeNull();
    expect(root?.querySelector('[data-settings-row="dshCurrentVersionLabel"]')).toBeNull();
    // 来源行保留行内问号提示（沿用 DSH 的来源说明）。
    const sourceRow = root?.querySelector('[data-settings-row="harnessVersionSourceTitle"]');
    expect(sourceRow?.querySelector('.adl-icon-button--info')).not.toBeNull();
  });

  it('未安装任何版本时显示缺失横幅（通用卡片 missingBanner 插槽）', async () => {
    useAppStore.setState({
      sourceStatus: makeStatus(),
      versionStatus: makeVersionStatus({ currentSelected: null, installed: [] }),
    });
    renderSettings();
    const banner = await screen.findByTestId('dsh-missing-banner');
    expect(banner.textContent).toBe('harnessMissingBannerDsh');
    // 旧 DSH 组件不再渲染（其读数行与缺失横幅都是旧的专属类名）。
    expect(document.querySelector('.adl-dsh-settings__version-readout')).toBeNull();
  });

  it('运行态读数插槽保留运行地址与版本（token 剥离后只在 title 上）', () => {
    const status = makeStatus();
    useAppStore.setState({
      sourceStatus: {
        ...status,
        running: {
          url: 'http://127.0.0.1:3080/?token=secret',
          port: 3080,
          managed: true,
          version: '1.2.3',
          source: 'host',
        },
        versionSource: { ...status.versionSource, effective: 'running' },
      },
      versionStatus: makeVersionStatus({ currentSelected: '1.2.3' }),
    });
    renderSettingsWithSummary();
    // 运行态读数插槽：主行是运行中的真实版本号，副行带端点，完整地址（去 token）在 title。
    const readout = document.querySelector('.adl-harness-version__readout');
    expect(readout).not.toBeNull();
    expect(readout?.textContent).toContain('1.2.3');
    const sub = readout?.querySelector('.adl-harness-version__readout-sub');
    expect(sub?.textContent).toBe('运行中（127.0.0.1:3080）');
    expect(sub?.getAttribute('title')).toBe('http://127.0.0.1:3080/');
  });

  it('系统安装生效时隐藏管理项并提示由系统维护（显隐规则与迁移前一致）', async () => {
    const status = makeStatus();
    useAppStore.setState({
      sourceStatus: {
        ...status,
        system: { path: 'C:/Program Files/dsh/dsh.exe', version: '0.9.0' },
        versionSource: {
          mode: 'system',
          effective: 'system',
          resolvedByMode: { auto: 'system', host: 'host', system: 'system' },
          hostVersion: null,
        },
      },
      versionStatus: makeVersionStatus({ currentSelected: null, installed: [] }),
    });
    renderSettings();
    const root = document.querySelector('.adl-dsh-settings');
    // 首屏快照到达后管理行隐藏（快照前不闪管理项由卡片自行处理）。
    await waitFor(() => {
      expect(root?.querySelector('[data-settings-row="harnessVersionUpdate"]')).toBeNull();
    });
    expect(root?.querySelector('[data-settings-row="harnessVersionStable"]')).toBeNull();
    expect(root?.querySelector('[data-settings-row="harnessVersionManual"]')).toBeNull();
    // 当前版本行与系统安装读数仍可见。
    expect(root?.querySelector('[data-settings-row="harnessVersionCurrent"]')).not.toBeNull();
    expect(screen.getByText('dshSystemManagedNote')).not.toBeNull();
  });

  it('切换版本来源会弹确认框；取消回退宿主且不写目标来源', async () => {
    seedDshBridge();
    const status = makeStatus();
    useAppStore.setState({
      sourceStatus: {
        ...status,
        system: { path: 'C:/Program Files/dsh/dsh.exe', version: '0.9.0' },
      },
      versionStatus: makeVersionStatus(),
    });
    renderSettings();
    const selects = Array.from(document.querySelectorAll('select'));
    // 第一处是稳定版选择，最后一个才是版本来源。
    fireEvent.change(selects[selects.length - 1], { target: { value: 'system' } });

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('dshVersionSourceSystemDialogTitle');
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // 历史行为：切向系统安装取消时回退宿主。
    expect(saveSourceConfig).toHaveBeenCalledWith({ version_source: 'host' }, true);
    expect(saveSourceConfig).not.toHaveBeenCalledWith({ version_source: 'system' }, true);
  });

  it('切向系统安装但未检测到系统安装时只提示，不弹框不写盘', async () => {
    seedDshBridge();
    useAppStore.setState({
      sourceStatus: makeStatus({
        version_source: 'host',
      }),
      versionStatus: makeVersionStatus(),
    });
    renderSettings();
    const selects = Array.from(document.querySelectorAll('select'));
    fireEvent.change(selects[selects.length - 1], { target: { value: 'system' } });

    await waitFor(() => {
      expect(useAppStore.getState().toasts.some((t) => t.message === 'dshSystemMissing')).toBe(
        true,
      );
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(saveSourceConfig).not.toHaveBeenCalled();
  });

  it('版本管理块挂载即拉取首屏原子快照；sourceStatus 为 null 时静默补拉一次', () => {
    renderSettings();
    // 首屏数据由内嵌版本块的原子快照一次供给，避免两路并发返回时序造成块内跳动。
    expect(fetchDshSettingsSnapshot).toHaveBeenCalledTimes(1);
    // 直接落到 DSH 组（未经网络组）时摘要也要有数据：null 才补拉，且只拉一次。
    expect(fetchSourceStatus).toHaveBeenCalledTimes(1);
    expect(fetchSourceStatus).toHaveBeenCalledWith(true);
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

  it('摘要行挂在版本管理卡最下方，只读展示当前下载源，点击前往修改跳转网络组', () => {
    useAppStore.setState({ sourceStatus: makeStatus(), activeSettingsGroup: 'dsh' });
    renderSettingsWithSummary();
    // 只读：registry 来自 sourceStatus.config；mode 按 source_mode 取自动检测/手动选择标签。
    expect(screen.getByText(`当前下载源：${NPMJS_URL}`)).not.toBeNull();
    // 尾部模式提示用直角引号（不是全角圆括号）。
    expect(screen.getByText('「手动选择」')).not.toBeNull();
    // 位置：当前下载源独立沉底卡（无块标题，照抄存储组数据位置索引卡），问号在项名前。
    const row = screen.getByText(`当前下载源：${NPMJS_URL}`).closest('.adl-settings-row');
    const card = row?.closest('.adl-settings-card');
    expect(row).not.toBeNull();
    expect(card).not.toBeNull();
    expect(card?.getAttribute('data-testid')).toBe('dsh-source-summary-card');
    // 独立卡不含版本管理内容（官方版本信息行在另一张卡），问号在前、链接为通用下划线样式。
    expect(card!.contains(screen.getByText('dshOfficialLinksLabel'))).toBe(false);
    expect(row?.querySelector('.adl-icon-button--info')).not.toBeNull();
    expect(row?.querySelector('.adl-dsh-settings__action-btn')).not.toBeNull();
    expect(saveSourceConfig).not.toHaveBeenCalled();
    expect(fetchSourceStatus).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '前往修改' }));
    expect(useAppStore.getState().activeSettingsGroup).toBe('network');
  });

  it('摘要行 source_mode 为 auto 时展示自动检测标签', () => {
    useAppStore.setState({
      sourceStatus: makeStatus({ source_mode: 'auto' }),
      activeSettingsGroup: 'dsh',
    });
    renderSettingsWithSummary();
    expect(screen.getByText(`当前下载源：${NPMJS_URL}`)).not.toBeNull();
    expect(screen.getByText('「自动检测」')).not.toBeNull();
  });

  it('来源三态显隐：自动/宿主托管显示管理项，系统安装隐藏（与迁移前一致）', async () => {
    const hostResolved = { auto: 'host' as const, host: 'host' as const, system: 'none' as const };
    const systemResolved = {
      auto: 'system' as const,
      host: 'host' as const,
      system: 'system' as const,
    };
    const cases = [
      {
        name: '宿主托管',
        source: makeStatus({
          version_source: 'host',
        }),
        versionSource: {
          mode: 'host' as const,
          effective: 'host' as const,
          resolvedByMode: hostResolved,
          hostVersion: '1.2.3',
        },
        visible: true,
      },
      {
        name: '自动解析到宿主',
        source: makeStatus(),
        versionSource: {
          mode: 'auto' as const,
          effective: 'host' as const,
          resolvedByMode: hostResolved,
          hostVersion: '1.2.3',
        },
        visible: true,
      },
      {
        name: '自动解析到系统安装',
        source: makeStatus({
          version_source: 'auto',
        }),
        versionSource: {
          mode: 'auto' as const,
          effective: 'system' as const,
          resolvedByMode: systemResolved,
          hostVersion: null,
        },
        visible: false,
      },
      {
        name: '系统安装',
        source: makeStatus({
          version_source: 'system',
        }),
        versionSource: {
          mode: 'system' as const,
          effective: 'system' as const,
          resolvedByMode: systemResolved,
          hostVersion: null,
        },
        visible: false,
      },
    ];

    for (const testCase of cases) {
      useAppStore.setState({
        sourceStatus: { ...testCase.source, versionSource: testCase.versionSource },
        versionStatus: makeVersionStatus(),
      });
      renderSettings();
      await waitFor(() => {
        const rows = [
          document.querySelector('[data-settings-row="harnessVersionUpdate"]'),
          document.querySelector('[data-settings-row="harnessVersionStable"]'),
          document.querySelector('[data-settings-row="harnessVersionPrerelease"]'),
          document.querySelector('[data-settings-row="harnessVersionManual"]'),
        ];
        if (testCase.visible) {
          for (const row of rows) {
            expect(row, testCase.name).not.toBeNull();
          }
        } else {
          for (const row of rows) {
            expect(row, testCase.name).toBeNull();
          }
        }
      });
      if (!testCase.visible) {
        expect(screen.getByText('dshSystemManagedNote')).not.toBeNull();
      }
      cleanup();
    }
  });

  it('无可用来源时管理项保持可见，并保留「宿主托管无版本」提示', async () => {
    const status = makeStatus({ version_source: 'host' });
    useAppStore.setState({
      sourceStatus: {
        ...status,
        versionSource: {
          mode: 'host',
          effective: 'none',
          resolvedByMode: { auto: 'none', host: 'none', system: 'none' },
          hostVersion: null,
        },
      },
      versionStatus: makeVersionStatus({ currentSelected: null, installed: [] }),
    });
    renderSettings();
    await waitFor(() =>
      expect(document.querySelector('[data-settings-row="harnessVersionStable"]')).not.toBeNull(),
    );
    expect(screen.getByText('dshNoSourceHostNote')).not.toBeNull();
    expect(screen.queryByText('dshSystemManagedNote')).toBeNull();
  });

  it('运行态插槽：系统安装显示版本号与安装路径', async () => {
    const status = makeStatus();
    useAppStore.setState({
      sourceStatus: {
        ...status,
        system: { path: 'C:/Program Files/dsh/dsh.exe', version: '0.9.0' },
        versionSource: {
          mode: 'system',
          effective: 'system',
          resolvedByMode: { auto: 'system', host: 'host', system: 'system' },
          hostVersion: null,
        },
      },
      versionStatus: makeVersionStatus({ currentSelected: null, installed: [] }),
    });
    renderSettingsWithSummary();
    const readout = document.querySelector('.adl-harness-version__readout');
    expect(readout).not.toBeNull();
    expect(readout?.textContent).toContain('0.9.0');
    expect(readout?.textContent).toContain('系统安装（C:/Program Files/dsh/dsh.exe）');
  });

  it('运行态插槽：无可用版本时显示「未安装」', async () => {
    const status = makeStatus();
    useAppStore.setState({
      sourceStatus: {
        ...status,
        versionSource: {
          mode: 'host',
          effective: 'none',
          resolvedByMode: { auto: 'none', host: 'none', system: 'none' },
          hostVersion: null,
        },
      },
      versionStatus: makeVersionStatus({ currentSelected: null, installed: [] }),
    });
    renderSettingsWithSummary();
    await waitFor(() => expect(screen.queryByText('未安装')).not.toBeNull());
    expect(document.querySelector('.adl-harness-version__readout-loading')).toBeNull();
  });

  it('运行态插槽：快照读取失败时显示「状态读取失败」而不是无限骨架', () => {
    useAppStore.setState({
      sourceStatus: null,
      versionStatus: null,
      versionCatalog: null,
      settingsSnapshotFailed: true,
    });
    renderSettings();
    expect(screen.getByText('dshVersionStateFailed')).not.toBeNull();
    expect(document.querySelector('.adl-harness-version__readout-loading')).toBeNull();
  });
});
