import type { AppPreferencePatch, AppInfo, IpcResult } from '@ai-digital-life/kernel';
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
    subscribeModelStream: mockDigitalLifeBridge.subscribeModelStream,
    subscribeRunActivity: mockDigitalLifeBridge.subscribeRunActivity,
    subscribeTerminalStream: mockDigitalLifeBridge.subscribeTerminalStream,
  };
}
