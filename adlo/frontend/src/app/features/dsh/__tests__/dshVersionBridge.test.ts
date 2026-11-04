import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CopyDict } from '@i18n';
import { useAppStore } from '@stores/slicedStore';
import type { DshBridge, DshSourceStatus, DshVersionStatus, DshVersionTask } from '@shared/ipc/dsh';
import { createDshVersionBridge, type DshVersionBridgeActions } from '../dshVersionBridge';

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

const BRIDGE = {} as DshBridge;

function status(overrides: Partial<DshVersionStatus> = {}): DshVersionStatus {
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

function sourceStatus(overrides: Partial<DshSourceStatus> = {}): DshSourceStatus {
  return {
    system: { path: 'C:/Program Files/dsh/dsh.exe', version: '0.9.0' },
    running: null,
    versionSource: {
      mode: 'auto',
      effective: 'host',
      resolvedByMode: { auto: 'host', host: 'host', system: 'system' },
      hostVersion: '1.0.0',
    },
    config: {
      npm_registry: 'https://registry.npmjs.org',
      dsh_mirror: null,
      source_mode: 'manual',
      version_source: 'auto',
      proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
    },
    ...overrides,
  };
}

function makeActions(overrides: Partial<DshVersionBridgeActions> = {}): DshVersionBridgeActions {
  return {
    fetchDshSettingsSnapshot: vi.fn(async () => true),
    fetchSourceStatus: vi.fn(async () => true),
    fetchVersionTask: vi.fn(async () => undefined),
    fetchDshVersionStatus: vi.fn(async () => true),
    fetchVersionCatalog: vi.fn(async () => true),
    cancelVersionTask: vi.fn(async () => true),
    updateDsh: vi.fn(async () => true),
    revertDsh: vi.fn(async () => true),
    uninstallDsh: vi.fn(async () => true),
    reinstallDsh: vi.fn(async () => true),
    installDshVersion: vi.fn(async () => true),
    saveSourceConfig: vi.fn(async () => true),
    restartDsh: vi.fn(async () => ({
      restarted: true,
      url: 'http://127.0.0.1:3080/?token=abc',
      failed: false,
    })),
    ...overrides,
  };
}

function makeBridge(
  actions: DshVersionBridgeActions,
  deps: {
    notify?: (message: string, tone: string) => void;
    changeSourceMode?: (mode: 'auto' | 'system' | 'host') => Promise<{ ok: boolean }>;
    t?: CopyDict;
  } = {},
) {
  return createDshVersionBridge({
    bridge: BRIDGE,
    toolName: 'DSH',
    t: deps.t ?? mockT,
    actions,
    notify: deps.notify ?? (() => {}),
    changeSourceMode: deps.changeSourceMode ?? (async () => ({ ok: true })),
  });
}

beforeEach(() => {
  useAppStore.setState({
    versionStatus: null,
    versionCatalog: null,
    versionCatalogFailed: false,
    settingsSnapshotFailed: false,
    sourceStatus: null,
    versionTask: null,
    versionTaskCancelRequested: false,
    dshVersionSourceDeferred: false,
    dshVersionSourcePending: null,
    dshLastUrl: null,
    dshRestarting: false,
    dshOpBusy: false,
    toasts: [],
  });
});

describe('dshVersionBridge', () => {
  it('maps install to installDshVersion(version, true)', async () => {
    const actions = makeActions();
    const bridge = makeBridge(actions);

    await expect(bridge.install('1.2.3')).resolves.toMatchObject({ ok: true });
    expect(actions.installDshVersion).toHaveBeenCalledWith('1.2.3', true);
  });

  it('reinstalls a non-current version with select=false and reports the only-saved wording', async () => {
    const actions = makeActions();
    const bridge = makeBridge(actions);

    await expect(bridge.reinstallVersion?.('1.1.0')).resolves.toMatchObject({
      ok: true,
      message: 'dshReinstalledOnly',
    });
    expect(actions.installDshVersion).toHaveBeenCalledWith('1.1.0', false);
    expect(actions.restartDsh).not.toHaveBeenCalled();
  });

  it('maps revert/uninstall/reinstall/update/cancel to the dsh actions', async () => {
    const actions = makeActions();
    const bridge = makeBridge(actions);

    await bridge.revert('1.1.0');
    await bridge.uninstall('1.1.0');
    await bridge.reinstall();
    await bridge.update();
    await bridge.cancel();

    expect(actions.revertDsh).toHaveBeenCalledWith('1.1.0');
    expect(actions.uninstallDsh).toHaveBeenCalledWith('1.1.0');
    expect(actions.reinstallDsh).toHaveBeenCalledTimes(1);
    expect(actions.updateDsh).toHaveBeenCalledTimes(1);
    expect(actions.cancelVersionTask).toHaveBeenCalledTimes(1);
  });

  it('reports a failed action silently (the action already recorded the error)', async () => {
    const actions = makeActions({ installDshVersion: vi.fn(async () => false) });
    const bridge = makeBridge(actions);

    const result = await bridge.install('9.9.9');
    expect(result.ok).toBe(false);
    expect(result.cancelled).toBeFalsy();
    expect(result.error).toBeUndefined();
    // 操作结束后释放 store 级 busy 门（否则入口守卫会一直拦截打开）。
    expect(useAppStore.getState().dshOpBusy).toBe(false);
  });

  it('turns a cancel-requested failure into a cancelled result and resets the flag', async () => {
    const actions = makeActions({
      installDshVersion: vi.fn(async () => {
        useAppStore.getState().setVersionTaskCancelRequested(true);
        return false;
      }),
    });
    const bridge = makeBridge(actions);

    await expect(bridge.install('1.2.3')).resolves.toMatchObject({ ok: false, cancelled: true });
    expect(useAppStore.getState().versionTaskCancelRequested).toBe(false);
  });

  it('restarts after a successful switch and reports the restarted toast', async () => {
    const actions = makeActions();
    const bridge = makeBridge(actions);

    await bridge.revert('1.1.0');
    const result = await bridge.afterMutation?.('switch');

    expect(actions.restartDsh).toHaveBeenCalledTimes(1);
    expect(actions.fetchSourceStatus).toHaveBeenCalledWith(true);
    expect(result).toMatchObject({ ok: true, message: 'dshSwitchedRestarted' });
  });

  it('reports only-saved wording when the restart did not actually restart', async () => {
    const actions = makeActions({
      restartDsh: vi.fn(async () => ({ restarted: false, url: null, failed: false })),
    });
    const bridge = makeBridge(actions);

    await bridge.reinstall();
    const result = await bridge.afterMutation?.('reinstall');

    // 无运行进程 + 有可用来源 → 兜底拉起一次；拉起仍失败但不是 failed 时按“仅保存”提示。
    expect(actions.restartDsh).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ ok: true, message: 'dshReinstalledOnly' });
  });

  it('reports the restart failure message so the card shows an error toast', async () => {
    const actions = makeActions({
      restartDsh: vi.fn(async () => ({ restarted: false, url: null, failed: true })),
    });
    const bridge = makeBridge(actions);

    await bridge.install('1.2.3');
    const result = await bridge.afterMutation?.('install');

    expect(result).toMatchObject({ ok: false, error: 'dshRestartFailed' });
  });

  it('does not restart when uninstalling a non-current version', async () => {
    const actions = makeActions();
    const bridge = makeBridge(actions);

    await bridge.uninstall('1.1.0');
    const result = await bridge.afterMutation?.('uninstall');

    expect(actions.restartDsh).not.toHaveBeenCalled();
    expect(actions.fetchSourceStatus).toHaveBeenCalledWith(true);
    expect(result).toMatchObject({ ok: true, message: 'dshUninstallSuccess' });
  });

  it('restarts when uninstalling the current version and names the next selection', async () => {
    useAppStore.setState({ versionStatus: status() });
    const actions = makeActions({
      uninstallDsh: vi.fn(async () => {
        useAppStore.setState({
          versionStatus: status({ currentSelected: '1.1.0', installed: ['1.1.0'] }),
        });
        return true;
      }),
    });
    const bridge = makeBridge(actions);

    await bridge.uninstall('1.0.0');
    const result = await bridge.afterMutation?.('uninstall');

    expect(actions.restartDsh).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, message: 'dshUninstalledSwitched' });
  });

  it('notifies when cancelling the task fails', async () => {
    const notify = vi.fn();
    const actions = makeActions({ cancelVersionTask: vi.fn(async () => false) });
    const bridge = makeBridge(actions, { notify });

    await bridge.cancel();
    expect(notify).toHaveBeenCalledWith('dshVersionCancelFailed', 'error');
  });

  it('saves the tri-state source mode through saveSourceConfig and clears pending', async () => {
    useAppStore.setState({ dshVersionSourcePending: 'system', dshVersionSourceDeferred: true });
    const actions = makeActions();
    const bridge = makeBridge(actions);

    await expect(bridge.saveSourceMode('system')).resolves.toMatchObject({ ok: true });
    expect(actions.saveSourceConfig).toHaveBeenCalledWith({ version_source: 'system' }, true);
    expect(useAppStore.getState().dshVersionSourcePending).toBeNull();
    expect(useAppStore.getState().dshVersionSourceDeferred).toBe(false);
    expect(actions.fetchSourceStatus).toHaveBeenCalledWith(true);
  });

  it('delegates the deferred source change to the wrapper-owned dialog', async () => {
    const changeSourceMode = vi.fn(async () => ({ ok: true }));
    const bridge = makeBridge(makeActions(), { changeSourceMode });

    expect(bridge.capabilities?.sourceModeChange).toBe('deferred');
    await bridge.changeSourceMode?.('system');
    expect(changeSourceMode).toHaveBeenCalledWith('system');
  });

  it('loads the frozen snapshot from the store after fetching it', async () => {
    useAppStore.setState({
      sourceStatus: sourceStatus(),
      versionStatus: status(),
      versionCatalog: {
        stable: [{ version: '1.0.0', publishedAt: null }],
        prerelease: [],
        latestStable: '1.0.0',
        latestPrerelease: null,
      },
    });
    const actions = makeActions();
    const bridge = makeBridge(actions);

    const snapshot = await bridge.load();

    expect(actions.fetchDshSettingsSnapshot).toHaveBeenCalledTimes(1);
    expect(snapshot.status?.currentSelected).toBe('1.0.0');
    expect(snapshot.source).toEqual({
      mode: 'auto',
      ready: true,
      managed: true,
      systemManaged: false,
    });
  });

  it('hides host-managed rows when the preference resolves to the system install', async () => {
    useAppStore.setState({
      sourceStatus: sourceStatus({
        versionSource: {
          mode: 'system',
          effective: 'system',
          resolvedByMode: { auto: 'system', host: 'host', system: 'system' },
          hostVersion: null,
        },
      }),
      versionStatus: status({ currentSelected: null, installed: [] }),
    });
    const bridge = makeBridge(makeActions());

    const snapshot = await bridge.load();
    expect(snapshot.source).toMatchObject({
      mode: 'system',
      managed: false,
      systemManaged: true,
    });
  });

  it('keeps the current-version row while a system switch is only pending', async () => {
    useAppStore.setState({
      sourceStatus: sourceStatus(), // auto → host：本次会话仍在用宿主版本
      dshVersionSourcePending: 'system',
    });
    const bridge = makeBridge(makeActions());

    const snapshot = await bridge.load();
    // 管理行按 pending 隐藏，但系统安装并未生效：当前版本行必须保留。
    expect(snapshot.source).toMatchObject({ managed: false, systemManaged: false });
  });

  it('does not treat a missing system install as system-managed', async () => {
    useAppStore.setState({
      sourceStatus: sourceStatus({
        versionSource: {
          mode: 'system',
          effective: 'none',
          resolvedByMode: { auto: 'none', host: 'none', system: 'none' },
          hostVersion: null,
        },
      }),
    });
    const bridge = makeBridge(makeActions());

    const snapshot = await bridge.load();
    expect(snapshot.source).toMatchObject({ managed: false, systemManaged: false });
  });

  it('returns the task fetched from the store', async () => {
    const task: DshVersionTask = {
      kind: 'dsh-install',
      version: '1.2.3',
      phase: 'installing',
      percent: 40,
      done: 4,
      total: 10,
      cancellable: true,
    };
    const actions = makeActions({
      fetchVersionTask: vi.fn(async () => {
        useAppStore.setState({ versionTask: task });
      }),
    });
    const bridge = makeBridge(actions);

    await expect(bridge.getTask()).resolves.toEqual(task);
  });

  it('is unavailable (actions disabled) when the dsh bridge is missing', () => {
    const bridge = createDshVersionBridge({
      bridge: undefined,
      toolName: 'DSH',
      t: mockT,
      actions: makeActions(),
      notify: () => {},
      changeSourceMode: async () => ({ ok: true }),
    });

    expect(bridge.available).toBe(false);
  });

  // —— 检查更新（只查询）/ 任务文案 / 术语（spec #1 items 1-6） ——

  const checkT = new Proxy({} as Record<string, string>, {
    get: (_, key) =>
      key === 'dshCheckUpdateFound'
        ? '发现新版本 {version}'
        : key === 'dshCheckUpdatePrerelease'
          ? '有新的预发布版本 {version} 可尝试'
          : typeof key === 'string'
            ? key
            : '',
  }) as unknown as CopyDict;

  it('declares the DSH card capabilities and terminology', () => {
    const bridge = makeBridge(makeActions());

    expect(bridge.capabilities).toMatchObject({
      updateAction: 'check',
      taskCounts: true,
      sourceManaged: true,
    });
    expect(bridge.labels).toMatchObject({
      stable: 'dshOfficialStable',
      prerelease: 'dshPrereleaseTitle',
      uninstallCurrentHint: 'dshUninstallCurrentHint',
    });
  });

  it('checks for updates without installing and reports a found version', async () => {
    useAppStore.setState({
      versionStatus: status({ latestAvailable: '1.3.0', hasUpdate: true }),
    });
    const actions = makeActions();
    const notify = vi.fn();
    const bridge = makeBridge(actions, { notify, t: checkT });

    await expect(bridge.checkUpdate?.()).resolves.toMatchObject({ ok: true });

    expect(actions.fetchDshVersionStatus).toHaveBeenCalledTimes(1);
    expect(actions.updateDsh).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('发现新版本 1.3.0', 'success');
    expect(actions.fetchVersionCatalog).toHaveBeenCalledWith(true);
  });

  it('warns when no stable release exists but a prerelease is available', async () => {
    useAppStore.setState({
      versionStatus: status({
        latestAvailable: null,
        hasUpdate: false,
        prereleaseAvailable: '2.0.0-rc.2',
        hasPrereleaseUpdate: true,
      }),
    });
    const notify = vi.fn();
    const bridge = makeBridge(makeActions(), { notify, t: checkT });

    await bridge.checkUpdate?.();
    expect(notify).toHaveBeenCalledWith('有新的预发布版本 2.0.0-rc.2 可尝试', 'success');
    expect(notify).not.toHaveBeenCalledWith('harnessVersionNoUpdate', 'success');
  });

  it('warns instead of claiming up-to-date when no stable version can be resolved', async () => {
    useAppStore.setState({
      versionStatus: status({ latestAvailable: null, hasUpdate: false }),
    });
    const notify = vi.fn();
    const bridge = makeBridge(makeActions(), { notify, t: checkT });

    await bridge.checkUpdate?.();
    expect(notify).toHaveBeenCalledWith('dshCheckUpdateNoStable', 'warning');
  });

  it('reports up to date only when a latest stable version is known', async () => {
    useAppStore.setState({
      versionStatus: status({ latestAvailable: '1.0.0', hasUpdate: false }),
    });
    const notify = vi.fn();
    const bridge = makeBridge(makeActions(), { notify, t: checkT });

    await bridge.checkUpdate?.();
    expect(notify).toHaveBeenCalledWith('harnessVersionNoUpdate', 'success');
  });

  it('reports a check failure instead of guessing from stale state', async () => {
    // 旧 handleCheckUpdate 在抓取失败时直接返回（失败只记全局错误卡片）；
    // 此处额外给一个失败 toast，保证点击必有反馈，且绝不拿旧值报“发现新版”。
    const notify = vi.fn();
    const actions = makeActions({ fetchDshVersionStatus: vi.fn(async () => false) });
    const bridge = makeBridge(actions, { notify, t: checkT });

    await expect(bridge.checkUpdate?.()).resolves.toMatchObject({ ok: true });
    expect(actions.updateDsh).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('dshCheckUpdateFailed', 'error');
    expect(notify).not.toHaveBeenCalledWith('dshCheckUpdateNoStable', 'warning');
  });

  it('owns the DSH stage text (counts inline) and per-kind cancel labels', () => {
    const bridge = makeBridge(makeActions());
    const task: DshVersionTask = {
      kind: 'dsh-install',
      version: '1.2.3',
      phase: 'installing',
      percent: 40,
      done: 4,
      total: 10,
      cancellable: true,
    };

    expect(bridge.taskStageText?.(task)).toBe('dshTaskStageInstalling');
    expect(bridge.taskStageText?.(null)).toBe('dshTaskStageFinalizing');
    expect(bridge.taskStageText?.({ ...task, phase: 'installing', total: 0 })).toBe(
      'dshTaskStageDownloading',
    );
    expect(bridge.taskStageText?.({ ...task, phase: 'removing', total: 0 })).toBe(
      'dshTaskStagePreparing',
    );
    expect(bridge.taskCancelLabel?.(task)).toBe('dshCancelInstall');
    expect(bridge.taskCancelLabel?.({ ...task, kind: 'dsh-uninstall' })).toBe('dshCancelUninstall');
    expect(bridge.taskCancelLabel?.({ ...task, kind: 'dsh-reinstall' })).toBe('dshCancelReinstall');
  });

  it('reports the source as not ready before resolvedByMode arrives', async () => {
    useAppStore.setState({
      sourceStatus: { ...sourceStatus(), versionSource: null } as unknown as DshSourceStatus,
    });
    const bridge = makeBridge(makeActions());

    const snapshot = await bridge.load();
    expect(snapshot.source).toMatchObject({ ready: false, managed: false });
  });
});
