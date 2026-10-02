import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { CopyDict } from '../../i18n';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { useAppStore } from '../../stores/slicedStore';
import { DshVersionManagement } from './DshVersionManagement';

const fetchDshVersionStatus = vi.fn();
const updateDsh = vi.fn();
const revertDsh = vi.fn();
const uninstallDsh = vi.fn();
const reinstallDsh = vi.fn();

vi.mock('@hooks/useAppActions', () => {
  // 单例对象：保持 useAppActions 返回引用稳定（真实实现经 useShallow 也稳定），
  // 否则组件挂载 effect 依赖 [actions] 会在每次重渲染时重复拉取版本状态。
  const actions = {
    fetchDshVersionStatus: (...args: unknown[]) => fetchDshVersionStatus(...args),
    updateDsh: (...args: unknown[]) => updateDsh(...args),
    revertDsh: (...args: unknown[]) => revertDsh(...args),
    uninstallDsh: (...args: unknown[]) => uninstallDsh(...args),
    reinstallDsh: (...args: unknown[]) => reinstallDsh(...args),
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
}

function seed(status: Partial<VersionStatus>) {
  useAppStore.setState({
    versionStatus: {
      currentSelected: null,
      latestAvailable: null,
      hasUpdate: false,
      installed: [],
      ...status,
    },
  });
}

function renderBlock() {
  return render(
    <TestProvider>
      <DshVersionManagement />
    </TestProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchDshVersionStatus.mockResolvedValue(true);
  updateDsh.mockResolvedValue(true);
  revertDsh.mockResolvedValue(true);
  uninstallDsh.mockResolvedValue(true);
  reinstallDsh.mockResolvedValue(true);
  useAppStore.setState({ versionStatus: null, showToast: vi.fn() });
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

  it('hasUpdate 时显示升级按钮，点击调用 updateDsh 并提示成功', async () => {
    const showToast = vi.fn();
    useAppStore.setState({ showToast });
    seed({
      currentSelected: '1.0.0',
      latestAvailable: '1.1.0',
      hasUpdate: true,
      installed: ['1.0.0'],
    });
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshUpdate' }));
    await waitFor(() => expect(updateDsh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('dshUpdate', 'success'));
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
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshReinstall' }));
    await waitFor(() => expect(reinstallDsh).toHaveBeenCalledTimes(1));
  });

  it('卸载当前版本需二次确认：首次点击进入 danger 确认态，再次点击调用 uninstallDsh', async () => {
    seed({ currentSelected: '1.0.0', installed: ['1.0.0'] });
    renderBlock();
    const btn = screen.getByRole('button', { name: 'dshUninstall' });
    fireEvent.click(btn);
    // 首次点击只武装确认态（danger），不调用卸载。
    expect(uninstallDsh).not.toHaveBeenCalled();
    expect(btn.className).toContain('adl-dsh-settings__action-btn--danger');
    fireEvent.click(btn);
    await waitFor(() => expect(uninstallDsh).toHaveBeenCalledWith('1.0.0'));
  });

  it('多版本时回退菜单可切换版本（Portal 菜单 + 非当前项点击调用 revertDsh）', async () => {
    seed({
      currentSelected: '1.0.0',
      latestAvailable: '1.1.0',
      installed: ['1.0.0', '1.1.0'],
    });
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshRevert' }));
    // 菜单经 Portal 渲染到 body：1.1.0 为非当前项。
    const target = await screen.findByText('1.1.0');
    fireEvent.click(target);
    await waitFor(() => expect(revertDsh).toHaveBeenCalledWith('1.1.0'));
  });

  it('Esc 关闭版本菜单', async () => {
    seed({
      currentSelected: '1.0.0',
      latestAvailable: '1.1.0',
      installed: ['1.0.0', '1.1.0'],
    });
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshRevert' }));
    expect(await screen.findByText('1.1.0')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('1.1.0')).toBeNull());
  });

  it('版本菜单内可卸载非当前版本（菜单单项卸载）', async () => {
    seed({ currentSelected: '1.0.0', latestAvailable: '1.1.0', installed: ['1.0.0', '1.1.0'] });
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: 'dshRevert' }));
    // 菜单内 1.1.0（已装、非当前）带卸载按钮；用类名精确取菜单项内的那个。
    await screen.findByText('1.1.0');
    const menuUninstall = document.querySelector(
      '.adl-dsh-settings__version-menu-item-uninstall',
    ) as HTMLButtonElement;
    expect(menuUninstall).not.toBeNull();
    fireEvent.click(menuUninstall);
    await waitFor(() => expect(uninstallDsh).toHaveBeenCalledWith('1.1.0'));
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
    renderBlock();
    const uninstallBtn = screen.getByRole('button', { name: 'dshUninstall' });
    fireEvent.click(uninstallBtn);
    fireEvent.click(uninstallBtn);
    // 卸载在途：重新安装按钮被禁用。
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'dshReinstall' })).toBeDisabled(),
    );
    resolveUninstall(true);
  });
});
