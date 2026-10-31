import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRef } from 'react';
import { render, cleanup, fireEvent, screen, waitFor, within, act } from '@testing-library/react';
import type { CopyDict } from '@i18n';
import { TCopyProvider } from '@i18n/TCopyContext';
import { REFRESH_ARC_PATH } from '@icons';
import {
  HarnessVersionCard,
  type HarnessVersionCardHandle,
  type HarnessVersionSlots,
} from '../HarnessVersionCard';
import type {
  HarnessVersionBridge,
  HarnessVersionResult,
  HarnessVersionSnapshot,
  HarnessVersionStatus,
} from '../harnessVersionBridge';

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) =>
    key === 'harnessVersionTaskCount' ? '{done}/{total}' : typeof key === 'string' ? key : '',
}) as unknown as CopyDict;

function renderCard(bridge: HarnessVersionBridge<unknown>, slots?: HarnessVersionSlots<unknown>) {
  return render(
    <TCopyProvider t={mockT} locale="en-US">
      <HarnessVersionCard bridge={bridge} slots={slots} />
    </TCopyProvider>,
  );
}

function status(overrides: Partial<HarnessVersionStatus> = {}): HarnessVersionStatus {
  return {
    currentSelected: '1.0.0',
    installed: ['1.0.0', '1.1.0'],
    latestAvailable: '1.1.0',
    hasUpdate: true,
    prereleaseAvailable: null,
    hasPrereleaseUpdate: false,
    prereleaseUnknown: false,
    ...overrides,
  };
}

const CATALOG = {
  stable: [
    { version: '1.0.0', publishedAt: null },
    { version: '1.1.0', publishedAt: null },
  ],
  prerelease: [],
  latestStable: '1.1.0',
  latestPrerelease: null,
};

function snapshot(overrides: Partial<HarnessVersionSnapshot> = {}): HarnessVersionSnapshot {
  return {
    status: status(),
    catalog: CATALOG,
    source: { mode: 'auto', ready: true },
    failed: false,
    ...overrides,
  };
}

const OK: HarnessVersionResult = { ok: true };

const DSH_CATALOG = {
  stable: [
    { version: '1.2.0', publishedAt: '2026-01-02T03:04:00Z' },
    { version: '1.1.0', publishedAt: '2026-01-01T00:00:00Z' },
    { version: '1.0.0', publishedAt: null },
  ],
  prerelease: [
    { version: '2.0.0-rc.2', publishedAt: '2026-02-02T03:04:00Z' },
    { version: '2.0.0-rc.1', publishedAt: null },
  ],
  latestStable: '1.2.0',
  latestPrerelease: '2.0.0-rc.2',
};

/** DSH 形态：行内双通道选择器 + 卸载确认 + 仅检查更新 + 无百分比任务行。 */
function dshBridge(
  overrides: Partial<HarnessVersionBridge<unknown>> & { initial?: HarnessVersionSnapshot } = {},
): HarnessVersionBridge<unknown> {
  return makeBridge({
    capabilities: {
      uninstallConfirm: true,
      updateAction: 'check',
      taskCounts: true,
      sourceManaged: true,
    },
    labels: {
      stable: 'dshOfficialStable',
      prerelease: 'dshPrereleaseTitle',
      uninstallCurrentHint: 'dshUninstallCurrentHint',
    },
    initial: snapshot({
      status: status({
        currentSelected: '1.1.0',
        installed: ['1.1.0', '1.0.0'],
        latestAvailable: '1.2.0',
        prereleaseAvailable: '2.0.0-rc.2',
        hasPrereleaseUpdate: true,
      }),
      catalog: DSH_CATALOG,
      source: { mode: 'auto', ready: true },
    }),
    ...overrides,
  });
}

function channelRow(channel: 'stable' | 'prerelease'): HTMLElement {
  const row = document.querySelector<HTMLElement>(`[data-harness-channel="${channel}"]`);
  if (!row) {
    throw new Error(`channel row not found: ${channel}`);
  }
  return row;
}

function openChannelMenu(channel: 'stable' | 'prerelease', effective: string): HTMLElement {
  fireEvent.click(within(channelRow(channel)).getByRole('button', { name: effective }));
  return screen.getByRole('listbox');
}

function optionFor(version: string): HTMLElement {
  const option = screen.getAllByRole('option').find((el) => el.textContent?.includes(version));
  if (!option) {
    throw new Error(`option not found: ${version}`);
  }
  return option;
}

function pickChannelVersion(version: string): void {
  fireEvent.click(within(optionFor(version)).getByRole('button'));
}

function makeBridge(
  overrides: Partial<HarnessVersionBridge<unknown>> & {
    initial?: HarnessVersionSnapshot;
  } = {},
): HarnessVersionBridge<unknown> {
  const { initial = snapshot(), ...rest } = overrides;
  return {
    toolName: 'OpenCode CLI',
    available: true,
    capabilities: {
      resetSourceAction: false,
    },
    // 与真实桥一致：首帧种子同步供给（无种子时卡片画骨架）。
    peekSnapshot: () => initial,
    peekSourceMode: () => initial.source?.mode ?? null,
    load: vi.fn(async () => initial),
    getTask: vi.fn(async () => null),
    install: vi.fn(async () => OK),
    update: vi.fn(async () => OK),
    revert: vi.fn(async () => OK),
    uninstall: vi.fn(async () => OK),
    reinstall: vi.fn(async () => OK),
    cancel: vi.fn(async () => OK),
    saveSourceMode: vi.fn(async () => OK),
    resetSourceMode: vi.fn(async () => OK),
    notify: vi.fn(),
    ...rest,
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('HarnessVersionCard', () => {
  it('installs the selected stable version through the injected bridge', async () => {
    const bridge = makeBridge({
      initial: snapshot({
        status: status({
          currentSelected: null,
          installed: [],
          latestAvailable: '1.1.0',
        }),
      }),
    });
    renderCard(bridge);

    await waitFor(() =>
      expect(within(channelRow('stable')).getByRole('button', { name: '1.0.0' })).toBeTruthy(),
    );
    openChannelMenu('stable', '1.0.0');
    pickChannelVersion('1.1.0');

    fireEvent.click(
      within(channelRow('stable')).getByRole('button', { name: 'harnessVersionInstall' }),
    );

    await waitFor(() => expect(bridge.install).toHaveBeenCalledWith('1.1.0'));
    await waitFor(() =>
      expect(bridge.notify).toHaveBeenCalledWith('harnessVersionInstallStarted', 'success'),
    );
  });

  it('switches to an installed version through the injected bridge', async () => {
    const bridge = makeBridge();
    renderCard(bridge);

    await waitFor(() =>
      expect(within(channelRow('stable')).getByRole('button', { name: '1.0.0' })).toBeTruthy(),
    );
    openChannelMenu('stable', '1.0.0');
    pickChannelVersion('1.1.0');

    fireEvent.click(
      within(channelRow('stable')).getByRole('button', { name: 'harnessVersionSwitchTo' }),
    );

    await waitFor(() => expect(bridge.revert).toHaveBeenCalledWith('1.1.0'));
    await waitFor(() =>
      expect(bridge.notify).toHaveBeenCalledWith('harnessVersionSwitched', 'success'),
    );
  });

  it('marks the current version and disables switching to it', async () => {
    renderCard(makeBridge());

    await waitFor(() =>
      expect(within(channelRow('stable')).getByRole('button', { name: '1.0.0' })).toBeTruthy(),
    );

    // 当前版本行：徽章 + 无切换按钮。
    expect(
      within(channelRow('stable')).getByText('harnessVersionCurrentBadge'),
    ).toBeInTheDocument();
    expect(
      within(channelRow('stable')).queryByRole('button', { name: 'harnessVersionSwitchTo' }),
    ).toBeNull();

    // 切到已装非当前版本：出现切换按钮且可用。
    openChannelMenu('stable', '1.0.0');
    pickChannelVersion('1.1.0');
    expect(
      within(channelRow('stable')).getByRole('button', { name: 'harnessVersionSwitchTo' }),
    ).toBeEnabled();

    // 切回当前版本：切换按钮消失。
    openChannelMenu('stable', '1.1.0');
    pickChannelVersion('1.0.0');
    expect(
      within(channelRow('stable')).queryByRole('button', { name: 'harnessVersionSwitchTo' }),
    ).toBeNull();
  });

  it('disables actions while busy and lets the running task be cancelled', async () => {
    let resolveInstall!: (result: HarnessVersionResult) => void;
    const installPromise = new Promise<HarnessVersionResult>((resolve) => {
      resolveInstall = resolve;
    });
    const bridge = makeBridge({
      initial: snapshot({
        status: status({ currentSelected: null, installed: [] }),
      }),
    });
    bridge.install = vi.fn(() => installPromise);
    bridge.getTask = vi.fn(async () => ({
      kind: 'dsh-install' as const,
      version: '1.1.0',
      phase: 'installing' as const,
      percent: 42,
      done: 42,
      total: 100,
      cancellable: true,
    }));

    renderCard(bridge);
    await waitFor(() =>
      expect(within(channelRow('stable')).getByRole('button', { name: '1.0.0' })).toBeTruthy(),
    );
    openChannelMenu('stable', '1.0.0');
    pickChannelVersion('1.1.0');

    vi.useFakeTimers();
    fireEvent.click(
      within(channelRow('stable')).getByRole('button', { name: 'harnessVersionInstall' }),
    );

    // 在途：通道选择器与更新按钮禁用，只有取消可点。
    expect(within(channelRow('stable')).getByRole('button', { name: '1.1.0' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'harnessVersionUpdateAction' })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    // picker 形态任务行内展示阶段文案（无百分比）+ 取消按钮。
    expect(screen.getByText('harnessVersionPhaseInstalling')).toBeInTheDocument();
    const cancel = screen.getByRole('button', { name: 'harnessVersionCancel' });
    expect(cancel).toBeEnabled();
    fireEvent.click(cancel);
    expect(bridge.cancel).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveInstall(OK);
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it('renders the not-installed readout when nothing is installed', async () => {
    const bridge = makeBridge({
      initial: snapshot({
        status: status({ currentSelected: null, installed: [] }),
      }),
    });
    renderCard(bridge);

    await waitFor(() => expect(bridge.load).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('harnessVersionNotInstalled')).toBeInTheDocument());
    const currentRow = document.querySelector(
      '[data-settings-row="harnessVersionCurrent"]',
    ) as HTMLElement;
    const readout = currentRow.querySelector('.adl-harness-version__readout') as HTMLElement;
    expect(readout.textContent?.trim()).toBe('harnessVersionNotInstalled');
    expect(readout.children).toHaveLength(1);
  });

  it('renders the DSH-exact card without installed/reset rows on the shared layout', async () => {
    renderCard(makeBridge());

    await waitFor(() =>
      expect(within(channelRow('stable')).getByRole('button', { name: '1.0.0' })).toBeTruthy(),
    );

    // 双通道为 picker（按钮形态），无传统下拉、无已安装独立卡、无恢复默认行。
    // 注意：已装徽章文案（harnessVersionInstalled）仍会出现在 picker 徽章里，
    // 因此按结构断言（版本行 / 按钮），不按文案断言。
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(document.querySelector('[data-settings-row="harnessVersionInstalled"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'harnessVersionResetDefaults' })).toBeNull();
    // 来源下拉（自定义按钮）与检查更新按钮仍在。
    expect(screen.getByRole('button', { name: 'harnessVersionSourceTitle' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'harnessVersionUpdateAction' })).toBeInTheDocument();
  });

  it('renders an error readout when the status cannot be loaded', async () => {
    renderCard(
      makeBridge({
        initial: { status: null, catalog: null, source: null, failed: true },
      }),
    );

    await waitFor(() => expect(screen.getByText('harnessVersionLoadFailed')).toBeInTheDocument());
  });

  it('hides host-managed rows when the source reports an unmanaged (system) install', async () => {
    renderCard(
      makeBridge({
        initial: snapshot({
          source: {
            mode: 'system',
            managed: false,
          },
        }),
      }),
    );

    await waitFor(() => expect(screen.getByText('harnessVersionCurrent')).toBeInTheDocument());
    // 管理行整体隐藏：来源行保留自定义下拉（按钮形态，不再是原生 select）。
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('button', { name: 'harnessVersionSourceTitle' })).toBeInTheDocument();
    expect(screen.queryByText('harnessVersionStable')).not.toBeInTheDocument();
    expect(screen.queryByText('dshOfficialStable')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'harnessVersionUpdateAction' })).toBeNull();
  });

  it('lets the adapter own the host block header', async () => {
    const bridge = makeBridge();
    const { unmount } = renderCard(bridge, { hideHeader: true });
    await waitFor(() => expect(bridge.load).toHaveBeenCalled());
    expect(screen.queryByText('harnessVersionTitle')).not.toBeInTheDocument();
    unmount();

    renderCard(makeBridge());
    await waitFor(() => expect(screen.getByText('harnessVersionTitle')).toBeInTheDocument());
  });

  it('prefers the adapter-provided success message over the generic one', async () => {
    const bridge = makeBridge({
      initial: snapshot({
        status: status({ currentSelected: null, installed: [] }),
      }),
    });
    bridge.install = vi.fn(async () => ({ ok: true, message: 'dshInstalledRestarted' }));

    renderCard(bridge);
    await waitFor(() =>
      expect(within(channelRow('stable')).getByRole('button', { name: '1.0.0' })).toBeTruthy(),
    );
    openChannelMenu('stable', '1.0.0');
    pickChannelVersion('1.1.0');

    fireEvent.click(
      within(channelRow('stable')).getByRole('button', { name: 'harnessVersionInstall' }),
    );

    await waitFor(() =>
      expect(bridge.notify).toHaveBeenCalledWith('dshInstalledRestarted', 'success'),
    );
    expect(bridge.notify).not.toHaveBeenCalledWith('harnessVersionInstallStarted', 'success');
  });

  it('stays silent on a deferred source change (adapter owns the dialog feedback)', async () => {
    const changeSourceMode = vi.fn(async () => ({ ok: true }) as HarnessVersionResult);
    const bridge = makeBridge({
      capabilities: { sourceModeChange: 'deferred' },
      changeSourceMode,
    });

    renderCard(bridge);
    await waitFor(() => expect(bridge.load).toHaveBeenCalled());

    // 来源行是自定义下拉：点触发器展开菜单，再点目标选项。
    fireEvent.click(screen.getByRole('button', { name: 'harnessVersionSourceTitle' }));
    const menu = await screen.findByRole('listbox');
    fireEvent.click(within(menu).getByRole('option', { name: 'harnessVersionSourceSystem' }));

    await waitFor(() => expect(changeSourceMode).toHaveBeenCalledWith('system'));
    expect(bridge.notify).not.toHaveBeenCalledWith('harnessVersionSourceSaved', 'success');
  });

  it('reports downloading when the install task has no known total', async () => {
    let resolveInstall!: (result: HarnessVersionResult) => void;
    const installPromise = new Promise<HarnessVersionResult>((resolve) => {
      resolveInstall = resolve;
    });
    const bridge = makeBridge({
      initial: snapshot({
        status: status({ currentSelected: null, installed: [] }),
      }),
    });
    bridge.install = vi.fn(() => installPromise);
    bridge.getTask = vi.fn(async () => ({
      kind: 'dsh-install' as const,
      version: '1.1.0',
      phase: 'installing' as const,
      percent: null,
      done: 0,
      total: 0,
      cancellable: true,
    }));

    renderCard(bridge);
    await waitFor(() =>
      expect(within(channelRow('stable')).getByRole('button', { name: '1.0.0' })).toBeTruthy(),
    );
    openChannelMenu('stable', '1.0.0');
    pickChannelVersion('1.1.0');

    vi.useFakeTimers();
    fireEvent.click(
      within(channelRow('stable')).getByRole('button', { name: 'harnessVersionInstall' }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(screen.getByText('harnessVersionPhaseDownloading')).toBeInTheDocument();

    await act(async () => {
      resolveInstall(OK);
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  // —— 双通道行内选择器（DSH 形态） ——

  it('shows one effective version per channel and only changes the display on pick', async () => {
    const bridge = dshBridge();
    renderCard(bridge);

    await waitFor(() =>
      expect(
        within(channelRow('stable')).getByRole('button', { name: '1.1.0' }),
      ).toBeInTheDocument(),
    );
    // 稳定通道跟随当前版本，预发布通道跟随该通道最新；另一版本不作为行内按钮出现。
    expect(
      within(channelRow('prerelease')).getByRole('button', { name: '2.0.0-rc.2' }),
    ).toBeTruthy();
    expect(within(channelRow('stable')).queryByRole('button', { name: '1.2.0' })).toBeNull();

    const menu = openChannelMenu('stable', '1.1.0');
    expect(menu.getAttribute('aria-label')).toBe('dshOfficialStable');
    expect(within(menu).getAllByRole('option')).toHaveLength(3);
    // 旧行文案：发布时间为 `YYYY-MM-DD HH:mm`（用户要求恢复）。
    expect(within(menu).getByText('2026-01-02 03:04')).toBeInTheDocument();

    pickChannelVersion('1.2.0');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(within(channelRow('stable')).getByRole('button', { name: '1.2.0' })).toBeTruthy();
    // 通道互相独立：稳定通道的选择不影响预发布通道。
    expect(
      within(channelRow('prerelease')).getByRole('button', { name: '2.0.0-rc.2' }),
    ).toBeTruthy();
    // 选择只换展示：不触发安装/切换。
    expect(bridge.install).not.toHaveBeenCalled();
    expect(bridge.revert).not.toHaveBeenCalled();
  });

  it('falls back to latestStable when the stable bucket is empty', async () => {
    const bridge = dshBridge({
      initial: snapshot({
        status: status({ currentSelected: null, installed: [], latestAvailable: '1.5.0' }),
        catalog: {
          stable: [],
          prerelease: [],
          latestStable: '1.5.0',
          latestPrerelease: null,
        },
      }),
    });
    renderCard(bridge);

    await waitFor(() =>
      expect(
        within(channelRow('stable')).getByRole('button', { name: '1.5.0' }),
      ).toBeInTheDocument(),
    );
    expect(
      within(channelRow('prerelease')).getByText('harnessVersionPrereleaseEmpty'),
    ).toBeTruthy();
  });

  it('closes the channel menu on the same trigger, Escape and outside mousedown', async () => {
    renderCard(dshBridge());
    await waitFor(() =>
      expect(within(channelRow('stable')).getByRole('button', { name: '1.1.0' })).toBeTruthy(),
    );

    openChannelMenu('stable', '1.1.0');
    const trigger = within(channelRow('stable')).getByRole('button', { name: '1.1.0' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());

    openChannelMenu('stable', '1.1.0');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());

    openChannelMenu('stable', '1.1.0');
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  });

  it('marks current over installed in the channel menu and keeps every check slot', async () => {
    renderCard(dshBridge());
    await waitFor(() =>
      expect(within(channelRow('stable')).getByRole('button', { name: '1.1.0' })).toBeTruthy(),
    );

    const menu = openChannelMenu('stable', '1.1.0');
    const current = optionFor('1.1.0');
    const installed = optionFor('1.0.0');
    const fresh = optionFor('1.2.0');
    expect(current.textContent).toContain('harnessVersionCurrentBadge');
    expect(current.textContent).not.toContain('harnessVersionInstalled');
    expect(installed.textContent).toContain('harnessVersionInstalled');
    expect(fresh.textContent).not.toContain('harnessVersionInstalled');
    expect(current.getAttribute('aria-selected')).toBe('true');
    expect(installed.getAttribute('aria-selected')).toBe('false');
    for (const option of [current, installed, fresh]) {
      expect(option.querySelectorAll('.adl-harness-version__version-menu-item-check')).toHaveLength(
        1,
      );
    }
    expect(current.querySelector('.adl-harness-version__version-menu-item-check svg')).toBeTruthy();
    expect(installed.querySelector('.adl-harness-version__version-menu-item-check svg')).toBeNull();
    expect(within(menu).getAllByRole('option')).toHaveLength(3);
  });

  it('switches row actions with the picked version (installed / fresh / current)', async () => {
    const bridge = dshBridge();
    const reinstallVersion = vi.fn(async () => OK);
    bridge.reinstallVersion = reinstallVersion;
    renderCard(bridge);
    await waitFor(() =>
      expect(within(channelRow('stable')).getByRole('button', { name: '1.1.0' })).toBeTruthy(),
    );

    // 已装非当前：卸载 / 重装 / 切换。
    openChannelMenu('stable', '1.1.0');
    pickChannelVersion('1.0.0');
    const installedRow = channelRow('stable');
    expect(
      within(installedRow).getByRole('button', { name: 'harnessVersionSwitchTo' }),
    ).toBeTruthy();
    fireEvent.click(within(installedRow).getByRole('button', { name: 'harnessVersionSwitchTo' }));
    await waitFor(() => expect(bridge.revert).toHaveBeenCalledWith('1.0.0'));

    await waitFor(() =>
      expect(
        within(channelRow('stable')).getByRole('button', { name: 'harnessVersionReinstallAction' }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      within(channelRow('stable')).getByRole('button', { name: 'harnessVersionReinstallAction' }),
    );
    await waitFor(() => expect(reinstallVersion).toHaveBeenCalledWith('1.0.0'));

    await waitFor(() =>
      expect(
        within(channelRow('stable')).getByRole('button', { name: 'harnessVersionUninstall' }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      within(channelRow('stable')).getByRole('button', { name: 'harnessVersionUninstall' }),
    );
    await waitFor(() => expect(bridge.uninstall).toHaveBeenCalledWith('1.0.0'));

    // 未安装：只剩安装；点击调用 install。
    await waitFor(() =>
      expect(within(channelRow('stable')).getByRole('button', { name: '1.0.0' })).toBeEnabled(),
    );
    openChannelMenu('stable', '1.0.0');
    pickChannelVersion('1.2.0');
    const freshRow = channelRow('stable');
    expect(within(freshRow).queryByRole('button', { name: 'harnessVersionUninstall' })).toBeNull();
    expect(within(freshRow).queryByRole('button', { name: 'harnessVersionSwitchTo' })).toBeNull();
    fireEvent.click(within(freshRow).getByRole('button', { name: 'harnessVersionInstall' }));
    await waitFor(() => expect(bridge.install).toHaveBeenCalledWith('1.2.0'));

    // 当前版本：卸载 + 重装，没有安装/切换。
    await waitFor(() =>
      expect(within(channelRow('stable')).getByRole('button', { name: '1.2.0' })).toBeEnabled(),
    );
    openChannelMenu('stable', '1.2.0');
    pickChannelVersion('1.1.0');
    const currentRow = channelRow('stable');
    expect(
      within(currentRow).getByRole('button', { name: 'harnessVersionUninstall' }),
    ).toBeTruthy();
    expect(
      within(currentRow).getByRole('button', { name: 'harnessVersionReinstallAction' }),
    ).toBeTruthy();
    expect(within(currentRow).queryByRole('button', { name: 'harnessVersionInstall' })).toBeNull();
    expect(within(currentRow).queryByRole('button', { name: 'harnessVersionSwitchTo' })).toBeNull();
  });

  it('requires two clicks to uninstall the current version but one for any other version', async () => {
    const bridge = dshBridge();
    renderCard(bridge);
    await waitFor(() =>
      expect(
        within(channelRow('stable')).getByRole('button', { name: 'harnessVersionUninstall' }),
      ).toBeTruthy(),
    );
    const currentUninstall = within(channelRow('stable')).getByRole('button', {
      name: 'harnessVersionUninstall',
    });
    fireEvent.click(currentUninstall);
    expect(bridge.uninstall).not.toHaveBeenCalled();
    // 二次确认态：当前版本行下方出现适配器提供的卸载后果提示。
    expect(screen.getByText('dshUninstallCurrentHint')).toBeInTheDocument();
    expect(
      within(channelRow('stable')).getByRole('button', { name: 'harnessVersionConfirmUninstall' }),
    ).toBeTruthy();
    fireEvent.click(
      within(channelRow('stable')).getByRole('button', { name: 'harnessVersionConfirmUninstall' }),
    );
    await waitFor(() => expect(bridge.uninstall).toHaveBeenCalledWith('1.1.0'));

    // 非当前版本一次点击即执行。
    await waitFor(() =>
      expect(
        within(channelRow('stable')).getByRole('button', { name: 'harnessVersionUninstall' }),
      ).toBeEnabled(),
    );
    openChannelMenu('stable', '1.1.0');
    pickChannelVersion('1.0.0');
    fireEvent.click(
      within(channelRow('stable')).getByRole('button', { name: 'harnessVersionUninstall' }),
    );
    await waitFor(() => expect(bridge.uninstall).toHaveBeenCalledWith('1.0.0'));
  });

  it('surfaces an adapter install rejection instead of success', async () => {
    const bridge = dshBridge();
    bridge.install = vi.fn(async () => ({ ok: false, error: 'dshInstallFailed' }));
    renderCard(bridge);
    await waitFor(() =>
      expect(within(channelRow('stable')).getByRole('button', { name: '1.1.0' })).toBeTruthy(),
    );
    openChannelMenu('stable', '1.1.0');
    pickChannelVersion('1.2.0');
    fireEvent.click(
      within(channelRow('stable')).getByRole('button', { name: 'harnessVersionInstall' }),
    );

    await waitFor(() => expect(bridge.notify).toHaveBeenCalledWith('dshInstallFailed', 'error'));
    expect(bridge.notify).not.toHaveBeenCalledWith('harnessVersionInstallStarted', 'success');
  });

  it('disables every action except cancel in flight, then warns and reloads after cancel', async () => {
    let resolveInstall!: (result: HarnessVersionResult) => void;
    const installPromise = new Promise<HarnessVersionResult>((resolve) => {
      resolveInstall = resolve;
    });
    const bridge = dshBridge();
    bridge.install = vi.fn(() => installPromise);
    bridge.getTask = vi.fn(async () => ({
      kind: 'dsh-install' as const,
      version: '1.2.0',
      phase: 'installing' as const,
      percent: 42,
      done: 42,
      total: 100,
      cancellable: true,
    }));
    bridge.taskStageText = () => 'dshTaskStageInstalling';
    bridge.taskCancelLabel = () => 'dshCancelInstall';

    renderCard(bridge);
    await waitFor(() =>
      expect(within(channelRow('stable')).getByRole('button', { name: '1.1.0' })).toBeTruthy(),
    );

    openChannelMenu('stable', '1.1.0');
    pickChannelVersion('1.2.0');

    vi.useFakeTimers();
    fireEvent.click(
      within(channelRow('stable')).getByRole('button', { name: 'harnessVersionInstall' }),
    );

    // 在途：所有操作控件禁用，只有取消可点。
    expect(within(channelRow('stable')).getByRole('button', { name: '1.2.0' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'harnessVersionUpdate' })).toBeDisabled();
    expect(
      within(channelRow('prerelease')).getByRole('button', { name: '2.0.0-rc.2' }),
    ).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(screen.getByText('dshTaskStageInstalling')).toBeInTheDocument();
    // DSH 任务行把计数并入阶段行（`taskCounts`），不渲染百分比。
    expect(screen.getByText('42/100')).toBeInTheDocument();
    const cancel = screen.getByRole('button', { name: 'dshCancelInstall' });
    expect(cancel).toBeEnabled();

    fireEvent.click(cancel);
    expect(bridge.cancel).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveInstall({ ok: false, cancelled: true });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // 取消映射为警告提示，卡片重新载入回到操作前状态。
    expect(bridge.notify).toHaveBeenCalledWith('harnessVersionCancelled', 'warning');
    expect(vi.mocked(bridge.load).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(within(channelRow('stable')).getByRole('button', { name: '1.2.0' })).toBeEnabled();
  });

  it('distinguishes a failed catalog from genuinely empty channels', async () => {
    const bridge = dshBridge({
      initial: snapshot({
        status: status({ currentSelected: null, installed: [], prereleaseUnknown: true }),
        catalog: {
          stable: [],
          prerelease: [],
          latestStable: null,
          latestPrerelease: null,
        },
        catalogFailed: true,
      }),
    });
    renderCard(bridge);
    await waitFor(() =>
      expect(within(channelRow('stable')).getAllByText('harnessVersionListUnknown')).toHaveLength(
        1,
      ),
    );
    expect(within(channelRow('stable')).getAllByText('harnessVersionListUnknown').length).toBe(1);
    expect(within(channelRow('prerelease')).getAllByText('harnessVersionListUnknown').length).toBe(
      1,
    );
  });

  it('shows the generic channel empty texts when nothing is published', async () => {
    const bridge = dshBridge({
      initial: snapshot({
        status: status({ currentSelected: null, installed: [] }),
        catalog: {
          stable: [],
          prerelease: [],
          latestStable: null,
          latestPrerelease: null,
        },
      }),
    });
    renderCard(bridge);
    await waitFor(() =>
      expect(within(channelRow('stable')).getByText('harnessVersionStableEmpty')).toBeTruthy(),
    );
    expect(
      within(channelRow('prerelease')).getByText('harnessVersionPrereleaseEmpty'),
    ).toBeTruthy();
  });

  // —— 适配器语义回归（spec #1 items 1-6） ——

  it('runs the check-only update action and never shows an update hint in check mode', async () => {
    const checkUpdate = vi.fn(async () => ({ ok: true }) as HarnessVersionResult);
    const bridge = dshBridge({ checkUpdate });
    renderCard(bridge);
    await waitFor(() =>
      expect(within(channelRow('stable')).getByRole('button', { name: '1.1.0' })).toBeTruthy(),
    );

    expect(screen.queryByText('harnessVersionHasUpdate')).toBeNull();
    expect(screen.queryByText('harnessVersionNoUpdate')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'harnessVersionUpdate' }));

    await waitFor(() => expect(checkUpdate).toHaveBeenCalledTimes(1));
    expect(bridge.update).not.toHaveBeenCalled();
  });

  it('never reports up to date when the status could not be read', async () => {
    const bridge = makeBridge({
      initial: { status: null, catalog: null, source: null, failed: false },
    });
    renderCard(bridge);
    await waitFor(() => expect(bridge.load).toHaveBeenCalled());
    const updateRow = screen.getByText('harnessVersionUpdate').closest('.adl-settings-row');
    expect(updateRow).not.toBeNull();
    expect(within(updateRow as HTMLElement).queryByText('harnessVersionNoUpdate')).toBeNull();
    expect(within(updateRow as HTMLElement).queryByText('harnessVersionHasUpdate')).toBeNull();
  });

  it('hides manage rows until the adapter reports a ready source', async () => {
    const bridge = dshBridge({
      initial: snapshot({
        source: {
          mode: 'auto',
          ready: false,
          managed: true,
        },
      }),
    });
    renderCard(bridge);
    await screen.findByText('harnessVersionCurrent');
    expect(screen.queryByRole('button', { name: 'harnessVersionUpdate' })).toBeNull();
    expect(screen.queryByText('dshOfficialStable')).toBeNull();
  });

  it('keeps the last task row through the restart tail and falls back to finalizing', async () => {
    let resolveInstall!: (result: HarnessVersionResult) => void;
    const installPromise = new Promise<HarnessVersionResult>((resolve) => {
      resolveInstall = resolve;
    });
    let polls = 0;
    const bridge = dshBridge();
    bridge.install = vi.fn(() => installPromise);
    bridge.getTask = vi.fn(async () =>
      polls++ === 0
        ? {
            kind: 'dsh-install' as const,
            version: '1.2.0',
            phase: 'installing' as const,
            percent: null,
            done: 3,
            total: 10,
            cancellable: true,
          }
        : null,
    );
    bridge.taskStageText = (task) => (task ? 'dshTaskStageInstalling' : 'dshTaskStageFinalizing');

    renderCard(bridge);
    await waitFor(() =>
      expect(within(channelRow('stable')).getByRole('button', { name: '1.1.0' })).toBeTruthy(),
    );
    openChannelMenu('stable', '1.1.0');
    pickChannelVersion('1.2.0');

    vi.useFakeTimers();
    fireEvent.click(
      within(channelRow('stable')).getByRole('button', { name: 'harnessVersionInstall' }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(screen.getByText('dshTaskStageInstalling')).toBeInTheDocument();
    expect(screen.getByText('3/10')).toBeInTheDocument();

    // 后端任务先归零、操作仍未结束：行继续显示，文案切到「收尾中」而不是消失。
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(screen.getByText('dshTaskStageFinalizing')).toBeInTheDocument();
    expect(screen.queryByText('3/10')).toBeNull();

    await act(async () => {
      resolveInstall(OK);
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it('renders the current version row as a single value without update or source hints', async () => {
    const bridge = makeBridge();
    renderCard(bridge);
    await waitFor(() => expect(bridge.load).toHaveBeenCalled());

    const currentRow = document.querySelector(
      '[data-settings-row="harnessVersionCurrent"]',
    ) as HTMLElement;
    const readout = currentRow.querySelector('.adl-harness-version__readout') as HTMLElement;
    expect(readout.textContent?.trim()).toBe('1.0.0');
    expect(readout.children).toHaveLength(1);
    expect(readout.querySelectorAll('.adl-harness-version__readout-value')).toHaveLength(1);
  });

  it('renders the reset row when the adapter opts into resetSourceAction', async () => {
    const bridge = makeBridge({
      capabilities: { resetSourceAction: true },
      initial: snapshot({
        source: { mode: 'host', ready: true },
      }),
    });
    const { unmount } = renderCard(bridge);

    await waitFor(() => expect(bridge.load).toHaveBeenCalled());
    const resetButton = screen.getByRole('button', { name: 'harnessVersionResetDefaults' });
    expect(resetButton).toBeEnabled();
    fireEvent.click(resetButton);
    await waitFor(() => expect(bridge.resetSourceMode).toHaveBeenCalledTimes(1));
    unmount();

    // auto 下恢复默认无意义：按钮禁用。
    const autoBridge = makeBridge({ capabilities: { resetSourceAction: true } });
    const second = renderCard(autoBridge);
    await waitFor(() => expect(autoBridge.load).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'harnessVersionResetDefaults' })).toBeDisabled();
    second.unmount();
  });
});

describe('HarnessVersionCard layout adjustments', () => {
  it('renders only the five baseline rows (no system path, manual, banner or installed card)', async () => {
    const bridge = dshBridge({
      initial: snapshot({ status: status({ currentSelected: null, installed: [] }) }),
    });
    renderCard(bridge);
    await waitFor(() => expect(bridge.load).toHaveBeenCalled());

    const rows = [
      ...document.querySelectorAll('.adl-harness-version .adl-settings-card > .adl-settings-row'),
    ]
      .map((row) => row.getAttribute('data-settings-row'))
      .filter((row): row is string => row !== null);
    expect(rows).toEqual([
      'harnessVersionSourceTitle',
      'harnessVersionCurrent',
      'harnessVersionUpdate',
      'dshOfficialStable',
      'dshPrereleaseTitle',
    ]);
    expect(document.querySelector('.adl-harness-version input')).toBeNull();
  });

  it('renders the discovered-version notes as badges under the update row instead of the current row', async () => {
    const bridge = makeBridge({
      initial: snapshot({
        status: status({
          latestAvailable: '1.2.0',
          hasUpdate: true,
          prereleaseAvailable: '2.0.0-rc.2',
          hasPrereleaseUpdate: true,
        }),
      }),
    });
    renderCard(bridge);
    await waitFor(() => expect(bridge.load).toHaveBeenCalled());

    const currentRow = document.querySelector(
      '[data-settings-row="harnessVersionCurrent"]',
    ) as HTMLElement;
    const updateRow = document.querySelector(
      '[data-settings-row="harnessVersionUpdate"]',
    ) as HTMLElement;
    expect(currentRow.querySelectorAll('.adl-harness-version__update-badge')).toHaveLength(0);
    const badges = updateRow.querySelectorAll('.adl-harness-version__update-badge');
    expect(badges).toHaveLength(2);
    // 徽章只由文字构成（规格明确不要向上箭头），文字之间保留空格便于读屏。
    expect(badges[0].querySelector('svg')).toBeNull();
    expect(badges[0].textContent?.trim()).toBe(
      'harnessVersionNewBadge harnessVersionStableBadge 1.2.0',
    );
    expect(badges[1].textContent?.trim()).toBe(
      'harnessVersionNewBadge harnessVersionPrereleaseBadge 2.0.0-rc.2',
    );
  });

  it('keeps installed versions outside the catalog window manageable', async () => {
    // OpenCode 目录只保留最近 50+50；更早安装的版本不在任何通道里。
    // 删除「已安装版本」独立卡后，通道行是该版本唯一的切换/卸载/重装入口。
    const bridge = makeBridge({
      initial: snapshot({
        status: status({ currentSelected: '0.9.0', installed: ['0.9.0'] }),
        catalog: {
          stable: [{ version: '1.2.0', publishedAt: null }],
          prerelease: [],
          latestStable: '1.2.0',
          latestPrerelease: null,
        },
      }),
    });
    renderCard(bridge);
    await waitFor(() => expect(bridge.load).toHaveBeenCalled());

    const stableRow = channelRow('stable');
    expect(within(stableRow).getByRole('button', { name: '0.9.0' })).toBeInTheDocument();
    expect(
      within(stableRow).getByRole('button', { name: 'harnessVersionUninstall' }),
    ).toBeInTheDocument();
  });

  it('buckets out-of-catalog versions by semver pre-release and never duplicates them', async () => {
    const bridge = makeBridge({
      initial: snapshot({
        status: status({
          currentSelected: '1.2.3+build-7',
          installed: ['1.2.3+build-7', '0.0.0-beta-202601010000', '1.0.0'],
        }),
        catalog: {
          stable: [{ version: '1.0.0', publishedAt: null }],
          prerelease: [],
          latestStable: '1.0.0',
          latestPrerelease: null,
        },
      }),
    });
    renderCard(bridge);
    await waitFor(() => expect(bridge.load).toHaveBeenCalled());

    // `1.2.3+build-7` 是正式版（+build 段不算预发布）；预发布只认 semver pre 段。
    expect(
      within(channelRow('stable')).getByRole('button', { name: '1.2.3+build-7' }),
    ).toBeInTheDocument();
    openChannelMenu('stable', '1.2.3+build-7');
    const stableOptions = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(stableOptions.filter((o) => o.textContent?.includes('1.2.3+build-7'))).toHaveLength(1);
    expect(stableOptions.some((o) => o.textContent?.includes('0.0.0-beta'))).toBe(false);
    fireEvent.keyDown(document, { key: 'Escape' });

    const prereleaseRow = channelRow('prerelease');
    expect(
      within(prereleaseRow).getByRole('button', { name: '0.0.0-beta-202601010000' }),
    ).toBeInTheDocument();
    // 目录内已存在的版本不重复追加。
    openChannelMenu('stable', '1.2.3+build-7');
    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options.filter((o) => o.textContent?.includes('1.0.0'))).toHaveLength(1);
  });

  it('uses the git-visualization arc icon for every configured row refresh button', async () => {
    const bridge = makeBridge({
      capabilities: {
        refreshRows: { source: true, current: true, stable: true, prerelease: true },
      },
    });
    renderCard(bridge);
    await waitFor(() => expect(bridge.load).toHaveBeenCalled());

    const rows = [
      document.querySelector('[data-settings-row="harnessVersionSourceTitle"]') as HTMLElement,
      document.querySelector('[data-settings-row="harnessVersionCurrent"]') as HTMLElement,
      channelRow('stable'),
      channelRow('prerelease'),
    ];
    for (const row of rows) {
      const button = within(row).getByRole('button', { name: /settingsRefreshAria/ });
      expect(button.querySelector('svg path')?.getAttribute('d')).toBe(REFRESH_ARC_PATH);
    }
    // 检查更新行不再提供行级刷新（由行内检查按钮 / 块级刷新承担）。
    const updateRow = document.querySelector(
      '[data-settings-row="harnessVersionUpdate"]',
    ) as HTMLElement;
    expect(within(updateRow).queryByRole('button', { name: /settingsRefreshAria/ })).toBeNull();
  });

  it('refreshing one row never disables other rows or the update action', async () => {
    const bridge = makeBridge({
      capabilities: {
        refreshRows: { source: true, current: true, stable: true, prerelease: true },
      },
    });
    renderCard(bridge);
    await waitFor(() => expect(bridge.load).toHaveBeenCalled());

    fireEvent.click(
      within(channelRow('stable')).getByRole('button', { name: /settingsRefreshAria/ }),
    );

    expect(screen.getByRole('button', { name: 'harnessVersionUpdateAction' })).not.toBeDisabled();
    const currentRow = document.querySelector(
      '[data-settings-row="harnessVersionCurrent"]',
    ) as HTMLElement;
    expect(
      within(currentRow).getByRole('button', { name: /settingsRefreshAria/ }),
    ).not.toBeDisabled();
  });

  it('serializes row refreshes and keeps per-row spinners', async () => {
    const resolvers: ((value: HarnessVersionSnapshot) => void)[] = [];
    const bridge = makeBridge({
      capabilities: {
        refreshRows: { source: true, current: true, stable: true, prerelease: true },
      },
      load: vi.fn(
        () =>
          new Promise<HarnessVersionSnapshot>((resolve) => {
            resolvers.push(resolve);
          }),
      ),
    });
    renderCard(bridge);
    await waitFor(() => expect(resolvers).toHaveLength(1));

    // 首屏快照尚未返回时也可点行刷新（种子已渲染）；第一个行刷新立即发起。
    fireEvent.click(
      within(channelRow('stable')).getByRole('button', { name: /settingsRefreshAria/ }),
    );
    await waitFor(() => expect(resolvers).toHaveLength(2));

    // 第二个行刷新只排队，不并发发起 load。
    fireEvent.click(
      within(channelRow('prerelease')).getByRole('button', { name: /settingsRefreshAria/ }),
    );
    expect(resolvers).toHaveLength(2);

    act(() => resolvers[1](snapshot()));
    await waitFor(() => expect(resolvers).toHaveLength(3));
    await waitFor(() =>
      expect(
        within(channelRow('stable')).getByRole('button', { name: /settingsRefreshAria/ }),
      ).toHaveAttribute('aria-busy', 'false'),
    );
    expect(
      within(channelRow('prerelease')).getByRole('button', { name: /settingsRefreshAria/ }),
    ).toHaveAttribute('aria-busy', 'true');
    act(() => resolvers[2](snapshot()));
    act(() => resolvers[0](snapshot()));
  });

  it('ignores a stale load response that arrives after a newer refresh', async () => {
    const resolvers: ((value: HarnessVersionSnapshot) => void)[] = [];
    const bridge = makeBridge({
      capabilities: { refreshRows: { current: true } },
      load: vi.fn(
        () =>
          new Promise<HarnessVersionSnapshot>((resolve) => {
            resolvers.push(resolve);
          }),
      ),
    });
    renderCard(bridge);
    await waitFor(() => expect(resolvers).toHaveLength(1));
    const currentRow = document.querySelector(
      '[data-settings-row="harnessVersionCurrent"]',
    ) as HTMLElement;

    // 首屏未返回时点当前版本行刷新（后发起的 load 才算数）。
    fireEvent.click(within(currentRow).getByRole('button', { name: /settingsRefreshAria/ }));
    await waitFor(() => expect(resolvers).toHaveLength(2));
    act(() =>
      resolvers[1](
        snapshot({
          status: status({
            currentSelected: '1.2.0',
            installed: ['1.2.0'],
            latestAvailable: '1.2.0',
          }),
        }),
      ),
    );
    await waitFor(() => expect(within(currentRow).getByText('1.2.0')).toBeTruthy());

    // 旧的首屏响应后到：不得把读数回退到 1.0.0。
    act(() => resolvers[0](snapshot()));
    expect(within(currentRow).queryByText('1.0.0')).toBeNull();
    expect(within(currentRow).getByText('1.2.0')).toBeTruthy();
  });

  it('reports card busy state so hosts can disable the block refresh', async () => {
    const onBusyChange = vi.fn();
    const bridge = makeBridge({ available: false });
    render(
      <TCopyProvider t={mockT} locale="en-US">
        <HarnessVersionCard bridge={bridge} onBusyChange={onBusyChange} />
      </TCopyProvider>,
    );
    await waitFor(() => expect(onBusyChange).toHaveBeenCalledWith(true));
  });

  it('gates the block refresh and keeps it on the same serial queue as row refreshes', async () => {
    const resolvers: ((value: HarnessVersionSnapshot) => void)[] = [];
    const bridge = makeBridge({
      capabilities: { refreshRows: { stable: true } },
      load: vi.fn(
        () =>
          new Promise<HarnessVersionSnapshot>((resolve) => {
            resolvers.push(resolve);
          }),
      ),
    });
    const ref = createRef<HarnessVersionCardHandle>();
    render(
      <TCopyProvider t={mockT} locale="en-US">
        <HarnessVersionCard bridge={bridge} ref={ref} />
      </TCopyProvider>,
    );
    await waitFor(() => expect(resolvers).toHaveLength(1));

    // 行刷新先入队；块刷新必须排在它之后，不并发发起第三个 load。
    fireEvent.click(
      within(channelRow('stable')).getByRole('button', { name: /settingsRefreshAria/ }),
    );
    await waitFor(() => expect(resolvers).toHaveLength(2));
    void ref.current?.refreshAll();
    expect(resolvers).toHaveLength(2);

    act(() => resolvers[1](snapshot()));
    await waitFor(() => expect(resolvers).toHaveLength(3));
    act(() => resolvers[2](snapshot()));
    act(() => resolvers[0](snapshot()));
  });

  it('keeps the current readout when a refresh fails but data is still available', async () => {
    const bridge = makeBridge({
      initial: snapshot({ failed: true }),
    });
    renderCard(bridge);
    await waitFor(() => expect(bridge.load).toHaveBeenCalled());
    const currentRow = document.querySelector(
      '[data-settings-row="harnessVersionCurrent"]',
    ) as HTMLElement;
    expect(within(currentRow).getByText('1.0.0')).toBeTruthy();
    expect(within(currentRow).queryByText('harnessVersionLoadFailed')).toBeNull();
  });

  it('surfaces an explicit block refresh failure once', async () => {
    const bridge = makeBridge({
      load: vi.fn(async () =>
        snapshot({ status: null, catalog: null, source: null, failed: true }),
      ),
    });
    const ref = createRef<HarnessVersionCardHandle>();
    render(
      <TCopyProvider t={mockT} locale="en-US">
        <HarnessVersionCard bridge={bridge} ref={ref} />
      </TCopyProvider>,
    );
    await waitFor(() => expect(bridge.load).toHaveBeenCalled());
    expect(bridge.notify).not.toHaveBeenCalled();

    await act(async () => {
      await ref.current?.refreshAll();
    });
    expect(bridge.notify).toHaveBeenCalledWith('harnessVersionLoadFailed', 'error');
  });
});
