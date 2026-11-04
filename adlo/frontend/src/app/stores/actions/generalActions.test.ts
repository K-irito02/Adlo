import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAppStore } from '../slicedStore';
import {
  accumulateBatch,
  resetCalibrationMemo,
  resolveCalibrationOptions,
  setCalibrationOptionsForTesting,
} from './generalActions';
import { applyTreeLoadedPrune } from '../persisted/pruneWiring';
import type * as PruneWiringModule from '../persisted/pruneWiring';
import type { WorkspaceTreeNode } from '@adlo/kernel';
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
      toasts: [],
    });
  });

  afterEach(() => {
    useAppStore.setState({
      isFetching: {},
      errorToasts: [],
      toasts: [],
      appInfo: undefined,
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
        info: {
          config: { themeMode: 'system' },
          recentLogs: [],
          currentWorkspace: null,
          appName: 'test',
          version: '0.0.0',
        },
        sessionLockedFields: [],
      },
    });
    await promise;
    expect(useAppStore.getState().isFetching['updatePreferences']).toBe(false);
  });

  it('coalesces patches arriving while in flight instead of dropping them', async () => {
    let resolveFirst: (value: { ok: true; data: unknown }) => void;
    mockUpdatePreferences.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );
    mockUpdatePreferences.mockResolvedValue({
      ok: true,
      data: {
        info: {
          config: { themeMode: 'system' },
          recentLogs: [],
          currentWorkspace: null,
          appName: 'test',
          version: '0.0.0',
        },
        sessionLockedFields: [],
      },
    });

    const store = useAppStore.getState();
    // 首次请求在途中，后两个补丁（快速连改设置）到达 → 入队。
    const p1 = store.updatePreferences({ logLevel: 'debug' } as AppPreferencePatch);
    const p2 = store.updatePreferences({ terminalLogMode: 'multi' } as AppPreferencePatch);
    const p3 = store.updatePreferences({ debugLogMode: 'append' } as AppPreferencePatch);

    resolveFirst!({
      ok: true,
      data: {
        info: {
          config: { themeMode: 'system' },
          recentLogs: [],
          currentWorkspace: null,
          appName: 'test',
          version: '0.0.0',
        },
        sessionLockedFields: [],
      },
    });

    const results = await Promise.all([p1, p2, p3]);
    expect(results).toEqual([true, true, true]);
    // 三次调用只发两次 IPC：in-flight 期间的两个补丁合并为一次。
    expect(mockUpdatePreferences).toHaveBeenCalledTimes(2);
    expect(mockUpdatePreferences.mock.calls[0][0]).toEqual({ logLevel: 'debug' });
    expect(mockUpdatePreferences.mock.calls[1][0]).toEqual({
      terminalLogMode: 'multi',
      debugLogMode: 'append',
    });
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
        info: {
          config: { themeMode: 'system' },
          recentLogs: [],
          currentWorkspace: null,
          appName: 'test',
          version: '0.0.0',
        },
        sessionLockedFields: [],
      },
    });

    const store = useAppStore.getState();
    store.reportError('CONFIG_ERROR', 'previous error', 'general');
    expect(useAppStore.getState().errorToasts).toHaveLength(1);

    await store.updatePreferences({ language: 'en-US' } as AppPreferencePatch);
    expect(useAppStore.getState().errorToasts).toEqual([]);
  });

  it('queues (rather than silently drops) a call while another is in flight', async () => {
    // 语义变更（P1 合并式排队）：旧实现把 `isFetching` 守卫当防重入、直接 return false
    // 丢弃并发补丁 —— 快速连改设置会真实丢项。现在改为入队合并，必然发出 IPC。
    useAppStore.setState({ isFetching: { updatePreferences: true } });
    mockUpdatePreferences.mockResolvedValue({
      ok: true,
      data: {
        info: {
          config: { themeMode: 'system' },
          recentLogs: [],
          currentWorkspace: null,
          appName: 'test',
          version: '0.0.0',
        },
        sessionLockedFields: [],
      },
    });
    const store = useAppStore.getState();

    const ok = await store.updatePreferences({ language: 'en-US' } as AppPreferencePatch);

    expect(ok).toBe(true);
    expect(mockUpdatePreferences).toHaveBeenCalledWith({ language: 'en-US' });
  });

  it('shows a next-launch toast when the backend reports session-locked fields', async () => {
    // Phase 4 F3：被 CLI 锁定的字段已落盘但运行期保持 CLI 值 → 顶部提示。
    mockUpdatePreferences.mockResolvedValue({
      ok: true,
      data: {
        info: {
          config: { themeMode: 'system' },
          recentLogs: [],
          currentWorkspace: null,
          appName: 'test',
          version: '0.0.0',
        },
        sessionLockedFields: ['logLevel'],
      },
    });
    // 提示文案跟随当前语言：显式设为 zh-CN 走中文分支（默认跟随系统语言）。
    useAppStore.setState({
      appInfo: { config: { language: 'zh-CN' } } as unknown as StoreState['appInfo'],
    });

    const store = useAppStore.getState();
    const ok = await store.updatePreferences({ logLevel: 'debug' } as AppPreferencePatch);

    expect(ok).toBe(true);
    const toasts = useAppStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toContain('下次启动生效');
  });

  it('shows no next-launch toast when nothing is session-locked', async () => {
    mockUpdatePreferences.mockResolvedValue({
      ok: true,
      data: {
        info: {
          config: { themeMode: 'system' },
          recentLogs: [],
          currentWorkspace: null,
          appName: 'test',
          version: '0.0.0',
        },
        sessionLockedFields: [],
      },
    });

    const store = useAppStore.getState();
    const ok = await store.updatePreferences({ logLevel: 'debug' } as AppPreferencePatch);

    expect(ok).toBe(true);
    expect(useAppStore.getState().toasts).toHaveLength(0);
  });

  it('uses the patch language for the lock toast when language itself changed', async () => {
    // Closing M-5：补丁改了语言 → 提示跟新语言（英文），不跟旧 appInfo。
    mockUpdatePreferences.mockResolvedValue({
      ok: true,
      data: {
        info: {
          config: { themeMode: 'system' },
          recentLogs: [],
          currentWorkspace: null,
          appName: 'test',
          version: '0.0.0',
        },
        sessionLockedFields: ['logLevel'],
      },
    });
    useAppStore.setState({
      appInfo: { config: { language: 'zh-CN' } } as unknown as StoreState['appInfo'],
    });

    const store = useAppStore.getState();
    const ok = await store.updatePreferences({
      language: 'en-US',
      logLevel: 'debug',
    } as AppPreferencePatch);

    expect(ok).toBe(true);
    const toasts = useAppStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toContain('next launch');
  });

  it('treats a missing sessionLockedFields as empty instead of throwing', async () => {
    // Closing M-8：旧信封/异常信封无数组 → 视为空集，更新照常成功。
    mockUpdatePreferences.mockResolvedValue({
      ok: true,
      data: {
        info: {
          config: { themeMode: 'system' },
          recentLogs: [],
          currentWorkspace: null,
          appName: 'test',
          version: '0.0.0',
        },
      },
    });

    const store = useAppStore.getState();
    const ok = await store.updatePreferences({ logLevel: 'debug' } as AppPreferencePatch);

    expect(ok).toBe(true);
    expect(useAppStore.getState().toasts).toHaveLength(0);
  });

  it('keeps an in-flight failure visible when a second call joins the batch', async () => {
    // Closing M-2：并入在途批次不再 clearError，错误卡保留。
    mockUpdatePreferences.mockResolvedValueOnce({
      ok: false,
      error: { code: 'CONFIG_ERROR', message: 'boom' },
    });
    mockUpdatePreferences.mockResolvedValue({
      ok: true,
      data: {
        info: {
          config: { themeMode: 'system' },
          recentLogs: [],
          currentWorkspace: null,
          appName: 'test',
          version: '0.0.0',
        },
        sessionLockedFields: [],
      },
    });

    const store = useAppStore.getState();
    // 占住 drain：首次调用发出后，在其 resolve 前第二次调用并入同一批次。
    const first = store.updatePreferences({ logLevel: 'debug' } as AppPreferencePatch);
    const second = store.updatePreferences({ themeMode: 'dark' } as AppPreferencePatch);
    const [r1, r2] = await Promise.all([first, second]);
    expect(r1).toBe(false);
    expect(r2).toBe(true);
    expect(useAppStore.getState().errorToasts.length).toBeGreaterThan(0);
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

    // 等级联 IIFE 落定（waitFor 替代固定 sleep，CI 高负载不 flaky）
    await vi.waitFor(() => {
      expect(useAppStore.getState().appReady).toBe(true);
    });

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

    // 等后台级联落定（waitFor 替代固定 sleep）
    await vi.waitFor(() => {
      expect(useAppStore.getState().appReady).toBe(true);
    });

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
    // 等失败行 loading 清零（waitFor 替代固定 sleep）
    await vi.waitFor(() => {
      expect(useAppStore.getState().workspaceTreeLoading['ws-boom']).toBe(false);
    });

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
    // 等首包落库（waitFor 替代固定 sleep）
    await vi.waitFor(() => {
      expect(useAppStore.getState().workspaceTrees['ws-1']).toEqual(STALE_TREE);
    });
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
    // 等后台静默校准触发（fire-and-forget，waitFor 替代固定 100ms sleep）
    await vi.waitFor(() => {
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });

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
    // 等阻塞回退落库（waitFor 替代固定 sleep）
    await vi.waitFor(() => {
      expect(useAppStore.getState().workspaceTrees['ws-1']).toEqual(MISS_NODES);
    });
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
    // 等首包落库（waitFor 替代固定 sleep）
    await vi.waitFor(() => {
      expect(useAppStore.getState().workspaceTrees['ws-1']).toEqual(STALE_TREE);
    });
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
    // 等开关关闭后的全量包落库（waitFor 替代固定 sleep）
    await vi.waitFor(() => {
      expect(useAppStore.getState().workspaceTrees['ws-1']).toEqual(FRESH_TREE);
    });

    expect(mockListTree).toHaveBeenCalled();
    for (const call of mockListTree.mock.calls) {
      expect(call[1]).toBeUndefined();
    }
    expect(useAppStore.getState().workspaceTrees['ws-1']).toEqual(FRESH_TREE);
    expect(useAppStore.getState().workspaceTreeLoading['ws-1']).toBe(false);
  });

  it('skips the stale write when a fresh tree lands first (F2 seq guard)', async () => {
    // 真实竞态：stale 首包在途时用户触发新鲜加载并先落库 → stale 不得覆盖。
    // 注：不能在 bootstrap 前预置（bootstrap 会重置 `workspaceTrees:{}`），须在请求在途时 seeded。
    let releaseStale!: () => void;
    const staleGate = new Promise<void>((resolve) => {
      releaseStale = resolve;
    });
    setupStaleBootstrap(['ws-1'], async () => {
      await staleGate;
      return {
        ok: true,
        data: { tree: STALE_TREE, fromCache: true, capturedAt: Date.now() - TTL_MS - 60_000 },
      };
    });
    const bootstrapped = useAppStore.getState().bootstrap();
    // 等 stale 请求发出（首包在途），再模拟用户新鲜加载先落库。
    await vi.waitFor(() => {
      expect(mockListTree).toHaveBeenCalled();
    });
    useAppStore.setState((s) => ({ workspaceTrees: { ...s.workspaceTrees, 'ws-1': FRESH_TREE } }));
    releaseStale();
    await bootstrapped;
    await vi.waitFor(() => {
      expect(useAppStore.getState().appReady).toBe(true);
    });

    // 用户点击的新鲜树必胜：stale 首包跳过写，且不计入校准（无需二次刷新）。
    expect(useAppStore.getState().workspaceTrees['ws-1']).toEqual(FRESH_TREE);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('treats non-boolean fromCache or non-number capturedAt as a miss (F6)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      setupStaleBootstrap(['ws-1'], async () => ({
        ok: true,
        // 失格载荷：fromCache 非布尔、capturedAt 非 number。
        data: { tree: STALE_TREE, fromCache: 'yes', capturedAt: 'now' },
      }));
      await useAppStore.getState().bootstrap();
      await vi.waitFor(() => {
        expect(useAppStore.getState().appReady).toBe(true);
      });

      // miss 语义：不落库、不记 stale（永不校准），warn 一次。
      expect(useAppStore.getState().workspaceTrees['ws-1']).toBeUndefined();
      expect(mockRefresh).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        '[workspace load] malformed tree payload, treating as miss',
        expect.objectContaining({ id: 'ws-1' }),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('resolveCalibrationOptions from stats (T9)', () => {
  const STATS_BASE = {
    workspaceCount: 0,
    totalBytes: 0,
    oldestCapturedAt: null,
    newestCapturedAt: null,
  };

  function setStorageBridge(impl: unknown) {
    (window as unknown as { digitalLife?: unknown }).digitalLife = { storage: impl };
  }

  afterEach(() => {
    setCalibrationOptionsForTesting(undefined);
    (window as unknown as { digitalLife?: unknown }).digitalLife = undefined;
  });

  it('returns the stats options when the bridge resolves', async () => {
    setStorageBridge({
      getTreeCacheStats: vi
        .fn()
        .mockResolvedValue({ ok: true, data: { ...STATS_BASE, enabled: false, ttlMinutes: 60 } }),
    });
    await expect(resolveCalibrationOptions()).resolves.toEqual({
      enabled: false,
      ttlMinutes: 60,
    });
  });

  it('falls back to Rust defaults when stats fail', async () => {
    setStorageBridge({
      getTreeCacheStats: vi.fn().mockResolvedValue({ ok: false, error: { message: 'gone' } }),
    });
    await expect(resolveCalibrationOptions()).resolves.toEqual({ enabled: true, ttlMinutes: 15 });
  });

  it('falls back to Rust defaults when the bridge is missing', async () => {
    (window as unknown as { digitalLife?: unknown }).digitalLife = {};
    await expect(resolveCalibrationOptions()).resolves.toEqual({ enabled: true, ttlMinutes: 15 });
  });

  it('testing override still wins over stats', async () => {
    setStorageBridge({
      getTreeCacheStats: vi
        .fn()
        .mockResolvedValue({ ok: true, data: { ...STATS_BASE, enabled: false, ttlMinutes: 60 } }),
    });
    setCalibrationOptionsForTesting({ enabled: true, ttlMinutes: 5 });
    await expect(resolveCalibrationOptions()).resolves.toEqual({ enabled: true, ttlMinutes: 5 });
  });

  it('clamps out-of-range TTL to Rust defaults (F5)', async () => {
    for (const ttlMinutes of [0, -5, 1441, 100_000, Number.NaN, Number.POSITIVE_INFINITY]) {
      setStorageBridge({
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: { ...STATS_BASE, enabled: true, ttlMinutes },
        }),
      });
      resetCalibrationMemo();
      await expect(resolveCalibrationOptions()).resolves.toEqual({
        enabled: true,
        ttlMinutes: 15,
      });
    }
    // 合法边界原样采用。
    for (const ttlMinutes of [1, 15, 1440]) {
      setStorageBridge({
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: { ...STATS_BASE, enabled: false, ttlMinutes },
        }),
      });
      resetCalibrationMemo();
      await expect(resolveCalibrationOptions()).resolves.toEqual({
        enabled: false,
        ttlMinutes,
      });
    }
  });

  it('single-flights concurrent resolutions into one stats RPC (F5)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const getTreeCacheStats = vi.fn().mockImplementation(() =>
      gate.then(() => ({
        ok: true,
        data: { ...STATS_BASE, enabled: true, ttlMinutes: 60 },
      })),
    );
    setStorageBridge({ getTreeCacheStats });
    resetCalibrationMemo();
    // 首调用发起 fetch（memo 同步落定），次调用复用同一 promise。
    const first = resolveCalibrationOptions();
    const second = resolveCalibrationOptions();
    release();
    await expect(first).resolves.toEqual({ enabled: true, ttlMinutes: 60 });
    await expect(second).resolves.toEqual({ enabled: true, ttlMinutes: 60 });
    expect(getTreeCacheStats).toHaveBeenCalledTimes(1);
  });
});

describe('fresh-path payload unwrap (T8)', () => {
  const NODES: WorkspaceTreeNode[] = [
    { path: 'src', name: 'src', kind: 'directory', children: [] },
  ];

  function setupFreshBridge() {
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      workspace: {
        listTreeForWorkspace: vi.fn().mockResolvedValue({
          ok: true,
          data: { tree: NODES, fromCache: false, capturedAt: Date.now() },
        }),
        listTree: vi.fn().mockResolvedValue({
          ok: true,
          data: { tree: NODES, fromCache: false, capturedAt: Date.now() },
        }),
      },
    };
  }

  beforeEach(() => {
    setupFreshBridge();
    useAppStore.setState({
      workspaceTrees: {},
      workspaceTreeLoading: {},
      workspaceTreeErrors: {},
      workspaceTreeRefreshing: {},
    });
  });

  it('unwraps the payload tree on lazy load', async () => {
    // 桥返回 { tree: NODES, fromCache: false } → workspaceTrees[id] === NODES。
    // .catch 收敛剪枝段对未拆包对象的 TypeError，让 RED 落在下面的断言 diff 上。
    await useAppStore
      .getState()
      .loadWorkspaceTree('ws-1' as never, '/fake/ws-1')
      .catch(() => {});
    expect(useAppStore.getState().workspaceTrees['ws-1']).toEqual(NODES);
  });

  it('unwraps the payload tree on refreshOneWorkspaceTree', async () => {
    await useAppStore.getState().refreshOneWorkspaceTree('ws-1' as never, '/fake/ws-1');
    expect(useAppStore.getState().workspaceTrees['ws-1']).toEqual(NODES);
  });

  it('unwraps the payload tree on refreshWorkspaceTree', async () => {
    useAppStore.setState({
      appInfo: {
        currentWorkspace: { id: 'ws-1', path: '/fake/ws-1', rootPath: '/fake/ws-1', name: 'ws-1' },
      } as never,
    });
    await useAppStore.getState().refreshWorkspaceTree();
    expect(useAppStore.getState().workspaceTrees['ws-1']).toEqual(NODES);
  });
});
