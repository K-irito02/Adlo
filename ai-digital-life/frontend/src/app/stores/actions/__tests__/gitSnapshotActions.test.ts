import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createStore } from 'zustand';
import { createGitSnapshotActions } from '../gitSnapshotActions';

interface TestStore {
  gitSnapshots: Record<string, unknown>;
  workspaceChangesTreeLoading: Record<string, boolean>;
  workspaceChangesTreeErrors: Record<string, string | undefined>;
  changesTreeRefreshing: Record<string, boolean>;
  refreshGitSnapshot: (
    workspaceId: string,
    workspacePath: string,
    options?: { silent?: boolean },
  ) => Promise<void>;
}

function makeStore() {
  const store = createStore<TestStore>((set, get) => {
    const actions = createGitSnapshotActions(set as never, () => get() as never);
    return {
      gitSnapshots: {},
      workspaceChangesTreeLoading: {},
      workspaceChangesTreeErrors: {},
      changesTreeRefreshing: {},
      ...actions,
    } as TestStore;
  });
  return store;
}

describe('refreshGitSnapshot', () => {
  beforeEach(() => {
    vi.stubGlobal('digitalLife', {
      workspace: {
        listGitStatusForWorkspace: vi.fn(),
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
