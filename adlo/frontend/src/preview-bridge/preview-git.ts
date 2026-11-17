import type {
  GitBranchSummary,
  GitSnapshot,
  GitVisCommitStats,
  GitVisCodeEvolution,
  GitVisContributorModules,
  GitVisBranchGraph,
  GitVisFileHotspots,
  IpcResult,
  WorktreeInfo,
  WorkspaceGitBranchChangeResult,
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
  WorkspaceMeta,
  WorkspaceWorktreeEnsureInput,
  WorkspaceWorktreeEnsureResult,
  WorkspaceWorktreeRemoveInput,
} from '@adlo/kernel';
import { IpcErrorCode } from '../shared/ipc/shared';
import { requestPreviewApi } from '../shared/ipc/preview-api';

/** Preview bridge shared mutable context（仅消费 currentWorkspace，其余字段已裁剪）。 */
export interface PreviewGitContext {
  currentWorkspace: WorkspaceMeta | undefined;
}

export function createPreviewGitBridge(
  ctx: PreviewGitContext,
  setMockActiveWorkspace: (ws: WorkspaceMeta | undefined) => void,
) {
  const requireWorkspace = () => {
    if (!ctx.currentWorkspace) {
      return {
        ok: false as const,
        error: { code: IpcErrorCode.NOT_FOUND, message: 'active workspace' },
      };
    }
    return null;
  };

  return {
    getGitStatus: async (): Promise<IpcResult<GitSnapshot>> => {
      if (!ctx.currentWorkspace) {
        return {
          ok: true as const,
          data: {
            isRepo: false,
            staged: [],
            unstaged: [],
            untracked: [],
            conflicts: [],
            capturedAt: Date.now(),
          } satisfies GitSnapshot,
        };
      }
      const params = new URLSearchParams({ rootPath: ctx.currentWorkspace.rootPath });
      return requestPreviewApi<GitSnapshot>(`/workspace/git-status?${params.toString()}`);
    },
    listGitBranches: async (rootPath?: string): Promise<IpcResult<GitBranchSummary[]>> => {
      const root = rootPath ?? ctx.currentWorkspace?.rootPath;
      if (!root) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'no workspace' } };
      }
      const params = new URLSearchParams({ rootPath: root });
      return requestPreviewApi<GitBranchSummary[]>(`/workspace/git-branches?${params.toString()}`);
    },
    switchGitBranch: async (
      input: WorkspaceGitBranchSwitchInput,
    ): Promise<IpcResult<WorkspaceGitBranchChangeResult>> => {
      const err = requireWorkspace();
      if (err) {
        return err;
      }
      const result = await requestPreviewApi<WorkspaceGitBranchChangeResult>(
        '/workspace/git-switch',
        {
          method: 'POST',
          body: JSON.stringify({ rootPath: ctx.currentWorkspace!.rootPath, input }),
        },
      );
      if (result.ok) {
        ctx.currentWorkspace = result.data.workspace;
        setMockActiveWorkspace(result.data.workspace);
      }
      return result;
    },
    createGitBranch: async (
      input: WorkspaceGitBranchCreateInput,
    ): Promise<IpcResult<WorkspaceGitBranchChangeResult>> => {
      const err = requireWorkspace();
      if (err) {
        return err;
      }
      const result = await requestPreviewApi<WorkspaceGitBranchChangeResult>(
        '/workspace/git-create-branch',
        {
          method: 'POST',
          body: JSON.stringify({ rootPath: ctx.currentWorkspace!.rootPath, input }),
        },
      );
      if (result.ok) {
        ctx.currentWorkspace = result.data.workspace;
        setMockActiveWorkspace(result.data.workspace);
      }
      return result;
    },
    listWorktrees: async (rootPath?: string): Promise<IpcResult<WorktreeInfo[]>> => {
      const root = rootPath ?? ctx.currentWorkspace?.rootPath;
      if (!root) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'no workspace' } };
      }
      const params = new URLSearchParams({ rootPath: root });
      return requestPreviewApi<WorktreeInfo[]>(`/workspace/git-worktrees?${params.toString()}`);
    },
    ensureWorktree: async (
      input: WorkspaceWorktreeEnsureInput,
      workspacePath?: string,
    ): Promise<IpcResult<WorkspaceWorktreeEnsureResult>> => {
      const root = workspacePath ?? ctx.currentWorkspace?.rootPath;
      if (!root) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'no workspace' } };
      }
      return requestPreviewApi<WorkspaceWorktreeEnsureResult>('/workspace/git-worktree-ensure', {
        method: 'POST',
        body: JSON.stringify({ rootPath: root, input }),
      });
    },
    removeWorktree: async (
      input: WorkspaceWorktreeRemoveInput,
      workspacePath?: string,
    ): Promise<IpcResult<void>> => {
      const root = workspacePath ?? ctx.currentWorkspace?.rootPath;
      if (!root) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'no workspace' } };
      }
      return requestPreviewApi<void>('/workspace/git-worktree-remove', {
        method: 'POST',
        body: JSON.stringify({ rootPath: root, input }),
      });
    },
    pruneWorktrees: async (workspacePath?: string): Promise<IpcResult<void>> => {
      const root = workspacePath ?? ctx.currentWorkspace?.rootPath;
      if (!root) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'no workspace' } };
      }
      return requestPreviewApi<void>('/workspace/git-worktree-prune', {
        method: 'POST',
        body: JSON.stringify({ rootPath: root }),
      });
    },
    stageFile: async (relativePath: string, workspacePath?: string): Promise<IpcResult<void>> => {
      const root = workspacePath ?? ctx.currentWorkspace?.rootPath;
      if (!root) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'no workspace' } };
      }
      return requestPreviewApi<void>('/workspace/git-stage-file', {
        method: 'POST',
        body: JSON.stringify({ rootPath: root, relativePath }),
      });
    },
    unstageFile: async (relativePath: string, workspacePath?: string): Promise<IpcResult<void>> => {
      const root = workspacePath ?? ctx.currentWorkspace?.rootPath;
      if (!root) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'no workspace' } };
      }
      return requestPreviewApi<void>('/workspace/git-unstage-file', {
        method: 'POST',
        body: JSON.stringify({ rootPath: root, relativePath }),
      });
    },
    discardFile: async (relativePath: string, workspacePath?: string): Promise<IpcResult<void>> => {
      const root = workspacePath ?? ctx.currentWorkspace?.rootPath;
      if (!root) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'no workspace' } };
      }
      return requestPreviewApi<void>('/workspace/git-discard-file', {
        method: 'POST',
        body: JSON.stringify({ rootPath: root, relativePath }),
      });
    },
    stageAllFiles: async (workspacePath?: string): Promise<IpcResult<void>> => {
      const root = workspacePath ?? ctx.currentWorkspace?.rootPath;
      if (!root) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'no workspace' } };
      }
      return requestPreviewApi<void>('/workspace/git-stage-all', {
        method: 'POST',
        body: JSON.stringify({ rootPath: root }),
      });
    },
    unstageAllFiles: async (workspacePath?: string): Promise<IpcResult<void>> => {
      const root = workspacePath ?? ctx.currentWorkspace?.rootPath;
      if (!root) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'no workspace' } };
      }
      return requestPreviewApi<void>('/workspace/git-unstage-all', {
        method: 'POST',
        body: JSON.stringify({ rootPath: root }),
      });
    },
    discardAllFiles: async (workspacePath?: string): Promise<IpcResult<void>> => {
      const root = workspacePath ?? ctx.currentWorkspace?.rootPath;
      if (!root) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'no workspace' } };
      }
      return requestPreviewApi<void>('/workspace/git-discard-all', {
        method: 'POST',
        body: JSON.stringify({ rootPath: root }),
      });
    },
    commitChanges: async (message: string, workspacePath?: string): Promise<IpcResult<void>> => {
      const root = workspacePath ?? ctx.currentWorkspace?.rootPath;
      if (!root) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'no workspace' } };
      }
      return requestPreviewApi<void>('/workspace/git-commit', {
        method: 'POST',
        body: JSON.stringify({ rootPath: root, message }),
      });
    },
    pushChanges: async (workspacePath?: string): Promise<IpcResult<void>> => {
      const root = workspacePath ?? ctx.currentWorkspace?.rootPath;
      if (!root) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'no workspace' } };
      }
      return requestPreviewApi<void>('/workspace/git-push', {
        method: 'POST',
        body: JSON.stringify({ rootPath: root }),
      });
    },
    pullChanges: async (workspacePath?: string): Promise<IpcResult<void>> => {
      const root = workspacePath ?? ctx.currentWorkspace?.rootPath;
      if (!root) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'no workspace' } };
      }
      return requestPreviewApi<void>('/workspace/git-pull', {
        method: 'POST',
        body: JSON.stringify({ rootPath: root }),
      });
    },
    gitVisCommitStats: async (rootPath: string, since?: string, until?: string) => {
      const params = new URLSearchParams({ rootPath });
      if (since) {
        params.set('since', since);
      }
      if (until) {
        params.set('until', until);
      }
      return requestPreviewApi<GitVisCommitStats>(
        `/workspace/git-vis-commit-stats?${params.toString()}`,
      );
    },
    gitVisCodeEvolution: async (rootPath: string, since?: string, until?: string) => {
      const params = new URLSearchParams({ rootPath });
      if (since) {
        params.set('since', since);
      }
      if (until) {
        params.set('until', until);
      }
      return requestPreviewApi<GitVisCodeEvolution>(
        `/workspace/git-vis-code-evolution?${params.toString()}`,
      );
    },
    gitVisContributorModules: async (rootPath: string, since?: string, until?: string) => {
      const params = new URLSearchParams({ rootPath });
      if (since) {
        params.set('since', since);
      }
      if (until) {
        params.set('until', until);
      }
      return requestPreviewApi<GitVisContributorModules>(
        `/workspace/git-vis-contributor-modules?${params.toString()}`,
      );
    },
    gitVisBranchGraph: async (rootPath: string) => {
      const params = new URLSearchParams({ rootPath });
      return requestPreviewApi<GitVisBranchGraph>(
        `/workspace/git-vis-branch-graph?${params.toString()}`,
      );
    },
    gitVisFileHotspots: async (rootPath: string, since?: string, until?: string) => {
      const params = new URLSearchParams({ rootPath });
      if (since) {
        params.set('since', since);
      }
      if (until) {
        params.set('until', until);
      }
      return requestPreviewApi<GitVisFileHotspots>(
        `/workspace/git-vis-file-hotspots?${params.toString()}`,
      );
    },
    gitVisFirstCommitYear: async (rootPath: string) => {
      const params = new URLSearchParams({ rootPath });
      return requestPreviewApi<number | null>(
        `/workspace/git-vis-first-commit-year?${params.toString()}`,
      );
    },
  };
}
