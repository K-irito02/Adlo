import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createStore } from 'zustand';
import { createGitBranchActions } from '../gitBranchActions';

interface TestStore {
  gitBranches: unknown[];
  appInfo?: { currentWorkspace?: { id: string } };
  reportError: (...args: unknown[]) => string;
  fetchGitBranches: (options?: { silent?: boolean }) => Promise<void>;
}

function makeStore() {
  const reportError = vi.fn(() => 'toast-id');
  const store = createStore<TestStore>((set, get) => {
    const actions = createGitBranchActions(set as never, () => get() as never);
    return {
      gitBranches: [],
      appInfo: { currentWorkspace: { id: 'ws-1' } },
      reportError,
      ...actions,
    } as unknown as TestStore;
  });
  return { store, reportError };
}

describe('fetchGitBranches non-git silence', () => {
  beforeEach(() => {
    vi.stubGlobal('digitalLife', {
      workspace: { listGitBranches: vi.fn() },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('非 Git 工作区不弹全局提示（预期态，只清空列表）', async () => {
    (
      window as unknown as {
        digitalLife: { workspace: { listGitBranches: ReturnType<typeof vi.fn> } };
      }
    ).digitalLife.workspace.listGitBranches.mockResolvedValue({
      ok: false,
      error: {
        code: 'WORKSPACE_ERROR',
        message:
          'Workspace error: fatal: not a git repository (or any of the parent directories): .git',
      },
    });
    const { store, reportError } = makeStore();
    await store.getState().fetchGitBranches();
    expect(store.getState().gitBranches).toEqual([]);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('silent 选项下其它失败也不打扰', async () => {
    (
      window as unknown as {
        digitalLife: { workspace: { listGitBranches: ReturnType<typeof vi.fn> } };
      }
    ).digitalLife.workspace.listGitBranches.mockResolvedValue({
      ok: false,
      error: { code: 'IO_ERROR', message: 'disk gone' },
    });
    const { store, reportError } = makeStore();
    await store.getState().fetchGitBranches({ silent: true });
    expect(reportError).not.toHaveBeenCalled();
  });

  it('非 silent 的真实失败仍上报', async () => {
    (
      window as unknown as {
        digitalLife: { workspace: { listGitBranches: ReturnType<typeof vi.fn> } };
      }
    ).digitalLife.workspace.listGitBranches.mockResolvedValue({
      ok: false,
      error: { code: 'IO_ERROR', message: 'disk gone' },
    });
    const { store, reportError } = makeStore();
    await store.getState().fetchGitBranches();
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});
