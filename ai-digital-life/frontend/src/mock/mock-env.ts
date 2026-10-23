import type { EnvBridge, EnvDependencyState, EnvStatus } from '../shared/ipc/env';

function depAvailable(version: string, path: string): EnvDependencyState {
  return {
    mode: 'auto',
    effective: 'host',
    origin: 'path',
    installedVersion: version,
    baselineVersion: version,
    meetsBaseline: true,
    path,
  };
}

const status: EnvStatus = {
  node: depAvailable('24.22.1', 'C:/ProgramData/AI-Digital-Life/hosted/node/24.22.1/node.exe'),
  git: depAvailable('2.52.0.windows.1', 'C:/ProgramData/AI-Digital-Life/hosted/git/2.52.0/cmd/git.exe'),
  bash: depAvailable('5.2.21', 'C:/ProgramData/AI-Digital-Life/hosted/git/2.52.0/bin/bash.exe'),
  webview2: {
    mode: 'auto',
    effective: 'system',
    origin: 'registry',
    installedVersion: '140.0.3485.94',
    baselineVersion: '140.0.0.0',
    meetsBaseline: true,
    path: null,
  },
  adlserver: {
    mode: 'auto',
    effective: 'host',
    origin: 'bundled',
    installedVersion: '0.1.0',
    baselineVersion: '0.1.0',
    meetsBaseline: true,
    path: 'C:/ProgramData/AI-Digital-Life/hosted/adlserver/adl-server.exe',
  },
  netprobe: {
    registryOk: true,
    registryLatencyMs: 12,
    // presence-only：mock 无真实 token，不虚构已配置。
    ciTokenConfigured: false,
  },
  task: null,
  dshReady: true,
};

function cloneStatus(): EnvStatus {
  return {
    ...status,
    node: { ...status.node },
    git: { ...status.git },
    bash: { ...status.bash },
    webview2: { ...status.webview2 },
    adlserver: { ...status.adlserver },
    netprobe: { ...status.netprobe },
    task: status.task ? { ...status.task } : null,
  };
}

/**
 * Mock env bridge：固定八键可用数据（6 段依赖 + task null + dshReady true）
 *（`EnvStatus` 代表态；`install` 恒 accepted，不置演示 task）。
 */
export function createMockEnv(): EnvBridge {
  return {
    getStatus: async () => ({ ok: true, data: cloneStatus() }),
    install: async (_dep: string, _version?: string) => ({ ok: true, data: true }),
    uninstall: async (_dep: string, _version?: string) => ({ ok: true, data: { started: true } }),
    selectSource: async (_dep: string, _mode) => ({ ok: true, data: true }),
    setCustomPath: async (_dep: string, _path: string) => ({ ok: true, data: true }),
    recheck: async (_dep?: string) => ({ ok: true, data: true }),
  };
}
