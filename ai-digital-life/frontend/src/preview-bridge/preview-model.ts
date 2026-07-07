import type { AppPreferencePatch, AppInfo, IpcResult } from '@ai-digital-life/kernel';
import type { ProviderStatus, ConnectionTestResult, ProviderInfo } from '../shared/ipc';
import { applyPreferencePatch } from '../shared/preferencesMerger';
import { mockDigitalLifeBridge } from '../mock-bridge';
import { persistPreviewPreferences, loadPreviewPreferences } from './storage';
import type { PreviewContext } from './preview-context';

export function createBaseAppInfo(): AppInfo {
  const savedPreferences = loadPreviewPreferences();
  return {
    appName: 'AI Digital Life',
    version: '0.1.0',
    config: {
      language: savedPreferences.language ?? 'zh-CN',
      themeMode: savedPreferences.themeMode ?? 'system',
      resolvedTheme: savedPreferences.resolvedTheme ?? 'light',
      logLevel: 'info',
      terminalLogMode: 'overwrite',
      debugLogMode: 'overwrite',
      maxRecentWorkspaces: 10,
      modelPreferences: savedPreferences.modelPreferences ?? {
        providers: {
          deepseek: {
            enabled: true,
            priority: 1,
            modelId: 'deepseek-v4-pro',
          },
          minimax: {
            enabled: true,
            priority: 2,
            modelId: 'MiniMax-M2.7',
          },
        },
      },
      keybinds: {},
      fonts: {},
    },
    recentLogs: [
      {
        timestamp: Date.now(),
        level: 'info',
        scope: 'preview',
        message: 'Preview mode: workspace data comes from the local Vite preview API.',
      },
    ],
  };
}

export function createPreviewModelBridge(
  ctx: PreviewContext,
  ensureCurrentWorkspaceRestored: () => Promise<void>
) {
  return {
    app: {
      getInfo: async (): Promise<IpcResult<AppInfo>> => {
        await ensureCurrentWorkspaceRestored();
        return {
          ok: true as const,
          data: {
            ...ctx.appInfo,
            currentWorkspace: ctx.currentWorkspace,
          },
        };
      },
      updatePreferences: async (patch: AppPreferencePatch): Promise<IpcResult<AppInfo>> => {
        const nextConfig = applyPreferencePatch(ctx.appInfo.config, patch);
        ctx.appInfo.config = nextConfig;
        persistPreviewPreferences(nextConfig);
        return {
          ok: true as const,
          data: {
            ...ctx.appInfo,
            currentWorkspace: ctx.currentWorkspace,
          },
        };
      },
    },
    provider: {
      listProviders: () => Promise.resolve({ ok: true, data: [] as ProviderStatus[] }),
      saveProviderConfig: () => Promise.resolve({ ok: true, data: undefined }),
      testProviderConnection: () =>
        Promise.resolve({ ok: true, data: { connected: false, error: null } }),
      fetchProviderModels: () => Promise.resolve({ ok: true, data: [] }),
      addCustomProvider: () => Promise.resolve({ ok: true, data: true }),
      removeCustomProvider: () => Promise.resolve({ ok: true, data: true }),
      setProviderApiKey: () => Promise.resolve({ ok: true, data: true }),
      clearProviderApiKey: () => Promise.resolve({ ok: true, data: true }),
      hasProviderApiKey: () => Promise.resolve({ ok: true, data: false }),
      listSupportedProviders: () => Promise.resolve({ ok: true, data: [] as ProviderInfo[] }),
    },
    subscribeModelStream: mockDigitalLifeBridge.subscribeModelStream,
    subscribeRunActivity: mockDigitalLifeBridge.subscribeRunActivity,
    subscribeTerminalStream: mockDigitalLifeBridge.subscribeTerminalStream,
  };
}
