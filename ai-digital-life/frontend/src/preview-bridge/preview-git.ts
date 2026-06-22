import type {
  GitBranchSummary,
  GitSnapshot,
  IpcResult,
  WorkspaceGitBranchChangeResult,
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
  WorkspaceMeta,
} from '@ai-digital-life/kernel';
import { IpcErrorCode } from '../shared/ipc';
import { requestPreviewApi } from './api';
import type { PreviewContext } from './preview-context';

export function createPreviewGitBridge(
  ctx: PreviewContext,
  setMockActiveWorkspace: (ws: WorkspaceMeta | undefined) => void
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
    listGitBranches: async (): Promise<IpcResult<GitBranchSummary[]>> => {
      const err = requireWorkspace();
      if (err) {
        return err;
      }
      const params = new URLSearchParams({ rootPath: ctx.currentWorkspace!.rootPath });
      return requestPreviewApi<GitBranchSummary[]>(`/workspace/git-branches?${params.toString()}`);
    },
    switchGitBranch: async (
      input: WorkspaceGitBranchSwitchInput
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
        }
      );
      if (result.ok) {
        ctx.currentWorkspace = result.data.workspace;
        setMockActiveWorkspace(result.data.workspace);
      }
      return result;
    },
    createGitBranch: async (
      input: WorkspaceGitBranchCreateInput
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
        }
      );
      if (result.ok) {
        ctx.currentWorkspace = result.data.workspace;
        setMockActiveWorkspace(result.data.workspace);
      }
      return result;
    },
  };
}
