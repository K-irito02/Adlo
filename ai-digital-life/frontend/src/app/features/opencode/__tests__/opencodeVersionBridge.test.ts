import { describe, it, expect, vi } from 'vitest';
import type { CopyDict } from '@i18n';
import type { OpencodeBridge, OpencodeSourceStatus } from '@shared/ipc/opencode';
import type { DshSourceConfig, DshTestResult } from '@shared/ipc/dsh';
import { createOpencodeVersionBridge } from '../opencodeVersionBridge';

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
    t: mockT,
    testSource: deps.testSource ?? (async () => null),
    saveSourceConfig: deps.saveSourceConfig ?? (async () => true),
    notify: deps.notify ?? (() => {}),
  });
  return { raw, adapter };
}

describe('opencodeVersionBridge', () => {
  it('declares the OpenCode capabilities (install-on-update, percent, generic labels)', () => {
    const { adapter } = makeBridge();
    expect(adapter.capabilities).toMatchObject({
      updateAction: 'install',
      taskPercent: true,
      taskCounts: false,
      // 与 DSH 精确一致：双通道 picker + 无额外行 + 无恢复默认行；
      // 终端开关/说明走 sourceFooter 插槽（唯一差异）。
      channelPicker: true,
      extraRows: 'none',
      resetSourceAction: false,
      uninstallConfirm: false,
    });
    expect(adapter.labels).toBeUndefined();
  });

  it('optimises the auto source before installing and never in manual mode', async () => {
    const saveSourceConfig = vi.fn(async () => true);
    const probe = (latency: number) => ({ reachable: true, latency_ms: latency, error: null });
    const testSource = vi.fn(async (url: string) =>
      url.includes('npmmirror') ? probe(10) : probe(90),
    );
    const { raw, adapter } = makeBridge({}, { testSource, saveSourceConfig });

    await adapter.load();
    await adapter.install('1.4.0');
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

  it('maps the source mode both ways and resets to auto', async () => {
    const { raw, adapter } = makeBridge();

    await adapter.saveSourceMode('system');
    await adapter.resetSourceMode();

    expect(raw.saveVersionSource).toHaveBeenNthCalledWith(1, 'system');
    expect(raw.saveVersionSource).toHaveBeenNthCalledWith(2, 'auto');
  });

  it('passes the terminal-injection source data through the snapshot slot', async () => {
    const { adapter } = makeBridge();
    const snapshot = await adapter.load();

    expect(snapshot.source).toMatchObject({
      mode: 'auto',
      effective: 'host',
      systemPath: 'C:/Program Files/opencode/opencode.exe',
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

  it('owns the four OpenCode stage labels (never "downloading", no counts)', () => {
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
      'harnessVersionPhaseInstalling',
    );
    expect(adapter.taskStageText?.({ ...base, phase: 'removing' })).toBe(
      'harnessVersionPhaseRemoving',
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
