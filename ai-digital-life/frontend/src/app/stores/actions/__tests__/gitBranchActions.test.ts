import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createStore } from 'zustand';
import { createGitBranchActions } from '../gitBranchActions';

interface TestWorkspaceEntry {
  id: string;
  path: string;
  removedFromSidebar: boolean;
  available: boolean;
}

interface TestStore {
  gitBranches: unknown[];
  gitSnapshot?: { branch?: string; staged: string[]; unstaged: string[]; untracked: string[] };
  appInfo?: { currentWorkspace?: { id: string; path: string } };
  recentWorkspaces: TestWorkspaceEntry[];
  reportError: (...args: unknown[]) => string;
  reportSilentError: (...args: unknown[]) => string;
  errorToasts: { silent?: boolean }[];
  fetchGitBranches: (options?: { silent?: boolean }) => Promise<void>;
  openWorkspace: (path: string) => Promise<unknown>;
  removeWorkspaceFromSidebar: (id: string) => Promise<void>;
  showToast: (message: string, type?: string) => string;
  clearErrorToasts: (scope?: string) => void;
  ensureBranchWorktree: (
    input: { branchName: string; allowStash: boolean; mode?: string },
    workspacePath?: string,
  ) => Promise<string | undefined>;
}

function makeStore() {
  const reportError = vi.fn(() => 'toast-id');
  const reportSilentError = vi.fn(() => 'silent-id');
  const openWorkspace = vi.fn(async () => ({ ok: true }));
  const removeWorkspaceFromSidebar = vi.fn(async () => {});
  const showToast = vi.fn(() => 'toast-id');
  const clearErrorToasts = vi.fn();
  const store = createStore<TestStore>((set, get) => {
    const actions = createGitBranchActions(set as never, () => get() as never);
    return {
      gitBranches: [],
      gitSnapshot: { staged: [], unstaged: [], untracked: [] },
      appInfo: { currentWorkspace: { id: 'ws-1', path: '/repo' } },
      recentWorkspaces: [{ id: 'ws-1', path: '/repo', removedFromSidebar: false, available: true }],
      reportError,
      reportSilentError,
      errorToasts: [],
      openWorkspace,
      removeWorkspaceFromSidebar,
      showToast,
      clearErrorToasts,
      ...actions,
    } as unknown as TestStore;
  });
  return {
    store,
    reportError,
    reportSilentError,
    openWorkspace,
    removeWorkspaceFromSidebar,
    showToast,
  };
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

  it('silent 真实故障记静默诊断（不上报但可观测）', async () => {
    (
      window as unknown as {
        digitalLife: { workspace: { listGitBranches: ReturnType<typeof vi.fn> } };
      }
    ).digitalLife.workspace.listGitBranches.mockResolvedValue({
      ok: false,
      error: { code: 'IO_ERROR', message: 'disk gone' },
    });
    const { store, reportError, reportSilentError } = makeStore();
    await store.getState().fetchGitBranches({ silent: true });
    expect(reportError).not.toHaveBeenCalled();
    expect(reportSilentError).toHaveBeenCalledTimes(1);
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

describe('ensureBranchWorktree', () => {
  beforeEach(() => {
    vi.stubGlobal('digitalLife', {
      workspace: { listGitBranches: vi.fn(), ensureWorktree: vi.fn(), listWorktrees: vi.fn() },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function bridge() {
    return (
      window as unknown as {
        digitalLife: {
          workspace: {
            listGitBranches: ReturnType<typeof vi.fn>;
            ensureWorktree: ReturnType<typeof vi.fn>;
            listWorktrees: ReturnType<typeof vi.fn>;
          };
        };
      }
    ).digitalLife.workspace;
  }

  it('成功时聚焦 worktree 路径并移出源工作区（替换式）', async () => {
    bridge().listWorktrees.mockResolvedValue({ ok: true, data: [] });
    bridge().ensureWorktree.mockResolvedValue({
      ok: true,
      data: {
        path: '/repo-worktrees/feature-ahead',
        created: true,
        branch: 'feature-ahead',
        gitSnapshot: { branch: 'feature-ahead' },
      },
    });
    const { store, openWorkspace, removeWorkspaceFromSidebar, showToast } = makeStore();
    const path = await store.getState().ensureBranchWorktree({
      branchName: 'feature-ahead',
      allowStash: false,
    });
    expect(path).toBe('/repo-worktrees/feature-ahead');
    expect(bridge().ensureWorktree).toHaveBeenCalledWith(
      { branchName: 'feature-ahead', allowStash: false },
      '/repo',
    );
    expect(openWorkspace).toHaveBeenCalledWith('/repo-worktrees/feature-ahead');
    expect(removeWorkspaceFromSidebar).toHaveBeenCalledWith('ws-1');
    expect(showToast).toHaveBeenCalled();
  });

  it('失败时返回 undefined 并上报错误（不聚焦不移出）', async () => {
    bridge().listWorktrees.mockResolvedValue({ ok: true, data: [] });
    bridge().ensureWorktree.mockResolvedValue({
      ok: false,
      error: { code: 'WORKSPACE_ERROR', message: 'branch not found locally or on remotes: nope' },
    });
    const { store, reportError, openWorkspace, removeWorkspaceFromSidebar } = makeStore();
    const path = await store.getState().ensureBranchWorktree({
      branchName: 'nope',
      allowStash: false,
    });
    expect(path).toBeUndefined();
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(openWorkspace).not.toHaveBeenCalled();
    expect(removeWorkspaceFromSidebar).not.toHaveBeenCalled();
  });

  it('目标已手动添加：不跑 git 切换，只聚焦 + toast', async () => {
    bridge().listWorktrees.mockResolvedValue({
      ok: true,
      data: [{ branch: 'feature-ahead', path: '/repo-worktrees/feature-ahead' }],
    });
    const { store, openWorkspace, showToast } = makeStore();
    store.setState({
      recentWorkspaces: [
        { id: 'ws-1', path: '/repo', removedFromSidebar: false, available: true },
        {
          id: 'ws-2',
          path: '/repo-worktrees/feature-ahead',
          removedFromSidebar: false,
          available: true,
        },
      ],
    });
    const path = await store.getState().ensureBranchWorktree({
      branchName: 'feature-ahead',
      allowStash: false,
    });
    expect(path).toBe('/repo-worktrees/feature-ahead');
    expect(bridge().ensureWorktree).not.toHaveBeenCalled();
    expect(openWorkspace).toHaveBeenCalledWith('/repo-worktrees/feature-ahead');
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('feature-ahead'), 'success');
  });

  it('目标就是当前工作区：toast 后直接返回（无任何操作）', async () => {
    bridge().listWorktrees.mockResolvedValue({
      ok: true,
      data: [{ branch: 'main', path: '/repo' }],
    });
    const { store, openWorkspace, showToast } = makeStore();
    const path = await store.getState().ensureBranchWorktree({
      branchName: 'main',
      allowStash: false,
    });
    expect(path).toBe('/repo');
    expect(bridge().ensureWorktree).not.toHaveBeenCalled();
    expect(openWorkspace).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('main'), 'success');
  });
});
