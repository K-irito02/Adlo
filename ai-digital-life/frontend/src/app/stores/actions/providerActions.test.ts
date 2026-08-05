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

function makeAppInfo(enabledModels: string[], enabled = true, modelId = 'deepseek-chat'): AppInfo {
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

function makeProvider(enabledModels: string[]): ProviderStatus {
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
        data: makeAppInfo([]),
      }),
      getModelHealth: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    },
    provider: {
      listProviders: mockListProviders.mockResolvedValue({
        ok: true,
        data: [makeProvider([])],
      }),
    },
  };
  useAppStore.setState({
    appInfo: makeAppInfo([]),
    providers: [makeProvider([])],
    error: undefined,
    isFetching: {},
  });
});

describe('toggleModel', () => {
  it('disable from empty list patches explicit "all minus modelId" list and refreshes', async () => {
    const store = useAppStore.getState();
    await store.toggleModel('deepseek', 'deepseek-reasoner', false);

    expect(mockUpdatePreferences).toHaveBeenCalledTimes(1);
    const patch = mockUpdatePreferences.mock.calls[0][0] as AppPreferencePatch;
    expect(patch.modelPreferences?.deepseek?.enabledModels).toEqual([
      'deepseek-chat',
      'deepseek-coder',
    ]);
    expect(mockListProviders).toHaveBeenCalled();
  });

  it('enable from explicit list appends modelId and refreshes', async () => {
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
    expect(mockListProviders).toHaveBeenCalled();
  });

  it('disable from explicit list removes modelId and refreshes', async () => {
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
    expect(mockListProviders).toHaveBeenCalled();
  });

  it('enable from empty list (all already enabled) is a no-op', async () => {
    const store = useAppStore.getState();
    await store.toggleModel('deepseek', 'deepseek-reasoner', true);

    expect(mockUpdatePreferences).not.toHaveBeenCalled();
    expect(mockListProviders).not.toHaveBeenCalled();
  });
});

describe('setProviderEnabled', () => {
  it('patches enabled flag and refreshes providers', async () => {
    const store = useAppStore.getState();
    await store.setProviderEnabled('deepseek', false);

    expect(mockUpdatePreferences).toHaveBeenCalledTimes(1);
    const patch = mockUpdatePreferences.mock.calls[0][0] as AppPreferencePatch;
    expect(patch.modelPreferences?.deepseek).toEqual({ enabled: false });
    expect(mockListProviders).toHaveBeenCalled();
  });
});

describe('setDefaultModel', () => {
  it('patches modelId and refreshes providers', async () => {
    const store = useAppStore.getState();
    await store.setDefaultModel('deepseek', 'deepseek-reasoner');

    expect(mockUpdatePreferences).toHaveBeenCalledTimes(1);
    const patch = mockUpdatePreferences.mock.calls[0][0] as AppPreferencePatch;
    expect(patch.modelPreferences?.deepseek).toEqual({ modelId: 'deepseek-reasoner' });
    expect(mockListProviders).toHaveBeenCalled();
  });
});
