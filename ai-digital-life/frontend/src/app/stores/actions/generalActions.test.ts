import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAppStore } from '../slicedStore';
import { accumulateBatch, setCalibrationOptionsForTesting } from './generalActions';
import { applyTreeLoadedPrune } from '../persisted/pruneWiring';
import type * as PruneWiringModule from '../persisted/pruneWiring';
import type { WorkspaceTreeNode } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';
import type { AppPreferencePatch } from '../../../shared/ipc-types.generated';

// loadBatch 的剪枝入口直接导入模块函数：经 vi.mock 设 spy（ESM 只读绑定无法 spyOn），
// behavior coverage 走真实 store + 真实 collectDirPaths，仅剪枝副作用被观测。
vi.mock('../persisted/pruneWiring', async (importOriginal) => {
  const actual = await importOriginal<typeof PruneWiringModule>();
  return { ...actual, applyTreeLoadedPrune: vi.fn(), applyWorkspacePrune: vi.fn() };
});

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
      isFetching: {},
      errorToasts: [],
    });
  });

  afterEach(() => {
    useAppStore.setState({
      isFetching: {},
      errorToasts: [],
    });
  });

  it('sets isFetching[updatePreferences] during call', async () => {
    let resolvePromise: (value: { ok: true; data: unknown }) => void;
    mockUpdatePreferences.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
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

    const toasts = useAppStore.getState().errorToasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].code).toBe('CONFIG_ERROR');
    expect(toasts[0].detail).toContain('Invalid preference');
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
    store.reportError('CONFIG_ERROR', 'previous error', 'general');
    expect(useAppStore.getState().errorToasts).toHaveLength(1);

    await store.updatePreferences({ language: 'en-US' } as AppPreferencePatch);
    expect(useAppStore.getState().errorToasts).toEqual([]);
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
            {
              id: 'ws-1',
              path: '/fake/1',
              rootPath: '/fake/1',
              name: 'ws-1',
              lastOpenedAt: 0,
              isPinned: false,
              pinnedOrder: 0,
              unpinnedOrder: 0,
              removedFromSidebar: false,
              available: true,
            },
            {
              id: 'ws-2',
              path: '/fake/2',
              rootPath: '/fake/2',
              name: 'ws-2',
              lastOpenedAt: 0,
              isPinned: false,
              pinnedOrder: 0,
              unpinnedOrder: 0,
              removedFromSidebar: false,
              available: true,
            },
            {
              id: 'ws-3',
              path: '/fake/3',
              rootPath: '/fake/3',
              name: 'ws-3',
              lastOpenedAt: 0,
              isPinned: false,
              pinnedOrder: 0,
              unpinnedOrder: 0,
              removedFromSidebar: false,
              available: true,
            },
          ],
        }),
        getGitStatus: mockGetGitStatus,
        listTreeForWorkspace: mockListTreeForWorkspace,
        listGitStatusForWorkspace: mockListGitStatusForWorkspace,
        setEditorDirtyPaths: vi.fn().mockResolvedValue({ ok: true }),
      },
      patch: { getPatchSet: vi.fn().mockResolvedValue({ ok: true, data: null }) },
      command: { listRecent: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
      retrieval: {
        getStatus: vi.fn().mockResolvedValue({ ok: true, data: null }),
        getRepoMap: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      },
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

  it('方案 B: preloads all visible workspaces even when currentWorkspace is none', async () => {
    const mockListTreeForWorkspace = vi.fn().mockResolvedValue({ ok: true, data: [] });
    const mockListGitStatusForWorkspace = vi.fn().mockResolvedValue({ ok: true, data: undefined });

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
              workspacePriorityIds: [],
              workspaceDeferredIds: [],
              workspaceNaturalOrder: [],
            },
            recentLogs: [],
            currentWorkspace: null,
          },
        }),
        getModelHealth: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      },
      workspace: {
        listRecent: vi.fn().mockResolvedValue({
          ok: true,
          data: [
            {
              id: 'ws-a',
              path: '/fake/a',
              rootPath: '/fake/a',
              name: 'ws-a',
              lastOpenedAt: 0,
              isPinned: false,
              pinnedOrder: 0,
              unpinnedOrder: 0,
              removedFromSidebar: false,
              available: true,
            },
          ],
        }),
        getGitStatus: vi.fn().mockResolvedValue({ ok: true, data: { branch: 'main' } }),
        listTreeForWorkspace: mockListTreeForWorkspace,
        listGitStatusForWorkspace: mockListGitStatusForWorkspace,
        setEditorDirtyPaths: vi.fn().mockResolvedValue({ ok: true }),
      },
      patch: { getPatchSet: vi.fn().mockResolvedValue({ ok: true, data: null }) },
      command: { listRecent: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
      retrieval: {
        getStatus: vi.fn().mockResolvedValue({ ok: true, data: null }),
        getRepoMap: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      },
      conversation: {
        listSessions: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        getSession: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };

    const store = useAppStore.getState();
    useAppStore.setState({ appReady: false });
    await store.bootstrap();

    // Allow the background cascade to flush
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 方案 B：无 currentWorkspace 时也必须预加载可见工作区树
    expect(useAppStore.getState().appReady).toBe(true);
    expect(mockListTreeForWorkspace).toHaveBeenCalledTimes(1);
    expect(mockListGitStatusForWorkspace).toHaveBeenCalledTimes(1);
  });

  it('M2: clears loading flags for rejected workspace loads so they can retry', async () => {
    const mockListTreeForWorkspace = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: [] })
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ ok: true, data: [] });
    const mockListGitStatusForWorkspace = vi.fn().mockResolvedValue({ ok: true, data: undefined });

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
              workspacePriorityIds: ['ws-ok', 'ws-boom'],
              workspaceDeferredIds: [],
              workspaceNaturalOrder: [],
            },
            recentLogs: [],
            currentWorkspace: { id: 'ws-ok', path: '/fake', rootPath: '/fake', name: 'ws-ok' },
          },
        }),
        getModelHealth: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      },
      workspace: {
        listRecent: vi.fn().mockResolvedValue({
          ok: true,
          data: [
            {
              id: 'ws-ok',
              path: '/fake/ok',
              rootPath: '/fake/ok',
              name: 'ws-ok',
              lastOpenedAt: 0,
              isPinned: false,
              pinnedOrder: 0,
              unpinnedOrder: 0,
              removedFromSidebar: false,
              available: true,
            },
            {
              id: 'ws-boom',
              path: '/fake/boom',
              rootPath: '/fake/boom',
              name: 'ws-boom',
              lastOpenedAt: 0,
              isPinned: false,
              pinnedOrder: 0,
              unpinnedOrder: 1,
              removedFromSidebar: false,
              available: true,
            },
          ],
        }),
        getGitStatus: vi.fn().mockResolvedValue({ ok: true, data: { branch: 'main' } }),
        listTreeForWorkspace: mockListTreeForWorkspace,
        listGitStatusForWorkspace: mockListGitStatusForWorkspace,
        setEditorDirtyPaths: vi.fn().mockResolvedValue({ ok: true }),
      },
      patch: { getPatchSet: vi.fn().mockResolvedValue({ ok: true, data: null }) },
      command: { listRecent: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
      retrieval: {
        getStatus: vi.fn().mockResolvedValue({ ok: true, data: null }),
        getRepoMap: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      },
      conversation: {
        listSessions: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        getSession: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };

    const store = useAppStore.getState();
    useAppStore.setState({
      appReady: false,
      workspaceTreeLoading: {},
      workspaceChangesTreeLoading: {},
    });
    await store.bootstrap();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // rejected 的 ws-boom 必须清除两个 loading 标记，否则新 guard（hasData||isLoading）会永久卡住它
    expect(useAppStore.getState().workspaceTreeLoading['ws-boom']).toBe(false);
    expect(useAppStore.getState().workspaceChangesTreeLoading['ws-boom']).toBe(false);
    expect(useAppStore.getState().workspaceTreeLoading['ws-ok']).toBe(false);
  });
});

describe('loadBatch stale-first + silent calibration (T7)', () => {
  const STALE_TREE: WorkspaceTreeNode[] = [
    { path: 'stale-dir', name: 'stale-dir', kind: 'directory', children: [] },
  ];
  const FRESH_TREE: WorkspaceTreeNode[] = [
    {
      path: 'src',
      name: 'src',
      kind: 'directory',
      children: [{ path: 'src/new', name: 'new', kind: 'directory', children: [] }],
    },
  ];
  const MISS_NODES: WorkspaceTreeNode[] = [
    { path: 'docs', name: 'docs', kind: 'directory', children: [] },
  ];
  const TTL_MS = 15 * 60 * 1000;

  function workspaceEntry(id: string) {
    return {
      id,
      path: `/fake/${id}`,
      rootPath: `/fake/${id}`,
      name: id,
      lastOpenedAt: 0,
      isPinned: false,
      pinnedOrder: 0,
      unpinnedOrder: 0,
      removedFromSidebar: false,
      available: true,
    };
  }

  type TreeImpl = (
    path: string,
    options?: { force?: boolean; allowStale?: boolean },
  ) => Promise<unknown>;

  let mockListTree: ReturnType<typeof vi.fn>;
  let mockRefresh: ReturnType<typeof vi.fn>;
  let origRefresh: StoreState['refreshOneWorkspaceTree'] | undefined;

  function setupStaleBootstrap(ids: string[], treeImpl: TreeImpl) {
    mockListTree = vi.fn(treeImpl);
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
              workspacePriorityIds: ids,
              workspaceDeferredIds: [],
              workspaceNaturalOrder: [],
            },
            recentLogs: [],
            currentWorkspace: {
              id: ids[0],
              path: `/fake/${ids[0]}`,
              rootPath: `/fake/${ids[0]}`,
              name: ids[0],
            },
          },
        }),
        getModelHealth: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      },
      workspace: {
        listRecent: vi.fn().mockResolvedValue({ ok: true, data: ids.map(workspaceEntry) }),
        getGitStatus: vi.fn().mockResolvedValue({ ok: true, data: { branch: 'main' } }),
        listTreeForWorkspace: mockListTree,
        listGitStatusForWorkspace: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        listGitBranches: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        setEditorDirtyPaths: vi.fn().mockResolvedValue({ ok: true }),
      },
      patch: { getPatchSet: vi.fn().mockResolvedValue({ ok: true, data: null }) },
      command: { listRecent: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
      retrieval: {
        getStatus: vi.fn().mockResolvedValue({ ok: true, data: null }),
        getRepoMap: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      },
      conversation: {
        listSessions: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        getSession: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
  }

  function resetLoadState() {
    useAppStore.setState({
      appReady: false,
      workspaceTrees: {},
      workspaceTreeLoading: {},
      workspaceTreeErrors: {},
      gitSnapshots: {},
      workspaceChangesTreeLoading: {},
    });
  }

  beforeEach(() => {
    origRefresh ??= useAppStore.getState().refreshOneWorkspaceTree;
    vi.mocked(applyTreeLoadedPrune).mockClear();
    // 模拟 T8 拆包后的校准行为：静默刷新写入新鲜树数组（T7 只验证门控与剪枝门，
    // 不验证 T8 的拆包；真实 refreshOneWorkspaceTree 的 payload 写入归 T8）。
    mockRefresh = vi.fn(async (id: string) => {
      useAppStore.setState((s) => ({ workspaceTrees: { ...s.workspaceTrees, [id]: FRESH_TREE } }));
    });
    useAppStore.setState({
      refreshOneWorkspaceTree: mockRefresh as unknown as StoreState['refreshOneWorkspaceTree'],
    });
    resetLoadState();
    setCalibrationOptionsForTesting(undefined);
  });

  afterEach(() => {
    if (origRefresh) {
      useAppStore.setState({ refreshOneWorkspaceTree: origRefresh });
    }
    setCalibrationOptionsForTesting(undefined);
  });

  it('renders the stale tree immediately without the loading flag', async () => {
    setupStaleBootstrap(['ws-1'], async () => ({
      ok: true,
      data: { tree: STALE_TREE, fromCache: true, capturedAt: Date.now() },
    }));
    const seen: unknown[] = [];
    const unsub = useAppStore.subscribe((s) => {
      seen.push(s.workspaceTreeLoading['ws-1']);
    });
    await useAppStore.getState().bootstrap();
    await new Promise((resolve) => setTimeout(resolve, 50));
    unsub();

    expect(mockListTree).toHaveBeenCalledWith('/fake/ws-1', { allowStale: true });
    expect(useAppStore.getState().workspaceTrees['ws-1']).toEqual(STALE_TREE);
    expect(useAppStore.getState().workspaceTreeLoading['ws-1']).not.toBe(true);
    // stale 可用时 loading 永不置 true（订阅全程无 true，而非事后清零）
    expect(seen).not.toContain(true);
  });

  it('silently calibrates after a stale first packet and prunes only on the fresh tree', async () => {
    setupStaleBootstrap(['ws-1'], async (_path, options) => {
      if (options?.force) {
        return { ok: true, data: { tree: FRESH_TREE, fromCache: false, capturedAt: Date.now() } };
      }
      return {
        ok: true,
        data: { tree: STALE_TREE, fromCache: true, capturedAt: Date.now() - TTL_MS - 60_000 },
      };
    });
    await useAppStore.getState().bootstrap();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockRefresh).toHaveBeenCalledWith('ws-1', '/fake/ws-1', { silent: true });
    expect(useAppStore.getState().workspaceTrees['ws-1']).toEqual(FRESH_TREE);
    // 剪枝只消费新鲜树：恰一次，且目录集为 fresh（含新目录 src/new，无 stale-dir）
    const pruneMock = vi.mocked(applyTreeLoadedPrune);
    expect(pruneMock).toHaveBeenCalledTimes(1);
    expect(pruneMock).toHaveBeenCalledWith('ws-1', new Set(['src', 'src/new']));
  });

  it('falls back to the blocking load when no stale row exists', async () => {
    setupStaleBootstrap(['ws-1'], async () => ({
      ok: true,
      data: { tree: MISS_NODES, fromCache: false, capturedAt: Date.now() },
    }));
    const seen: unknown[] = [];
    const unsub = useAppStore.subscribe((s) => {
      seen.push(s.workspaceTreeLoading['ws-1']);
    });
    await useAppStore.getState().bootstrap();
    await new Promise((resolve) => setTimeout(resolve, 50));
    unsub();

    expect(mockListTree).toHaveBeenCalledWith('/fake/ws-1', { allowStale: true });
    // 阻塞回退：loading 正常置位又清除，与现状一致
    expect(seen).toContain(true);
    expect(useAppStore.getState().workspaceTreeLoading['ws-1']).toBe(false);
    expect(useAppStore.getState().workspaceTrees['ws-1']).toEqual(MISS_NODES);
    // miss 即新鲜：直接剪枝，无需校准
    expect(vi.mocked(applyTreeLoadedPrune)).toHaveBeenCalledWith('ws-1', new Set(['docs']));
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('skips calibration inside the TTL window and honors the master switch', async () => {
    // TTL 窗内：无二次 refresh，无剪枝，树保持 STALE
    setupStaleBootstrap(['ws-1'], async () => ({
      ok: true,
      data: { tree: STALE_TREE, fromCache: true, capturedAt: Date.now() },
    }));
    await useAppStore.getState().bootstrap();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(useAppStore.getState().workspaceTrees['ws-1']).toEqual(STALE_TREE);
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(vi.mocked(applyTreeLoadedPrune)).not.toHaveBeenCalled();

    // 总开关关闭：首包请求不带 allowStale，行为等同现状
    setCalibrationOptionsForTesting({ enabled: false, ttlMinutes: 15 });
    mockListTree.mockImplementation(async () => ({
      ok: true,
      data: { tree: FRESH_TREE, fromCache: false, capturedAt: Date.now() },
    }));
    mockListTree.mockClear();
    vi.mocked(applyTreeLoadedPrune).mockClear();
    mockRefresh.mockClear();
    resetLoadState();
    await useAppStore.getState().bootstrap();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockListTree).toHaveBeenCalled();
    for (const call of mockListTree.mock.calls) {
      expect(call[1]).toBeUndefined();
    }
    expect(useAppStore.getState().workspaceTrees['ws-1']).toEqual(FRESH_TREE);
    expect(useAppStore.getState().workspaceTreeLoading['ws-1']).toBe(false);
  });
});
