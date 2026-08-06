import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../slicedStore';
import type { AppInfo } from '../../../kernel/types';
import type { AppPreferencePatch } from '../../../shared/ipc-types.generated';
import type { ProviderStatus } from '../../../shared/ipc/provider';

vi.mock('@utils/theme', () => ({
  themeController: { setTheme: vi.fn(), hydrate: vi.fn() },
}));
vi.mock('@shared/resolveTheme', () => ({
  resolveCurrentTheme: vi.fn(() => 'light'),
}));

const mockUpdatePreferences = vi.fn();
const mockListProviders = vi.fn();
const mockGetProviderApiKey = vi.fn();
const mockClearProviderApiKey = vi.fn();
const mockRemoveCustomProvider = vi.fn();

function makeAppInfo(
  enabledModels: string[] | null,
  enabled = true,
  modelId = 'deepseek-chat',
): AppInfo {
  return {
    appName: 'test',
    version: '0.0.0',
    config: {
      themeMode: 'light',
      resolvedTheme: 'light',
      logLevel: 'info',
      terminalLogMode: 'overwrite',
      debugLogMode: 'overwrite',
      maxRecentWorkspaces: 10,
      modelPreferences: {
        providers: {
          deepseek: { enabled, priority: 1, modelId, enabledModels },
        },
      },
      keybinds: {},
      fonts: {},
      language: 'zh-CN',
      maxConcurrentWorkspaces: 6,
      workspacePriorityIds: [],
      workspaceDeferredIds: [],
      workspaceNaturalOrder: [],
    },
    recentLogs: [],
  };
}

function makeProvider(enabledModels: string[] | null, hasKey = true): ProviderStatus {
  return {
    id: 'deepseek',
    name: 'deepseek',
    description: '',
    apiType: 'openai',
    builtIn: true,
    configured: true,
    hasKey,
    requiresKey: false,
    baseUrl: null,
    models: [
      {
        id: 'deepseek-chat',
        providerId: 'deepseek',
        name: 'DeepSeek Chat',
        capabilities: ['text'],
      },
      {
        id: 'deepseek-reasoner',
        providerId: 'deepseek',
        name: 'DeepSeek Reasoner',
        capabilities: ['text'],
      },
      {
        id: 'deepseek-coder',
        providerId: 'deepseek',
        name: 'DeepSeek Coder',
        capabilities: ['text'],
      },
    ],
    enabled: true,
    enabledModels,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    app: {
      updatePreferences: mockUpdatePreferences.mockResolvedValue({
        ok: true,
        data: makeAppInfo(null),
      }),
      getModelHealth: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    },
    provider: {
      listProviders: mockListProviders.mockResolvedValue({
        ok: true,
        data: [makeProvider(null)],
      }),
      getProviderApiKey: mockGetProviderApiKey.mockResolvedValue({
        ok: true,
        data: 'sk-persisted',
      }),
      clearProviderApiKey: mockClearProviderApiKey.mockResolvedValue({
        ok: true,
        data: true,
      }),
      removeCustomProvider: mockRemoveCustomProvider.mockResolvedValue({ ok: true, data: true }),
    },
  };
  useAppStore.setState({
    appInfo: makeAppInfo(null),
    providers: [makeProvider(null)],
    error: undefined,
    isFetching: {},
    apiKeyInputs: {},
    keyInputTouched: {},
    connectionTestResults: {},
  });
});

describe('toggleModel', () => {
  it('disable from null (all enabled) patches explicit all-minus-modelId list and syncs providers', async () => {
    const store = useAppStore.getState();
    await store.toggleModel('deepseek', 'deepseek-chat', false);

    expect(mockUpdatePreferences).toHaveBeenCalledTimes(1);
    const patch = mockUpdatePreferences.mock.calls[0][0] as AppPreferencePatch;
    expect(patch.modelPreferences?.deepseek?.enabledModels).toEqual([
      'deepseek-reasoner',
      'deepseek-coder',
    ]);
    expect(useAppStore.getState().providers[0].enabledModels).toEqual([
      'deepseek-reasoner',
      'deepseek-coder',
    ]);
    expect(mockListProviders).not.toHaveBeenCalled();
  });

  it('enable from explicit list appends modelId and syncs providers without refetch', async () => {
    useAppStore.setState({
      appInfo: makeAppInfo(['deepseek-chat']),
      providers: [makeProvider(['deepseek-chat'])],
    });
    const store = useAppStore.getState();
    await store.toggleModel('deepseek', 'deepseek-reasoner', true);

    expect(mockUpdatePreferences).toHaveBeenCalledTimes(1);
    const patch = mockUpdatePreferences.mock.calls[0][0] as AppPreferencePatch;
    expect(patch.modelPreferences?.deepseek?.enabledModels).toEqual([
      'deepseek-chat',
      'deepseek-reasoner',
    ]);
    expect(useAppStore.getState().providers[0].enabledModels).toEqual([
      'deepseek-chat',
      'deepseek-reasoner',
    ]);
    expect(mockListProviders).not.toHaveBeenCalled();
  });

  it('disable from explicit list removes modelId and syncs providers without refetch', async () => {
    useAppStore.setState({
      appInfo: makeAppInfo(['deepseek-chat', 'deepseek-reasoner', 'deepseek-coder']),
      providers: [makeProvider(['deepseek-chat', 'deepseek-reasoner', 'deepseek-coder'])],
    });
    const store = useAppStore.getState();
    await store.toggleModel('deepseek', 'deepseek-reasoner', false);

    expect(mockUpdatePreferences).toHaveBeenCalledTimes(1);
    const patch = mockUpdatePreferences.mock.calls[0][0] as AppPreferencePatch;
    expect(patch.modelPreferences?.deepseek?.enabledModels).toEqual([
      'deepseek-chat',
      'deepseek-coder',
    ]);
    expect(useAppStore.getState().providers[0].enabledModels).toEqual([
      'deepseek-chat',
      'deepseek-coder',
    ]);
    expect(mockListProviders).not.toHaveBeenCalled();
  });

  it('disable from [] (none enabled) is a no-op', async () => {
    useAppStore.setState({
      appInfo: makeAppInfo([]),
      providers: [makeProvider([])],
    });
    const store = useAppStore.getState();
    await store.toggleModel('deepseek', 'deepseek-reasoner', false);

    expect(mockUpdatePreferences).not.toHaveBeenCalled();
    expect(mockListProviders).not.toHaveBeenCalled();
  });

  it('enable from null (all enabled) narrows to single-model allowlist', async () => {
    const store = useAppStore.getState();
    await store.toggleModel('deepseek', 'deepseek-reasoner', true);

    expect(mockUpdatePreferences).toHaveBeenCalledTimes(1);
    const patch = mockUpdatePreferences.mock.calls[0][0] as AppPreferencePatch;
    expect(patch.modelPreferences?.deepseek?.enabledModels).toEqual(['deepseek-reasoner']);
    expect(useAppStore.getState().providers[0].enabledModels).toEqual(['deepseek-reasoner']);
    expect(mockListProviders).not.toHaveBeenCalled();
  });
});

describe('setAllModelsEnabled', () => {
  it('true patches enabledModels null (all enabled) and syncs providers without refetch', async () => {
    const store = useAppStore.getState();
    await store.setAllModelsEnabled('deepseek', true);

    expect(mockUpdatePreferences).toHaveBeenCalledTimes(1);
    const patch = mockUpdatePreferences.mock.calls[0][0] as AppPreferencePatch;
    expect(patch.modelPreferences?.deepseek?.enabledModels).toBeNull();
    expect(useAppStore.getState().providers[0].enabledModels).toBeNull();
    expect(mockListProviders).not.toHaveBeenCalled();
  });

  it('false patches enabledModels [] (none enabled) and syncs providers without refetch', async () => {
    const store = useAppStore.getState();
    await store.setAllModelsEnabled('deepseek', false);

    expect(mockUpdatePreferences).toHaveBeenCalledTimes(1);
    const patch = mockUpdatePreferences.mock.calls[0][0] as AppPreferencePatch;
    expect(patch.modelPreferences?.deepseek?.enabledModels).toEqual([]);
    expect(useAppStore.getState().providers[0].enabledModels).toEqual([]);
    expect(mockListProviders).not.toHaveBeenCalled();
  });
});

describe('setProviderEnabled', () => {
  it('patches enabled flag and syncs providers without refetch', async () => {
    const store = useAppStore.getState();
    await store.setProviderEnabled('deepseek', false);

    expect(mockUpdatePreferences).toHaveBeenCalledTimes(1);
    const patch = mockUpdatePreferences.mock.calls[0][0] as AppPreferencePatch;
    expect(patch.modelPreferences?.deepseek).toEqual({ enabled: false });
    expect(useAppStore.getState().providers[0].enabled).toBe(false);
    expect(mockListProviders).not.toHaveBeenCalled();
  });
});

describe('rapid consecutive toggles', () => {
  it('serializes rapid toggles: B computes from A-applied providers state and both patches reach the server', async () => {
    let resolveFirst!: (value: { ok: boolean; data: AppInfo }) => void;
    let resolveSecond!: (value: { ok: boolean; data: AppInfo }) => void;
    const first = new Promise<{ ok: boolean; data: AppInfo }>((r) => {
      resolveFirst = r;
    });
    const second = new Promise<{ ok: boolean; data: AppInfo }>((r) => {
      resolveSecond = r;
    });
    mockUpdatePreferences.mockReturnValueOnce(first).mockReturnValueOnce(second);

    const store = useAppStore.getState();
    const pA = store.toggleModel('deepseek', 'deepseek-chat', false);
    const pB = store.toggleModel('deepseek', 'deepseek-reasoner', false);

    expect(useAppStore.getState().providers[0].enabledModels).toEqual(['deepseek-coder']);

    await vi.waitFor(() => expect(mockUpdatePreferences).toHaveBeenCalledTimes(1));
    const firstCall = mockUpdatePreferences.mock.calls[0][0] as AppPreferencePatch;
    expect(firstCall.modelPreferences?.deepseek?.enabledModels).toEqual([
      'deepseek-reasoner',
      'deepseek-coder',
    ]);

    resolveFirst({ ok: true, data: makeAppInfo(['deepseek-reasoner', 'deepseek-coder']) });
    await pA;

    await vi.waitFor(() => expect(mockUpdatePreferences).toHaveBeenCalledTimes(2));
    const secondCall = mockUpdatePreferences.mock.calls[1][0] as AppPreferencePatch;
    expect(secondCall.modelPreferences?.deepseek?.enabledModels).toEqual(['deepseek-coder']);

    resolveSecond({ ok: true, data: makeAppInfo(['deepseek-coder']) });
    await pB;

    expect(useAppStore.getState().providers[0].enabledModels).toEqual(['deepseek-coder']);
    expect(
      useAppStore.getState().appInfo?.config.modelPreferences.providers.deepseek.enabledModels,
    ).toEqual(['deepseek-coder']);
  });
});

describe('fetchProviders key prefill', () => {
  it('re-fills an empty key input from the persisted credential store', async () => {
    mockGetProviderApiKey.mockResolvedValue({ ok: true, data: 'sk-persisted' });
    const store = useAppStore.getState();
    await store.fetchProviders();

    expect(mockGetProviderApiKey).toHaveBeenCalledWith('deepseek');
    expect(useAppStore.getState().apiKeyInputs.deepseek).toBe('sk-persisted');
  });

  it('does not overwrite a key typed this session but not yet saved', async () => {
    mockGetProviderApiKey.mockResolvedValue({ ok: true, data: 'sk-persisted' });
    useAppStore.setState({ apiKeyInputs: { deepseek: 'sk-typed-unsaved' } });
    const store = useAppStore.getState();
    await store.fetchProviders();

    expect(useAppStore.getState().apiKeyInputs.deepseek).toBe('sk-typed-unsaved');
  });

  it('skips the read when the provider has no stored key', async () => {
    useAppStore.setState({
      providers: [makeProvider(null, false)],
    });
    mockListProviders.mockResolvedValue({
      ok: true,
      data: [makeProvider(null, false)],
    });
    const store = useAppStore.getState();
    await store.fetchProviders();

    expect(mockGetProviderApiKey).not.toHaveBeenCalled();
  });

  it('ignores a failed readback without clobbering the input', async () => {
    mockGetProviderApiKey.mockResolvedValue({ ok: false, error: 'boom' });
    const store = useAppStore.getState();
    await store.fetchProviders();

    expect(useAppStore.getState().apiKeyInputs.deepseek).toBeUndefined();
  });

  it('does not re-fill a provider whose input already has a persisted value', async () => {
    mockGetProviderApiKey.mockResolvedValue({ ok: true, data: 'sk-persisted' });
    useAppStore.setState({ apiKeyInputs: { deepseek: 'sk-persisted' } });
    const store = useAppStore.getState();
    await store.fetchProviders();

    expect(mockGetProviderApiKey).not.toHaveBeenCalled();
  });

  it('does not overwrite a key typed while the prefill read is in flight', async () => {
    let resolveKey!: (v: { ok: boolean; data: string | null }) => void;
    mockGetProviderApiKey.mockReturnValueOnce(
      new Promise((r) => {
        resolveKey = r;
      }),
    );
    const fetchP = useAppStore.getState().fetchProviders();
    // The user types a key while the persisted-key read is pending.
    useAppStore.getState().setApiKeyInput('deepseek', 'sk-typed-midflight');
    resolveKey({ ok: true, data: 'sk-persisted' });
    await fetchP;

    expect(useAppStore.getState().apiKeyInputs.deepseek).toBe('sk-typed-midflight');
  });

  it('does not re-fill an input the user cleared while the prefill read was in flight', async () => {
    let resolveKey!: (v: { ok: boolean; data: string | null }) => void;
    mockGetProviderApiKey.mockReturnValueOnce(
      new Promise((r) => {
        resolveKey = r;
      }),
    );
    const fetchP = useAppStore.getState().fetchProviders();
    // The user clears the input while the read is pending.
    useAppStore.getState().setApiKeyInput('deepseek', '');
    resolveKey({ ok: true, data: 'sk-persisted' });
    await fetchP;

    expect(useAppStore.getState().apiKeyInputs.deepseek).toBe('');
  });
});

describe('clearApiKey input clearing', () => {
  it('clears the in-memory input and stale test result after the credential is cleared', async () => {
    useAppStore.setState({
      apiKeyInputs: { deepseek: 'sk-secret' },
      connectionTestResults: { deepseek: { connected: true, error: null } },
    });
    mockListProviders.mockResolvedValue({
      ok: true,
      data: [makeProvider(null, false)],
    });
    const store = useAppStore.getState();
    await store.clearApiKey('deepseek');

    expect(mockClearProviderApiKey).toHaveBeenCalledWith('deepseek');
    expect(useAppStore.getState().apiKeyInputs.deepseek).toBeUndefined();
    expect(useAppStore.getState().connectionTestResults.deepseek).toBeUndefined();
  });

  it('keeps the input when the credential clear fails', async () => {
    mockClearProviderApiKey.mockResolvedValue({ ok: false, error: 'boom' });
    useAppStore.setState({ apiKeyInputs: { deepseek: 'sk-secret' } });
    const store = useAppStore.getState();
    const ok = await store.clearApiKey('deepseek');

    expect(ok).toBe(false);
    expect(useAppStore.getState().apiKeyInputs.deepseek).toBe('sk-secret');
  });
});

describe('removeCustomProvider state cleanup', () => {
  it('drops the input, touched flag, and stale test result for the removed provider', async () => {
    useAppStore.setState({
      apiKeyInputs: { 'custom-foo': 'sk' },
      keyInputTouched: { 'custom-foo': true },
      connectionTestResults: { 'custom-foo': { connected: true, error: null } },
    });
    const store = useAppStore.getState();
    await store.removeCustomProvider('custom-foo');

    expect(mockRemoveCustomProvider).toHaveBeenCalledWith('custom-foo');
    const s = useAppStore.getState();
    expect(s.apiKeyInputs['custom-foo']).toBeUndefined();
    expect(s.keyInputTouched['custom-foo']).toBeUndefined();
    expect(s.connectionTestResults['custom-foo']).toBeUndefined();
  });
});
