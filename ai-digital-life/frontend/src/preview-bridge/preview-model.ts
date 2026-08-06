import type { AppPreferencePatch, AppInfo, IpcResult } from '@ai-digital-life/kernel';
import type {
  ProviderStatus,
  ProviderInfo,
  ConnectionTestResult,
  FetchModelsResult,
} from '../shared/ipc/provider';
import type { ModelPreferences, ModelProviderPreference } from '../shared/ipc-types.generated';
import { applyPreferencePatch } from '../shared/preferencesMerger';
import { mockDigitalLifeBridge } from '../mock-bridge';
import { MODEL_CATALOG } from '../shared/modelCatalog';
import {
  persistPreviewPreferences,
  loadPreviewPreferences,
  loadPreviewCustomProviders,
  persistPreviewCustomProviders,
  type PreviewCustomProvider,
} from './preview-storage';
import type { PreviewContext } from './preview-context';

// In-memory API keys for preview mode. API keys must NEVER be persisted to
// localStorage (security constraint); the map is module-level and cleared on reset.
const previewApiKeys = new Map<string, string>();

export function resetPreviewModelState(): void {
  previewApiKeys.clear();
}

const DEFAULT_PROVIDER_PRIORITY: Record<string, number> = {
  deepseek: 1,
  minimax: 2,
  openai: 3,
  anthropic: 4,
  google: 5,
  ollama: 6,
  openrouter: 7,
};

function defaultModelPreferences(): ModelPreferences {
  const providers: ModelPreferences['providers'] = {};
  for (const catalog of MODEL_CATALOG) {
    providers[catalog.id] = {
      enabled: true,
      priority: DEFAULT_PROVIDER_PRIORITY[catalog.id] ?? 10,
      modelId: catalog.models[0]?.id ?? catalog.id,
      enabledModels: null,
    };
  }
  return { providers };
}

function catalogToStatus(
  providerId: string,
  pref: ModelProviderPreference | undefined,
): ProviderStatus {
  const catalog = MODEL_CATALOG.find((p) => p.id === providerId);
  const requiresKey = catalog?.requiresKey ?? true;
  const hasKey = previewApiKeys.has(providerId);
  return {
    id: providerId,
    name: catalog?.name ?? providerId,
    description: catalog?.description ?? '',
    apiType: catalog?.apiType ?? 'OpenAICompatible',
    builtIn: true,
    configured: !requiresKey || hasKey,
    hasKey,
    requiresKey,
    baseUrl: catalog?.baseUrl ?? null,
    models: catalog?.models ?? [],
    enabled: pref?.enabled ?? true,
    enabledModels: pref?.enabledModels ?? null,
  };
}

function customToStatus(custom: PreviewCustomProvider): ProviderStatus {
  const hasKey = previewApiKeys.has(custom.id);
  return {
    id: custom.id,
    name: custom.name,
    description: `Custom OpenAI-compatible: ${custom.name}`,
    apiType: 'OpenAICompatible',
    builtIn: false,
    configured: hasKey,
    hasKey,
    requiresKey: true,
    baseUrl: custom.baseUrl,
    models: custom.models.map((m) => ({
      id: m,
      providerId: custom.id,
      name: m,
      capabilities: ['text'],
    })),
    enabled: true,
    enabledModels: null,
  };
}

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
      modelPreferences: savedPreferences.modelPreferences ?? defaultModelPreferences(),
      keybinds: {},
      fonts: {},
      maxConcurrentWorkspaces: 6,
      workspacePriorityIds: [],
      workspaceDeferredIds: [],
      workspaceNaturalOrder: [],
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
  ensureCurrentWorkspaceRestored: () => Promise<void>,
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
      listProviders: async (): Promise<IpcResult<ProviderStatus[]>> => {
        const prefs = loadPreviewPreferences().modelPreferences?.providers ?? {};
        const builtins = MODEL_CATALOG.map((p) => catalogToStatus(p.id, prefs[p.id]));
        const customs = loadPreviewCustomProviders().map(customToStatus);
        return { ok: true as const, data: [...builtins, ...customs] };
      },
      saveProviderConfig: async (
        providerId: string,
        config: Record<string, unknown>,
      ): Promise<IpcResult<void>> => {
        const apiKey = config?.apiKey;
        if (typeof apiKey === 'string' && apiKey.length > 0) {
          previewApiKeys.set(providerId, apiKey);
        }
        return { ok: true as const, data: undefined };
      },
      testProviderConnection: async (
        providerId: string,
        apiKey?: string,
      ): Promise<IpcResult<ConnectionTestResult>> => {
        // Mirror the Tauri command's resolve_api_key: a key passed for the test
        // is used for THIS call only (blank/whitespace keys are ignored), it
        // must not be promoted to the saved key — that happens only via
        // setProviderApiKey — so hasKey / Clear-button / sort rank behave
        // identically in browser and desktop modes.
        const trimmed = apiKey?.trim();
        const effectiveKey = trimmed ? trimmed : previewApiKeys.get(providerId);
        const catalog = MODEL_CATALOG.find((p) => p.id === providerId);
        const custom = loadPreviewCustomProviders().find((p) => p.id === providerId);
        const requiresKey = custom ? true : (catalog?.requiresKey ?? true);
        if (!requiresKey || !!effectiveKey) {
          return { ok: true as const, data: { connected: true, error: null } };
        }
        return { ok: true as const, data: { connected: false, error: 'missing API key' } };
      },
      fetchProviderModels: async (
        providerId: string,
        apiKey?: string,
      ): Promise<IpcResult<FetchModelsResult>> => {
        const trimmed = apiKey?.trim();
        const key = trimmed ? trimmed : previewApiKeys.get(providerId);
        const catalog = MODEL_CATALOG.find((p) => p.id === providerId);
        const custom = loadPreviewCustomProviders().find((p) => p.id === providerId);
        const baseUrl = custom?.baseUrl ?? catalog?.baseUrl;
        if (baseUrl) {
          // Ollama needs no API key and exposes /api/tags (mirrors the Tauri
          // adapter); otherwise the OpenAI-compatible /models + Bearer pattern.
          if (providerId === 'ollama' && !custom) {
            try {
              const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`);
              if (response.ok) {
                const body = (await response.json()) as {
                  models?: { name?: string }[];
                };
                const models = (body.models ?? [])
                  .filter(
                    (m): m is { name: string } => typeof m?.name === 'string' && m.name.length > 0,
                  )
                  .map((m) => ({
                    id: m.name,
                    providerId,
                    name: m.name,
                    capabilities: ['text' as const, 'streaming' as const],
                  }));
                if (models.length > 0) {
                  return { ok: true as const, data: { models, fromFallback: false } };
                }
              }
            } catch {
              // CORS / network failures fall back to the static catalog below.
            }
            // Ollama has no OpenAI-compatible endpoint; never fall through to
            // the /models + Bearer branch even if a stray key exists.
            return {
              ok: true as const,
              data: { models: catalog?.models ?? [], fromFallback: true },
            };
          }
          if (key) {
            try {
              const response = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
                headers: { Authorization: `Bearer ${key}` },
              });
              if (response.ok) {
                const body = (await response.json()) as { data?: { id: string }[] };
                const models = (body.data ?? [])
                  .filter((m) => typeof m?.id === 'string' && m.id.length > 0)
                  .map((m) => ({
                    id: m.id,
                    providerId,
                    name: m.id,
                    capabilities: ['text' as const, 'streaming' as const],
                  }));
                if (models.length > 0) {
                  return { ok: true as const, data: { models, fromFallback: false } };
                }
              }
            } catch {
              // CORS / network failures fall back to the static catalog below.
            }
          }
        }
        if (custom) {
          return {
            ok: true as const,
            data: {
              models: custom.models.map((m) => ({
                id: m,
                providerId: custom.id,
                name: m,
                capabilities: ['text'],
              })),
              fromFallback: true,
            },
          };
        }
        return { ok: true as const, data: { models: catalog?.models ?? [], fromFallback: true } };
      },
      addCustomProvider: async (
        name: string,
        baseUrl: string,
        apiKey: string,
        models: string[],
      ): Promise<IpcResult<boolean>> => {
        const id = `custom-${name.toLowerCase().replace(/ /g, '-')}`;
        const providers = loadPreviewCustomProviders();
        if (providers.some((p) => p.id === id)) {
          return { ok: true as const, data: false };
        }
        providers.push({ id, name, baseUrl, models });
        persistPreviewCustomProviders(providers);
        if (apiKey) {
          previewApiKeys.set(id, apiKey);
        }
        return { ok: true as const, data: true };
      },
      removeCustomProvider: async (providerId: string): Promise<IpcResult<boolean>> => {
        const providers = loadPreviewCustomProviders();
        const next = providers.filter((p) => p.id !== providerId);
        persistPreviewCustomProviders(next);
        previewApiKeys.delete(providerId);
        return { ok: true as const, data: true };
      },
      setProviderApiKey: async (
        providerId: string,
        apiKey: string,
      ): Promise<IpcResult<boolean>> => {
        previewApiKeys.set(providerId, apiKey);
        return { ok: true as const, data: true };
      },
      clearProviderApiKey: async (providerId: string): Promise<IpcResult<boolean>> => {
        previewApiKeys.delete(providerId);
        return { ok: true as const, data: true };
      },
      hasProviderApiKey: async (providerId: string): Promise<IpcResult<boolean>> => ({
        ok: true as const,
        data: previewApiKeys.has(providerId),
      }),
      getProviderApiKey: async (providerId: string): Promise<IpcResult<string | null>> => ({
        ok: true as const,
        data: previewApiKeys.get(providerId) ?? null,
      }),
      listSupportedProviders: async (): Promise<IpcResult<ProviderInfo[]>> => ({
        ok: true as const,
        data: MODEL_CATALOG.map((p) => ({ id: p.id, name: p.name, requiresKey: p.requiresKey })),
      }),
    },
    subscribeModelStream: mockDigitalLifeBridge.subscribeModelStream,
    subscribeRunActivity: mockDigitalLifeBridge.subscribeRunActivity,
    subscribeTerminalStream: mockDigitalLifeBridge.subscribeTerminalStream,
  };
}
