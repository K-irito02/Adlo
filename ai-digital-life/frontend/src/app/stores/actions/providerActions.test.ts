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

function makeProvider(enabledModels: string[] | null): ProviderStatus {
  return {
    id: 'deepseek',
    name: 'deepseek',
    description: '',
    apiType: 'openai',
    builtIn: true,
    configured: true,
    hasKey: true,
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
    },
  };
  useAppStore.setState({
    appInfo: makeAppInfo(null),
    providers: [makeProvider(null)],
    error: undefined,
    isFetching: {},
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
