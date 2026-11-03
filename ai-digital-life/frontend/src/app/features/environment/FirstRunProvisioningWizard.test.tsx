import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen, waitFor } from '@testing-library/react';
import type { CopyDict } from '@i18n';
import { TCopyProvider } from '@i18n/TCopyContext';
import { useAppStore } from '@stores/slicedStore';
import { FirstRunProvisioningWizard } from './FirstRunProvisioningWizard';
import type { EnvDependencyState, EnvStatus } from '../../../shared/ipc/env';

vi.mock('@features/preview/openByMethod', () => ({
  openUrlByMethod: vi.fn(),
}));

vi.mock('@hooks/useAppActions', () => ({
  useAppActions: () => ({
    selectEnvSource: vi.fn(),
    recheckEnv: vi.fn(async () => true),
  }),
}));

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

function TestProvider({ children }: { children: React.ReactNode }) {
  return (
    <TCopyProvider t={mockT} locale="zh-CN">
      {children}
    </TCopyProvider>
  );
}

function depState(patch: Partial<EnvDependencyState> = {}): EnvDependencyState {
  return {
    mode: 'auto',
    effective: 'host',
    origin: 'path',
    installedVersion: '1.0.0',
    baselineVersion: '1.0.0',
    meetsBaseline: true,
    path: 'C:/hosted/1.0.0/bin.exe',
    ...patch,
  };
}

function envFixture(nodeReady: boolean): EnvStatus {
  return {
    node: nodeReady
      ? depState({
          installedVersion: '24.22.1',
          baselineVersion: '24.22.1',
          path: 'C:/hosted/node/24.22.1/node.exe',
        })
      : depState({
          effective: 'none',
          installedVersion: null,
          baselineVersion: '24.22.1',
          meetsBaseline: false,
          path: null,
        }),
    git: depState({
      installedVersion: '2.56.0',
      baselineVersion: '2.56.0',
      path: 'C:/hosted/git/2.56.0/cmd/git.exe',
    }),
    bash: depState({
      installedVersion: null,
      baselineVersion: '',
      path: 'C:/hosted/git/2.56.0/bin/bash.exe',
    }),
    webview2: {
      mode: 'auto',
      effective: 'system',
      origin: 'registry',
      installedVersion: '140.0.3485.94',
      baselineVersion: '140.0.0.0',
      meetsBaseline: true,
      path: null,
    },
    adlserver: depState({
      effective: 'system',
      origin: 'bundled',
      installedVersion: null,
      baselineVersion: '',
      path: 'C:/hosted/adlserver/adl-server.exe',
    }),
    netprobe: { registryOk: true, registryLatencyMs: 12, ciTokenConfigured: false },
    task: null,
    dataDir: 'C:/data-root',
    dshReady: true,
  };
}

function harnessSource(system: boolean) {
  return {
    ok: true as const,
    data: {
      system: system ? { path: 'C:/Program Files/DSH/dsh.exe', version: '1.0.0' } : null,
      versionSource: {
        mode: 'auto' as const,
        effective: system ? ('system' as const) : ('host' as const),
        resolvedByMode: {
          auto: system ? ('system' as const) : ('host' as const),
          system: 'system' as const,
          host: 'host' as const,
        },
        hostVersion: system ? null : '1.0.0',
      },
      config: { version_source: 'auto' as const, source_mode: 'auto' as const, npm_registry: '' },
      terminalInjection: true,
    },
  };
}

function harnessStatus() {
  return {
    ok: true as const,
    data: {
      currentSelected: null,
      installed: [] as string[],
      latestAvailable: null,
      hasUpdate: false,
      prereleaseAvailable: null,
      hasPrereleaseUpdate: false,
      prereleaseUnknown: false,
    },
  };
}

function harnessCatalog() {
  return {
    ok: true as const,
    data: {
      stable: [],
      prerelease: [],
      latestStable: '1.0.0',
      latestPrerelease: null,
    },
  };
}

function seedStore() {
  useAppStore.setState({
    envWizardDone: false,
    envWizardSkippedAt: null,
    envStatus: null,
    envBusy: false,
    isTauri: true,
    toasts: [],
  } as unknown as Parameters<typeof useAppStore.setState>[0]);
}

function installBridge(
  envGetStatus: ReturnType<typeof vi.fn>,
  envInstall: ReturnType<typeof vi.fn>,
) {
  const dsh = {
    getSourceStatus: vi.fn(async () => harnessSource(true)),
    getVersionStatus: vi.fn(async () => harnessStatus()),
    getVersionCatalog: vi.fn(async () => harnessCatalog()),
    installVersion: vi.fn(async () => ({ ok: true, data: '1.0.0' })),
    getVersionTask: vi.fn(async () => ({ ok: true, data: { task: null } })),
  };
  const opencode = {
    getSourceStatus: vi.fn(async () => harnessSource(true)),
    getVersionStatus: vi.fn(async () => harnessStatus()),
    getVersionCatalog: vi.fn(async () => harnessCatalog()),
    installVersion: vi.fn(async () => ({ ok: true, data: '1.0.0' })),
    getVersionTask: vi.fn(async () => ({ ok: true, data: { task: null } })),
  };
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    env: {
      getStatus: envGetStatus,
      install: envInstall,
      selectSource: vi.fn(async () => ({ ok: true, data: true })),
    },
    dsh,
    opencode,
  };
  return { dsh, opencode };
}

describe('FirstRunProvisioningWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedStore();
  });

  afterEach(() => {
    cleanup();
    delete (window as unknown as { digitalLife?: unknown }).digitalLife;
  });

  it('detects ready items, has no skip, and finishes with the guide', async () => {
    const envGetStatus = vi.fn(async () => ({ ok: true, data: envFixture(true) }));
    const envInstall = vi.fn(async () => ({ ok: true, data: { started: true } }));
    installBridge(envGetStatus, envInstall);

    render(
      <TestProvider>
        <FirstRunProvisioningWizard onClose={vi.fn()} />
      </TestProvider>,
    );

    await waitFor(() => expect(screen.getByText('firstRunTitleDone')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /skip|跳过/i })).toBeNull();
    expect(screen.getByText('firstRunStart')).toBeTruthy();
    expect(screen.getByText('firstRunGuideTitle')).toBeTruthy();
    expect(envInstall).not.toHaveBeenCalled();
    expect(useAppStore.getState().envWizardDone).toBe(true);
  });

  it('installs a missing runtime and marks it host-managed', async () => {
    const initial = envFixture(false);
    const ready = envFixture(true);
    let calls = 0;
    const envGetStatus = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return { ok: true, data: initial };
      }
      if (calls === 2) {
        return {
          ok: true,
          data: {
            ...initial,
            task: {
              kind: 'env-node-install',
              version: '24.22.1',
              phase: 'installing',
              percent: 50,
              done: 0,
              total: 100,
              cancellable: false,
              error: null,
            },
          },
        };
      }
      return { ok: true, data: ready };
    });
    const envInstall = vi.fn(async () => ({ ok: true, data: { started: true } }));
    installBridge(envGetStatus, envInstall);

    render(
      <TestProvider>
        <FirstRunProvisioningWizard onClose={vi.fn()} />
      </TestProvider>,
    );

    await waitFor(() => expect(screen.getByText('firstRunTitleDone')).toBeTruthy(), {
      timeout: 8000,
    });
    expect(envInstall).toHaveBeenCalledWith('node');
  });
});
