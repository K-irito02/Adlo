import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createStore } from 'zustand';
import {
  applyGitOperation,
  clearChangePreviewForWorkspace,
  createGitSnapshotActions,
} from '../gitSnapshotActions';
import { pendingChangePreviewPath, setPendingChangePreviewPath } from '../../cacheHelpers';
import {
  getCachedChangePreview,
  getNextChangePreviewRequestSeq,
  scopedFileKey,
  setCachedChangePreview,
} from '../../cacheHelpers';
import { openChangePreviewGeneric } from '../editorActionsHelpers';

interface TestWorkspaceEntry {
  id: string;
  path: string;
  removedFromSidebar?: boolean;
  available?: boolean;
}

interface TestStore {
  gitSnapshot?: unknown;
  gitSnapshots: Record<string, unknown>;
  appInfo?: {
    currentWorkspace?: { id: string; path?: string; rootPath?: string };
  };
  recentWorkspaces: TestWorkspaceEntry[];
  workspaceChangesExpanded: Record<string, boolean>;
  workspaceChangesTreeLoading: Record<string, boolean>;
  workspaceChangesTreeErrors: Record<string, string | undefined>;
  changesTreeRefreshing: Record<string, boolean>;
  fetchGitStatus: () => Promise<void>;
  refreshGitSnapshot: (
    workspaceId: string,
    workspacePath: string,
    options?: { silent?: boolean },
  ) => Promise<void>;
  initGitRepo: (workspaceId: string, workspacePath: string) => Promise<boolean>;
  reportSilentError: (...args: unknown[]) => string;
  selectedChangePreviewPath?: string;
  selectedChangePreviewWorkspaceId?: string;
  openChangePreviewForWorkspace: (workspacePath: string, relativePath: string) => Promise<void>;
}

function makeStore(opts?: {
  appInfo?: TestStore['appInfo'];
  recentWorkspaces?: TestWorkspaceEntry[];
  workspaceChangesExpanded?: Record<string, boolean>;
}) {
  const reportSilentError = vi.fn(() => 'silent-id');
  const openChangePreviewForWorkspace = vi.fn(async () => {});
  const store = createStore<TestStore>((set, get) => {
    const actions = createGitSnapshotActions(set as never, () => get() as never);
    return {
      gitSnapshot: undefined,
      gitSnapshots: {},
      workspaceChangesTreeLoading: {},
      workspaceChangesTreeErrors: {},
      changesTreeRefreshing: {},
      appInfo: opts?.appInfo,
      recentWorkspaces: opts?.recentWorkspaces ?? [],
      workspaceChangesExpanded: opts?.workspaceChangesExpanded ?? {},
      reportSilentError,
      openChangePreviewForWorkspace,
      ...actions,
    } as TestStore;
  });
  return { store, reportSilentError, openChangePreviewForWorkspace };
}

const snapshotData = { staged: [], unstaged: [], untracked: [], conflicts: [], capturedAt: 0 };
const currentWsAppInfo = {
  currentWorkspace: { id: 'ws-current', path: '/current', rootPath: '/current' },
};

describe('refreshGitSnapshot', () => {
  beforeEach(() => {
    vi.stubGlobal('digitalLife', {
      workspace: {
        listGitStatusForWorkspace: vi.fn(),
        getGitStatus: vi.fn(),
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('非 silent 时写 changesTreeRefreshing 并保留数据', async () => {
    (window as any).digitalLife.workspace.listGitStatusForWorkspace.mockResolvedValue({
      ok: true,
      data: { staged: [], unstaged: [], untracked: [], conflicts: [], capturedAt: 0 },
    });
    const { store } = makeStore();
    const p = store.getState().refreshGitSnapshot('ws-1', '/p');
    expect(store.getState().changesTreeRefreshing['ws-1']).toBe(true);
    await p;
    expect(store.getState().changesTreeRefreshing['ws-1']).toBe(false);
    expect(store.getState().gitSnapshots['ws-1']).toEqual({
      staged: [],
      unstaged: [],
      untracked: [],
      conflicts: [],
      capturedAt: 0,
    });
  });

  it('silent 时不写 changesTreeRefreshing', async () => {
    (window as any).digitalLife.workspace.listGitStatusForWorkspace.mockResolvedValue({
      ok: true,
      data: { staged: [], unstaged: [], untracked: [], conflicts: [], capturedAt: 0 },
    });
    const { store } = makeStore();
    await store.getState().refreshGitSnapshot('ws-1', '/p', { silent: true });
    expect(store.getState().changesTreeRefreshing['ws-1']).toBeUndefined();
  });

  it('silent 失败时仍写入 error 且不写 refreshing', async () => {
    (window as any).digitalLife.workspace.listGitStatusForWorkspace.mockResolvedValue({
      ok: false,
      error: { message: 'boom' },
    });
    const { store } = makeStore();
    await store.getState().refreshGitSnapshot('ws-1', '/p', { silent: true });
    expect(store.getState().workspaceChangesTreeErrors['ws-1']).toBe('boom');
    expect(store.getState().changesTreeRefreshing['ws-1']).toBeUndefined();
  });

  it('silent 成功时清除既有的陈旧 error', async () => {
    (window as any).digitalLife.workspace.listGitStatusForWorkspace.mockResolvedValue({
      ok: true,
      data: { staged: [], unstaged: [], untracked: [], conflicts: [], capturedAt: 0 },
    });
    const { store } = makeStore();
    store.setState({
      workspaceChangesTreeErrors: {
        ...store.getState().workspaceChangesTreeErrors,
        'ws-1': 'stale',
      },
    });
    await store.getState().refreshGitSnapshot('ws-1', '/p', { silent: true });
    expect(store.getState().workspaceChangesTreeErrors['ws-1']).toBeUndefined();
  });

  it('选中预览仍在快照中时按新内容重开（diff 与大纲同步）', async () => {
    vi.mocked(window.digitalLife.workspace.listGitStatusForWorkspace).mockResolvedValue({
      ok: true,
      data: {
        isRepo: true,
        staged: ['a.txt'],
        unstaged: [],
        untracked: [],
        conflicts: [],
        capturedAt: 5,
      },
    });
    const { store, openChangePreviewForWorkspace } = makeStore({
      recentWorkspaces: [{ id: 'ws-1', path: '/p' }],
    });
    // 旧 diff 进缓存：重开必须失效它，否则会读回旧内容（本轮修复的核心）。
    setCachedChangePreview(scopedFileKey('ws-1', 'a.txt'), {
      baseContent: 'old-base',
      currentContent: 'old-current',
    } as never);
    store.setState({
      selectedChangePreviewPath: 'a.txt',
      selectedChangePreviewWorkspaceId: 'ws-1',
    });
    await store.getState().refreshGitSnapshot('ws-1', '/p', { silent: true });
    expect(getCachedChangePreview(scopedFileKey('ws-1', 'a.txt'))).toBeUndefined();
    expect(openChangePreviewForWorkspace).toHaveBeenCalledWith('/p', 'a.txt');
  });

  it('当前工作区不在侧栏时按同一 global 键失效缓存', async () => {
    vi.mocked(window.digitalLife.workspace.listGitStatusForWorkspace).mockResolvedValue({
      ok: true,
      data: {
        isRepo: true,
        staged: ['a.txt'],
        unstaged: [],
        untracked: [],
        conflicts: [],
        capturedAt: 5,
      },
    });
    const { store, openChangePreviewForWorkspace } = makeStore({ appInfo: currentWsAppInfo });
    const globalKey = scopedFileKey(undefined, 'a.txt');
    setCachedChangePreview(globalKey, {
      baseContent: 'old-base',
      currentContent: 'old-current',
    } as never);
    store.setState({
      selectedChangePreviewPath: 'a.txt',
      selectedChangePreviewWorkspaceId: 'ws-current',
    });

    await store.getState().refreshGitSnapshot('ws-current', '/current', { silent: true });

    expect(getCachedChangePreview(globalKey)).toBeUndefined();
    expect(openChangePreviewForWorkspace).toHaveBeenCalledWith('/current', 'a.txt');
  });

  it('用户预览请求在途时让路（不重开）', async () => {
    vi.mocked(window.digitalLife.workspace.listGitStatusForWorkspace).mockResolvedValue({
      ok: true,
      data: {
        isRepo: true,
        staged: ['a.txt'],
        unstaged: [],
        untracked: [],
        conflicts: [],
        capturedAt: 5,
      },
    });
    const { store, openChangePreviewForWorkspace } = makeStore({
      recentWorkspaces: [{ id: 'ws-1', path: '/p' }],
    });
    store.setState({
      selectedChangePreviewPath: 'a.txt',
      selectedChangePreviewWorkspaceId: 'ws-1',
    });
    setPendingChangePreviewPath('a.txt');
    try {
      await store.getState().refreshGitSnapshot('ws-1', '/p', { silent: true });
      expect(openChangePreviewForWorkspace).not.toHaveBeenCalled();
    } finally {
      setPendingChangePreviewPath(undefined);
    }
  });

  it('预览不属于该工作区时不重开', async () => {
    vi.mocked(window.digitalLife.workspace.listGitStatusForWorkspace).mockResolvedValue({
      ok: true,
      data: {
        isRepo: true,
        staged: ['a.txt'],
        unstaged: [],
        untracked: [],
        conflicts: [],
        capturedAt: 5,
      },
    });
    const { store, openChangePreviewForWorkspace } = makeStore({
      appInfo: currentWsAppInfo,
      recentWorkspaces: [
        { id: 'ws-1', path: '/p' },
        { id: 'ws-2', path: '/other' },
      ],
    });
    store.setState({
      selectedChangePreviewPath: 'a.txt',
      selectedChangePreviewWorkspaceId: 'ws-2',
    });
    await store.getState().refreshGitSnapshot('ws-1', '/p', { silent: true });
    expect(openChangePreviewForWorkspace).not.toHaveBeenCalled();
  });
});

describe('initGitRepo', () => {
  beforeEach(() => {
    vi.stubGlobal('digitalLife', {
      workspace: {
        initGitRepo: vi.fn(),
        listGitStatusForWorkspace: vi.fn(),
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('成功时写入快照、清除旧 error，并把工作区路径显式传给后端', async () => {
    (window as any).digitalLife.workspace.initGitRepo.mockResolvedValue({
      ok: true,
      data: {
        isRepo: true,
        branch: 'main',
        staged: [],
        unstaged: [],
        untracked: [],
        conflicts: [],
        capturedAt: 1,
      },
    });
    const { store } = makeStore();
    store.setState({ workspaceChangesTreeErrors: { 'ws-1': 'stale' } });

    const ok = await store.getState().initGitRepo('ws-1', '/target-workspace');

    expect(ok).toBe(true);
    expect((window as any).digitalLife.workspace.initGitRepo).toHaveBeenCalledWith(
      '/target-workspace',
    );
    expect(store.getState().gitSnapshots['ws-1']).toMatchObject({ isRepo: true, branch: 'main' });
    expect(store.getState().workspaceChangesTreeErrors['ws-1']).toBeUndefined();
  });

  it('失败时返回 false 并写入该工作区的 error', async () => {
    (window as any).digitalLife.workspace.initGitRepo.mockResolvedValue({
      ok: false,
      error: { message: 'git init failed' },
    });
    const { store } = makeStore();

    const ok = await store.getState().initGitRepo('ws-1', '/target-workspace');

    expect(ok).toBe(false);
    expect(store.getState().workspaceChangesTreeErrors['ws-1']).toBe('git init failed');
  });
});

describe('refreshAllGitSnapshotsSilent 焦点回归补刷', () => {
  // 类型化桥接替身（dev-rules 禁 any）：与本文件既有 `(window as any)` 写法不同，
  // 新增测试一律走 unknown 收窄。
  function gitStatusBridge() {
    return (
      window as unknown as {
        digitalLife: {
          workspace: {
            listGitStatusForWorkspace: ReturnType<typeof vi.fn>;
          };
        };
      }
    ).digitalLife.workspace.listGitStatusForWorkspace;
  }
  beforeEach(() => {
    vi.stubGlobal('digitalLife', {
      workspace: {
        listGitStatusForWorkspace: vi.fn(),
        getGitStatus: vi.fn(),
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const entries = [
    { id: 'ws-1', path: '/a', available: true },
    { id: 'ws-2', path: '/b', available: true },
    { id: 'ws-hidden', path: '/c', available: true, removedFromSidebar: true },
    { id: 'ws-offline', path: '/d', available: false },
  ];

  it('刷新所有已添加可用工作区（隐藏/离线除外），不受展开状态影响，一律 silent', async () => {
    const bridge = gitStatusBridge();
    bridge.mockResolvedValue({
      ok: true,
      data: { staged: [], unstaged: [], untracked: [], conflicts: [], capturedAt: 0 },
    });
    const { store } = makeStore({
      recentWorkspaces: entries,
      workspaceChangesExpanded: { 'ws-1': true, 'ws-2': false },
    });
    await (
      store.getState() as unknown as { refreshAllGitSnapshotsSilent: () => Promise<void> }
    ).refreshAllGitSnapshotsSilent();
    expect(bridge).toHaveBeenCalledTimes(2);
    expect(bridge).toHaveBeenCalledWith('/a');
    expect(bridge).toHaveBeenCalledWith('/b');
    expect(store.getState().gitSnapshots['ws-2']).toBeDefined();
    // silent：不转刷新图标
    expect(store.getState().changesTreeRefreshing['ws-1']).toBeUndefined();
  });

  it('无已添加工作区时不调桥', async () => {
    const bridge = gitStatusBridge();
    const { store } = makeStore({
      recentWorkspaces: [],
      workspaceChangesExpanded: {},
    });
    await (
      store.getState() as unknown as { refreshAllGitSnapshotsSilent: () => Promise<void> }
    ).refreshAllGitSnapshotsSilent();
    expect(bridge).not.toHaveBeenCalled();
  });

  it('单个失败不阻断其余（allSettled）', async () => {
    const bridge = gitStatusBridge();
    bridge.mockImplementation((path: string) =>
      path === '/a'
        ? Promise.resolve({ ok: false, error: { message: 'boom' } })
        : Promise.resolve({
            ok: true,
            data: { staged: [], unstaged: [], untracked: [], conflicts: [], capturedAt: 0 },
          }),
    );
    const { store } = makeStore({
      recentWorkspaces: entries,
      workspaceChangesExpanded: { 'ws-1': true, 'ws-2': true },
    });
    await (
      store.getState() as unknown as { refreshAllGitSnapshotsSilent: () => Promise<void> }
    ).refreshAllGitSnapshotsSilent();
    expect(bridge).toHaveBeenCalledTimes(2);
    expect(store.getState().workspaceChangesTreeErrors['ws-1']).toBe('boom');
    expect(store.getState().gitSnapshots['ws-2']).toBeDefined();
  });

  it('桥接抛错（reject）记 warn 且不阻断其余', async () => {
    const bridge = gitStatusBridge();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      bridge.mockImplementation((path: string) =>
        path === '/a'
          ? Promise.reject(new Error('net down'))
          : Promise.resolve({
              ok: true,
              data: { staged: [], unstaged: [], untracked: [], conflicts: [], capturedAt: 0 },
            }),
      );
      const { store } = makeStore({
        recentWorkspaces: entries,
        workspaceChangesExpanded: { 'ws-1': true, 'ws-2': true },
      });
      await (
        store.getState() as unknown as { refreshAllGitSnapshotsSilent: () => Promise<void> }
      ).refreshAllGitSnapshotsSilent();
      expect(warn).toHaveBeenCalledWith(
        '[refreshAllGitSnapshotsSilent] refreshGitSnapshot rejected',
        expect.anything(),
      );
      expect(store.getState().gitSnapshots['ws-2']).toBeDefined();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('fetchGitStatus', () => {
  beforeEach(() => {
    vi.stubGlobal('digitalLife', {
      workspace: {
        listGitStatusForWorkspace: vi.fn(),
        getGitStatus: vi.fn(),
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes the fresh snapshot into all three sources (A/B/C) for the request-time current workspace', async () => {
    (window as any).digitalLife.workspace.getGitStatus.mockResolvedValue({
      ok: true,
      data: { ...snapshotData, capturedAt: 42, staged: ['a.txt'] },
    });
    const { store } = makeStore({ appInfo: currentWsAppInfo as never });
    await store.getState().fetchGitStatus();
    const st = store.getState();
    expect(st.gitSnapshot).toEqual({ ...snapshotData, capturedAt: 42, staged: ['a.txt'] });
    expect(st.gitSnapshots['ws-current']).toEqual({
      ...snapshotData,
      capturedAt: 42,
      staged: ['a.txt'],
    });
    expect((st.appInfo?.currentWorkspace as never as { gitSnapshot: unknown }).gitSnapshot).toEqual(
      { ...snapshotData, capturedAt: 42, staged: ['a.txt'] },
    );
  });

  it('keeps unrelated workspace slots intact when syncing the current workspace', async () => {
    (window as any).digitalLife.workspace.getGitStatus.mockResolvedValue({
      ok: true,
      data: snapshotData,
    });
    const unrelated = { marker: 'keep' };
    const { store } = makeStore({ appInfo: currentWsAppInfo as never });
    store.setState({
      gitSnapshots: { 'ws-other': unrelated },
    });
    await store.getState().fetchGitStatus();
    expect(store.getState().gitSnapshots['ws-other']).toBe(unrelated);
    expect(store.getState().gitSnapshots['ws-current']).toBeDefined();
  });

  it('clears the singleton when no current workspace is present', async () => {
    const { store } = makeStore();
    store.setState({ gitSnapshot: { staged: ['x'] } as never });
    await store.getState().fetchGitStatus();
    expect(store.getState().gitSnapshot).toBeUndefined();
    expect(window.digitalLife.workspace.getGitStatus).not.toHaveBeenCalled();
  });

  it('无工作区时连带清空预览归属（P4-R1-F3）', async () => {
    const { store } = makeStore();
    store.setState({
      gitSnapshot: { staged: ['x'] } as never,
      selectedChangePreviewPath: 'gone.md',
      selectedChangePreviewWorkspaceId: 'ws-old',
      changePreview: { path: 'gone.md' } as never,
      changePreviewLoading: false,
    } as never);
    await store.getState().fetchGitStatus();
    const st = store.getState() as unknown as {
      selectedChangePreviewPath?: string;
      selectedChangePreviewWorkspaceId?: string;
      changePreview?: unknown;
    };
    expect(st.selectedChangePreviewPath).toBeUndefined();
    expect(st.selectedChangePreviewWorkspaceId).toBeUndefined();
    expect(st.changePreview).toBeUndefined();
  });

  it('选中预览已不在快照中则清空归属（P4-R1-F3）', async () => {
    (window as any).digitalLife.workspace.getGitStatus.mockResolvedValue({
      ok: true,
      data: snapshotData,
    });
    const { store } = makeStore({ appInfo: currentWsAppInfo as never });
    store.setState({
      selectedChangePreviewPath: 'gone.md',
      selectedChangePreviewWorkspaceId: 'ws-current',
      changePreview: { path: 'gone.md' } as never,
      changePreviewLoading: false,
    } as never);
    await store.getState().fetchGitStatus();
    const st = store.getState() as unknown as {
      selectedChangePreviewPath?: string;
      selectedChangePreviewWorkspaceId?: string;
      changePreview?: unknown;
    };
    expect(st.selectedChangePreviewPath).toBeUndefined();
    expect(st.selectedChangePreviewWorkspaceId).toBeUndefined();
    expect(st.changePreview).toBeUndefined();
  });

  it('失败记静默诊断（P4 F5），不弹全局提示', async () => {
    const { store, reportSilentError } = makeStore({ appInfo: currentWsAppInfo as never });
    (window.digitalLife.workspace.getGitStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: { code: 'WORKSPACE_ERROR', message: 'git gone' },
    });
    await store.getState().fetchGitStatus();
    expect(reportSilentError).toHaveBeenCalledWith('WORKSPACE_ERROR', 'git gone', 'git');
    expect(store.getState().gitSnapshot).toBeUndefined();
  });
});

describe('陈旧变更预览对账（事项2：推送/删除后内容区清空）', () => {
  beforeEach(() => {
    vi.stubGlobal('digitalLife', {
      workspace: {
        listGitStatusForWorkspace: vi.fn(),
        getGitStatus: vi.fn(),
        getChangePreview: vi.fn(),
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const emptySnapshot = { staged: [], unstaged: [], untracked: [], conflicts: [], capturedAt: 1 };

  function seedPreview(
    store: ReturnType<typeof makeStore>['store'],
    workspaceId: string,
    relativePath: string,
  ) {
    store.setState({
      selectedChangePreviewPath: relativePath,
      selectedChangePreviewWorkspaceId: workspaceId,
      changePreview: { path: relativePath } as never,
      changePreviewLoading: false,
    } as never);
  }

  function readPreview(store: ReturnType<typeof makeStore>['store']) {
    return store.getState() as unknown as {
      selectedChangePreviewPath?: string;
      selectedChangePreviewWorkspaceId?: string;
      changePreview?: unknown;
      changePreviewLoading?: boolean;
    };
  }

  it('refreshGitSnapshot：选中预览已不在新快照中则清空', async () => {
    (window as any).digitalLife.workspace.listGitStatusForWorkspace.mockResolvedValue({
      ok: true,
      data: emptySnapshot,
    });
    const { store } = makeStore();
    seedPreview(store, 'ws-1', 'gone.md');
    await store.getState().refreshGitSnapshot('ws-1', '/p', { silent: true });
    const st = readPreview(store);
    expect(st.selectedChangePreviewPath).toBeUndefined();
    expect(st.changePreview).toBeUndefined();
    expect(st.changePreviewLoading).toBe(false);
  });

  it('refreshGitSnapshot：刷新其它工作区不碰当前选中预览', async () => {
    (window as any).digitalLife.workspace.listGitStatusForWorkspace.mockResolvedValue({
      ok: true,
      data: emptySnapshot,
    });
    const { store } = makeStore();
    seedPreview(store, 'ws-2', 'other.md');
    await store.getState().refreshGitSnapshot('ws-1', '/p', { silent: true });
    expect(readPreview(store).selectedChangePreviewPath).toBe('other.md');
  });

  it('清空同时取消在途 open（P4-R1-F2：落定不复活已清选中）', async () => {
    (window as any).digitalLife.workspace.listGitStatusForWorkspace.mockResolvedValue({
      ok: true,
      data: emptySnapshot,
    });
    const { store } = makeStore();
    seedPreview(store, 'ws-1', 'gone.md');
    setPendingChangePreviewPath('gone.md');
    await store.getState().refreshGitSnapshot('ws-1', '/p', { silent: true });
    expect(pendingChangePreviewPath).toBeUndefined();
    expect(readPreview(store).selectedChangePreviewPath).toBeUndefined();
    setPendingChangePreviewPath(undefined);
  });

  it('在途 open 落定不复活已清选中（P4-R1-N4 全链路）', async () => {
    (window as any).digitalLife.workspace.listGitStatusForWorkspace.mockResolvedValue({
      ok: true,
      data: emptySnapshot,
    });
    const { store } = makeStore();
    store.setState({
      appInfo: { currentWorkspace: { id: 'ws-1', path: '/p' } },
      selectedChangePreviewPath: 'gone.md',
      selectedChangePreviewWorkspaceId: 'ws-1',
      changePreview: { path: 'gone.md', currentContent: 'old' } as never,
      changePreviewLoading: false,
    } as never);
    let resolvePreview!: (v: { ok: true; data: unknown }) => void;
    const gate = new Promise<{ ok: true; data: unknown }>((r) => {
      resolvePreview = r;
    });
    const pending = openChangePreviewGeneric(
      store.setState as never,
      () => store.getState() as never,
      'gone.md',
      getNextChangePreviewRequestSeq(),
      {
        cacheKey: scopedFileKey('ws-1', 'gone.md'),
        workspaceId: 'ws-1',
        getPreview: () => gate as never,
      },
    );
    // 刷新先落定：选中清空 + 在途被取消
    await store.getState().refreshGitSnapshot('ws-1', '/p', { silent: true });
    expect(readPreview(store).selectedChangePreviewPath).toBeUndefined();
    // 旧请求后落定：必须被丢弃，不复活
    resolvePreview({
      ok: true,
      data: {
        path: 'gone.md',
        changeKind: 'modified',
        status: 'modified',
        baseExists: true,
        currentExists: true,
        baseContent: 'base',
        currentContent: 'stale',
      },
    });
    await pending;
    const st = readPreview(store);
    expect(st.selectedChangePreviewPath).toBeUndefined();
    expect(st.changePreview).toBeUndefined();
    expect(st.changePreviewLoading).toBe(false);
    setPendingChangePreviewPath(undefined);
  });

  it('未归属预览回退当前工作区判定（P4-R1-F4）', async () => {
    (window as any).digitalLife.workspace.listGitStatusForWorkspace.mockResolvedValue({
      ok: true,
      data: emptySnapshot,
    });
    const { store } = makeStore();
    store.setState({
      appInfo: { currentWorkspace: { id: 'ws-1', path: '/p' } },
      selectedChangePreviewPath: 'gone.md',
      selectedChangePreviewWorkspaceId: undefined,
      changePreview: { path: 'gone.md' } as never,
      changePreviewLoading: false,
    } as never);
    await store.getState().refreshGitSnapshot('ws-1', '/p', { silent: true });
    expect(readPreview(store).selectedChangePreviewPath).toBeUndefined();
  });

  it('无归属且无当前工作区 → 保留（P4-R1-F5  pin）', async () => {
    (window as any).digitalLife.workspace.listGitStatusForWorkspace.mockResolvedValue({
      ok: true,
      data: emptySnapshot,
    });
    const { store } = makeStore();
    store.setState({
      selectedChangePreviewPath: 'gone.md',
      selectedChangePreviewWorkspaceId: undefined,
      changePreview: { path: 'gone.md' } as never,
      changePreviewLoading: false,
    } as never);
    await store.getState().refreshGitSnapshot('ws-1', '/p', { silent: true });
    expect(readPreview(store).selectedChangePreviewPath).toBe('gone.md');
  });

  it('反斜杠快照路径仍命中（P4-R1-F10），不误删', async () => {
    (window as any).digitalLife.workspace.listGitStatusForWorkspace.mockResolvedValue({
      ok: true,
      data: { staged: ['sub\\gone.md'], unstaged: [], untracked: [], conflicts: [], capturedAt: 1 },
    });
    const { store } = makeStore();
    store.setState({
      appInfo: { currentWorkspace: { id: 'ws-1', path: '/p' } },
      selectedChangePreviewPath: 'sub/gone.md',
      selectedChangePreviewWorkspaceId: 'ws-1',
      changePreview: { path: 'sub/gone.md' } as never,
      changePreviewLoading: false,
    } as never);
    await store.getState().refreshGitSnapshot('ws-1', '/p', { silent: true });
    expect(readPreview(store).selectedChangePreviewPath).toBe('sub/gone.md');
  });

  it('loadGitSnapshot 落盘后选中预览消失则清空', async () => {
    (window as any).digitalLife.workspace.listGitStatusForWorkspace.mockResolvedValue({
      ok: true,
      data: emptySnapshot,
    });
    const { store } = makeStore();
    store.setState({
      appInfo: { currentWorkspace: { id: 'ws-1', path: '/p' } },
      selectedChangePreviewPath: 'gone.md',
      selectedChangePreviewWorkspaceId: 'ws-1',
      changePreview: { path: 'gone.md' } as never,
      changePreviewLoading: false,
    } as never);
    await (
      store.getState() as unknown as {
        loadGitSnapshot: (id: string, path: string) => Promise<void>;
      }
    ).loadGitSnapshot('ws-1', '/p');
    const st = readPreview(store);
    expect(st.selectedChangePreviewPath).toBeUndefined();
    expect(st.changePreview).toBeUndefined();
  });

  it('discardWorkspaceFile：丢弃的正是选中预览则清空', () => {
    const { store } = makeStore();
    store.setState({
      recentWorkspaces: [{ id: 'ws-1', path: '/p' }],
      gitSnapshots: {
        'ws-1': {
          staged: [],
          unstaged: ['gone.md'],
          untracked: [],
          conflicts: [],
          capturedAt: 0,
        },
      },
    } as never);
    seedPreview(store, 'ws-1', 'gone.md');
    applyGitOperation(
      () => store.getState() as never,
      store.setState as never,
      '/p',
      'gone.md',
      'discard',
    );
    const st = readPreview(store);
    expect(st.selectedChangePreviewPath).toBeUndefined();
    expect(st.changePreview).toBeUndefined();
  });

  it('discardWorkspaceFile：丢弃其它文件时保留选中预览', () => {
    const { store } = makeStore();
    store.setState({
      recentWorkspaces: [{ id: 'ws-1', path: '/p' }],
      gitSnapshots: {
        'ws-1': {
          staged: [],
          unstaged: ['keep.md', 'drop.md'],
          untracked: [],
          conflicts: [],
          capturedAt: 0,
        },
      },
    } as never);
    seedPreview(store, 'ws-1', 'keep.md');
    applyGitOperation(
      () => store.getState() as never,
      store.setState as never,
      '/p',
      'drop.md',
      'discard',
    );
    expect(readPreview(store).selectedChangePreviewPath).toBe('keep.md');
  });
});

describe('clearChangePreviewForWorkspace（事项5-R3：worktree 替换后变更内容区清空）', () => {
  function seedPreview(
    store: ReturnType<typeof makeStore>['store'],
    workspaceId: string,
    relativePath: string,
  ) {
    store.setState({
      selectedChangePreviewPath: relativePath,
      selectedChangePreviewWorkspaceId: workspaceId,
      changePreview: { path: relativePath } as never,
      changePreviewLoading: false,
    } as never);
  }

  function readPreview(store: ReturnType<typeof makeStore>['store']) {
    return store.getState() as unknown as {
      selectedChangePreviewPath?: string;
      selectedChangePreviewWorkspaceId?: string;
      changePreview?: unknown;
      changePreviewLoading?: boolean;
    };
  }

  it('预览归属被移除工作区 → 清空', () => {
    const { store } = makeStore();
    seedPreview(store, 'ws-old', 'gone.md');
    clearChangePreviewForWorkspace(
      () => store.getState() as never,
      store.setState as never,
      'ws-old',
    );
    const st = readPreview(store);
    expect(st.selectedChangePreviewPath).toBeUndefined();
    expect(st.selectedChangePreviewWorkspaceId).toBeUndefined();
    expect(st.changePreview).toBeUndefined();
    expect(st.changePreviewLoading).toBe(false);
  });

  it('预览归属其它工作区 → 保留', () => {
    const { store } = makeStore();
    seedPreview(store, 'ws-other', 'keep.md');
    clearChangePreviewForWorkspace(
      () => store.getState() as never,
      store.setState as never,
      'ws-old',
    );
    expect(readPreview(store).selectedChangePreviewPath).toBe('keep.md');
  });

  it('workspaceId 为空 → 不动', () => {
    const { store } = makeStore();
    seedPreview(store, 'ws-old', 'gone.md');
    clearChangePreviewForWorkspace(
      () => store.getState() as never,
      store.setState as never,
      undefined,
    );
    expect(readPreview(store).selectedChangePreviewPath).toBe('gone.md');
  });
});
