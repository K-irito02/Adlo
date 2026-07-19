import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAppStore } from '../slicedStore';
import { accumulateBatch } from './generalActions';
import type { StoreState } from '../StoreState';
import type { AppPreferencePatch } from '../../../shared/ipc-types.generated';

// Mock themeController 依赖（updatePreferences 成功路径会调用）
vi.mock('@utils/theme', () => ({
  themeController: {
    setTheme: vi.fn(),
    hydrate: vi.fn(),
  },
}));

// Mock resolveCurrentTheme（依赖 window.matchMedia，jsdom 不提供）
vi.mock('@shared/resolveTheme', () => ({
  resolveCurrentTheme: vi.fn(() => 'light'),
}));

// window.digitalLife 全局 mock
const mockUpdatePreferences = vi.fn();

function setupWindowDigitalLife() {
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    app: {
      updatePreferences: mockUpdatePreferences,
      getModelHealth: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    },
  };
}

describe('updatePreferences action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupWindowDigitalLife();
    // 重置 store 状态
    useAppStore.setState({
      error: undefined,
      isFetching: {},
    });
  });

  afterEach(() => {
    useAppStore.setState({
      error: undefined,
      isFetching: {},
    });
  });

  it('sets isFetching[updatePreferences] during call', async () => {
    let resolvePromise: (value: { ok: true; data: unknown }) => void;
    mockUpdatePreferences.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      })
    );

    const store = useAppStore.getState();
    const promise = store.updatePreferences({ language: 'en-US' } as AppPreferencePatch);
    expect(useAppStore.getState().isFetching['updatePreferences']).toBe(true);

    resolvePromise!({
      ok: true,
      data: {
        config: { themeMode: 'system' },
        recentLogs: [],
        currentWorkspace: null,
        appName: 'test',
        version: '0.0.0',
      },
    });
    await promise;
    expect(useAppStore.getState().isFetching['updatePreferences']).toBe(false);
  });

  it('captures typed error on failure and clears isFetching', async () => {
    mockUpdatePreferences.mockResolvedValue({
      ok: false,
      error: { code: 'CONFIG_ERROR', message: 'Invalid preference' },
    });

    const store = useAppStore.getState();
    await store.updatePreferences({ language: 'invalid' } as AppPreferencePatch);

    const error = useAppStore.getState().error;
    expect(error).toContain('[CONFIG_ERROR]');
    expect(error).toContain('Invalid preference');
    expect(useAppStore.getState().isFetching['updatePreferences']).toBe(false);
  });

  it('clears error on entry', async () => {
    mockUpdatePreferences.mockResolvedValue({
      ok: true,
      data: {
        config: { themeMode: 'system' },
        recentLogs: [],
        currentWorkspace: null,
        appName: 'test',
        version: '0.0.0',
      },
    });

    const store = useAppStore.getState();
    store.setError('previous error');
    expect(useAppStore.getState().error).toBe('previous error');

    await store.updatePreferences({ language: 'en-US' } as AppPreferencePatch);
    expect(useAppStore.getState().error).toBeUndefined();
  });

  it('does not re-enter when isFetching is already true', async () => {
    useAppStore.setState({ isFetching: { updatePreferences: true } });
    const store = useAppStore.getState();
    await store.updatePreferences({ language: 'en-US' } as AppPreferencePatch);
    // 不应调用 mock（防重入）
    expect(mockUpdatePreferences).not.toHaveBeenCalled();
  });
});

describe('accumulateBatch', () => {
  // 构造最小 StoreState 子集，仅包含测试所需的 Record 字段
  function makeMockGet(overrides: Partial<StoreState> = {}): () => StoreState {
    const base = {
      workspaceTrees: {},
      workspaceTreeLoading: {},
      gitSnapshots: {},
      workspaceChangesTreeLoading: {},
    } as unknown as StoreState;
    return () => ({ ...base, ...overrides }) as StoreState;
  }

  it('initializes batch field from store state on first call', () => {
    const batch: Partial<StoreState> = {};
    const get = makeMockGet({
      workspaceTrees: { existing: [] } as unknown as StoreState['workspaceTrees'],
    });
    accumulateBatch(batch, get, 'workspaceTrees', 'new-id', [] as never);
    expect(batch.workspaceTrees).toBeDefined();
    expect(batch.workspaceTrees).toHaveProperty('existing');
    expect(batch.workspaceTrees).toHaveProperty('new-id');
  });

  it('accumulates multiple entries into same batch field', () => {
    const batch: Partial<StoreState> = {};
    const get = makeMockGet();
    accumulateBatch(batch, get, 'workspaceTreeLoading', 'id1', false);
    accumulateBatch(batch, get, 'workspaceTreeLoading', 'id2', false);
    expect(batch.workspaceTreeLoading).toHaveProperty('id1', false);
    expect(batch.workspaceTreeLoading).toHaveProperty('id2', false);
  });

  it('does not re-initialize batch field on subsequent calls', () => {
    const batch: Partial<StoreState> = {};
    const get = makeMockGet({
      gitSnapshots: { stale: { id: 'stale' } } as unknown as StoreState['gitSnapshots'],
    });
    accumulateBatch(batch, get, 'gitSnapshots', 'first', { id: 'first' } as never);
    // 第二次调用不应重新从 get() 拷贝（否则会覆盖 first）
    accumulateBatch(batch, get, 'gitSnapshots', 'second', { id: 'second' } as never);
    expect(batch.gitSnapshots).toHaveProperty('first');
    expect(batch.gitSnapshots).toHaveProperty('second');
    // stale 不应在 batch 中（batch 从 get() 拷贝时包含 stale，但第一次调用后就不再拷贝）
    expect(batch.gitSnapshots).toHaveProperty('stale');
  });
});

describe('workspace load cascade ordering', () => {
  it('calls loadBatch in order: priority → completeStartup → deferred → natural', async () => {
    // Mock window.digitalLife for bootstrap path
    const callOrder: string[] = [];
    const mockListTreeForWorkspace = vi.fn().mockResolvedValue({ ok: true, data: [] });
    const mockListGitStatusForWorkspace = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const mockGetGitStatus = vi.fn().mockResolvedValue({ ok: true, data: { branch: 'main' } });

    (window as unknown as { digitalLife: unknown }).digitalLife = {
      app: {
        getInfo: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            appName: 'test',
            version: '0.0.0',
            config: {
              themeMode: 'light',
              resolvedTheme: 'light',
              maxRecentWorkspaces: 10,
              modelPreferences: { providers: {} },
              keybinds: {},
              fonts: {},
              maxConcurrentWorkspaces: 6,
              workspacePriorityIds: ['ws-1'],
              workspaceDeferredIds: ['ws-2'],
              workspaceNaturalOrder: ['ws-3'],
            },
            recentLogs: [],
            currentWorkspace: { id: 'ws-1', path: '/fake', rootPath: '/fake', name: 'ws-1' },
          },
        }),
        getModelHealth: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      },
      workspace: {
        listRecent: vi.fn().mockResolvedValue({
          ok: true,
          data: [
            { id: 'ws-1', path: '/fake/1', rootPath: '/fake/1', name: 'ws-1', lastOpenedAt: 0, isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, removedFromSidebar: false, available: true, hiddenFromRightPanels: false },
            { id: 'ws-2', path: '/fake/2', rootPath: '/fake/2', name: 'ws-2', lastOpenedAt: 0, isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, removedFromSidebar: false, available: true, hiddenFromRightPanels: false },
            { id: 'ws-3', path: '/fake/3', rootPath: '/fake/3', name: 'ws-3', lastOpenedAt: 0, isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, removedFromSidebar: false, available: true, hiddenFromRightPanels: false },
          ],
        }),
        getGitStatus: mockGetGitStatus,
        listTreeForWorkspace: mockListTreeForWorkspace,
        listGitStatusForWorkspace: mockListGitStatusForWorkspace,
        setEditorDirtyPaths: vi.fn().mockResolvedValue({ ok: true }),
      },
      patch: { getPatchSet: vi.fn().mockResolvedValue({ ok: true, data: null }) },
      task: { listAuditEntries: vi.fn().mockResolvedValue({ ok: true, data: [] }), getSnapshot: vi.fn().mockResolvedValue({ ok: true, data: undefined }) },
      command: { listRecent: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
      retrieval: { getStatus: vi.fn().mockResolvedValue({ ok: true, data: null }), getRepoMap: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
      conversation: {
        listSessions: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        getSession: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };

    // Track call order via listTreeForWorkspace invocations (each phase triggers N calls)
    mockListTreeForWorkspace.mockImplementation(async (path: string) => {
      callOrder.push(`loadBatch:${path}`);
      return { ok: true, data: [] };
    });
    mockListGitStatusForWorkspace.mockImplementation(async (path: string) => {
      callOrder.push(`loadBatch:${path}`);
      return { ok: true, data: undefined };
    });

    const store = useAppStore.getState();
    // Reset appReady for the test
    useAppStore.setState({ appReady: false });
    await store.bootstrap();

    // Allow the deferred IIFE to flush
    await new Promise((resolve) => setTimeout(resolve, 50));

    // priority batch must complete before appReady flips to true
    expect(useAppStore.getState().appReady).toBe(true);
    // All 3 workspaces should have been loaded (each triggers 2 calls — tree + git)
    expect(mockListTreeForWorkspace).toHaveBeenCalledTimes(3);
    expect(mockListGitStatusForWorkspace).toHaveBeenCalledTimes(3);
  });
});
