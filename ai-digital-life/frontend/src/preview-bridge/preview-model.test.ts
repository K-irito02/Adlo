import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createPreviewModelBridge,
  createBaseAppInfo,
  resetPreviewModelState,
} from './preview-model';
import { MODEL_CATALOG } from '../shared/modelCatalog';
import type { PreviewContext } from './preview-context';

function createBridge() {
  const ctx: PreviewContext = {
    appInfo: createBaseAppInfo(),
    recentWorkspaces: [],
    currentWorkspace: undefined,
    retrievalStatus: undefined,
  };
  return createPreviewModelBridge(ctx, async () => {});
}

describe('preview-model provider bridge', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetPreviewModelState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('listProviders returns exactly the 7 builtin providers enabled by default', async () => {
    const bridge = createBridge();
    const result = await bridge.provider.listProviders();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data).toHaveLength(7);
    const ids = result.data.map((p) => p.id).sort();
    expect(ids).toEqual(MODEL_CATALOG.map((p) => p.id).sort());
    for (const provider of result.data) {
      expect(provider.enabled).toBe(true);
      expect(provider.enabledModels).toEqual(null);
    }
  });

  it('listProviders merges persisted enabled/enabledModels preferences', async () => {
    const bridge = createBridge();
    const update = await bridge.app.updatePreferences({
      modelPreferences: {
        deepseek: {
          enabled: false,
          enabledModels: ['deepseek-chat'],
        },
      },
    });
    expect(update.ok).toBe(true);

    const result = await bridge.provider.listProviders();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const deepseek = result.data.find((p) => p.id === 'deepseek');
    expect(deepseek?.enabled).toBe(false);
    expect(deepseek?.enabledModels).toEqual(['deepseek-chat']);
    for (const provider of result.data) {
      if (provider.id !== 'deepseek') {
        expect(provider.enabled).toBe(true);
        expect(provider.enabledModels).toEqual(null);
      }
    }
  });

  it('updatePreferences persists enabled/enabledModels for a non-seeded provider', async () => {
    const bridge = createBridge();
    const update = await bridge.app.updatePreferences({
      modelPreferences: {
        openai: {
          enabled: false,
          enabledModels: ['gpt-4o'],
        },
      },
    });
    expect(update.ok).toBe(true);

    const result = await bridge.provider.listProviders();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const openai = result.data.find((p) => p.id === 'openai');
    expect(openai?.enabled).toBe(false);
    expect(openai?.enabledModels).toEqual(['gpt-4o']);
    for (const provider of result.data) {
      if (provider.id !== 'openai') {
        expect(provider.enabled).toBe(true);
        expect(provider.enabledModels).toEqual(null);
      }
    }
  });

  it('createBaseAppInfo seeds all 7 providers with correct defaults', () => {
    const info = createBaseAppInfo();
    const providers = info.config.modelPreferences.providers;
    const ids = Object.keys(providers).sort();
    expect(ids).toEqual(MODEL_CATALOG.map((p) => p.id).sort());
    const deepseek = providers.deepseek;
    expect(deepseek.modelId).toBe('deepseek-chat');
    expect(deepseek.enabled).toBe(true);
    expect(deepseek.priority).toBe(1);
    for (const provider of Object.values(providers)) {
      expect(provider.enabled).toBe(true);
      expect(provider.enabledModels).toEqual(null);
    }
  });

  it('setProviderApiKey then hasProviderApiKey returns true', async () => {
    const bridge = createBridge();
    const set = await bridge.provider.setProviderApiKey('deepseek', 'secret-key');
    expect(set.ok).toBe(true);
    if (!set.ok) {
      return;
    }
    expect(set.data).toBe(true);
    const has = await bridge.provider.hasProviderApiKey('deepseek');
    expect(has.ok).toBe(true);
    if (!has.ok) {
      return;
    }
    expect(has.data).toBe(true);
  });

  it('testProviderConnection connected when key set, not connected when cleared', async () => {
    const bridge = createBridge();
    const before = await bridge.provider.testProviderConnection('deepseek');
    expect(before.ok).toBe(true);
    if (!before.ok) {
      return;
    }
    expect(before.data.connected).toBe(false);
    expect(before.data.error).toBe('missing API key');

    await bridge.provider.setProviderApiKey('deepseek', 'secret-key');
    const withKey = await bridge.provider.testProviderConnection('deepseek');
    expect(withKey.ok).toBe(true);
    if (!withKey.ok) {
      return;
    }
    expect(withKey.data.connected).toBe(true);
    expect(withKey.data.error).toBeNull();

    await bridge.provider.clearProviderApiKey('deepseek');
    const after = await bridge.provider.testProviderConnection('deepseek');
    expect(after.ok).toBe(true);
    if (!after.ok) {
      return;
    }
    expect(after.data.connected).toBe(false);
  });

  it('testProviderConnection is connected for ollama without a key', async () => {
    const bridge = createBridge();
    const result = await bridge.provider.testProviderConnection('ollama');
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.connected).toBe(true);
    expect(result.data.error).toBeNull();
  });

  it('testProviderConnection accepts a typed api key without persisting it', async () => {
    const bridge = createBridge();
    const before = await bridge.provider.testProviderConnection('deepseek');
    expect(before.ok && !before.data.connected).toBe(true);

    const typed = await bridge.provider.testProviderConnection('deepseek', 'typed-key');
    expect(typed.ok).toBe(true);
    if (!typed.ok) {
      return;
    }
    expect(typed.data.connected).toBe(true);
    expect(typed.data.error).toBeNull();

    // Mirror the Tauri command: a typed key used for a test is NOT promoted to
    // the saved key, so hasKey stays false and the Clear button does not appear.
    const has = await bridge.provider.hasProviderApiKey('deepseek');
    expect(has.ok && has.data).toBe(false);
  });

  it('fetchProviderModels returns the deepseek catalog (fromFallback)', async () => {
    const bridge = createBridge();
    const result = await bridge.provider.fetchProviderModels('deepseek');
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.fromFallback).toBe(true);
    expect(result.data.models.map((m) => m.id)).toEqual([
      'deepseek-chat',
      'deepseek-v4-flash',
      'deepseek-v4-pro',
    ]);
  });

  it('fetchProviderModels performs a real network request when a key is available', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'deepseek-v4-flash' }, { id: 'deepseek-v4-pro' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const bridge = createBridge();
    await bridge.provider.setProviderApiKey('deepseek', 'real-key');
    const result = await bridge.provider.fetchProviderModels('deepseek');

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe('https://api.deepseek.com/models');
    expect(init.headers.Authorization).toBe('Bearer real-key');
    expect(result.data.fromFallback).toBe(false);
    expect(result.data.models.map((m) => m.id)).toEqual(['deepseek-v4-flash', 'deepseek-v4-pro']);
    expect(result.data.models.every((m) => m.providerId === 'deepseek')).toBe(true);
    // Fetched models must match the catalog's capabilities (incl. streaming) so
    // browser mode stays consistent with Tauri mode.
    expect(
      result.data.models.every(
        (m) => m.capabilities.includes('text') && m.capabilities.includes('streaming'),
      ),
    ).toBe(true);
  });

  it('fetchProviderModels uses a typed key for the call only and does not persist it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'deepseek-v4-flash' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const bridge = createBridge();
    const result = await bridge.provider.fetchProviderModels('deepseek', 'typed-key');

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const [, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(init.headers.Authorization).toBe('Bearer typed-key');
    expect(result.data.fromFallback).toBe(false);
    // The typed key must not be promoted to the saved key.
    const has = await bridge.provider.hasProviderApiKey('deepseek');
    expect(has.ok && has.data).toBe(false);
  });

  it('fetchProviderModels falls back to the stored key when the typed key is blank', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'deepseek-v4-flash' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const bridge = createBridge();
    await bridge.provider.setProviderApiKey('deepseek', 'stored-key');
    const result = await bridge.provider.fetchProviderModels('deepseek', '   ');

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const [, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(init.headers.Authorization).toBe('Bearer stored-key');
  });

  it('fetchProviderModels performs a keyless live fetch for ollama via /api/tags', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [{ name: 'llama3.1' }, { name: 'qwen2.5' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const bridge = createBridge();
    const result = await bridge.provider.fetchProviderModels('ollama');

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('http://localhost:11434/api/tags');
    expect(result.data.fromFallback).toBe(false);
    expect(result.data.models.map((m) => m.id)).toEqual(['llama3.1', 'qwen2.5']);
    expect(result.data.models.every((m) => m.providerId === 'ollama')).toBe(true);
  });

  it('fetchProviderModels falls back to the catalog when the request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal('fetch', fetchMock);

    const bridge = createBridge();
    await bridge.provider.setProviderApiKey('deepseek', 'bad-key');
    const result = await bridge.provider.fetchProviderModels('deepseek');

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.fromFallback).toBe(true);
    expect(result.data.models.map((m) => m.id)).toEqual([
      'deepseek-chat',
      'deepseek-v4-flash',
      'deepseek-v4-pro',
    ]);
  });

  it('listSupportedProviders returns the 7 builtin providers', async () => {
    const bridge = createBridge();
    const result = await bridge.provider.listSupportedProviders();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data).toHaveLength(7);
    expect(result.data.find((p) => p.id === 'ollama')?.requiresKey).toBe(false);
    expect(result.data.find((p) => p.id === 'deepseek')?.requiresKey).toBe(true);
  });

  it('updatePreferences persisting enabledModels is retained by createBaseAppInfo', async () => {
    const bridge = createBridge();
    const result = await bridge.app.updatePreferences({
      modelPreferences: { deepseek: { enabledModels: ['deepseek-chat'] } },
    });
    expect(result.ok).toBe(true);
    const info = createBaseAppInfo();
    expect(info.config.modelPreferences.providers.deepseek.enabledModels).toEqual([
      'deepseek-chat',
    ]);
  });

  it('addCustomProvider persists without the api key and removeCustomProvider deletes it', async () => {
    const bridge = createBridge();
    const add = await bridge.provider.addCustomProvider(
      'My Proxy',
      'https://proxy.example.com/v1',
      'secret-api-key',
      ['m1', 'm2'],
    );
    expect(add.ok).toBe(true);
    if (!add.ok) {
      return;
    }
    expect(add.data).toBe(true);

    const has = await bridge.provider.hasProviderApiKey('custom-my-proxy');
    expect(has.ok && has.data).toBe(true);

    const raw = window.localStorage.getItem('adl.preview.custom-providers.v1');
    expect(raw).toBeTruthy();
    expect(raw).not.toContain('secret-api-key');

    const list = await bridge.provider.listProviders();
    expect(list.ok).toBe(true);
    if (!list.ok) {
      return;
    }
    const custom = list.data.find((p) => p.id === 'custom-my-proxy');
    expect(custom).toBeDefined();
    expect(custom?.baseUrl).toBe('https://proxy.example.com/v1');
    expect(custom?.builtIn).toBe(false);
    expect(custom?.models.map((m) => m.id)).toEqual(['m1', 'm2']);

    const remove = await bridge.provider.removeCustomProvider('custom-my-proxy');
    expect(remove.ok && remove.data).toBe(true);
    const after = await bridge.provider.listProviders();
    expect(after.ok).toBe(true);
    if (!after.ok) {
      return;
    }
    expect(after.data.find((p) => p.id === 'custom-my-proxy')).toBeUndefined();
    const hasAfter = await bridge.provider.hasProviderApiKey('custom-my-proxy');
    expect(hasAfter.ok && hasAfter.data).toBe(false);
  });
});
