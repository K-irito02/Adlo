import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createStore } from 'zustand';
import {
  applyGitOperation,
  clearChangePreviewForWorkspace,
  createGitSnapshotActions,
} from '../gitSnapshotActions';

interface TestStore {
  gitSnapshot?: unknown;
  gitSnapshots: Record<string, unknown>;
  appInfo?: {
    currentWorkspace?: { id: string; path?: string; rootPath?: string };
  };
  workspaceChangesTreeLoading: Record<string, boolean>;
  workspaceChangesTreeErrors: Record<string, string | undefined>;
  changesTreeRefreshing: Record<string, boolean>;
  fetchGitStatus: () => Promise<void>;
  refreshGitSnapshot: (
    workspaceId: string,
    workspacePath: string,
    options?: { silent?: boolean },
  ) => Promise<void>;
  reportSilentError: (...args: unknown[]) => string;
}

function makeStore(opts?: { appInfo?: TestStore['appInfo'] }) {
  const reportSilentError = vi.fn(() => 'silent-id');
  const store = createStore<TestStore>((set, get) => {
    const actions = createGitSnapshotActions(set as never, () => get() as never);
    return {
      gitSnapshot: undefined,
      gitSnapshots: {},
      workspaceChangesTreeLoading: {},
      workspaceChangesTreeErrors: {},
      changesTreeRefreshing: {},
      appInfo: opts?.appInfo,
      reportSilentError,
      ...actions,
    } as TestStore;
  });
  return { store, reportSilentError };
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
