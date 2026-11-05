import type { AppInfo } from '../kernel/types';

type AppInfoOverrides = Omit<Partial<AppInfo>, 'config' | 'runtime'> & {
  config?: Partial<AppInfo['config']>;
  runtime?: Partial<AppInfo['runtime']>;
};

const BASE_CONFIG: AppInfo['config'] = {
  language: 'en-US',
  themeMode: 'system',
  resolvedTheme: 'light',
  logLevel: 'info',
  terminalLogMode: 'overwrite',
  debugLogMode: 'overwrite',
  maxRecentWorkspaces: 10,
  modelPreferences: { providers: {} },
  keybinds: {},
  fonts: { uiFont: '', codeFont: '', terminalFont: '' },
  maxConcurrentWorkspaces: 6,
  workspacePriorityIds: [],
  workspaceDeferredIds: [],
  workspaceNaturalOrder: [],
  browserInactiveTabSuspendMs: 3_600_000,
  linkOpenMethod: 'panel',
  fileOpenMethod: 'panel',
  agentLinkIntercept: false,
  agentSiteWhitelist: [],
  browserSuspendWhitelistEnabled: false,
  browserSuspendWhitelist: [],
};

const BASE_RUNTIME: AppInfo['runtime'] = {
  shell: 'browser',
  tauriVersion: null,
  webviewVersion: null,
  os: 'windows',
  arch: 'x86_64',
  logDir: '',
};

/**
 * AppInfo fixture factory.
 *
 * AppInfo is a shared contract (Rust ↔ shell ↔ ad-server ↔ frontend). Adding a
 * field used to require editing every fixture literal; override only what the
 * test cares about instead. Keep this file test-only.
 */
export function createAppInfo(overrides: AppInfoOverrides = {}): AppInfo {
  const { config, runtime, appName, version, recentLogs, ...rest } = overrides;
  return {
    appName: appName ?? 'Adlo',
    version: version ?? '0.1.0',
    ...rest,
    recentLogs: recentLogs ?? [],
    config: { ...BASE_CONFIG, ...config },
    runtime: { ...BASE_RUNTIME, ...runtime },
  };
}
