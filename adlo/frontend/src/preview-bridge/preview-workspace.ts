import type {
  GitSnapshot,
  IpcResult,
  RecentWorkspaceEntry,
  RepoMapNode,
  RetrievalSnapshot,
  WorkspaceChangePreview,
  WorkspaceFileDocument,
  WorkspaceMeta,
  WorkspaceTreeNode,
  WorkspaceTreePayload,
} from '@adlo/kernel';
import { IpcErrorCode } from '../shared/ipc/shared';
import { requestPreviewApi, PREVIEW_API_PREFIX } from '../shared/ipc/preview-api';
import { probeMediaSource } from '../httpBridge';
import {
  persistRecentWorkspaces,
  updateRecentWorkspaces,
  loadActiveWorkspacePath,
  persistActiveWorkspacePath,
} from './preview-storage';
import { repoMapEntriesToTree } from '../shared/repoMapFromEntries';
import { joinPathSegments } from '../app/utils/workspacePaths';

/** Preview bridge shared mutable context (subset previously exported by preview-context). */
export interface PreviewWorkspaceContext {
  recentWorkspaces: RecentWorkspaceEntry[];
  currentWorkspace: WorkspaceMeta | undefined;
  retrievalStatus: RetrievalSnapshot | undefined;
}

export interface PreviewWorkspaceOpenPayload {
  meta: WorkspaceMeta;
  recent: RecentWorkspaceEntry;
  retrieval: RetrievalSnapshot;
}

export function createPreviewWorkspaceBridge(
  ctx: PreviewWorkspaceContext,
  setMockActiveWorkspace: (ws: WorkspaceMeta | undefined) => void,
) {
  const applyOpenedWorkspace = (payload: PreviewWorkspaceOpenPayload) => {
    ctx.currentWorkspace = payload.meta;
    ctx.retrievalStatus = payload.retrieval;
    setMockActiveWorkspace(payload.meta);
    ctx.recentWorkspaces = updateRecentWorkspaces(ctx.recentWorkspaces, payload.recent);
    persistActiveWorkspacePath(payload.meta.rootPath);
  };

  const openWorkspaceFromPreviewApi = async (
    workspacePath: string,
    options?: { create?: boolean },
  ): Promise<IpcResult<WorkspaceMeta>> => {
    const result = await requestPreviewApi<PreviewWorkspaceOpenPayload>('/workspace/open', {
      method: 'POST',
      body: JSON.stringify({
        workspacePath,
        ...(options?.create ? { create: true } : {}),
      }),
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

  function withWorkspace<T, A extends unknown[]>(
    fn: (rootPath: string, ...args: A) => Promise<IpcResult<T>>,
  ): (...args: A) => Promise<IpcResult<T>> {
    return async (...args: A) => {
      if (!ctx.currentWorkspace) {
        return {
          ok: false as const,
          error: { code: IpcErrorCode.NOT_FOUND, message: 'active workspace' },
        };
      }
      return fn(ctx.currentWorkspace.rootPath, ...args);
    };
  }

  const workspace = {
    listRecent: async (): Promise<IpcResult<RecentWorkspaceEntry[]>> => ({
      ok: true as const,
      data: ctx.recentWorkspaces,
    }),
    open: async (workspacePath: string, options?: { create?: boolean }) =>
      openWorkspaceFromPreviewApi(workspacePath, options),
    addToSidebar: async (workspacePath: string) => {
      const result = await requestPreviewApi<RecentWorkspaceEntry>('/workspace/add', {
        method: 'POST',
        body: JSON.stringify({ workspacePath }),
      });
      if (!result.ok) {
        // 该能力仅桌面端提供；应用内当前无调用方（未知工作区改用内存隐藏工作区，
        // 见 ADR 0023），预览模式保持明确降级而不是假装成功。
        return {
          ok: false as const,
          error: {
            code: IpcErrorCode.INTERNAL_ERROR,
            message: 'workspace.addToSidebar is only available in the desktop app',
          },
        };
      }
      ctx.recentWorkspaces = updateRecentWorkspaces(ctx.recentWorkspaces, result.data);
      persistRecentWorkspaces(ctx.recentWorkspaces);
      return result;
    },
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
    removeFromSidebar: async (workspaceId: string) => {
      ctx.recentWorkspaces = ctx.recentWorkspaces.filter((entry) => entry.id !== workspaceId);
      persistRecentWorkspaces(ctx.recentWorkspaces);
      return { ok: true as const, data: ctx.recentWorkspaces };
    },
    reorderSidebar: async (orderedIds: string[]) => {
      const ordered: RecentWorkspaceEntry[] = [];
      for (const id of orderedIds) {
        const entry = ctx.recentWorkspaces.find((item) => item.id === id && !item.isPinned);
        if (entry && !ordered.some((item) => item.id === id)) {
          ordered.push(entry);
        }
      }
      const orderedIdsSet = new Set(ordered.map((entry) => entry.id));
      const rest = ctx.recentWorkspaces
        .filter((entry) => !entry.isPinned && !orderedIdsSet.has(entry.id))
        .sort((a, b) => a.unpinnedOrder - b.unpinnedOrder);
      const unpinned = [...ordered, ...rest].map((entry, index) => ({
        ...entry,
        unpinnedOrder: index,
      }));
      const pinned = ctx.recentWorkspaces
        .filter((entry) => entry.isPinned)
        .sort((a, b) => a.pinnedOrder - b.pinnedOrder);
      ctx.recentWorkspaces = [...pinned, ...unpinned];
      persistRecentWorkspaces(ctx.recentWorkspaces);
      return { ok: true as const, data: ctx.recentWorkspaces };
    },
    listTreeForWorkspace: async (
      workspacePath: string,
      _options?: { force?: boolean; allowStale?: boolean },
    ): Promise<IpcResult<WorkspaceTreePayload>> => {
      const params = new URLSearchParams({ rootPath: workspacePath });
      const result = await requestPreviewApi<WorkspaceTreeNode[]>(
        `/workspace/tree?${params.toString()}`,
      );
      // preview dev-server 只 serving 新鲜树：allowStale 恒 miss（同 mock 语义）。
      // `capturedAt` 为客户端合成时间（`Date.now()`），仅恒 miss 路径携带——
      // 校准门只消费 `fromCache:true` 行的时间戳，故该值永不参与校准判定。
      return result.ok
        ? {
            ok: true as const,
            data: { tree: result.data, fromCache: false, capturedAt: Date.now() },
          }
        : result;
    },
    listGitStatusForWorkspace: async (workspacePath: string) => {
      const params = new URLSearchParams({ rootPath: workspacePath });
      return requestPreviewApi<GitSnapshot>(`/workspace/git-status?${params.toString()}`);
    },
    initGitRepo: async (workspacePath: string) =>
      requestPreviewApi<GitSnapshot>('/workspace/git-init', {
        method: 'POST',
        body: JSON.stringify({ rootPath: workspacePath }),
      }),
    revealInFileManager: async (workspacePath: string) =>
      requestPreviewApi<boolean>('/workspace/reveal', {
        method: 'POST',
        body: JSON.stringify({ path: workspacePath }),
      }),
    createFile: (relativePath: string, content = '', workspacePath?: string) =>
      withWorkspace<WorkspaceFileDocument, [string, string, string?]>(
        async (rootPath, rp, c, wsPath) =>
          requestPreviewApi<WorkspaceFileDocument>('/workspace/create-file', {
            method: 'POST',
            body: JSON.stringify({
              rootPath: wsPath ?? rootPath,
              relativePath: rp,
              content: c,
            }),
          }),
      )(relativePath, content, workspacePath),
    updateFileContent: (relativePath: string, content: string, workspacePath?: string) =>
      withWorkspace<WorkspaceFileDocument, [string, string, string?]>(
        async (rootPath, rp, c, wsPath) =>
          requestPreviewApi<WorkspaceFileDocument>('/workspace/update-file', {
            method: 'POST',
            body: JSON.stringify({
              rootPath: wsPath ?? rootPath,
              relativePath: rp,
              content: c,
            }),
          }),
      )(relativePath, content, workspacePath),
    createFolder: withWorkspace<boolean, [string, string?]>(
      async (rootPath, relativePath, wsPath) =>
        requestPreviewApi<boolean>('/workspace/create-folder', {
          method: 'POST',
          body: JSON.stringify({
            rootPath: wsPath ?? rootPath,
            relativePath,
          }),
        }),
    ),
    readFile: withWorkspace<WorkspaceFileDocument, [string]>(async (rootPath, relativePath) => {
      const params = new URLSearchParams({ rootPath, relativePath });
      return requestPreviewApi<WorkspaceFileDocument>(`/workspace/file?${params.toString()}`);
    }),
    readFileForWorkspace: async (workspacePath: string, relativePath: string) => {
      const params = new URLSearchParams({ rootPath: workspacePath, relativePath });
      return requestPreviewApi<WorkspaceFileDocument>(`/workspace/file?${params.toString()}`);
    },
    mediaSource: async (workspacePath: string, relativePath: string) =>
      // 浏览器模式：同源相对 URL，`<img>/<audio>/<video>` 直接引用即可（Range 由
      // 预览服务的 `/workspace/media` 同构实现提供）。
      probeMediaSource(`${PREVIEW_API_PREFIX}/workspace/media`, workspacePath, relativePath),
    // 浏览器预览同样跑在本机：交给预览服务的 `/system/open-file`（与桌面同样交给
    // 系统默认程序；越界校验只在桌面命令里做，预览服务是 dev-only 实现）。
    openInDefaultApp: async (
      workspacePath: string,
      relativePath: string,
    ): Promise<IpcResult<boolean>> => {
      const result = await requestPreviewApi<boolean>('/system/open-file', {
        method: 'POST',
        body: JSON.stringify({ path: joinPathSegments(workspacePath, relativePath) }),
      });
      if (!result.ok) {
        return result;
      }
      return { ok: true, data: result.data ?? true };
    },
    getChangePreview: withWorkspace<WorkspaceChangePreview, [string]>(
      async (rootPath, relativePath) => {
        const params = new URLSearchParams({ rootPath, relativePath });
        return requestPreviewApi<WorkspaceChangePreview>(
          `/workspace/change-preview?${params.toString()}`,
        );
      },
    ),
    getChangePreviewForWorkspace: async (workspacePath: string, relativePath: string) => {
      const params = new URLSearchParams({ rootPath: workspacePath, relativePath });
      return requestPreviewApi<WorkspaceChangePreview>(
        `/workspace/change-preview?${params.toString()}`,
      );
    },
    listTree: async (_options?: {
      force?: boolean;
      allowStale?: boolean;
    }): Promise<IpcResult<WorkspaceTreePayload>> => {
      if (!ctx.currentWorkspace) {
        return {
          ok: true as const,
          data: { tree: [] as WorkspaceTreeNode[], fromCache: false, capturedAt: Date.now() },
        };
      }
      const params = new URLSearchParams({ rootPath: ctx.currentWorkspace.rootPath });
      const result = await requestPreviewApi<WorkspaceTreeNode[]>(
        `/workspace/tree?${params.toString()}`,
      );
      // 同上：`capturedAt` 为客户端合成，仅恒 miss 路径携带，不参与校准判定。
      return result.ok
        ? {
            ok: true as const,
            data: { tree: result.data, fromCache: false, capturedAt: Date.now() },
          }
        : result;
    },
    renameFile: async (relativePath: string, newName: string, workspacePath?: string) => {
      const rootPath = workspacePath ?? ctx.currentWorkspace?.rootPath;
      if (!rootPath) {
        return {
          ok: false as const,
          error: { code: IpcErrorCode.NOT_FOUND, message: 'active workspace' },
        };
      }
      return requestPreviewApi<boolean>('/workspace/rename-file', {
        method: 'POST',
        body: JSON.stringify({ rootPath, relativePath, newName }),
      });
    },
    deleteFile: async (relativePath: string, workspacePath?: string) => {
      const rootPath = workspacePath ?? ctx.currentWorkspace?.rootPath;
      if (!rootPath) {
        return {
          ok: false as const,
          error: { code: IpcErrorCode.NOT_FOUND, message: 'active workspace' },
        };
      }
      return requestPreviewApi<boolean>('/workspace/delete-file', {
        method: 'POST',
        body: JSON.stringify({ rootPath, relativePath }),
      });
    },
    duplicateFile: async (
      srcRelativePath: string,
      dstRelativePath: string,
      workspacePath?: string,
    ) => {
      const rootPath = workspacePath ?? ctx.currentWorkspace?.rootPath;
      if (!rootPath) {
        return {
          ok: false as const,
          error: { code: IpcErrorCode.NOT_FOUND, message: 'active workspace' },
        };
      }
      return requestPreviewApi<boolean>('/workspace/duplicate-file', {
        method: 'POST',
        body: JSON.stringify({ rootPath, srcRelativePath, dstRelativePath }),
      });
    },
    getAbsolutePath: async (relativePath: string, workspacePath?: string) => {
      const rootPath = workspacePath ?? ctx.currentWorkspace?.rootPath;
      if (!rootPath) {
        return {
          ok: false as const,
          error: { code: IpcErrorCode.NOT_FOUND, message: 'active workspace' },
        };
      }
      const params = new URLSearchParams({ rootPath, relativePath });
      return requestPreviewApi<string>(`/workspace/absolute-path?${params.toString()}`);
    },
    moveFile: async (relativePath: string, newPath: string, workspacePath?: string) => {
      const rootPath = workspacePath ?? ctx.currentWorkspace?.rootPath;
      if (!rootPath) {
        return {
          ok: false as const,
          error: { code: IpcErrorCode.NOT_FOUND, message: 'active workspace' },
        };
      }
      return requestPreviewApi<boolean>('/workspace/move-file', {
        method: 'POST',
        body: JSON.stringify({ rootPath, relativePath, newPath }),
      });
    },
    moveFileAcross: async (input: {
      sourceWorkspacePath: string;
      sourceRelativePath: string;
      targetWorkspacePath: string;
      targetRelativePath: string;
    }) =>
      requestPreviewApi<boolean>('/workspace/move-across', {
        method: 'POST',
        body: JSON.stringify({
          sourceRootPath: input.sourceWorkspacePath,
          sourceRelativePath: input.sourceRelativePath,
          targetRootPath: input.targetWorkspacePath,
          targetRelativePath: input.targetRelativePath,
        }),
      }),
    copyFileAcross: async (input: {
      sourceWorkspacePath: string;
      sourceRelativePath: string;
      targetWorkspacePath: string;
      targetRelativePath: string;
    }) =>
      requestPreviewApi<boolean>('/workspace/copy-across', {
        method: 'POST',
        body: JSON.stringify({
          sourceRootPath: input.sourceWorkspacePath,
          sourceRelativePath: input.sourceRelativePath,
          targetRootPath: input.targetWorkspacePath,
          targetRelativePath: input.targetRelativePath,
        }),
      }),
    setEditorDirtyPaths: async () => ({ ok: true as const, data: true }),
  };

  const retrieval = {
    getStatus: async (): Promise<IpcResult<RetrievalSnapshot | undefined>> => {
      if (!ctx.currentWorkspace) {
        return { ok: true, data: undefined };
      }
      if (
        ctx.retrievalStatus?.completedAt &&
        Date.now() - ctx.retrievalStatus.completedAt < 10_000
      ) {
        return { ok: true, data: ctx.retrievalStatus };
      }
      const params = new URLSearchParams({
        rootPath: ctx.currentWorkspace.rootPath,
        workspaceId: ctx.currentWorkspace.id,
      });
      const result = await requestPreviewApi<RetrievalSnapshot>(
        `/retrieval/status?${params.toString()}`,
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
