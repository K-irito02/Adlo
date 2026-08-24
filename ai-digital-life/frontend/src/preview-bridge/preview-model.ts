import type { AppPreferencePatch, AppInfo, IpcResult } from '@ai-digital-life/kernel';
import type {
  ProviderStatus,
  ProviderInfo,
  ConnectionTestResult,
  FetchModelsResult,
  ModelDefinition,
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

/// Live model-fetch timeout, mirroring the Tauri shared reqwest client (30s).
const FETCH_TIMEOUT_MS = 30_000;

/// Parse a JSON response body without throwing. A 2xx with an unparseable body
/// (proxy HTML page, empty body) must still count as "connected" — the Tauri
/// `test_connection` adapters check status only — so a parse failure yields
/// `null` and the caller produces an empty model list (fetch falls back, test
/// reports connected).
async function safeJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

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

type LiveModelsResult =
  | { kind: 'ok'; models: ModelDefinition[] }
  | { kind: 'http-error'; status: number }
  | { kind: 'no-key' }
  | { kind: 'network-error' };

/**
 * Perform the real live model-list HTTP request for a provider, mirroring the
 * Tauri adapters so browser preview and desktop stay dual-end consistent:
 *  - ollama: keyless GET /api/tags
 *  - anthropic: GET /models with x-api-key + anthropic-version headers
 *  - google:   GET /models?key=... (key as query parameter, no Authorization)
 *  - everything else (incl. custom OpenAI-compatible): GET /models + Bearer
 * Returns a discriminated result so callers can distinguish a live success (any
 * 2xx response; the model list may be empty), a non-2xx HTTP error, a missing
 * key, and a network/CORS failure.
 */
async function fetchProviderModelsLive(
  providerId: string,
  key: string | undefined,
  baseUrl: string,
  custom: PreviewCustomProvider | undefined,
): Promise<LiveModelsResult> {
  if (providerId === 'ollama' && !custom) {
    try {
      const response = await fetch(
        `${baseUrl.replace(/\/+$/, '')}/api/tags`,
        // Mirror the Tauri shared reqwest client's 30s timeout so a stalled
        // server cannot hang the Test/Fetch button indefinitely.
        { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
      );
      if (response.ok) {
        const body = (await safeJson<{ models?: { name?: string }[] }>(response)) ?? {};
        const models = (body.models ?? [])
          .filter((m): m is { name: string } => typeof m?.name === 'string' && m.name.length > 0)
          .map(
            (m): ModelDefinition => ({
              id: m.name,
              providerId,
              name: m.name,
              capabilities: ['text' as const, 'streaming' as const],
            }),
          );
        return { kind: 'ok', models };
      }
      return { kind: 'http-error', status: response.status };
    } catch {
      return { kind: 'network-error' };
    }
  }
  if (!key) {
    return { kind: 'no-key' };
  }
  try {
    const modelsUrl = `${baseUrl.replace(/\/+$/, '')}/models`;
    const isAnthropic = providerId === 'anthropic' && !custom;
    const isGoogle = providerId === 'google' && !custom;
    const url = isGoogle ? `${modelsUrl}?key=${encodeURIComponent(key)}` : modelsUrl;
    // Anthropic authenticates via x-api-key + anthropic-version headers, Google
    // via the ?key= query parameter only (no Authorization header), everything
    // else via Authorization: Bearer — mirrors the Tauri adapters.
    const headers: Record<string, string> | undefined = isAnthropic
      ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
      : isGoogle
        ? undefined
        : { Authorization: `Bearer ${key}` };
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.ok) {
      if (isGoogle) {
        // Google returns { models: [{ name: "models/gemini-...", displayName,
        // supportedGenerationMethods }] }; strip the "models/" prefix and keep
        // only generateContent-capable models (mirrors google.rs).
        const body = (await safeJson<{
          models?: {
            name?: string;
            displayName?: string;
            supportedGenerationMethods?: string[];
          }[];
        }>(response)) ?? { models: [] };
        const models = (body.models ?? [])
          .filter(
            (m): m is { name: string; displayName?: string } =>
              typeof m?.name === 'string' &&
              m.name.length > 0 &&
              (m.supportedGenerationMethods ?? []).some((s) => s === 'generateContent'),
          )
          .map((m): ModelDefinition => {
            const id = m.name.replace(/^models\//, '');
            return {
              id,
              providerId,
              name: m.displayName ?? id,
              capabilities: ['text' as const, 'streaming' as const],
            };
          });
        return { kind: 'ok', models };
      }
      // Anthropic returns { data: [{ id, display_name }] }, OpenRouter returns
      // { data: [{ id, name }] }, OpenAI-compatible providers return only id.
      // Prefer the provider's display name, then the raw id (mirrors
      // anthropic.rs / openrouter.rs).
      const body = (await safeJson<{
        data?: { id: string; display_name?: string; name?: string }[];
      }>(response)) ?? { data: [] };
      const models = (body.data ?? [])
        .filter((m) => typeof m?.id === 'string' && m.id.length > 0)
        .map(
          (m): ModelDefinition => ({
            id: m.id,
            providerId,
            name: m.display_name ?? m.name ?? m.id,
            capabilities: ['text' as const, 'streaming' as const],
          }),
        );
      return { kind: 'ok', models };
    }
    return { kind: 'http-error', status: response.status };
  } catch {
    return { kind: 'network-error' };
  }
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
      browserInactiveTabSuspendMs: 3_600_000,
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
        const baseUrl = custom?.baseUrl ?? catalog?.baseUrl;
        if (baseUrl) {
          // Real connectivity check mirroring the Tauri adapters (any 2xx
          // response counts as connected). A browser network/CORS failure for
          // a remote provider cannot be told apart from a blocked cross-origin
          // request, so it falls back to the key-presence heuristic; Ollama is
          // assumed-local, so a failed ping reports not reachable (the common
          // case for a down daemon; a restrictive OLLAMA_ORIGINS / HTTPS-served
          // preview can still produce a false negative here).
          const live = await fetchProviderModelsLive(providerId, effectiveKey, baseUrl, custom);
          switch (live.kind) {
            case 'ok':
              return { ok: true as const, data: { connected: true, error: null } };
            case 'http-error':
              return {
                ok: true as const,
                data: { connected: false, error: `Provider returned HTTP ${live.status}` },
              };
            case 'no-key':
              return { ok: true as const, data: { connected: false, error: 'missing API key' } };
            case 'network-error':
              if (providerId === 'ollama' && !custom) {
                return {
                  ok: true as const,
                  data: { connected: false, error: 'Ollama is not reachable' },
                };
              }
              return { ok: true as const, data: { connected: true, error: null } };
          }
        }
        return {
          ok: true as const,
          data: {
            connected: !requiresKey || !!effectiveKey,
            error: !requiresKey || !!effectiveKey ? null : 'missing API key',
          },
        };
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
          const live = await fetchProviderModelsLive(providerId, key, baseUrl, custom);
          // A live success is only reported for a NON-empty list (mirrors the
          // Tauri fetch_provider_models `Ok(models) if !models.is_empty()`);
          // an empty 2xx response counts as a fallback.
          if (live.kind === 'ok' && live.models.length > 0) {
            return { ok: true as const, data: { models: live.models, fromFallback: false } };
          }
          // Any other outcome (no key / HTTP error / empty list / network-CORS
          // failure) falls back to the static/cached catalog below.
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
