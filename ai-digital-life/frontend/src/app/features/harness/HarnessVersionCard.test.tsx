import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor, within, act } from '@testing-library/react';
import type { CopyDict } from '../../i18n';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { HarnessVersionCard, type HarnessVersionSlots } from './HarnessVersionCard';
import type {
  HarnessVersionBridge,
  HarnessVersionResult,
  HarnessVersionSnapshot,
  HarnessVersionStatus,
} from './harnessVersionBridge';

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) =>
    key === 'harnessVersionTaskCount'
      ? '{done}/{total}'
      : typeof key === 'string'
        ? key
        : '',
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
    source: { mode: 'auto', effective: 'host', systemPath: null },
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

/** DSH 形态：行内双通道选择器 + 卸载确认 + 任务阶段/计数。 */
function dshBridge(
  overrides: Partial<HarnessVersionBridge<unknown>> & { initial?: HarnessVersionSnapshot } = {},
): HarnessVersionBridge<unknown> {
  return makeBridge({
    capabilities: {
      channelPicker: true,
      uninstallConfirm: true,
      taskStageText: true,
      taskCounts: true,
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
  const option = screen
    .getAllByRole('option')
    .find((el) => el.textContent?.includes(version));
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
    capabilities: {},
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

function rowFor(version: string): HTMLElement {
  const row = document.querySelector<HTMLElement>(`[data-harness-version-row="${version}"]`);
  if (!row) {
    throw new Error(`version row not found: ${version}`);
  }
  return row;
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

    await waitFor(() => expect(bridge.load).toHaveBeenCalled());

    const stableSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    await waitFor(() => expect(stableSelect.value).toBe('1.1.0'));
    const stableRow = stableSelect.closest('.adl-settings-row') as HTMLElement;
    fireEvent.click(within(stableRow).getByRole('button', { name: 'harnessVersionInstall' }));

    await waitFor(() => expect(bridge.install).toHaveBeenCalledWith('1.1.0'));
    await waitFor(() =>
      expect(bridge.notify).toHaveBeenCalledWith('harnessVersionInstallStarted', 'success'),
    );
  });

  it('switches to an installed version through the injected bridge', async () => {
    const bridge = makeBridge();
    renderCard(bridge);

    await waitFor(() => expect(bridge.load).toHaveBeenCalled());

    fireEvent.click(within(rowFor('1.1.0')).getByRole('button', { name: 'harnessVersionSwitch' }));

    await waitFor(() => expect(bridge.revert).toHaveBeenCalledWith('1.1.0'));
    await waitFor(() =>
      expect(bridge.notify).toHaveBeenCalledWith('harnessVersionSwitched', 'success'),
    );
  });

  it('marks the current version and disables switching to it', async () => {
    renderCard(makeBridge());

    await waitFor(() => expect(rowFor('1.0.0')).toBeTruthy());

    expect(within(rowFor('1.0.0')).getByText('harnessVersionCurrentBadge')).toBeInTheDocument();
    expect(
      within(rowFor('1.0.0')).getByRole('button', { name: 'harnessVersionSwitch' }),
    ).toBeDisabled();
    expect(
      within(rowFor('1.1.0')).getByRole('button', { name: 'harnessVersionSwitch' }),
    ).toBeEnabled();
  });

  it('disables actions while busy and lets the running task be cancelled', async () => {
    let resolveInstall!: (result: HarnessVersionResult) => void;
    const installPromise = new Promise<HarnessVersionResult>((resolve) => {
      resolveInstall = resolve;
    });
    const bridge = makeBridge();
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
    await waitFor(() => expect(bridge.load).toHaveBeenCalled());

    const stableSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    await waitFor(() => expect(stableSelect.value).toBe('1.0.0'));
    const stableRow = stableSelect.closest('.adl-settings-row') as HTMLElement;

    vi.useFakeTimers();
    fireEvent.click(within(stableRow).getByRole('button', { name: 'harnessVersionInstall' }));

    expect(
      within(rowFor('1.1.0')).getByRole('button', { name: 'harnessVersionSwitch' }),
    ).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(screen.getByText('42%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'harnessVersionCancel' }));
    expect(bridge.cancel).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveInstall(OK);
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it('renders the not-installed and missing-harness guidance for an empty install', async () => {
    renderCard(
      makeBridge({
        initial: snapshot({
          status: status({ currentSelected: null, installed: [] }),
        }),
      }),
    );

    await waitFor(() => expect(screen.getByText('harnessVersionNotInstalled')).toBeInTheDocument());
    expect(screen.getByText('harnessVersionMissingBanner')).toBeInTheDocument();
  });

  it('renders an error readout when the status cannot be loaded', async () => {
    renderCard(
      makeBridge({
        initial: { status: null, catalog: null, source: null, failed: true },
      }),
    );

    await waitFor(() => expect(screen.getByText('harnessVersionLoadFailed')).toBeInTheDocument());
    expect(screen.queryByText('harnessVersionMissingBanner')).not.toBeInTheDocument();
  });

  it('hides host-managed rows when the source reports an unmanaged (system) install', async () => {
    renderCard(
      makeBridge({
        initial: snapshot({
          source: {
            mode: 'system',
            effective: 'system',
            systemPath: 'C:/Program Files/dsh/dsh.exe',
            managed: false,
          },
        }),
      }),
    );

    await waitFor(() => expect(screen.getByText('harnessVersionCurrent')).toBeInTheDocument());
    // 管理行整体隐藏：只剩来源下拉一个 combobox。
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.queryByText('harnessVersionStable')).not.toBeInTheDocument();
    expect(screen.queryByText('harnessVersionManual')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'harnessVersionUpdateAction' })).toBeNull();
    // 来源行与系统路径读数仍可见（用户要能判断当前连的是系统安装）。
    expect(screen.getByText('harnessVersionSourceTitle')).toBeInTheDocument();
    expect(screen.getByText('C:/Program Files/dsh/dsh.exe')).toBeInTheDocument();
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
    const bridge = makeBridge();
    bridge.install = vi.fn(async () => ({ ok: true, message: 'dshInstalledRestarted' }));

    renderCard(bridge);
    await waitFor(() => expect(bridge.load).toHaveBeenCalled());

    const stableSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    const stableRow = stableSelect.closest('.adl-settings-row') as HTMLElement;
    fireEvent.click(within(stableRow).getByRole('button', { name: 'harnessVersionInstall' }));

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

    const sourceSelect = screen.getAllByRole('combobox');
    fireEvent.change(sourceSelect[sourceSelect.length - 1] as HTMLSelectElement, {
      target: { value: 'system' },
    });

    await waitFor(() => expect(changeSourceMode).toHaveBeenCalledWith('system'));
    expect(bridge.notify).not.toHaveBeenCalledWith('harnessVersionSourceSaved', 'success');
  });

  it('reports downloading when the install task has no known total', async () => {
    let resolveInstall!: (result: HarnessVersionResult) => void;
    const installPromise = new Promise<HarnessVersionResult>((resolve) => {
      resolveInstall = resolve;
    });
    const bridge = makeBridge();
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
    await waitFor(() => expect(bridge.load).toHaveBeenCalled());

    const stableSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    const stableRow = stableSelect.closest('.adl-settings-row') as HTMLElement;

    vi.useFakeTimers();
    fireEvent.click(within(stableRow).getByRole('button', { name: 'harnessVersionInstall' }));
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

  // —— 双通道行内选择器（`capabilities.channelPicker`，DSH 形态） ——

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
    expect(menu.getAttribute('aria-label')).toBe('harnessVersionStable');
    expect(within(menu).getAllByRole('option')).toHaveLength(3);
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
    await waitFor(() => expect(channelRow('stable')).toBeTruthy());

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
    await waitFor(() => expect(channelRow('stable')).toBeTruthy());

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
      expect(option.querySelectorAll('.adl-harness-version__menu-item-check')).toHaveLength(1);
    }
    expect(current.querySelector('.adl-harness-version__menu-item-check svg')).toBeTruthy();
    expect(installed.querySelector('.adl-harness-version__menu-item-check svg')).toBeNull();
    expect(within(menu).getAllByRole('option')).toHaveLength(3);
  });

  it('switches row actions with the picked version (installed / fresh / current)', async () => {
    const bridge = dshBridge();
    const reinstallVersion = vi.fn(async () => OK);
    bridge.reinstallVersion = reinstallVersion;
    renderCard(bridge);
    await waitFor(() => expect(channelRow('stable')).toBeTruthy());

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
    await waitFor(() => expect(channelRow('stable')).toBeTruthy());

    const currentUninstall = within(channelRow('stable')).getByRole('button', {
      name: 'harnessVersionUninstall',
    });
    fireEvent.click(currentUninstall);
    expect(bridge.uninstall).not.toHaveBeenCalled();
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

  it('installs a manual version and surfaces an adapter rejection instead of success', async () => {
    const bridge = dshBridge();
    bridge.install = vi.fn(async () => ({ ok: true }));
    renderCard(bridge);
    await waitFor(() => expect(bridge.load).toHaveBeenCalled());

    const input = screen.getByPlaceholderText(
      'harnessVersionManualPlaceholder',
    ) as HTMLInputElement;
    const manualRow = input.closest('.adl-settings-row') as HTMLElement;
    fireEvent.change(input, { target: { value: '0.9.0' } });
    fireEvent.click(within(manualRow).getByRole('button', { name: 'harnessVersionInstall' }));
    await waitFor(() => expect(bridge.install).toHaveBeenCalledWith('0.9.0'));
    await waitFor(() =>
      expect(bridge.notify).toHaveBeenCalledWith('harnessVersionInstallStarted', 'success'),
    );
    expect(input.value).toBe('');
  });

  it('reports an unpublished manual version through the adapter error', async () => {
    const bridge = dshBridge();
    bridge.install = vi.fn(async () => ({ ok: false, error: 'dshInstallFailed' }));
    renderCard(bridge);
    await waitFor(() => expect(bridge.load).toHaveBeenCalled());

    const input = screen.getByPlaceholderText(
      'harnessVersionManualPlaceholder',
    ) as HTMLInputElement;
    const manualRow = input.closest('.adl-settings-row') as HTMLElement;
    fireEvent.change(input, { target: { value: '9.9.9' } });
    fireEvent.click(within(manualRow).getByRole('button', { name: 'harnessVersionInstall' }));

    await waitFor(() =>
      expect(bridge.notify).toHaveBeenCalledWith('dshInstallFailed', 'error'),
    );
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

    renderCard(bridge);
    await waitFor(() => expect(channelRow('stable')).toBeTruthy());

    openChannelMenu('stable', '1.1.0');
    pickChannelVersion('1.2.0');

    vi.useFakeTimers();
    fireEvent.click(
      within(channelRow('stable')).getByRole('button', { name: 'harnessVersionInstall' }),
    );

    // 在途：所有操作控件禁用，只有取消可点。
    expect(within(channelRow('stable')).getByRole('button', { name: '1.2.0' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'harnessVersionUpdateAction' })).toBeDisabled();
    expect(screen.getByPlaceholderText('harnessVersionManualPlaceholder')).toBeDisabled();
    expect(
      within(rowFor('1.0.0')).getByRole('button', { name: 'harnessVersionSwitch' }),
    ).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(screen.getByText('harnessVersionPhaseInstalling')).toBeInTheDocument();
    expect(screen.getByText('42/100')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    const cancel = screen.getByRole('button', { name: 'harnessVersionCancel' });
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
    expect(screen.queryByText('42%')).toBeNull();
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
    await waitFor(() => expect(channelRow('stable')).toBeTruthy());
    expect(
      within(channelRow('stable')).getAllByText('harnessVersionListUnknown').length,
    ).toBe(1);
    expect(
      within(channelRow('prerelease')).getAllByText('harnessVersionListUnknown').length,
    ).toBe(1);
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
    await waitFor(() => expect(channelRow('stable')).toBeTruthy());
    expect(within(channelRow('stable')).getByText('harnessVersionStableEmpty')).toBeTruthy();
    expect(
      within(channelRow('prerelease')).getByText('harnessVersionPrereleaseEmpty'),
    ).toBeTruthy();
  });
});
