import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createStore } from 'zustand';
import { createGitSnapshotActions } from '../gitSnapshotActions';

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
}

function makeStore(opts?: { appInfo?: TestStore['appInfo'] }) {
  const store = createStore<TestStore>((set, get) => {
    const actions = createGitSnapshotActions(set as never, () => get() as never);
    return {
      gitSnapshot: undefined,
      gitSnapshots: {},
      workspaceChangesTreeLoading: {},
      workspaceChangesTreeErrors: {},
      changesTreeRefreshing: {},
      appInfo: opts?.appInfo,
      ...actions,
    } as TestStore;
  });
  return store;
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
    const store = makeStore();
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
    const store = makeStore();
    await store.getState().refreshGitSnapshot('ws-1', '/p', { silent: true });
    expect(store.getState().changesTreeRefreshing['ws-1']).toBeUndefined();
  });

  it('silent 失败时仍写入 error 且不写 refreshing', async () => {
    (window as any).digitalLife.workspace.listGitStatusForWorkspace.mockResolvedValue({
      ok: false,
      error: { message: 'boom' },
    });
    const store = makeStore();
    await store.getState().refreshGitSnapshot('ws-1', '/p', { silent: true });
    expect(store.getState().workspaceChangesTreeErrors['ws-1']).toBe('boom');
    expect(store.getState().changesTreeRefreshing['ws-1']).toBeUndefined();
  });

  it('silent 成功时清除既有的陈旧 error', async () => {
    (window as any).digitalLife.workspace.listGitStatusForWorkspace.mockResolvedValue({
      ok: true,
      data: { staged: [], unstaged: [], untracked: [], conflicts: [], capturedAt: 0 },
    });
    const store = makeStore();
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
    const store = makeStore({ appInfo: currentWsAppInfo as never });
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
    const store = makeStore({ appInfo: currentWsAppInfo as never });
    store.setState({
      gitSnapshots: { 'ws-other': unrelated },
    });
    await store.getState().fetchGitStatus();
    expect(store.getState().gitSnapshots['ws-other']).toBe(unrelated);
    expect(store.getState().gitSnapshots['ws-current']).toBeDefined();
  });

  it('clears the singleton when no current workspace is present', async () => {
    const store = makeStore();
    store.setState({ gitSnapshot: { staged: ['x'] } as never });
    await store.getState().fetchGitStatus();
    expect(store.getState().gitSnapshot).toBeUndefined();
    expect(window.digitalLife.workspace.getGitStatus).not.toHaveBeenCalled();
  });
});
