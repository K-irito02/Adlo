import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { CopyDict } from '../../i18n';
import type { DshSourceStatus } from '../../../shared/ipc/dsh';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { dshZh } from '../../i18n/zh-CN/dsh';
import { useAppStore } from '../../stores/slicedStore';
import { DshVersionManagement } from './DshVersionManagement';

import { openUrlByMethod } from '@features/preview/openByMethod';

vi.mock('@features/preview/openByMethod', () => ({
  openUrlByMethod: vi.fn(),
}));

const fetchDshVersionStatus = vi.fn();
const fetchSourceStatus = vi.fn();
const fetchVersionCatalog = vi.fn();
const fetchDshSettingsSnapshot = vi.fn();
const fetchDshRunning = vi.fn();
const updateDsh = vi.fn();
const revertDsh = vi.fn();
const uninstallDsh = vi.fn();
const reinstallDsh = vi.fn();
const installDshVersion = vi.fn();
const restartDsh = vi.fn();
const saveSourceConfig = vi.fn();
const fetchVersionTask = vi.fn();
const cancelVersionTask = vi.fn();

vi.mock('@hooks/useAppActions', () => {
  // 单例对象：保持 useAppActions 返回引用稳定（真实实现经 useShallow 也稳定），
  // 否则组件挂载 effect 依赖 [actions] 会在每次重渲染时重复拉取版本状态。
  const actions = {
    fetchDshVersionStatus: (...args: unknown[]) => fetchDshVersionStatus(...args),
    fetchSourceStatus: (...args: unknown[]) => fetchSourceStatus(...args),
    fetchVersionCatalog: (...args: unknown[]) => fetchVersionCatalog(...args),
    fetchDshSettingsSnapshot: (...args: unknown[]) => fetchDshSettingsSnapshot(...args),
    fetchDshRunning: (...args: unknown[]) => fetchDshRunning(...args),
    updateDsh: (...args: unknown[]) => updateDsh(...args),
    revertDsh: (...args: unknown[]) => revertDsh(...args),
    uninstallDsh: (...args: unknown[]) => uninstallDsh(...args),
    reinstallDsh: (...args: unknown[]) => reinstallDsh(...args),
    installDshVersion: (...args: unknown[]) => installDshVersion(...args),
    restartDsh: (...args: unknown[]) => restartDsh(...args),
    saveSourceConfig: (...args: unknown[]) => saveSourceConfig(...args),
    fetchVersionTask: (...args: unknown[]) => fetchVersionTask(...args),
    cancelVersionTask: (...args: unknown[]) => cancelVersionTask(...args),
  };
  return { useAppActions: () => actions };
});

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

/** 仅「切到空来源」提示用真实中文文案，其余键保持 key 形态以便按 key 选中元素。 */
const emptyNoteT = new Proxy({} as Record<string, string>, {
  get: (_, key) =>
    key === 'dshVersionSourceSwitchDialogEmpty'
      ? (dshZh as Record<string, string>)[key]
      : typeof key === 'string'
        ? key
        : '',
}) as unknown as CopyDict;

function TestProvider({ children, t = mockT }: { children: React.ReactNode; t?: CopyDict }) {
  return (
    <TCopyProvider t={t} locale="en-US">
      {children}
    </TCopyProvider>
  );
}

interface VersionStatus {
  currentSelected: string | null;
  latestAvailable: string | null;
  hasUpdate: boolean;
  installed: string[];
  bundledVersion: string | null;
  prereleaseAvailable: string | null;
  hasPrereleaseUpdate: boolean;
  prereleaseUnknown: boolean;
}

function seed(status: Partial<VersionStatus>) {
  const versionStatus: VersionStatus = {
    currentSelected: null,
    latestAvailable: null,
    hasUpdate: false,
    installed: [],
    bundledVersion: null,
    prereleaseAvailable: null,
    hasPrereleaseUpdate: false,
    prereleaseUnknown: false,
    ...status,
  };
  // 默认使用「自动检测 + 宿主可用（选中版本已安装）」的来源快照，与版本状态保持一致；
  // 需要特定来源形态的用例再显式覆写 sourceStatus。
  const hasHost =
    versionStatus.currentSelected !== null &&
    versionStatus.installed.includes(versionStatus.currentSelected);
  const hostVersion = hasHost ? versionStatus.currentSelected : null;
  useAppStore.setState({
    versionStatus,
    versionCatalog: null,
    versionCatalogFailed: false,
    sourceStatus: {
      system: null,
      running: null,
      versionSource: {
        mode: 'auto',
        effective: hostVersion ? 'host' : 'none',
        resolvedByMode: resolvedByMode(hostVersion, false),
        hostVersion,
      },
      config: MOCK_CONFIG,
    },
  });
}

function renderBlock(t?: CopyDict) {
  return render(
    <TestProvider t={t}>
      <DshVersionManagement />
    </TestProvider>,
  );
}

/** 播种官方目录（正式版 + 预发布各一行，发布时间可选）。 */
function seedCatalog(stable: string[] = ['0.2.0', '0.1.0'], prerelease: string[] = []) {
  useAppStore.setState({
    versionCatalog: {
      stable: stable.map((version) => ({ version, publishedAt: '2026-09-29T09:56:27.000Z' })),
      prerelease: prerelease.map((version) => ({
        version,
        publishedAt: '2026-10-17T08:36:31.000Z',
      })),
      latestStable: stable[0] ?? null,
      latestPrerelease: prerelease[0] ?? null,
    },
  });
}

const MOCK_CONFIG: DshSourceStatus['config'] = {
  npm_registry: 'https://registry.npmjs.org',
  dsh_mirror: null,
  source_mode: 'auto',
  version_source: 'auto',
  proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
};

/** 按后端同一优先级推导「忽略 running 的偏好解析」（auto：宿主优先，其次系统）。 */
function resolvedByMode(hostVersion: string | null, hasSystem: boolean) {
  return {
    auto: hostVersion ? 'host' : hasSystem ? 'system' : 'none',
    host: hostVersion ? 'host' : 'none',
    system: hasSystem ? 'system' : 'none',
  } as const;
}

/** 播种宿主来源（选中版本已完整安装）。 */
function seedHostSource(version: string) {
  useAppStore.setState({
    sourceStatus: {
      system: null,
      running: null,
      versionSource: {
        mode: 'auto',
        effective: 'host',
        resolvedByMode: resolvedByMode(version, false),
        hostVersion: version,
      },
      config: MOCK_CONFIG,
    },
  });
}

/** 播种「宿主拉起的运行中」来源（mode 决定跑的是宿主那份还是系统那份）。 */
function seedRunningSource(version: string, mode: 'auto' | 'system' | 'host' = 'auto') {
  const hostVersion = mode === 'system' ? null : version;
  useAppStore.setState({
    sourceStatus: {
      system: null,
      running: {
        url: 'http://127.0.0.1:3080/',
        port: 3080,
        managed: true,
        source: mode === 'system' ? 'system' : 'host',
        version,
      },
      versionSource: {
        mode,
        effective: 'running',
        resolvedByMode: resolvedByMode(hostVersion, false),
        hostVersion,
      },
      config: { ...MOCK_CONFIG, version_source: mode },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  useAppStore.setState({
    versionTask: null,
    versionTaskCancelRequested: false,
    dshVersionSourceDeferred: false,
  });
  fetchDshVersionStatus.mockResolvedValue(true);
  fetchSourceStatus.mockResolvedValue(true);
  fetchVersionCatalog.mockResolvedValue(true);
  fetchDshSettingsSnapshot.mockResolvedValue(true);
  fetchDshRunning.mockResolvedValue(true);
  updateDsh.mockResolvedValue(true);
  revertDsh.mockResolvedValue(true);
  uninstallDsh.mockResolvedValue(true);
  reinstallDsh.mockResolvedValue(true);
  installDshVersion.mockResolvedValue(true);
  restartDsh.mockResolvedValue({
    restarted: true,
    url: 'http://127.0.0.1:3080/?token=t',
    failed: false,
  });
  saveSourceConfig.mockResolvedValue(true);
  fetchVersionTask.mockResolvedValue(undefined);
  cancelVersionTask.mockResolvedValue(true);
  useAppStore.setState({
    versionStatus: null,
    versionCatalog: null,
    versionCatalogFailed: false,
    sourceStatus: null,
    showToast: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DshVersionManagement', () => {
  it('挂载即拉取首屏原子快照（一次请求覆盖 source/version/catalog）', () => {
    seed({ currentSelected: '1.0.0', installed: ['1.0.0'] });
    renderBlock();
    expect(fetchDshSettingsSnapshot).toHaveBeenCalledTimes(1);
    expect(fetchDshVersionStatus).not.toHaveBeenCalled();
    expect(fetchSourceStatus).not.toHaveBeenCalled();
    expect(fetchVersionCatalog).not.toHaveBeenCalled();
  });

  it('轻量轮询：running 出现 → effective=running；消失 → 回退偏好解析（P2）', () => {
    seed({ currentSelected: '1.0.0', installed: ['1.0.0'] });
    const store = useAppStore.getState();
    store.setDshRunning({
      url: 'http://127.0.0.1:3080/',
      port: 3080,
      managed: false,
      source: 'external',
      version: null,
    });
    expect(useAppStore.getState().sourceStatus?.versionSource.effective).toBe('running');
    store.setDshRunning(null);
    // 回退值来自后端 resolvedByMode，而不是前端复制的优先级。
    expect(useAppStore.getState().sourceStatus?.versionSource.effective).toBe('host');
  });

  it('渲染当前版本 + 已是最新徽标 + 最新可用版本', () => {
    seed({ currentSelected: '1.0.0', latestAvailable: '1.0.0', installed: ['1.0.0'] });
    renderBlock();
    expect(screen.getByText('1.0.0')).toBeTruthy();
    expect(screen.getByText('dshNoUpdate')).toBeTruthy();
    expect(screen.getByText(/dshLatest/)).toBeTruthy();
  });

  it('无当前版本时显示专用空态文案（非 system 文案）', () => {
    seed({ currentSelected: null, installed: [] });
    renderBlock();
    expect(screen.getByText('dshCurrentVersionNone')).toBeTruthy();
    expect(screen.queryByText('dshStatusSystemNone')).toBeNull();
  });

  it('hasUpdate 时当前版本行显示更新徽标；下拉框选最新版后可安装', async () => {
    const showToast = vi.fn();
    useAppStore.setState({ showToast });
    seed({
      currentSelected: '1.0.0',
      latestAvailable: '1.1.0',
      hasUpdate: true,
      installed: ['1.0.0'],
    });
    seedCatalog(['1.1.0', '1.0.0']);
    const { container } = renderBlock();
    // 检查更新行只剩检查按钮，不再有升级类按钮（升级走正式版列表行内安装）。
    // 注：行内问号提示也是 button，只统计操作按钮。
    const checkRow = container.querySelector('[data-settings-row="dshCheckUpdate"]')!;
    expect(checkRow.querySelectorAll('.adl-dsh-settings__action-btn')).toHaveLength(1);
    expect(screen.getByText('dshHasUpdate')).toBeTruthy();
    // 下拉框默认选中当前版本；打开菜单选 1.1.0 后出现安装按钮。
    fireEvent.click(screen.getByRole('button', { name: '1.0.0' }));
    const menuPick = await waitFor(() => {
      const items = Array.from(
        document
          .querySelector('.adl-dsh-settings__version-menu')
          ?.querySelectorAll('.adl-dsh-settings__version-menu-item-revert') ?? [],
      );
      const target = items.find((el) => el.textContent?.includes('1.1.0')) as HTMLButtonElement;
      expect(target).toBeTruthy();
      return target;
    });
    fireEvent.click(menuPick);
    fireEvent.click(screen.getByRole('button', { name: 'dshInstallAction' }));
    await waitFor(() => expect(installDshVersion).toHaveBeenCalledWith('1.1.0', true));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('dshInstalledRestarted', 'success', undefined, 5000),
    );
  });

  it('检查更新：无更新时提示已是最新', async () => {
    const showToast = vi.fn();
    useAppStore.setState({ showToast });
    seed({ currentSelected: '1.0.0', latestAvailable: '1.0.0', installed: ['1.0.0'] });
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshCheckUpdate' }));
    await waitFor(() => expect(fetchDshVersionStatus).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('dshNoUpdate', 'success'));
  });

  it('检查更新：发现新版本时提示 dshHasUpdate', async () => {
    const showToast = vi.fn();
    useAppStore.setState({ showToast });
    // fetchDshVersionStatus 回写 hasUpdate=true（组件在 await 后从 store 读取结果）。
    fetchDshVersionStatus.mockImplementation(async () => {
      useAppStore.setState({
        versionStatus: {
          currentSelected: '1.0.0',
          latestAvailable: '1.1.0',
          hasUpdate: true,
          installed: ['1.0.0'],
          bundledVersion: null,
          prereleaseAvailable: null,
          hasPrereleaseUpdate: false,
          prereleaseUnknown: false,
        },
      });
      return true;
    });
    seed({ currentSelected: '1.0.0', latestAvailable: '1.0.0', installed: ['1.0.0'] });
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshCheckUpdate' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('dshCheckUpdateFound', 'success'));
  });

  it('重新安装按钮调用 reinstallDsh', async () => {
    seed({ currentSelected: '1.0.0', installed: ['1.0.0'] });
    seedCatalog(['1.0.0']);
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshReinstall' }));
    await waitFor(() => expect(reinstallDsh).toHaveBeenCalledTimes(1));
  });

  it('卸载当前版本需二次确认：首次点击进入 danger 确认态，再次点击调用 uninstallDsh', async () => {
    seed({ currentSelected: '1.0.0', installed: ['1.0.0'] });
    seedCatalog(['1.0.0']);
    renderBlock();
    const btn = screen.getByRole('button', { name: 'dshUninstall' });
    fireEvent.click(btn);
    // 首次点击只武装确认态（danger），不调用卸载。
    expect(uninstallDsh).not.toHaveBeenCalled();
    expect(btn.className).toContain('adl-dsh-settings__action-btn--danger');
    fireEvent.click(btn);
    await waitFor(() => expect(uninstallDsh).toHaveBeenCalledWith('1.0.0'));
  });

  it('内置版本只多一个「已内置」徽章，按钮与其它已装版本完全一致', async () => {
    seed({ currentSelected: '1.0.0', installed: ['1.0.0', '1.1.0'], bundledVersion: '1.1.0' });
    seedCatalog(['1.1.0', '1.0.0']);
    seedHostSource('1.0.0');
    const { container } = renderBlock();
    fireEvent.click(screen.getByRole('button', { name: '1.0.0' }));
    const menuPick = await waitFor(() => {
      // 必须限定在 Portal 菜单内：sizer（隐藏测量尺）用的是同一批类名。
      const item = Array.from(
        document
          .querySelector('.adl-dsh-settings__version-menu')
          ?.querySelectorAll('.adl-dsh-settings__version-menu-item') ?? [],
      ).find((el) => el.textContent?.includes('1.1.0'));
      expect(item).toBeTruthy();
      // 菜单卡片内：内置版本挂「已内置」徽章。
      expect(item!.textContent).toContain('dshBundledVersions');
      return item!.querySelector(
        '.adl-dsh-settings__version-menu-item-revert',
      ) as HTMLButtonElement;
    });
    fireEvent.click(menuPick);
    await waitFor(() => expect(screen.getByRole('button', { name: '1.1.0' })).toBeTruthy());
    const row = container.querySelectorAll(
      '.adl-dsh-settings__version-list-item',
    )[0] as HTMLElement;
    // 来源徽章互斥：已内置优先，不再同时挂「已装版本」。
    expect(row.textContent).toContain('dshBundledVersions');
    expect(row.textContent).not.toContain('dshInstalledVersions');
    // 与普通已装版本一致：卸载 + 重装 + 切换，只是多了「已内置」徽章。
    expect(within(row).getByRole('button', { name: 'dshUninstall' })).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'dshReinstall' })).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'dshSwitchToVersion' })).toBeTruthy();
    expect(within(row).queryByRole('button', { name: 'dshInstallAction' })).toBeNull();
    // 行内下拉框按钮：非当前版本 → 「已内置」徽章 + 常驻（空）勾号槽。
    expect(row.textContent).toContain('dshBundledVersions');
    expect(row.querySelectorAll('.adl-dsh-settings__version-menu-item-check')).toHaveLength(1);
  });

  it('行内下拉框按钮：当前版本标「当前版本」徽章且勾号槽显示勾号', () => {
    seed({ currentSelected: '1.0.0', installed: ['1.0.0'] });
    seedCatalog(['1.0.0']);
    seedHostSource('1.0.0');
    const { container } = renderBlock();
    const row = container.querySelector('.adl-dsh-settings__version-list-item') as HTMLElement;
    expect(row.textContent).toContain('dshCurrentVersionBadge');
    expect(row.textContent).not.toContain('dshInstalledVersions');
    expect(row.querySelector('.adl-dsh-settings__version-menu-item-check svg')).toBeTruthy();
  });

  it('菜单卡片：徽章互斥（当前版本 > 已内置 > 已装版本），勾号槽位常驻不挤徽章', async () => {
    // 关键 fixture：当前在用的版本**同时**是预置版本，用来验证「当前版本」优先级高于
    // 「已内置」（换掉三元顺序此断言必挂）；第三行是普通已装版本，覆盖最低优先级。
    seed({ currentSelected: '1.1.0', installed: ['1.0.0', '1.1.0'], bundledVersion: '1.1.0' });
    seedCatalog(['1.1.0', '1.0.0']);
    seedHostSource('1.1.0');
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: '1.1.0' }));
    const items = await waitFor(() => {
      const list = Array.from(
        document
          .querySelector('.adl-dsh-settings__version-menu')
          ?.querySelectorAll('.adl-dsh-settings__version-menu-item') ?? [],
      );
      expect(list.length).toBe(2);
      return list as HTMLElement[];
    });
    const currentItem = items.find((el) => el.textContent?.includes('1.1.0'))!;
    const plainItem = items.find((el) => el.textContent?.includes('1.0.0'))!;
    // 当前版本 + 预置：只标「当前版本」（蓝色类），不再显示「已装版本」/「已内置」。
    expect(currentItem.textContent).toContain('dshCurrentVersionBadge');
    expect(currentItem.textContent).not.toContain('dshInstalledVersions');
    expect(currentItem.textContent).not.toContain('dshBundledVersions');
    expect(currentItem.querySelector('.adl-dsh-settings__version-menu-item-current')).toBeTruthy();
    // 普通已装版本：标「已装版本」。
    expect(plainItem.textContent).toContain('dshInstalledVersions');
    expect(plainItem.textContent).not.toContain('dshBundledVersions');
    // 勾号槽位两行都常驻（未选中行留空），保证徽章不因勾号出现而左移。
    expect(currentItem.querySelectorAll('.adl-dsh-settings__version-menu-item-check')).toHaveLength(
      1,
    );
    expect(plainItem.querySelectorAll('.adl-dsh-settings__version-menu-item-check')).toHaveLength(
      1,
    );
    expect(
      currentItem.querySelector('.adl-dsh-settings__version-menu-item-check svg'),
    ).toBeTruthy();
    expect(plainItem.querySelector('.adl-dsh-settings__version-menu-item-check svg')).toBeNull();
  });

  it('再次点击同一个下拉框按钮会收起菜单（此前只开不关）', async () => {
    seed({ currentSelected: '1.0.0', installed: ['1.0.0'] });
    seedCatalog(['1.0.0', '0.9.0']);
    seedHostSource('1.0.0');
    renderBlock();
    const picker = screen.getByRole('button', { name: '1.0.0' });
    fireEvent.click(picker);
    await waitFor(() =>
      expect(document.querySelector('.adl-dsh-settings__version-menu')).toBeTruthy(),
    );
    fireEvent.click(picker);
    await waitFor(() =>
      expect(document.querySelector('.adl-dsh-settings__version-menu')).toBeNull(),
    );
  });

  it('内置版本非当前时卸载直接执行（二次确认只留给当前版本）', async () => {
    seed({ currentSelected: '1.0.0', installed: ['1.0.0', '1.1.0'], bundledVersion: '1.1.0' });
    seedCatalog(['1.1.0', '1.0.0']);
    seedHostSource('1.0.0');
    const { container } = renderBlock();
    fireEvent.click(screen.getByRole('button', { name: '1.0.0' }));
    const menuPick = await waitFor(() => {
      const item = Array.from(
        document
          .querySelector('.adl-dsh-settings__version-menu')
          ?.querySelectorAll('.adl-dsh-settings__version-menu-item') ?? [],
      ).find((el) => el.textContent?.includes('1.1.0'));
      return item!.querySelector(
        '.adl-dsh-settings__version-menu-item-revert',
      ) as HTMLButtonElement;
    });
    fireEvent.click(menuPick);
    await waitFor(() => expect(screen.getByRole('button', { name: '1.1.0' })).toBeTruthy());
    const row = container.querySelectorAll(
      '.adl-dsh-settings__version-list-item',
    )[0] as HTMLElement;
    // 非当前版本一次点击即卸载（二次确认只留给当前选中版本，见上一用例）。
    const btn = within(row).getByRole('button', { name: 'dshUninstall' });
    fireEvent.click(btn);
    await waitFor(() => expect(uninstallDsh).toHaveBeenCalledWith('1.1.0'));
  });

  it('当前版本由内置包提供时，版本号旁显示「内置」徽章', () => {
    // 不变式：bundledVersion ≠ null ⟹ 该版本必在 installed 里（收编后就是普通已装版本）。
    seed({ currentSelected: '1.1.0', installed: ['1.1.0'], bundledVersion: '1.1.0' });
    seedHostSource('1.1.0');
    const { container } = renderBlock();
    const readout = container.querySelector('.adl-dsh-settings__version-readout') as HTMLElement;
    expect(readout.textContent).toContain('1.1.0');
    expect(within(readout).getByText('dshBundledBadge')).toBeTruthy();
    // 宿主命中内置包时补一行来源说明。
    expect(screen.getByText('dshBundledSourceNote')).toBeTruthy();
  });

  it('宿主拉起的运行中若是预置版本则标「内置」；系统安装/外部复用同版本号不标', () => {
    seed({ currentSelected: null, installed: ['1.1.0'], bundledVersion: '1.1.0' });
    seedRunningSource('1.1.0');
    const { container, unmount } = renderBlock();
    const readout = container.querySelector('.adl-dsh-settings__version-readout') as HTMLElement;
    expect(within(readout).getByText('dshBundledBadge')).toBeTruthy();
    unmount();
    cleanup();
    // 同版本号但来源偏好是系统安装（跑的是用户自己的那份）：不得挂「内置」徽章。
    seed({ currentSelected: null, installed: ['1.1.0'], bundledVersion: '1.1.0' });
    seedRunningSource('1.1.0', 'system');
    const second = renderBlock();
    const readout2 = second.container.querySelector(
      '.adl-dsh-settings__version-readout',
    ) as HTMLElement;
    expect(readout2.textContent).toContain('1.1.0');
    expect(within(readout2).queryByText('dshBundledBadge')).toBeNull();
  });

  it('外部复用（managed=false）的运行中进程即便版本号相同也不标「内置」', () => {
    seed({ currentSelected: null, installed: ['1.1.0'], bundledVersion: '1.1.0' });
    // 外部复用：没有 Child 可持有，版本来源未知（managed=false + version 由探测给出）。
    useAppStore.setState({
      sourceStatus: {
        system: null,
        running: {
          url: 'http://127.0.0.1:3080/',
          port: 3080,
          managed: false,
          source: 'external',
          version: '1.1.0',
        },
        versionSource: {
          mode: 'auto',
          effective: 'running',
          resolvedByMode: resolvedByMode(null, false),
          hostVersion: null,
        },
        config: { ...MOCK_CONFIG },
      },
    });
    const { container } = renderBlock();
    const readout = container.querySelector('.adl-dsh-settings__version-readout') as HTMLElement;
    expect(within(readout).queryByText('dshBundledBadge')).toBeNull();
  });

  it('行内按钮按所选版本状态显示：当前行有卸载+重装+下拉框，无安装/切换', () => {
    seed({
      currentSelected: '1.0.0',
      installed: ['1.0.0', '0.9.0'],
    });
    seedCatalog(['1.1.0', '1.0.0', '0.9.0']);
    const { container } = renderBlock();
    // 默认选中当前版本：只有 1.0.0 一行。
    const rows = Array.from(container.querySelectorAll('.adl-dsh-settings__version-list-item'));
    expect(rows).toHaveLength(1);
    const current = rows[0]! as HTMLElement;
    expect(within(current).getByRole('button', { name: 'dshUninstall' })).toBeTruthy();
    expect(within(current).getByRole('button', { name: 'dshReinstall' })).toBeTruthy();
    expect(within(current).queryByRole('button', { name: 'dshInstallAction' })).toBeNull();
    expect(within(current).queryByRole('button', { name: 'dshSwitchToVersion' })).toBeNull();
  });

  it('下拉框选择未装版本后，行内变为安装+下拉框', async () => {
    seed({
      currentSelected: '1.0.0',
      installed: ['1.0.0', '0.9.0'],
    });
    seedCatalog(['1.1.0', '1.0.0', '0.9.0']);
    const { container } = renderBlock();
    // 下拉框当前显示 1.0.0；打开菜单选 1.1.0。
    fireEvent.click(screen.getByRole('button', { name: '1.0.0' }));
    const menuPick = await waitFor(() => {
      const items = Array.from(
        document
          .querySelector('.adl-dsh-settings__version-menu')
          ?.querySelectorAll('.adl-dsh-settings__version-menu-item-revert') ?? [],
      );
      const target = items.find((el) => el.textContent?.includes('1.1.0')) as HTMLButtonElement;
      expect(target).toBeTruthy();
      return target;
    });
    fireEvent.click(menuPick);
    // 行内切换为 1.1.0：安装 + 下拉框，无卸载/重装/切换。
    await waitFor(() => expect(screen.getByRole('button', { name: '1.1.0' })).toBeTruthy());
    const row = Array.from(
      container.querySelectorAll('.adl-dsh-settings__version-list-item'),
    )[0]! as HTMLElement;
    expect(within(row).getByRole('button', { name: 'dshInstallAction' })).toBeTruthy();
    expect(within(row).queryByRole('button', { name: 'dshSwitchToVersion' })).toBeNull();
    expect(within(row).queryByRole('button', { name: 'dshUninstall' })).toBeNull();
    expect(within(row).queryByRole('button', { name: 'dshReinstall' })).toBeNull();
  });

  it('下拉框选择已装非当前版本后，行内出现切换按钮', async () => {
    seed({
      currentSelected: '1.0.0',
      installed: ['1.0.0', '0.9.0'],
    });
    seedCatalog(['1.1.0', '1.0.0', '0.9.0']);
    const { container } = renderBlock();
    fireEvent.click(screen.getByRole('button', { name: '1.0.0' }));
    const menuPick = await waitFor(() => {
      const items = Array.from(
        document
          .querySelector('.adl-dsh-settings__version-menu')
          ?.querySelectorAll('.adl-dsh-settings__version-menu-item-revert') ?? [],
      );
      const target = items.find((el) => el.textContent?.includes('0.9.0')) as HTMLButtonElement;
      expect(target).toBeTruthy();
      return target;
    });
    fireEvent.click(menuPick);
    await waitFor(() => expect(screen.getByRole('button', { name: '0.9.0' })).toBeTruthy());
    const row = Array.from(
      container.querySelectorAll('.adl-dsh-settings__version-list-item'),
    )[0]! as HTMLElement;
    expect(within(row).getByRole('button', { name: 'dshUninstall' })).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'dshReinstall' })).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'dshSwitchToVersion' })).toBeTruthy();
    expect(within(row).queryByRole('button', { name: 'dshInstallAction' })).toBeNull();
    fireEvent.click(within(row).getByRole('button', { name: 'dshSwitchToVersion' }));
    await waitFor(() => expect(revertDsh).toHaveBeenCalledWith('0.9.0'));
  });

  it('空列表时保持常规行布局，空态文案居右显示；有版本时行堆叠', () => {
    seed({ currentSelected: null, installed: [] });
    seedCatalog([], []);
    const { container, unmount } = renderBlock();
    expect(container.querySelectorAll('.adl-dsh-settings__version-list-item')).toHaveLength(0);
    // 空态行不堆叠（常规 label 左 + 控件右布局），空态文案在右侧。
    const stableRow = container.querySelector('[data-settings-row="dshOfficialStable"]');
    expect(stableRow?.classList.contains('adl-dsh-settings__row--stack')).toBe(false);
    expect(stableRow?.textContent).toContain('dshOfficialStableEmpty');
    unmount();
    cleanup();
    // 有版本时行堆叠（标签在上、控件独占下一行）。
    seed({ currentSelected: '1.0.0', installed: ['1.0.0'] });
    seedCatalog(['1.0.0']);
    const stacked = renderBlock();
    const stackedRow = stacked.container.querySelector('[data-settings-row="dshOfficialStable"]');
    expect(stackedRow?.classList.contains('adl-dsh-settings__row--stack')).toBe(true);
  });

  it('行内下拉框打开版本菜单，菜单列出本分区全部版本且无卸载图标按钮', async () => {
    seed({
      currentSelected: '1.0.0',
      latestAvailable: '1.1.0',
      installed: ['1.0.0', '1.1.0'],
    });
    seedCatalog(['1.1.0', '1.0.0']);
    renderBlock();
    // 行内版本下拉框（aria-label 即版本号）：菜单未打开时唯一。
    fireEvent.click(screen.getByRole('button', { name: '1.0.0' }));
    // 菜单经 Portal 渲染到 body：列出分区全部版本。
    await waitFor(() => {
      const items = Array.from(
        document
          .querySelector('.adl-dsh-settings__version-menu')
          ?.querySelectorAll('.adl-dsh-settings__version-menu-item-revert') ?? [],
      );
      expect(items).toHaveLength(2);
    });
    // 卸载图标按钮已删除（行内已有卸载文字按钮）。
    expect(document.querySelector('.adl-dsh-settings__version-menu-item-uninstall')).toBeNull();
    // 选中项打勾：当前下拉框选中 1.0.0。
    const checks = document.querySelectorAll('.adl-dsh-settings__version-menu-item-check');
    expect(checks.length).toBeGreaterThanOrEqual(1);
  });

  it('Esc 关闭版本菜单', async () => {
    seed({
      currentSelected: '1.0.0',
      latestAvailable: '1.1.0',
      installed: ['1.0.0', '1.1.0'],
    });
    seedCatalog(['1.1.0', '1.0.0']);
    renderBlock();
    // 下拉框默认选中当前版本 1.0.0。
    fireEvent.click(screen.getByRole('button', { name: '1.0.0' }));
    await waitFor(() =>
      expect(document.querySelector('.adl-dsh-settings__version-menu')).not.toBeNull(),
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(document.querySelector('.adl-dsh-settings__version-menu')).toBeNull(),
    );
  });

  it('菜单点击选择版本后关闭菜单并切换行内展示', async () => {
    seed({ currentSelected: '1.0.0', latestAvailable: '1.1.0', installed: ['1.0.0', '1.1.0'] });
    seedCatalog(['1.1.0', '1.0.0']);
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: '1.0.0' }));
    const menuPick = await waitFor(() => {
      const items = Array.from(
        document
          .querySelector('.adl-dsh-settings__version-menu')
          ?.querySelectorAll('.adl-dsh-settings__version-menu-item-revert') ?? [],
      );
      const target = items.find((el) => el.textContent?.includes('1.1.0')) as HTMLButtonElement;
      expect(target).toBeTruthy();
      return target;
    });
    fireEvent.click(menuPick);
    // 菜单关闭，行内下拉框切换为 1.1.0（菜单内按钮卸载）。
    await waitFor(() =>
      expect(document.querySelector('.adl-dsh-settings__version-menu')).toBeNull(),
    );
    expect(screen.getByRole('button', { name: '1.1.0' })).toBeTruthy();
    expect(revertDsh).not.toHaveBeenCalled();
  });

  it('卸载在途时禁用其余版本操作按钮（防并发）', async () => {
    let resolveUninstall: (v: boolean) => void = () => {};
    uninstallDsh.mockImplementation(
      () =>
        new Promise<boolean>((r) => {
          resolveUninstall = r;
        }),
    );
    seed({ currentSelected: '1.0.0', installed: ['1.0.0'] });
    seedCatalog(['1.0.0']);
    renderBlock();
    const uninstallBtn = screen.getByRole('button', { name: 'dshUninstall' });
    fireEvent.click(uninstallBtn);
    fireEvent.click(uninstallBtn);
    // 卸载在途：行内重装按钮被禁用。
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'dshReinstall' })).toBeDisabled(),
    );
    resolveUninstall(true);
  });

  it('检查更新：latest 为 null（查询失败）时提示检查失败，不误报已是最新', async () => {
    const showToast = vi.fn();
    useAppStore.setState({ showToast });
    // fetch 回写 latestAvailable: null（断网/镜像不可达），hasUpdate 恒 false。
    fetchDshVersionStatus.mockImplementation(async () => {
      useAppStore.setState({
        versionStatus: {
          currentSelected: '1.0.0',
          latestAvailable: null,
          hasUpdate: false,
          installed: ['1.0.0'],
          bundledVersion: null,
          prereleaseAvailable: null,
          hasPrereleaseUpdate: false,
          prereleaseUnknown: false,
        },
      });
      return true;
    });
    seed({ currentSelected: '1.0.0', latestAvailable: '1.0.0', installed: ['1.0.0'] });
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshCheckUpdate' }));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('dshCheckUpdateNoStable', 'warning'),
    );
    expect(showToast).not.toHaveBeenCalledWith('dshNoUpdate', expect.anything());
  });

  it('无选中但有运行中实例时显示有效来源，而非未安装', () => {
    seed({ currentSelected: null, installed: [] });
    useAppStore.setState({
      sourceStatus: {
        system: null,
        running: {
          url: 'http://127.0.0.1:3080/',
          port: 3080,
          managed: false,
          source: 'external',
          version: null,
        },
        versionSource: {
          mode: 'auto',
          effective: 'running',
          resolvedByMode: resolvedByMode(null, false),
          hostVersion: null,
        },
        config: {
          npm_registry: 'https://registry.npmjs.org',
          dsh_mirror: null,
          source_mode: 'auto',
          version_source: 'auto',
          proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
        },
      },
    });
    renderBlock();
    expect(screen.queryByText('dshCurrentVersionNone')).toBeNull();
    // P4：外部进程版本未知时主行=版本未知，副行说明外部启动（不再把“运行中”当版本号）。
    expect(screen.getByText('dshVersionUnknown')).toBeTruthy();
    expect(screen.getByText('dshRunningExternalNote')).toBeTruthy();
  });

  it('宿主拉起的运行中显示 spawn 来源版本 + 小字运行地址（事项 1）', () => {
    seed({ currentSelected: '0.2.1-rc.2', installed: ['0.2.1-rc.2'] });
    useAppStore.setState({
      sourceStatus: {
        system: null,
        running: {
          url: 'http://127.0.0.1:3080/',
          port: 3080,
          managed: true,
          source: 'host',
          version: '0.2.1-rc.2',
        },
        versionSource: {
          mode: 'auto',
          effective: 'running',
          resolvedByMode: resolvedByMode('0.2.1-rc.2', false),
          hostVersion: '0.2.1-rc.2',
        },
        config: {
          npm_registry: 'https://registry.npmjs.org',
          dsh_mirror: null,
          source_mode: 'auto',
          version_source: 'auto',
          proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
        },
      },
    });
    renderBlock();
    // 主行版本号（非灰空态）+ 小字运行地址（mockT 下 key 名即文案）。
    expect(screen.getByText('0.2.1-rc.2')).toBeTruthy();
    expect(screen.getByText('dshEffectiveRunning')).toBeTruthy();
    expect(screen.queryByText('dshVersionUnknown')).toBeNull();
  });

  it('外部运行中不借用宿主版本：主行=版本未知 + 副行外部启动（P4）', () => {
    seed({ currentSelected: '0.2.1-rc.2', installed: ['0.2.1-rc.2'] });
    useAppStore.setState({
      sourceStatus: {
        system: null,
        running: {
          url: 'http://127.0.0.1:3080/',
          port: 3080,
          managed: false,
          source: 'external',
          version: null,
        },
        versionSource: {
          mode: 'auto',
          effective: 'running',
          resolvedByMode: resolvedByMode('0.2.1-rc.2', false),
          hostVersion: '0.2.1-rc.2',
        },
        config: {
          npm_registry: 'https://registry.npmjs.org',
          dsh_mirror: null,
          source_mode: 'auto',
          version_source: 'auto',
          proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
        },
      },
    });
    renderBlock();
    expect(screen.getByText('dshVersionUnknown')).toBeTruthy();
    expect(screen.getByText('dshRunningExternalNote')).toBeTruthy();
    expect(screen.queryByText('dshEffectiveRunning')).toBeNull();
    // 宿主虽装有 0.2.1-rc.2，外部运行也不得借用（managed=false 即未知）。
    expect(screen.queryByText('0.2.1-rc.2')).toBeNull();
  });

  it('系统安装有版本号时主行显示版本 + 小字安装路径（事项 1）', () => {
    seed({ currentSelected: null, installed: [] });
    useAppStore.setState({
      sourceStatus: {
        system: { path: 'C:\\tools\\dsh', version: '0.2.0-rc.2' },
        running: null,
        versionSource: {
          mode: 'system',
          effective: 'system',
          resolvedByMode: resolvedByMode(null, true),
          hostVersion: null,
        },
        config: {
          npm_registry: 'https://registry.npmjs.org',
          dsh_mirror: null,
          source_mode: 'auto',
          version_source: 'system',
          proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
        },
      },
    });
    renderBlock();
    expect(screen.getByText('0.2.0-rc.2')).toBeTruthy();
    expect(screen.getByText('dshEffectiveSystem')).toBeTruthy();
    expect(screen.queryByText('dshVersionUnknown')).toBeNull();
  });

  it('预发布有更新时在当前版本行给出尝鲜提示', () => {
    seed({
      currentSelected: '0.2.0',
      latestAvailable: '0.2.0',
      installed: ['0.2.0'],
      prereleaseAvailable: '0.2.1-rc.2',
      hasPrereleaseUpdate: true,
    });
    renderBlock();
    expect(screen.getByText('dshPrereleaseUpdateAvailable')).toBeTruthy();
  });

  it('下拉框选择未装版本后行内可安装（安装按钮不带版本号），成功提示含版本号', async () => {
    const showToast = vi.fn();
    useAppStore.setState({ showToast });
    seed({ currentSelected: '0.1.0', latestAvailable: '0.2.0', installed: ['0.1.0'] });
    useAppStore.setState({
      versionCatalog: {
        stable: [
          { version: '0.2.0', publishedAt: '2026-09-29T09:56:27.000Z' },
          { version: '0.1.0', publishedAt: '2026-08-20T10:00:00.000Z' },
        ],
        prerelease: [],
        latestStable: '0.2.0',
        latestPrerelease: null,
      },
    });
    renderBlock();
    // 下拉框默认选中当前版本 0.1.0；打开菜单选 0.2.0 后行内出现安装按钮。
    fireEvent.click(screen.getByRole('button', { name: '0.1.0' }));
    const menuPick = await waitFor(() => {
      const items = Array.from(
        document
          .querySelector('.adl-dsh-settings__version-menu')
          ?.querySelectorAll('.adl-dsh-settings__version-menu-item-revert') ?? [],
      );
      const target = items.find((el) => el.textContent?.includes('0.2.0')) as HTMLButtonElement;
      expect(target).toBeTruthy();
      return target;
    });
    fireEvent.click(menuPick);
    fireEvent.click(screen.getByRole('button', { name: 'dshInstallAction' }));
    await waitFor(() => expect(installDshVersion).toHaveBeenCalledWith('0.2.0', true));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('dshInstalledRestarted', 'success', undefined, 5000),
    );
  });

  it('已装非当前行重装只修目录不改选中（installDshVersion select=false），提示已重新安装', async () => {
    seed({ currentSelected: '0.1.0', installed: ['0.1.0', '0.2.0'] });
    seedCatalog(['0.2.0', '0.1.0']);
    const showToast = vi.fn();
    useAppStore.setState({ showToast });
    const { container } = renderBlock();
    // 下拉框默认选中当前版本 0.1.0；打开菜单选 0.2.0。
    fireEvent.click(screen.getByRole('button', { name: '0.1.0' }));
    const menuPick = await waitFor(() => {
      const items = Array.from(
        document
          .querySelector('.adl-dsh-settings__version-menu')
          ?.querySelectorAll('.adl-dsh-settings__version-menu-item-revert') ?? [],
      );
      const target = items.find((el) => el.textContent?.includes('0.2.0')) as HTMLButtonElement;
      expect(target).toBeTruthy();
      return target;
    });
    fireEvent.click(menuPick);
    // 0.2.0 行：卸载 + 重装 + 切换 + 下拉框；点重装只修该版本目录，不切换选中。
    const row = Array.from(
      container.querySelectorAll('.adl-dsh-settings__version-list-item'),
    )[0]! as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'dshReinstall' }));
    await waitFor(() => expect(installDshVersion).toHaveBeenCalledWith('0.2.0', false));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('dshReinstalledOnly', 'success', undefined, 5000),
    );
    expect(restartDsh).not.toHaveBeenCalled();
  });

  it('官方版本信息行内嵌与标题同色的链接，点击跟随打开方式跳转', () => {
    seed({ currentSelected: null, installed: [] });
    renderBlock();
    const links = Array.from(
      document.querySelectorAll('.adl-dsh-settings__inline-link'),
    ) as HTMLButtonElement[];
    expect(links).toHaveLength(2);
    fireEvent.click(links[0]);
    expect(openUrlByMethod).toHaveBeenCalledWith('https://www.npmjs.com/package/@deepseek-ai/dsh');
    fireEvent.click(links[1]);
    expect(openUrlByMethod).toHaveBeenCalledWith(
      'https://github.com/deepseek-ai/deepseek-harness/releases',
    );
  });

  it('目录拉取失败时展示“未知”而非“暂无”（未知与无版本可区分）', () => {
    seed({ currentSelected: null, installed: [] });
    useAppStore.setState({ versionCatalog: null, versionCatalogFailed: true });
    const { container } = renderBlock();
    // 未知态文本出现且无“暂无”误导。
    expect(container.textContent).toContain('dshVersionListUnknown');
    expect(container.textContent).not.toContain('dshOfficialStableEmpty');
  });

  it('预发布分区渲染版本与单行说明，已装预发布可切换', async () => {
    seed({
      currentSelected: '0.2.0',
      latestAvailable: '0.2.0',
      installed: ['0.2.0', '0.2.1-rc.2'],
      prereleaseAvailable: '0.2.1-rc.2',
      hasPrereleaseUpdate: false,
    });
    useAppStore.setState({
      versionCatalog: {
        stable: [{ version: '0.2.0', publishedAt: null }],
        prerelease: [{ version: '0.2.1-rc.2', publishedAt: '2026-10-17T08:36:31.000Z' }],
        latestStable: '0.2.0',
        latestPrerelease: '0.2.1-rc.2',
      },
    });
    renderBlock();
    expect(screen.getByText('dshPrereleaseTitle')).toBeTruthy();
    // 分区说明：原独立说明行已合并进分区标题行内。
    expect(screen.getByText('dshPrereleaseDesc')).toBeTruthy();
    expect(screen.queryByText('dshPrereleaseNote')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'dshSwitchToVersion' }));
    await waitFor(() => expect(revertDsh).toHaveBeenCalledWith('0.2.1-rc.2'));
  });

  it('实际来源为系统安装时隐藏管理项并显示说明', () => {
    seed({ currentSelected: null, installed: [] });
    useAppStore.setState({
      sourceStatus: {
        system: { path: 'D:\\nodejs\\dsh', version: null },
        running: null,
        versionSource: {
          mode: 'auto',
          effective: 'system',
          resolvedByMode: resolvedByMode(null, true),
          hostVersion: null,
        },
        config: {
          npm_registry: 'https://registry.npmjs.org',
          dsh_mirror: null,
          source_mode: 'auto',
          version_source: 'auto',
          proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
        },
      },
    });
    renderBlock();
    expect(screen.queryByText('dshCheckUpdate')).toBeNull();
    expect(screen.queryByText('dshOfficialStable')).toBeNull();
    expect(screen.queryByText('dshPrereleaseTitle')).toBeNull();
    expect(screen.getByText('dshSystemManagedNote')).toBeTruthy();
  });

  it('自动检测无来源时把版本来源切换为宿主安装', async () => {
    seed({ currentSelected: null, installed: [] });
    useAppStore.setState({
      sourceStatus: {
        system: null,
        running: null,
        versionSource: {
          mode: 'auto',
          effective: 'none',
          resolvedByMode: resolvedByMode(null, false),
          hostVersion: null,
        },
        config: {
          npm_registry: 'https://registry.npmjs.org',
          dsh_mirror: null,
          source_mode: 'auto',
          version_source: 'auto',
          proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
        },
      },
    });
    renderBlock();
    await waitFor(() =>
      expect(saveSourceConfig).toHaveBeenCalledWith({ version_source: 'host' }, true),
    );
  });

  it('检查更新：只有预发布更新时提示预发布版本', async () => {
    const showToast = vi.fn();
    useAppStore.setState({ showToast });
    fetchDshVersionStatus.mockImplementation(async () => {
      useAppStore.setState({
        versionStatus: {
          currentSelected: '1.0.0',
          latestAvailable: null,
          hasUpdate: false,
          installed: ['1.0.0'],
          bundledVersion: null,
          prereleaseAvailable: '1.1.0-rc.1',
          hasPrereleaseUpdate: true,
          prereleaseUnknown: false,
        },
      });
      return true;
    });
    seed({ currentSelected: '1.0.0', installed: ['1.0.0'] });
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshCheckUpdate' }));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('dshCheckUpdatePrerelease', 'success'),
    );
  });

  it('版本管理块渲染版本来源选择器', () => {
    seed({ currentSelected: '1.0.0', installed: ['1.0.0'] });
    renderBlock();
    expect(screen.getByText('dshVersionSource')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'dshVersionSource' })).toBeTruthy();
  });

  it('选择系统安装且助手运行中：弹出三选项对话框', async () => {
    seed({ currentSelected: '1.0.0', installed: ['1.0.0'] });
    useAppStore.setState({
      sourceStatus: {
        system: { path: 'D:\\nodejs\\dsh', version: null },
        running: {
          url: 'http://127.0.0.1:3080/',
          port: 3080,
          managed: true,
          source: 'host',
          version: '1.0.0',
        },
        versionSource: {
          mode: 'host',
          effective: 'running',
          resolvedByMode: resolvedByMode('1.0.0', true),
          hostVersion: '1.0.0',
        },
        config: {
          npm_registry: 'https://registry.npmjs.org',
          dsh_mirror: null,
          source_mode: 'auto',
          version_source: 'host',
          proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
        },
      },
    });
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshVersionSource' }));
    fireEvent.click(screen.getByText('dshVersionSourceSystem'));
    expect(await screen.findByText('dshVersionSourceSystemDialogTitle')).toBeTruthy();
    expect(screen.getByText('dshVersionSourceApplyNextLaunch')).toBeTruthy();
    expect(screen.getByText('dshVersionSourceApplyNow')).toBeTruthy();
  });

  it('对话框选择立即生效：保存系统安装并重启助手', async () => {
    seed({ currentSelected: '1.0.0', installed: ['1.0.0'] });
    useAppStore.setState({
      sourceStatus: {
        system: { path: 'D:\\nodejs\\dsh', version: null },
        running: {
          url: 'http://127.0.0.1:3080/',
          port: 3080,
          managed: true,
          source: 'host',
          version: '1.0.0',
        },
        versionSource: {
          mode: 'host',
          effective: 'running',
          resolvedByMode: resolvedByMode('1.0.0', true),
          hostVersion: '1.0.0',
        },
        config: {
          npm_registry: 'https://registry.npmjs.org',
          dsh_mirror: null,
          source_mode: 'auto',
          version_source: 'host',
          proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
        },
      },
    });
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshVersionSource' }));
    fireEvent.click(screen.getByText('dshVersionSourceSystem'));
    fireEvent.click(await screen.findByText('dshVersionSourceApplyNow'));
    await waitFor(() =>
      expect(saveSourceConfig).toHaveBeenCalledWith({ version_source: 'system' }, true),
    );
    await waitFor(() => expect(restartDsh).toHaveBeenCalled());
  });

  it('切系统安装前现查快照：stale 无运行也会弹对话框（事项 2 回归）', async () => {
    seed({ currentSelected: '1.0.0', installed: ['1.0.0'] });
    const stale: DshSourceStatus = {
      system: { path: 'D:\\nodejs\\dsh', version: null },
      running: null,
      versionSource: {
        mode: 'host',
        effective: 'host',
        resolvedByMode: resolvedByMode('1.0.0', true),
        hostVersion: '1.0.0',
      },
      config: {
        npm_registry: 'https://registry.npmjs.org',
        dsh_mirror: null,
        source_mode: 'auto',
        version_source: 'host',
        proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
      },
    };
    const fresh: DshSourceStatus = {
      ...stale,
      running: {
        url: 'http://127.0.0.1:3080/',
        port: 3080,
        managed: true,
        source: 'host',
        version: '1.0.0',
      },
    };
    useAppStore.setState({ sourceStatus: stale });
    // 模拟现查：fetch 后 store 出现 running（预拉起刚完成）。
    fetchSourceStatus.mockImplementation(async () => {
      useAppStore.setState({ sourceStatus: fresh });
      return true;
    });
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshVersionSource' }));
    fireEvent.click(screen.getByText('dshVersionSourceSystem'));
    // 现查发现运行中 → 必须弹三选项对话框，而非直接保存。
    expect(await screen.findByText('dshVersionSourceSystemDialogTitle')).toBeTruthy();
  });

  it('立即启用在途时按钮内显示加载圈（用户需求）', async () => {
    seed({ currentSelected: '1.0.0', installed: ['1.0.0'] });
    useAppStore.setState({
      sourceStatus: {
        system: { path: 'D:\\nodejs\\dsh', version: null },
        running: {
          url: 'http://127.0.0.1:3080/',
          port: 3080,
          managed: true,
          source: 'host',
          version: '1.0.0',
        },
        versionSource: {
          mode: 'host',
          effective: 'running',
          resolvedByMode: resolvedByMode('1.0.0', true),
          hostVersion: '1.0.0',
        },
        config: {
          npm_registry: 'https://registry.npmjs.org',
          dsh_mirror: null,
          source_mode: 'auto',
          version_source: 'host',
          proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
        },
      },
    });
    // 重启悬而不决，卡住 busy 态以便断言圈。
    restartDsh.mockImplementation(() => new Promise(() => {}));
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshVersionSource' }));
    fireEvent.click(screen.getByText('dshVersionSourceSystem'));
    fireEvent.click(await screen.findByText('dshVersionSourceApplyNow'));
    const applyNow = await screen.findByRole('button', { name: 'dshVersionSourceApplyNow' });
    await waitFor(() => expect(applyNow.querySelector('svg')).not.toBeNull());
  });

  it('对话框选择下次启动生效：只记 pending 不落盘，选择器保持当前来源（事项 2026-10-20/5）', async () => {
    const toast = useAppStore.getState().showToast;
    seed({ currentSelected: '1.0.0', installed: ['1.0.0'] });
    useAppStore.setState({
      sourceStatus: {
        system: { path: 'D:\\nodejs\\dsh', version: null },
        running: {
          url: 'http://127.0.0.1:3080/',
          port: 3080,
          managed: true,
          source: 'host',
          version: '1.0.0',
        },
        versionSource: {
          mode: 'host',
          effective: 'running',
          resolvedByMode: resolvedByMode('1.0.0', true),
          hostVersion: '1.0.0',
        },
        config: {
          npm_registry: 'https://registry.npmjs.org',
          dsh_mirror: null,
          source_mode: 'auto',
          version_source: 'host',
          proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
        },
      },
    });
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshVersionSource' }));
    fireEvent.click(screen.getByText('dshVersionSourceSystem'));
    fireEvent.click(await screen.findByText('dshVersionSourceApplyNextLaunch'));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('dshVersionSourceNextLaunchSaved', 'success'),
    );
    // 不写配置：选择器仍显示当前生效来源，管理项按待切换隐藏 + 提示行。
    expect(saveSourceConfig).not.toHaveBeenCalled();
    expect(useAppStore.getState().dshVersionSourcePending).toBe('system');
    expect(screen.getByText('dshVersionSourceDeferredNote')).toBeTruthy();
    expect(screen.queryByText('dshCheckUpdate')).toBeNull();
    expect(screen.queryByText('dshOfficialStable')).toBeNull();
  });

  it('对话框选择取消：回退为宿主安装且不隐藏管理项', async () => {
    seed({ currentSelected: '1.0.0', installed: ['1.0.0'] });
    useAppStore.setState({
      sourceStatus: {
        system: { path: 'D:\\nodejs\\dsh', version: null },
        running: {
          url: 'http://127.0.0.1:3080/',
          port: 3080,
          managed: true,
          source: 'host',
          version: '1.0.0',
        },
        versionSource: {
          mode: 'auto',
          effective: 'running',
          resolvedByMode: resolvedByMode('1.0.0', true),
          hostVersion: '1.0.0',
        },
        config: {
          npm_registry: 'https://registry.npmjs.org',
          dsh_mirror: null,
          source_mode: 'auto',
          version_source: 'auto',
          proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
        },
      },
    });
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshVersionSource' }));
    fireEvent.click(screen.getByText('dshVersionSourceSystem'));
    fireEvent.click(await screen.findByRole('button', { name: 'cancel' }));
    await waitFor(() =>
      expect(saveSourceConfig).toHaveBeenCalledWith({ version_source: 'host' }, true),
    );
    expect(screen.getByText('dshOfficialStable')).toBeTruthy();
  });

  it('已是系统安装时管理行按配置隐藏（运行中也不显示，事项 1 回归）', () => {
    seed({ currentSelected: '1.0.0', installed: ['1.0.0'] });
    useAppStore.setState({
      sourceStatus: {
        system: { path: 'D:\\nodejs\\dsh', version: '0.2.0-rc.2' },
        running: {
          url: 'http://127.0.0.1:3080/',
          port: 3080,
          managed: true,
          source: 'system',
          version: '0.2.0-rc.2',
        },
        versionSource: {
          mode: 'system',
          effective: 'running',
          resolvedByMode: resolvedByMode('1.0.0', true),
          hostVersion: '1.0.0',
        },
        config: {
          npm_registry: 'https://registry.npmjs.org',
          dsh_mirror: null,
          source_mode: 'auto',
          version_source: 'system',
          proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
        },
      },
    });
    const { container } = renderBlock();
    // 三行按 mode 隐藏（effective 虽为 running 也不显示）。
    expect(container.querySelector('[data-settings-row="dshCheckUpdate"]')).toBeNull();
    expect(container.querySelector('[data-settings-row="dshOfficialStable"]')).toBeNull();
    expect(container.querySelector('[data-settings-row="dshPrereleaseTitle"]')).toBeNull();
    expect(screen.getByText('dshSystemManagedNote')).toBeTruthy();
  });

  it('从系统安装切到宿主安装且运行中：弹切换确认对话框（事项 2 回归）', async () => {
    seed({ currentSelected: '1.0.0', installed: ['1.0.0'] });
    useAppStore.setState({
      sourceStatus: {
        system: { path: 'D:\\nodejs\\dsh', version: '0.2.0-rc.2' },
        running: {
          url: 'http://127.0.0.1:3080/',
          port: 3080,
          managed: true,
          source: 'system',
          version: '0.2.0-rc.2',
        },
        versionSource: {
          mode: 'system',
          effective: 'running',
          resolvedByMode: resolvedByMode('1.0.0', true),
          hostVersion: '1.0.0',
        },
        config: {
          npm_registry: 'https://registry.npmjs.org',
          dsh_mirror: null,
          source_mode: 'auto',
          version_source: 'system',
          proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
        },
      },
    });
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshVersionSource' }));
    fireEvent.click(screen.getByText('dshVersionSourceHost'));
    expect(await screen.findByText('dshVersionSourceSwitchDialogTitle')).toBeTruthy();
    fireEvent.click(await screen.findByText('dshVersionSourceApplyNow'));
    await waitFor(() =>
      expect(saveSourceConfig).toHaveBeenCalledWith({ version_source: 'host' }, true),
    );
    await waitFor(() => expect(restartDsh).toHaveBeenCalled());
  });

  it('从系统安装切到宿主且无运行时：仍弹确认框（用户裁决 2026-10-22）', async () => {
    seed({ currentSelected: '1.0.0', installed: ['1.0.0'] });
    useAppStore.setState({
      sourceStatus: {
        system: { path: 'D:\\nodejs\\dsh', version: null },
        running: null,
        versionSource: {
          mode: 'system',
          effective: 'system',
          resolvedByMode: resolvedByMode('1.0.0', true),
          hostVersion: '1.0.0',
        },
        config: {
          npm_registry: 'https://registry.npmjs.org',
          dsh_mirror: null,
          source_mode: 'auto',
          version_source: 'system',
          proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
        },
      },
    });
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshVersionSource' }));
    fireEvent.click(screen.getByText('dshVersionSourceHost'));
    // 解析结果不同即需要用户裁决「立即生效 / 下次启动生效」，与是否 running 无关。
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(saveSourceConfig).not.toHaveBeenCalled();
  });

  it('对话框按 Escape 仅关闭不写入配置', async () => {
    seed({ currentSelected: '1.0.0', installed: ['1.0.0'] });
    useAppStore.setState({
      sourceStatus: {
        system: { path: 'D:\\nodejs\\dsh', version: null },
        running: {
          url: 'http://127.0.0.1:3080/',
          port: 3080,
          managed: true,
          source: 'host',
          version: '1.0.0',
        },
        versionSource: {
          mode: 'auto',
          effective: 'running',
          resolvedByMode: resolvedByMode('1.0.0', true),
          hostVersion: '1.0.0',
        },
        config: {
          npm_registry: 'https://registry.npmjs.org',
          dsh_mirror: null,
          source_mode: 'auto',
          version_source: 'auto',
          proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
        },
      },
    });
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshVersionSource' }));
    fireEvent.click(screen.getByText('dshVersionSourceSystem'));
    await screen.findByRole('dialog');
    saveSourceConfig.mockClear();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(saveSourceConfig).not.toHaveBeenCalled();
  });

  it('对话框点遮罩仅关闭不写入配置', async () => {
    seed({ currentSelected: '1.0.0', installed: ['1.0.0'] });
    useAppStore.setState({
      sourceStatus: {
        system: { path: 'D:\\nodejs\\dsh', version: null },
        running: {
          url: 'http://127.0.0.1:3080/',
          port: 3080,
          managed: true,
          source: 'host',
          version: '1.0.0',
        },
        versionSource: {
          mode: 'auto',
          effective: 'running',
          resolvedByMode: resolvedByMode('1.0.0', true),
          hostVersion: '1.0.0',
        },
        config: {
          npm_registry: 'https://registry.npmjs.org',
          dsh_mirror: null,
          source_mode: 'auto',
          version_source: 'auto',
          proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
        },
      },
    });
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshVersionSource' }));
    fireEvent.click(screen.getByText('dshVersionSourceSystem'));
    await screen.findByRole('dialog');
    saveSourceConfig.mockClear();
    fireEvent.click(screen.getByRole('dialog'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(saveSourceConfig).not.toHaveBeenCalled();
  });

  it('版本任务在对应行显示阶段文案与取消按钮（无进度条；计数口径一致）', async () => {
    seed({ currentSelected: '0.2.0', installed: ['0.2.0'] });
    seedCatalog(['0.2.0'], ['0.2.1-rc.2']);
    useAppStore.setState({
      versionTask: {
        kind: 'install',
        version: '0.2.0',
        phase: 'installing',
        percent: 42,
        done: 10,
        total: 20,
        cancellable: true,
      },
    });
    renderBlock();
    // 阶段文案行（扫光文字＋素计数），不渲染进度条/百分比。
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText('dshTaskStageInstalling')).toBeTruthy();
    expect(screen.getByText('10/20')).toBeTruthy();
    expect(screen.getByText('dshCancelInstall')).toBeTruthy();
    fireEvent.click(screen.getByText('dshCancelInstall'));
    await waitFor(() => expect(cancelVersionTask).toHaveBeenCalled());
  });

  it('下载盲区（total 为 0）显示“正在下载”而非计数', async () => {
    seed({ currentSelected: '0.2.0', installed: ['0.2.0'] });
    seedCatalog(['0.2.0'], ['0.2.1-rc.2']);
    useAppStore.setState({
      versionTask: {
        kind: 'install',
        version: '0.2.0',
        phase: 'installing',
        percent: null,
        done: 0,
        total: 0,
        cancellable: true,
      },
    });
    renderBlock();
    expect(screen.getByText('dshTaskStageDownloading')).toBeTruthy();
  });

  it('任务结束但重启在途时行内保持收尾中任务行（不闪回禁用安装按钮）', async () => {
    seed({ currentSelected: '0.2.0', installed: ['0.2.0'] });
    seedCatalog(['0.2.0'], ['0.2.1-rc.2']);
    useAppStore.setState({
      versionTask: {
        kind: 'install',
        version: '0.2.0',
        phase: 'installing',
        percent: 95,
        done: 650,
        total: 683,
        cancellable: true,
      },
    });
    const { container } = renderBlock();
    await waitFor(() =>
      expect(container.querySelector('.adl-dsh-settings__version-task')).not.toBeNull(),
    );
    // 后端任务结束、重启在途中：沿用快照但文案统一为收尾，取消按钮禁用。
    useAppStore.setState({ versionTask: null, dshRestarting: true });
    await waitFor(() => expect(screen.getByText('dshTaskStageFinalizing')).toBeTruthy());
    expect(container.querySelector('.adl-dsh-settings__version-task')).not.toBeNull();
    const cancelBtn = screen.getByRole('button', { name: 'dshCancelInstall' });
    expect((cancelBtn as HTMLButtonElement).disabled).toBe(true);
  });

  // —— 来源偏好（忽略 running）判定：显隐与切源确认 ——

  it('自动检测且真实来源是系统安装时，预拉起的运行中进程不使管理项显现（根因回归）', () => {
    seed({ currentSelected: null, installed: [] });
    useAppStore.setState({
      sourceStatus: {
        system: { path: 'D:\\nodejs-v22\\node_global\\dsh.cmd', version: '0.2.0-rc.2' },
        running: {
          url: 'http://127.0.0.1:3080/',
          port: 3080,
          managed: true,
          source: 'system',
          version: '0.2.0-rc.2',
        },
        versionSource: {
          mode: 'auto',
          effective: 'running',
          resolvedByMode: resolvedByMode(null, true),
          hostVersion: null,
        },
        config: MOCK_CONFIG,
      },
    });
    renderBlock();
    expect(screen.queryByText('dshCheckUpdate')).toBeNull();
    expect(screen.queryByText('dshOfficialStable')).toBeNull();
    expect(screen.queryByText('dshPrereleaseTitle')).toBeNull();
    expect(screen.getByText('dshSystemManagedNote')).toBeTruthy();
  });

  it('自动检测且真实来源是宿主安装时，运行中进程下管理项保持显现', () => {
    seed({ currentSelected: '1.0.0', installed: ['1.0.0'] });
    useAppStore.setState({
      sourceStatus: {
        system: { path: 'D:\\nodejs\\dsh', version: null },
        running: {
          url: 'http://127.0.0.1:3080/',
          port: 3080,
          managed: true,
          source: 'host',
          version: '1.0.0',
        },
        versionSource: {
          mode: 'auto',
          effective: 'running',
          resolvedByMode: resolvedByMode('1.0.0', true),
          hostVersion: '1.0.0',
        },
        config: MOCK_CONFIG,
      },
    });
    const { container } = renderBlock();
    expect(container.querySelector('[data-settings-row="dshCheckUpdate"]')).not.toBeNull();
    expect(container.querySelector('[data-settings-row="dshOfficialStable"]')).not.toBeNull();
  });

  it('来源状态未返回前不渲染管理项（首帧不闪烁）', () => {
    seed({ currentSelected: '1.0.0', installed: ['1.0.0'] });
    useAppStore.setState({ sourceStatus: null });
    renderBlock();
    expect(screen.queryByText('dshCheckUpdate')).toBeNull();
    expect(screen.queryByText('dshOfficialStable')).toBeNull();
    expect(screen.queryByText('dshPrereleaseTitle')).toBeNull();
  });

  it('自动检测切到系统安装，若自动检测本就落在系统则运行中也不弹窗', async () => {
    seed({ currentSelected: null, installed: [] });
    useAppStore.setState({
      sourceStatus: {
        system: { path: 'D:\\nodejs\\dsh', version: '0.2.0-rc.2' },
        running: {
          url: 'http://127.0.0.1:3080/',
          port: 3080,
          managed: true,
          source: 'system',
          version: '0.2.0-rc.2',
        },
        versionSource: {
          mode: 'auto',
          effective: 'running',
          resolvedByMode: resolvedByMode(null, true),
          hostVersion: null,
        },
        config: MOCK_CONFIG,
      },
    });
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshVersionSource' }));
    fireEvent.click(screen.getByText('dshVersionSourceSystem'));
    await waitFor(() =>
      expect(saveSourceConfig).toHaveBeenCalledWith({ version_source: 'system' }, true),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('系统安装切到自动检测，若自动检测解析仍是系统则运行中也不弹窗', async () => {
    seed({ currentSelected: null, installed: [] });
    useAppStore.setState({
      sourceStatus: {
        system: { path: 'D:\\nodejs\\dsh', version: '0.2.0-rc.2' },
        running: {
          url: 'http://127.0.0.1:3080/',
          port: 3080,
          managed: true,
          source: 'system',
          version: '0.2.0-rc.2',
        },
        versionSource: {
          mode: 'system',
          effective: 'running',
          resolvedByMode: resolvedByMode(null, true),
          hostVersion: null,
        },
        config: { ...MOCK_CONFIG, version_source: 'system' },
      },
    });
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshVersionSource' }));
    fireEvent.click(screen.getByText('dshVersionSourceAuto'));
    await waitFor(() =>
      expect(saveSourceConfig).toHaveBeenCalledWith({ version_source: 'auto' }, true),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('切到空宿主时仍弹确认框并追加无版本后果提示', async () => {
    seed({ currentSelected: null, installed: [] });
    useAppStore.setState({
      sourceStatus: {
        system: { path: 'D:\\nodejs\\dsh', version: '0.2.0-rc.2' },
        running: {
          url: 'http://127.0.0.1:3080/',
          port: 3080,
          managed: true,
          source: 'system',
          version: '0.2.0-rc.2',
        },
        versionSource: {
          mode: 'auto',
          effective: 'running',
          resolvedByMode: resolvedByMode(null, true),
          hostVersion: null,
        },
        config: MOCK_CONFIG,
      },
    });
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshVersionSource' }));
    fireEvent.click(screen.getByText('dshVersionSourceHost'));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText('dshVersionSourceSwitchDialogEmpty')).toBeTruthy();
  });

  it('所有来源皆空时切源不弹确认框', async () => {
    seed({ currentSelected: null, installed: [] });
    useAppStore.setState({
      sourceStatus: {
        system: null,
        running: {
          url: 'http://127.0.0.1:3080/',
          port: 3080,
          managed: false,
          source: 'external',
          version: '0.2.0-rc.2',
        },
        versionSource: {
          mode: 'auto',
          effective: 'running',
          resolvedByMode: resolvedByMode(null, false),
          hostVersion: null,
        },
        config: MOCK_CONFIG,
      },
    });
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshVersionSource' }));
    fireEvent.click(screen.getByText('dshVersionSourceHost'));
    await waitFor(() =>
      expect(saveSourceConfig).toHaveBeenCalledWith({ version_source: 'host' }, true),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('无运行中进程时切到空宿主仍弹确认框（不依赖是否已打开 dsh 标签）', async () => {
    seed({ currentSelected: null, installed: [] });
    useAppStore.setState({
      sourceStatus: {
        system: { path: 'D:\\nodejs\\dsh', version: '0.2.0-rc.2' },
        running: null,
        versionSource: {
          mode: 'auto',
          effective: 'system',
          resolvedByMode: resolvedByMode(null, true),
          hostVersion: null,
        },
        config: MOCK_CONFIG,
      },
    });
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshVersionSource' }));
    fireEvent.click(screen.getByText('dshVersionSourceHost'));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText('dshVersionSourceSwitchDialogEmpty')).toBeTruthy();
  });

  it('切到空宿主的对话框文案不残留 {target} 占位符', async () => {
    seed({ currentSelected: null, installed: [] });
    useAppStore.setState({
      sourceStatus: {
        system: { path: 'D:\\nodejs\\dsh', version: '0.2.0-rc.2' },
        running: null,
        versionSource: {
          mode: 'auto',
          effective: 'system',
          resolvedByMode: resolvedByMode(null, true),
          hostVersion: null,
        },
        config: MOCK_CONFIG,
      },
    });
    renderBlock(emptyNoteT);
    fireEvent.click(screen.getByRole('button', { name: 'dshVersionSource' }));
    fireEvent.click(screen.getByText('dshVersionSourceHost'));
    await screen.findByRole('dialog');
    // String.replace 只换首处，三处占位符会残留两个（用户实测 2026-10-22）。
    expect(screen.queryByText(/\{target\}/)).toBeNull();
    expect(screen.getByText(/注意：切换后“dshVersionSourceHost”下没有任何可用版本/)).toBeTruthy();
  });

  it('空宿主切到系统安装且无运行进程：弹确认框（从无版本恢复为可用来源）', async () => {
    seed({ currentSelected: null, installed: [] });
    useAppStore.setState({
      sourceStatus: {
        system: { path: 'D:\\nodejs\\dsh', version: '0.2.0-rc.2' },
        running: null,
        versionSource: {
          mode: 'host',
          effective: 'none',
          resolvedByMode: resolvedByMode(null, true),
          hostVersion: null,
        },
        config: { ...MOCK_CONFIG, version_source: 'host' },
      },
    });
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshVersionSource' }));
    fireEvent.click(screen.getByText('dshVersionSourceSystem'));
    // 用户实测 2026-10-22：此前 currentResolved=none 被守卫短路，切到有版本的来源不弹框。
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText('dshVersionSourceSwitchDialogFromEmpty')).toBeTruthy();
  });

  it('空宿主切到系统安装后取消：不改配置（纯 no-op）', async () => {
    seed({ currentSelected: null, installed: [] });
    useAppStore.setState({
      sourceStatus: {
        system: { path: 'D:\\nodejs\\dsh', version: '0.2.0-rc.2' },
        running: null,
        versionSource: {
          mode: 'host',
          effective: 'none',
          resolvedByMode: resolvedByMode(null, true),
          hostVersion: null,
        },
        config: { ...MOCK_CONFIG, version_source: 'host' },
      },
    });
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshVersionSource' }));
    fireEvent.click(screen.getByText('dshVersionSourceSystem'));
    await screen.findByRole('dialog');
    saveSourceConfig.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    // 历史行为「切向 system 取消回退 host」在来源为空时不适用：会把 auto 全空静默改成 host。
    expect(saveSourceConfig).not.toHaveBeenCalled();
  });

  it('立即生效切到空宿主会关闭已打开的 dsh 标签', async () => {
    seed({ currentSelected: null, installed: [] });
    useAppStore.setState({
      sourceStatus: {
        system: { path: 'D:\\nodejs\\dsh', version: '0.2.0-rc.2' },
        running: {
          url: 'http://127.0.0.1:3080/?token=t',
          port: 3080,
          managed: true,
          source: 'system',
          version: '0.2.0-rc.2',
        },
        versionSource: {
          mode: 'auto',
          effective: 'running',
          resolvedByMode: resolvedByMode(null, true),
          hostVersion: null,
        },
        config: MOCK_CONFIG,
      },
      browserTabs: [
        {
          id: 'tab-dsh',
          workspaceId: 'w1',
          title: 'dsh',
          url: 'http://127.0.0.1:3080/',
          titleResolved: true,
          isPinned: false,
          sortOrder: 0,
          isPlayingAudio: false,
          isAudioMuted: false,
          isDownloading: false,
        },
      ],
      browserActiveTabId: 'tab-dsh',
    });
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshVersionSource' }));
    fireEvent.click(screen.getByText('dshVersionSourceHost'));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByText('dshVersionSourceApplyNow'));
    await waitFor(() => {
      const st = useAppStore.getState();
      expect(st.browserTabs.some((tab) => tab.id === 'tab-dsh')).toBe(false);
    });
  });
});
