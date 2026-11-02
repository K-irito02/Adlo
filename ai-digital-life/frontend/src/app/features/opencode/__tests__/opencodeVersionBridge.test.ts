import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CopyDict } from '@i18n';
import type { OpencodeBridge, OpencodeSourceStatus } from '@shared/ipc/opencode';
import type { DshSourceConfig, DshTestResult } from '@shared/ipc/dsh';
import {
  createOpencodeVersionBridge,
  peekOpencodeSource,
  resetOpencodeSnapshotCache,
} from '../opencodeVersionBridge';

beforeEach(() => {
  resetOpencodeSnapshotCache();
});

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

const ok = <T>(data: T) => ({ ok: true as const, data });
const err = (message: string) => ({ ok: false as const, error: { code: 'x', message } });

function sourceStatus(overrides: Partial<OpencodeSourceStatus> = {}): OpencodeSourceStatus {
  return {
    system: { path: 'C:/Program Files/opencode/opencode.exe', version: '1.2.0' },
    versionSource: {
      mode: 'auto',
      effective: 'host',
      resolvedByMode: { auto: 'host', host: 'host', system: 'system' },
      hostVersion: '1.3.0',
    },
    config: {
      version_source: 'auto',
      source_mode: 'auto',
      npm_registry: 'https://registry.npmjs.org',
    },
    terminalInjection: true,
    ...overrides,
  };
}

function makeBridge(
  bridge: Partial<OpencodeBridge> = {},
  deps: {
    testSource?: (url: string, silent?: boolean) => Promise<DshTestResult | null>;
    saveSourceConfig?: (config: DshSourceConfig, silent?: boolean) => Promise<boolean>;
    notify?: (message: string, tone: string) => void;
    onSource?: (source: OpencodeSourceStatus | null) => void;
    t?: CopyDict;
  } = {},
) {
  const raw = {
    getVersionTask: vi.fn(async () => ok({ task: null })),
    cancelVersionTask: vi.fn(async () => ok(true)),
    getVersionStatus: vi.fn(async () =>
      ok({
        currentSelected: '1.3.0',
        installed: ['1.3.0'],
        latestAvailable: '1.4.0',
        hasUpdate: true,
        prereleaseAvailable: null,
        hasPrereleaseUpdate: false,
        prereleaseUnknown: false,
      }),
    ),
    getVersionCatalog: vi.fn(async () =>
      ok({ stable: [], prerelease: [], latestStable: null, latestPrerelease: null }),
    ),
    installVersion: vi.fn(async () => ok('1.4.0')),
    update: vi.fn(async () => ok('1.4.0')),
    revert: vi.fn(async () => ok('1.3.0')),
    uninstall: vi.fn(async () => ok(true)),
    reinstall: vi.fn(async () => ok('1.3.0')),
    getSourceStatus: vi.fn(async () => ok(sourceStatus())),
    saveVersionSource: vi.fn(async () => ok(true)),
    setTerminalInjection: vi.fn(async () => ok(true)),
    ...bridge,
  } as OpencodeBridge;
  const adapter = createOpencodeVersionBridge({
    bridge: raw,
    toolName: 'OpenCode CLI',
    t: deps.t ?? mockT,
    testSource: deps.testSource ?? (async () => null),
    saveSourceConfig: deps.saveSourceConfig ?? (async () => true),
    notify: deps.notify ?? (() => {}),
    onSource: deps.onSource,
  });
  return { raw, adapter };
}

describe('opencodeVersionBridge', () => {
  it('declares the OpenCode capabilities (check-only update, refresh rows)', () => {
    const { adapter } = makeBridge();
    expect(adapter.capabilities).toMatchObject({
      updateAction: 'check',
      taskCounts: false,
      resetSourceAction: false,
      uninstallConfirm: false,
      refreshRows: { source: true, current: true, stable: true, prerelease: true },
      sourceManaged: true,
    });
    expect(adapter.labels).toMatchObject({
      stable: 'opencodeStable',
      prerelease: 'opencodePrerelease',
    });
    expect(adapter.formatVersion?.('0.0.0-beta-202608110357')).toBe('beta-202608110357');
    expect(adapter.formatVersion?.('1.19.5')).toBe('1.19.5');
  });

  it('exposes the cached source status for group remounts', async () => {
    const { adapter } = makeBridge();
    expect(peekOpencodeSource()).toBeNull();
    await adapter.load();
    expect(peekOpencodeSource()?.config.npm_registry).toBe('https://registry.npmjs.org');
  });

  it('optimises the auto source before installing and never in manual mode', async () => {
    const saveSourceConfig = vi.fn(async () => true);
    const probe = (latency: number) => ({ reachable: true, latency_ms: latency, error: null });
    const testSource = vi.fn(async (url: string) =>
      url.includes('npmmirror') ? probe(10) : probe(90),
    );
    const { raw, adapter } = makeBridge({}, { testSource, saveSourceConfig });

    await adapter.load();
    const installed = await adapter.install('1.4.0');
    expect(installed).toMatchObject({ ok: true, message: 'harnessVersionInstalledVersion' });
    expect(testSource).toHaveBeenCalledTimes(2);
    expect(saveSourceConfig).toHaveBeenCalledWith(
      { source_mode: 'auto', npm_registry: 'https://registry.npmmirror.com' },
      true,
    );
    expect(raw.installVersion).toHaveBeenCalledWith('1.4.0', true);

    saveSourceConfig.mockClear();
    testSource.mockClear();
    raw.getSourceStatus = vi.fn(async () =>
      ok(
        sourceStatus({
          config: {
            version_source: 'auto',
            source_mode: 'manual',
            npm_registry: 'https://registry.npmjs.org',
          },
        }),
      ),
    );
    const manual = makeBridge(raw, { testSource, saveSourceConfig });
    await manual.adapter.load();
    await manual.adapter.install('1.4.0');
    expect(testSource).not.toHaveBeenCalled();
    expect(saveSourceConfig).not.toHaveBeenCalled();
    expect(raw.installVersion).toHaveBeenCalledWith('1.4.0', true);
  });

  it('maps revert/uninstall/reinstall/update/cancel to the raw bridge', async () => {
    const { raw, adapter } = makeBridge();

    await adapter.revert('1.3.0');
    await adapter.uninstall('1.3.0');
    await adapter.reinstall();
    await adapter.update();
    await adapter.cancel();

    expect(raw.revert).toHaveBeenCalledWith('1.3.0');
    expect(raw.uninstall).toHaveBeenCalledWith('1.3.0');
    expect(raw.reinstall).toHaveBeenCalledTimes(1);
    expect(raw.update).toHaveBeenCalledTimes(1);
    expect(raw.cancelVersionTask).toHaveBeenCalledTimes(1);
  });

  it('seeds the card snapshot from the module cache after load', async () => {
    const { adapter } = makeBridge();
    expect(adapter.peekSnapshot?.()).toBeNull();
    await adapter.load();
    expect(adapter.peekSnapshot?.()?.status).toMatchObject({ currentSelected: '1.3.0' });
    expect(adapter.peekSourceMode?.()).toBe('auto');
  });

  it('marks the catalog as failed so channels show unknown instead of "none published"', async () => {
    const { adapter } = makeBridge({
      getVersionCatalog: vi.fn(async () => err('network down')),
    });

    const snapshot = await adapter.load();

    expect(snapshot.catalog).toBeNull();
    expect(snapshot.catalogFailed).toBe(true);
    expect(adapter.peekSnapshot?.()?.catalogFailed).toBe(true);
  });

  it('keeps catalogFailed false when the catalog leg succeeds', async () => {
    const { adapter } = makeBridge();

    const snapshot = await adapter.load();

    expect(snapshot.catalogFailed).toBe(false);
  });

  it('maps the source mode both ways and resets to auto', async () => {
    const { raw, adapter } = makeBridge();

    await adapter.saveSourceMode('system');
    await adapter.resetSourceMode();

    expect(raw.saveVersionSource).toHaveBeenNthCalledWith(1, 'system');
    expect(raw.saveVersionSource).toHaveBeenNthCalledWith(2, 'auto');
  });

  it('checkUpdate notifies the three states without installing', async () => {
    const notify = vi.fn();
    const { raw, adapter } = makeBridge({}, { notify });
    // 有新版本 → 成功提示新版本。
    await expect(adapter.checkUpdate?.()).resolves.toEqual({ ok: true });
    expect(notify).toHaveBeenCalledWith('opencodeCheckUpdateFound', 'success');
    expect(raw.update).not.toHaveBeenCalled();

    // 已是最新 → 成功提示已是最新。
    notify.mockClear();
    raw.getVersionStatus = vi.fn(async () =>
      ok({
        currentSelected: '1.4.0',
        installed: ['1.4.0'],
        latestAvailable: '1.4.0',
        hasUpdate: false,
        prereleaseAvailable: null,
        hasPrereleaseUpdate: false,
        prereleaseUnknown: false,
      }),
    );
    await expect(adapter.checkUpdate?.()).resolves.toEqual({ ok: true });
    expect(notify).toHaveBeenCalledWith('harnessVersionNoUpdate', 'success');
  });

  it('checkUpdate reports a failed check when the status leg fails', async () => {
    const notify = vi.fn();
    const { raw, adapter } = makeBridge(
      { getVersionStatus: vi.fn(async () => err('status failed')) },
      { notify },
    );
    await expect(adapter.checkUpdate?.()).resolves.toEqual({ ok: true });
    expect(notify).toHaveBeenCalledWith('opencodeCheckUpdateFailed', 'error');
    expect(raw.update).not.toHaveBeenCalled();
  });

  it('passes the terminal-injection source data through the snapshot slot', async () => {
    const { adapter } = makeBridge();
    const snapshot = await adapter.load();

    expect(snapshot.source).toMatchObject({
      mode: 'auto',
      ready: true,
    });
    expect(snapshot.sourceExtra).toMatchObject({
      terminalInjection: true,
      config: { npm_registry: 'https://registry.npmjs.org' },
    });
  });

  it('maps an IPC error to a result and treats an offline bridge as unavailable', async () => {
    const { raw, adapter } = makeBridge({
      installVersion: vi.fn(async () => err('install failed')),
    });

    await expect(adapter.install('9.9.9')).resolves.toMatchObject({
      ok: false,
      error: 'install failed',
    });
    expect(raw.installVersion).toHaveBeenCalledWith('9.9.9', true);

    const offline = createOpencodeVersionBridge({
      bridge: undefined,
      toolName: 'OpenCode CLI',
      t: mockT,
      testSource: async () => null,
      saveSourceConfig: async () => true,
      notify: () => {},
    });
    expect(offline.available).toBe(false);
    await expect(offline.install('1.0.0')).resolves.toMatchObject({ ok: false });
  });

  it('reports the snapshot source through onSnapshot (null when the leg failed)', async () => {
    const onSource = vi.fn();
    const { adapter } = makeBridge({}, { onSource });
    const snapshot = await adapter.load();
    adapter.onSnapshot?.(snapshot);
    expect(onSource).toHaveBeenLastCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ npm_registry: 'https://registry.npmjs.org' }),
      }),
    );

    adapter.onSnapshot?.({
      status: null,
      catalog: null,
      source: null,
      sourceExtra: null,
      failed: true,
    });
    expect(onSource).toHaveBeenLastCalledWith(null);
  });

  it('formats prerelease versions in install and check-update toasts but sends the raw version', async () => {
    const notify = vi.fn();
    const t = new Proxy({} as Record<string, string>, {
      get: (_, key) =>
        key === 'harnessVersionInstalledVersion'
          ? 'installed {version}'
          : key === 'opencodeCheckUpdatePrerelease'
            ? 'prerelease {version}'
            : typeof key === 'string'
              ? key
              : '',
    }) as unknown as CopyDict;
    const { raw, adapter } = makeBridge(
      {
        getVersionStatus: vi.fn(async () =>
          ok({
            currentSelected: '1.0.0',
            installed: ['1.0.0'],
            latestAvailable: null,
            hasUpdate: false,
            prereleaseAvailable: '0.0.0-beta-202608110357',
            hasPrereleaseUpdate: true,
            prereleaseUnknown: false,
          }),
        ),
      },
      { notify, t },
    );

    await expect(adapter.install('0.0.0-beta-202608110357')).resolves.toMatchObject({
      ok: true,
      message: 'installed beta-202608110357',
    });
    expect(raw.installVersion).toHaveBeenCalledWith('0.0.0-beta-202608110357', true);

    await adapter.checkUpdate?.();
    expect(notify).toHaveBeenCalledWith('prerelease beta-202608110357', 'success');
  });

  it('mirrors the DSH stage labels (download when total is unknown, no counts)', () => {
    const { adapter } = makeBridge();
    const base = {
      kind: 'dsh-install' as const,
      version: '1.4.0',
      percent: 40,
      done: 4,
      total: 10,
      cancellable: true,
    };

    expect(adapter.taskStageText?.({ ...base, phase: 'preparing' })).toBe(
      'harnessVersionPhasePreparing',
    );
    expect(adapter.taskStageText?.({ ...base, phase: 'installing', total: 0 })).toBe(
      'harnessVersionPhaseDownloading',
    );
    expect(adapter.taskStageText?.({ ...base, phase: 'installing' })).toBe(
      'harnessVersionPhaseInstalling',
    );
    expect(adapter.taskStageText?.({ ...base, phase: 'removing' })).toBe(
      'harnessVersionPhaseRemoving',
    );
    expect(adapter.taskStageText?.({ ...base, phase: 'removing', total: 0 })).toBe(
      'harnessVersionPhasePreparing',
    );
    expect(adapter.taskStageText?.({ ...base, phase: 'finalizing' })).toBe(
      'harnessVersionPhaseFinalizing',
    );
    expect(adapter.taskStageText?.(null)).toBe('harnessVersionPhaseFinalizing');
    expect(adapter.taskCancelLabel).toBeUndefined();
  });

  it('returns the task from the raw bridge and null when the read fails', async () => {
    const task = {
      kind: 'dsh-install' as const,
      version: '1.4.0',
      phase: 'installing' as const,
      percent: 40,
      done: 4,
      total: 10,
      cancellable: true,
    };
    const { raw, adapter } = makeBridge({
      getVersionTask: vi.fn(async () => ok({ task })),
    });
    await expect(adapter.getTask()).resolves.toEqual(task);

    raw.getVersionTask = vi.fn(async () => err('task failed'));
    await expect(adapter.getTask()).resolves.toBeNull();
  });
});
