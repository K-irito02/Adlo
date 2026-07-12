import type {
  GitSnapshot,
  IpcResult,
  RecentWorkspaceEntry,
  ReorderWorkspacesInput,
  RepoMapNode,
  RetrievalSnapshot,
  WorkspaceChangePreview,
  WorkspaceFileDocument,
  WorkspaceMeta,
  WorkspaceTreeNode,
} from '@ai-digital-life/kernel';
import { IpcErrorCode } from '../shared/ipc';
import { requestPreviewApi } from './api';
import {
  persistRecentWorkspaces,
  updateRecentWorkspaces,
  loadActiveWorkspacePath,
  persistActiveWorkspacePath,
} from './storage';
import { repoMapEntriesToTree } from '../shared/repoMapFromEntries';
import type { PreviewContext, PreviewWorkspaceOpenPayload } from './preview-context';

export function createPreviewWorkspaceBridge(
  ctx: PreviewContext,
  setMockActiveWorkspace: (ws: WorkspaceMeta | undefined) => void
) {
  const applyOpenedWorkspace = (payload: PreviewWorkspaceOpenPayload) => {
    ctx.currentWorkspace = payload.meta;
    ctx.retrievalStatus = payload.retrieval;
    setMockActiveWorkspace(payload.meta);
    ctx.recentWorkspaces = updateRecentWorkspaces(ctx.recentWorkspaces, payload.recent);
    persistActiveWorkspacePath(payload.meta.rootPath);
    ctx.appInfo.recentLogs.unshift({
      timestamp: Date.now(),
      level: 'info',
      scope: 'workspace',
      message: `Preview mode: opened real local workspace ${payload.meta.rootPath}`,
    });
  };

  const openWorkspaceFromPreviewApi = async (
    workspacePath: string
  ): Promise<IpcResult<WorkspaceMeta>> => {
    const result = await requestPreviewApi<PreviewWorkspaceOpenPayload>('/workspace/open', {
      method: 'POST',
      body: JSON.stringify({ workspacePath }),
    });
    if (result.ok) {
      applyOpenedWorkspace(result.data);
      return { ok: true as const, data: result.data.meta };
    }
    return result;
  };

  let restoreCurrentWorkspacePromise: Promise<void> | undefined;

  const ensureCurrentWorkspaceRestored = async () => {
    if (ctx.currentWorkspace || restoreCurrentWorkspacePromise) {
      await restoreCurrentWorkspacePromise;
      return;
    }
    const savedWorkspacePath = loadActiveWorkspacePath();
    if (!savedWorkspacePath) {
      return;
    }
    restoreCurrentWorkspacePromise = (async () => {
      const result = await openWorkspaceFromPreviewApi(savedWorkspacePath);
      if (!result.ok) {
        persistActiveWorkspacePath(undefined);
      }
    })();
    try {
      await restoreCurrentWorkspacePromise;
    } finally {
      restoreCurrentWorkspacePromise = undefined;
    }
  };

  const requireWorkspace = () => {
    if (!ctx.currentWorkspace) {
      return {
        ok: false as const,
        error: { code: IpcErrorCode.NOT_FOUND, message: 'active workspace' },
      };
    }
    return null;
  };

  const workspace = {
    listRecent: async (): Promise<IpcResult<RecentWorkspaceEntry[]>> => ({
      ok: true as const,
      data: ctx.recentWorkspaces,
    }),
    open: async (workspacePath: string) => openWorkspaceFromPreviewApi(workspacePath),
    clearCurrent: async () => {
      ctx.currentWorkspace = undefined;
      ctx.retrievalStatus = undefined;
      setMockActiveWorkspace(undefined);
      persistActiveWorkspacePath(undefined);
      return { ok: true as const, data: true };
    },
    pickDirectory: async () => {
      const result = await requestPreviewApi<string | undefined>('/workspace/pick-directory', {
        method: 'POST',
      });
      if (!result.ok) {
        return { ok: true as const, data: undefined };
      }
      return { ok: true as const, data: result.data };
    },
    pin: async (workspaceId: string) => {
      const ws = ctx.recentWorkspaces.find((w) => w.id === workspaceId);
      if (!ws) {
        return {
          ok: false as const,
          error: { code: IpcErrorCode.NOT_FOUND, message: 'workspace not found' },
        };
      }
      const pinnedCount = ctx.recentWorkspaces.filter((w) => w.isPinned).length;
      ctx.recentWorkspaces = ctx.recentWorkspaces.map((w) =>
        w.id === workspaceId ? { ...w, isPinned: true, pinnedOrder: pinnedCount } : w
      );
      persistRecentWorkspaces(ctx.recentWorkspaces);
      return { ok: true as const, data: ctx.recentWorkspaces };
    },
    unpin: async (workspaceId: string) => {
      const ws = ctx.recentWorkspaces.find((w) => w.id === workspaceId);
      if (!ws) {
        return {
          ok: false as const,
          error: { code: IpcErrorCode.NOT_FOUND, message: 'workspace not found' },
        };
      }
      ctx.recentWorkspaces = ctx.recentWorkspaces.map((w) =>
        w.id === workspaceId ? { ...w, isPinned: false, pinnedOrder: 0 } : w
      );
      const pinnedWorkspaces = ctx.recentWorkspaces
        .filter((w) => w.isPinned)
        .sort((a, b) => a.pinnedOrder - b.pinnedOrder);
      const unpinnedWorkspaces = ctx.recentWorkspaces
        .filter((w) => !w.isPinned)
        .sort((a, b) => a.unpinnedOrder - b.unpinnedOrder);
      ctx.recentWorkspaces = [...pinnedWorkspaces, ...unpinnedWorkspaces];
      persistRecentWorkspaces(ctx.recentWorkspaces);
      return { ok: true as const, data: ctx.recentWorkspaces };
    },
    reorder: async (input: ReorderWorkspacesInput) => {
      const { pinnedIds, unpinnedIds } = input;
      ctx.recentWorkspaces = ctx.recentWorkspaces.map((w) => {
        const pinnedIndex = pinnedIds.indexOf(w.id);
        const unpinnedIndex = unpinnedIds.indexOf(w.id);
        if (pinnedIndex !== -1) {
          return { ...w, isPinned: true, pinnedOrder: pinnedIndex };
        }
        if (unpinnedIndex !== -1) {
          return { ...w, isPinned: false, unpinnedOrder: unpinnedIndex };
        }
        return w;
      });
      persistRecentWorkspaces(ctx.recentWorkspaces);
      return { ok: true as const, data: ctx.recentWorkspaces };
    },
    removeFromSidebar: async (workspaceId: string) => {
      ctx.recentWorkspaces = ctx.recentWorkspaces.filter((entry) => entry.id !== workspaceId);
      persistRecentWorkspaces(ctx.recentWorkspaces);
      return { ok: true as const, data: ctx.recentWorkspaces };
    },
    restoreToSidebar: async (_workspaceId: string) => ({
      ok: true as const,
      data: ctx.recentWorkspaces,
    }),
    listTreeForWorkspace: async (workspacePath: string) => {
      const params = new URLSearchParams({ rootPath: workspacePath });
      return requestPreviewApi<WorkspaceTreeNode[]>(`/workspace/tree?${params.toString()}`);
    },
    listGitStatusForWorkspace: async (workspacePath: string) => {
      const params = new URLSearchParams({ rootPath: workspacePath });
      return requestPreviewApi<GitSnapshot>(`/workspace/git-status?${params.toString()}`);
    },
    hideFromRightPanels: async (workspaceId: string) => {
      const entry = ctx.recentWorkspaces.find((item) => item.id === workspaceId);
      if (entry) {
        entry.hiddenFromRightPanels = true;
      }
      persistRecentWorkspaces(ctx.recentWorkspaces);
      return { ok: true as const, data: ctx.recentWorkspaces };
    },
    showInRightPanels: async (workspaceId: string) => {
      const entry = ctx.recentWorkspaces.find((item) => item.id === workspaceId);
      if (entry) {
        entry.hiddenFromRightPanels = false;
      }
      persistRecentWorkspaces(ctx.recentWorkspaces);
      return { ok: true as const, data: ctx.recentWorkspaces };
    },
    revealInFileManager: async (workspacePath: string) =>
      requestPreviewApi<boolean>('/workspace/reveal', {
        method: 'POST',
        body: JSON.stringify({ path: workspacePath }),
      }),
    createFile: async (relativePath: string, content = '') => {
      const err = requireWorkspace();
      if (err) {
        return err;
      }
      return requestPreviewApi<WorkspaceFileDocument>('/workspace/create-file', {
        method: 'POST',
        body: JSON.stringify({
          rootPath: ctx.currentWorkspace!.rootPath,
          relativePath,
          content,
        }),
      });
    },
    createFolder: async (relativePath: string) => {
      const err = requireWorkspace();
      if (err) {
        return err;
      }
      return requestPreviewApi<boolean>('/workspace/create-folder', {
        method: 'POST',
        body: JSON.stringify({ rootPath: ctx.currentWorkspace!.rootPath, relativePath }),
      });
    },
    readFile: async (relativePath: string) => {
      const err = requireWorkspace();
      if (err) {
        return err;
      }
      const params = new URLSearchParams({
        rootPath: ctx.currentWorkspace!.rootPath,
        relativePath,
      });
      return requestPreviewApi<WorkspaceFileDocument>(`/workspace/file?${params.toString()}`);
    },
    readFileForWorkspace: async (workspacePath: string, relativePath: string) => {
      const params = new URLSearchParams({ rootPath: workspacePath, relativePath });
      return requestPreviewApi<WorkspaceFileDocument>(`/workspace/file?${params.toString()}`);
    },
    getChangePreview: async (relativePath: string) => {
      const err = requireWorkspace();
      if (err) {
        return err;
      }
      const params = new URLSearchParams({
        rootPath: ctx.currentWorkspace!.rootPath,
        relativePath,
      });
      return requestPreviewApi<WorkspaceChangePreview>(
        `/workspace/change-preview?${params.toString()}`
      );
    },
    getChangePreviewForWorkspace: async (workspacePath: string, relativePath: string) => {
      const params = new URLSearchParams({ rootPath: workspacePath, relativePath });
      return requestPreviewApi<WorkspaceChangePreview>(
        `/workspace/change-preview?${params.toString()}`
      );
    },
    listTree: async () => {
      if (!ctx.currentWorkspace) {
        return { ok: true as const, data: [] as WorkspaceTreeNode[] };
      }
      const params = new URLSearchParams({ rootPath: ctx.currentWorkspace.rootPath });
      return requestPreviewApi<WorkspaceTreeNode[]>(`/workspace/tree?${params.toString()}`);
    },
    renameFile: async (relativePath: string, newName: string) => {
      const err = requireWorkspace();
      if (err) {
        return err;
      }
      return requestPreviewApi<boolean>('/workspace/rename-file', {
        method: 'POST',
        body: JSON.stringify({
          rootPath: ctx.currentWorkspace!.rootPath,
          relativePath,
          newName,
        }),
      });
    },
    deleteFile: async (relativePath: string) => {
      const err = requireWorkspace();
      if (err) {
        return err;
      }
      return requestPreviewApi<boolean>('/workspace/delete-file', {
        method: 'POST',
        body: JSON.stringify({ rootPath: ctx.currentWorkspace!.rootPath, relativePath }),
      });
    },
    duplicateFile: async (srcRelativePath: string, dstRelativePath: string) => {
      const err = requireWorkspace();
      if (err) {
        return err;
      }
      return requestPreviewApi<boolean>('/workspace/duplicate-file', {
        method: 'POST',
        body: JSON.stringify({
          rootPath: ctx.currentWorkspace!.rootPath,
          srcRelativePath,
          dstRelativePath,
        }),
      });
    },
    getAbsolutePath: async (relativePath: string) => {
      const err = requireWorkspace();
      if (err) {
        return err;
      }
      const params = new URLSearchParams({
        rootPath: ctx.currentWorkspace!.rootPath,
        relativePath,
      });
      return requestPreviewApi<string>(`/workspace/absolute-path?${params.toString()}`);
    },
    moveFile: async (relativePath: string, newPath: string) => {
      const err = requireWorkspace();
      if (err) {
        return err;
      }
      return requestPreviewApi<boolean>('/workspace/move-file', {
        method: 'POST',
        body: JSON.stringify({
          rootPath: ctx.currentWorkspace!.rootPath,
          relativePath,
          newPath,
        }),
      });
    },
    setEditorDirtyPaths: async () => ({ ok: true as const, data: true }),
  };

  const retrieval = {
    getStatus: async (): Promise<IpcResult<RetrievalSnapshot | undefined>> => {
      if (!ctx.currentWorkspace) {
        return { ok: true, data: undefined };
      }
      if (ctx.retrievalStatus?.completedAt && Date.now() - ctx.retrievalStatus.completedAt < 10_000) {
        return { ok: true, data: ctx.retrievalStatus };
      }
      const params = new URLSearchParams({
        rootPath: ctx.currentWorkspace.rootPath,
        workspaceId: ctx.currentWorkspace.id,
      });
      const result = await requestPreviewApi<RetrievalSnapshot>(
        `/retrieval/status?${params.toString()}`
      );
      if (result.ok) {
        ctx.retrievalStatus = result.data;
      }
      return result.ok ? { ok: true as const, data: result.data } : result;
    },
    getRepoMap: async (): Promise<IpcResult<RepoMapNode[]>> => {
      const status = ctx.retrievalStatus
        ? ({ ok: true, data: ctx.retrievalStatus } satisfies IpcResult<RetrievalSnapshot>)
        : await retrieval.getStatus();
      if (!status.ok) {
        return status;
      }
      return { ok: true as const, data: repoMapEntriesToTree(status.data?.repoMap ?? []) };
    },
    rebuildIndex: async () => ({ ok: true as const, data: true }),
  };

  return { workspace, retrieval, ensureCurrentWorkspaceRestored };
}
