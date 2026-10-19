import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { CopyDict } from '../../i18n';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { useAppStore } from '../../stores/slicedStore';
import { DshVersionManagement } from './DshVersionManagement';

import { openUrlByMethod } from '@features/preview/openByMethod';

vi.mock('@features/preview/openByMethod', () => ({
  openUrlByMethod: vi.fn(),
}));

const fetchDshVersionStatus = vi.fn();
const fetchSourceStatus = vi.fn();
const fetchVersionCatalog = vi.fn();
const updateDsh = vi.fn();
const revertDsh = vi.fn();
const uninstallDsh = vi.fn();
const reinstallDsh = vi.fn();
const installDshVersion = vi.fn();

vi.mock('@hooks/useAppActions', () => {
  // 单例对象：保持 useAppActions 返回引用稳定（真实实现经 useShallow 也稳定），
  // 否则组件挂载 effect 依赖 [actions] 会在每次重渲染时重复拉取版本状态。
  const actions = {
    fetchDshVersionStatus: (...args: unknown[]) => fetchDshVersionStatus(...args),
    fetchSourceStatus: (...args: unknown[]) => fetchSourceStatus(...args),
    fetchVersionCatalog: (...args: unknown[]) => fetchVersionCatalog(...args),
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

interface VersionStatus {
  currentSelected: string | null;
  latestAvailable: string | null;
  hasUpdate: boolean;
  installed: string[];
  prereleaseAvailable: string | null;
  hasPrereleaseUpdate: boolean;
  prereleaseUnknown: boolean;
}

function seed(status: Partial<VersionStatus>) {
  useAppStore.setState({
    versionStatus: {
      currentSelected: null,
      latestAvailable: null,
      hasUpdate: false,
      installed: [],
      prereleaseAvailable: null,
      hasPrereleaseUpdate: false,
      prereleaseUnknown: false,
      ...status,
    },
    versionCatalog: null,
    versionCatalogFailed: false,
    sourceStatus: null,
  });
}

function renderBlock() {
  return render(
    <TestProvider>
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

beforeEach(() => {
  vi.clearAllMocks();
  fetchDshVersionStatus.mockResolvedValue(true);
  fetchSourceStatus.mockResolvedValue(true);
  fetchVersionCatalog.mockResolvedValue(true);
  updateDsh.mockResolvedValue(true);
  revertDsh.mockResolvedValue(true);
  uninstallDsh.mockResolvedValue(true);
  reinstallDsh.mockResolvedValue(true);
  installDshVersion.mockResolvedValue(true);
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
  it('挂载即拉取版本状态', () => {
    seed({ currentSelected: '1.0.0', installed: ['1.0.0'] });
    renderBlock();
    expect(fetchDshVersionStatus).toHaveBeenCalledTimes(1);
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
    await waitFor(() => expect(installDshVersion).toHaveBeenCalledWith('1.1.0'));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('dshInstallSuccess', 'success'));
  });

  it('检查更新：无更新时提示已是最新', async () => {
    const showToast = vi.fn();
    useAppStore.setState({ showToast });
    seed({ currentSelected: '1.0.0', latestAvailable: '1.0.0', installed: ['1.0.0'] });
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshCheckUpdate' }));
    await waitFor(() => expect(fetchDshVersionStatus).toHaveBeenCalledTimes(2));
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
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('dshHasUpdate', 'success'));
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
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('dshCheckUpdateFailed', 'error'));
    expect(showToast).not.toHaveBeenCalledWith('dshNoUpdate', expect.anything());
  });

  it('无选中但有运行中实例时显示有效来源，而非未安装', () => {
    seed({ currentSelected: null, installed: [] });
    useAppStore.setState({
      sourceStatus: {
        bundled: null,
        system: null,
        running: { url: 'http://127.0.0.1:3080/', port: 3080 },
        config: {
          npm_registry: 'https://registry.npmjs.org',
          dsh_mirror: null,
          source_mode: 'auto',
          proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
        },
      },
    });
    renderBlock();
    expect(screen.queryByText('dshCurrentVersionNone')).toBeNull();
    expect(screen.getByText('dshEffectiveRunning')).toBeTruthy();
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
    await waitFor(() => expect(installDshVersion).toHaveBeenCalledWith('0.2.0'));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('dshInstallSuccess', 'success'));
  });

  it('已装非当前行重装走登记并选中（installDshVersion），无二次弹窗', async () => {
    seed({ currentSelected: '0.1.0', installed: ['0.1.0', '0.2.0'] });
    seedCatalog(['0.2.0', '0.1.0']);
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
    // 0.2.0 行：卸载 + 重装 + 切换 + 下拉框；点重装应登记选中该版本。
    const row = Array.from(
      container.querySelectorAll('.adl-dsh-settings__version-list-item'),
    )[0]! as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'dshReinstall' }));
    await waitFor(() => expect(installDshVersion).toHaveBeenCalledWith('0.2.0'));
  });

  it('官方版本信息行内嵌蓝色链接，点击跟随打开方式跳转', () => {
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
    // 单行说明（原特殊说明行已合并，不再单独成行）。
    expect(screen.getByText('dshPrereleaseDesc')).toBeTruthy();
    expect(screen.queryByText('dshPrereleaseNote')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'dshSwitchToVersion' }));
    await waitFor(() => expect(revertDsh).toHaveBeenCalledWith('0.2.1-rc.2'));
  });
});
