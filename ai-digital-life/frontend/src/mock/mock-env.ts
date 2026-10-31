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
  bash: {
    mode: 'auto',
    effective: 'system',
    origin: 'path',
    installedVersion: null,
    baselineVersion: '',
    meetsBaseline: true,
    path: 'C:/ProgramData/AI-Digital-Life/hosted/git/2.52.0/bin/bash.exe',
  },
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
    effective: 'system',
    origin: 'bundled',
    installedVersion: null,
    baselineVersion: '',
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
  dataDir: 'C:/ProgramData/AI-Digital-Life',
  dshReady: true,
};

function cloneOf(source: EnvStatus): EnvStatus {
  return {
    ...source,
    node: { ...source.node },
    git: { ...source.git },
    bash: { ...source.bash },
    webview2: { ...source.webview2 },
    adlserver: { ...source.adlserver },
    netprobe: { ...source.netprobe },
    task: source.task ? { ...source.task } : null,
  };
}

/** mock 的当前状态：recheck 只替换请求的依赖，其余保持原值（块互不联动）。 */
let current = cloneOf(status);

function cloneStatus(): EnvStatus {
  return cloneOf(current);
}

const DEP_KEYS = ['node', 'git', 'bash', 'webview2', 'adlserver'] as const;

/**
 * Mock env bridge：固定八键可用数据（6 段依赖 + task null + dshReady true）
 *（`EnvStatus` 代表态；`install` 恒 accepted，不置演示 task）。
 */
export function createMockEnv(): EnvBridge {
  return {
    getStatus: async () => ({ ok: true, data: cloneStatus() }),
    install: async (_dep: string, _version?: string) => ({ ok: true, data: { started: true } }),
    uninstall: async (_dep: string, _version?: string) => ({ ok: true, data: { started: true } }),
    selectSource: async (_dep: string, _mode) => ({ ok: true, data: true }),
    setCustomPath: async (_dep: string, _path: string) => ({ ok: true, data: true }),
    recheck: async (deps?: string[]) => {
      if (!deps || deps.length === 0) {
        current = cloneOf(status);
      } else {
        const next = cloneOf(current);
        for (const dep of deps) {
          if ((DEP_KEYS as readonly string[]).includes(dep)) {
            const key = dep as (typeof DEP_KEYS)[number];
            next[key] = { ...status[key] };
          }
        }
        current = next;
      }
      return { ok: true, data: cloneStatus() };
    },
  };
}
