import type {
  AppInfo,
  AppPreferencePatch,
  CiStatusSnapshot,
  GitBranchSummary,
  GitSnapshot,
  IpcResult,
  RecentWorkspaceEntry,
  RepoMapNode,
  RetrievalSnapshot,
  WorkspaceChangePreview,
  WorkspaceFileDocument,
  WorkspaceMeta,
  WorkspaceSearchHit,
  WorkspaceTreeNode,
  WorkspaceGitBranchChangeResult,
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
} from '@ai-digital-life/kernel';
import { applyPreferencePatch } from '../shared/preferencesMerger';
import { mockDigitalLifeBridge, setMockActiveWorkspace } from '../mock-bridge';
import { repoMapEntriesToTree } from '../shared/repoMapFromEntries';
import type { DigitalLifeBridge } from '../shared/ipc';
import { IpcErrorCode } from '../shared/ipc';
import { requestPreviewApi } from './api';
import {
  loadRecentWorkspaces,
  persistRecentWorkspaces,
  updateRecentWorkspaces,
  loadPreviewPreferences,
  persistPreviewPreferences,
  loadActiveWorkspacePath,
  persistActiveWorkspacePath,
} from './storage';
import { createPtyBridge } from './ptyBridge';

type PreviewWorkspaceOpenPayload = {
  meta: WorkspaceMeta;
  recent: RecentWorkspaceEntry;
  retrieval: RetrievalSnapshot;
};

function createBaseAppInfo(): AppInfo {
  const savedPreferences = loadPreviewPreferences();
  return {
    appName: 'AI Digital Life',
    version: '0.1.0',
    config: {
      language: savedPreferences.language ?? 'zh-CN',
      themeMode: savedPreferences.themeMode ?? 'system',
      resolvedTheme: savedPreferences.resolvedTheme ?? 'light',
      logLevel: 'info',
      maxRecentWorkspaces: 10,
      modelPreferences: savedPreferences.modelPreferences ?? {
        providers: {
          deepseek: {
            enabled: true,
            priority: 1,
            modelId: 'deepseek-v4-pro',
          },
          minimax: {
            enabled: true,
            priority: 2,
            modelId: 'MiniMax-M2.7',
          },
        },
      },
    },
    recentLogs: [
      {
        timestamp: Date.now(),
        level: 'info',
        scope: 'preview',
        message: 'Preview mode: workspace data comes from the local Vite preview API.',
      },
    ],
  };
}

export function setupPreviewBridge(): void {
  if (typeof window === 'undefined' || (window as { digitalLife?: unknown }).digitalLife) {
    return;
  }

  const appInfo = createBaseAppInfo();
  let recentWorkspaces = loadRecentWorkspaces();
  let currentWorkspace: WorkspaceMeta | undefined;
  let retrievalStatus: RetrievalSnapshot | undefined;
  let restoreCurrentWorkspacePromise: Promise<void> | undefined;

  setMockActiveWorkspace(undefined);

  const applyOpenedWorkspace = (payload: PreviewWorkspaceOpenPayload) => {
    currentWorkspace = payload.meta;
    retrievalStatus = payload.retrieval;
    setMockActiveWorkspace(payload.meta);
    recentWorkspaces = updateRecentWorkspaces(recentWorkspaces, payload.recent);
    persistActiveWorkspacePath(payload.meta.rootPath);
    appInfo.recentLogs.unshift({
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
      return { ok: true, data: result.data.meta };
    }
    return result;
  };

  const ensureCurrentWorkspaceRestored = async () => {
    if (currentWorkspace || restoreCurrentWorkspacePromise) {
      await restoreCurrentWorkspacePromise;
      return;
    }
    const savedWorkspacePath = loadActiveWorkspacePath();
    if (!savedWorkspacePath) return;
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

  const ptyBridge = createPtyBridge();

  const previewBridge: DigitalLifeBridge = {
    ...mockDigitalLifeBridge,
    subscribePtyOutput: ptyBridge.subscribePtyOutput,

    pty: ptyBridge.pty,

    app: {
      getInfo: async () => {
        await ensureCurrentWorkspaceRestored();
        return {
          ok: true,
          data: {
            ...appInfo,
            currentWorkspace,
          },
        };
      },
      getHealth: mockDigitalLifeBridge.app.getHealth,
      getDiagnostics: mockDigitalLifeBridge.app.getDiagnostics,
      getModelHealth: mockDigitalLifeBridge.app.getModelHealth,
      updatePreferences: async (patch: AppPreferencePatch) => {
        const nextConfig = applyPreferencePatch(appInfo.config, patch);
        appInfo.config = nextConfig;
        persistPreviewPreferences(nextConfig);
        return {
          ok: true,
          data: {
            ...appInfo,
            currentWorkspace,
          },
        };
      },
    },

    workspace: {
      listRecent: async () => ({ ok: true, data: recentWorkspaces }),
      open: async (workspacePath: string) => openWorkspaceFromPreviewApi(workspacePath),
      clearCurrent: async () => {
        currentWorkspace = undefined;
        retrievalStatus = undefined;
        setMockActiveWorkspace(undefined);
        persistActiveWorkspacePath(undefined);
        return { ok: true, data: true };
      },
      pickDirectory: async () => {
        const result = await requestPreviewApi<string | undefined>('/workspace/pick-directory', {
          method: 'POST',
        });
        if (!result.ok) return { ok: true, data: undefined };
        return { ok: true, data: result.data };
      },
      pin: async (workspaceId: string) => {
        const workspace = recentWorkspaces.find((w) => w.id === workspaceId);
        if (!workspace) {
          return {
            ok: false,
            error: { code: IpcErrorCode.NOT_FOUND, message: 'workspace not found' },
          };
        }
        const pinnedCount = recentWorkspaces.filter((w) => w.isPinned).length;
        recentWorkspaces = recentWorkspaces.map((w) =>
          w.id === workspaceId ? { ...w, isPinned: true, pinnedOrder: pinnedCount } : w
        );
        persistRecentWorkspaces(recentWorkspaces);
        return { ok: true, data: recentWorkspaces };
      },
      unpin: async (workspaceId: string) => {
        const workspace = recentWorkspaces.find((w) => w.id === workspaceId);
        if (!workspace) {
          return {
            ok: false,
            error: { code: IpcErrorCode.NOT_FOUND, message: 'workspace not found' },
          };
        }
        recentWorkspaces = recentWorkspaces.map((w) =>
          w.id === workspaceId ? { ...w, isPinned: false, pinnedOrder: 0 } : w
        );
        const pinnedWorkspaces = recentWorkspaces
          .filter((w) => w.isPinned)
          .sort((a, b) => a.pinnedOrder - b.pinnedOrder);
        const unpinnedWorkspaces = recentWorkspaces
          .filter((w) => !w.isPinned)
          .sort((a, b) => a.unpinnedOrder - b.unpinnedOrder);
        recentWorkspaces = [...pinnedWorkspaces, ...unpinnedWorkspaces];
        persistRecentWorkspaces(recentWorkspaces);
        return { ok: true, data: recentWorkspaces };
      },
      reorder: async (input: { pinnedIds: string[]; unpinnedIds: string[] }) => {
        const { pinnedIds, unpinnedIds } = input;
        recentWorkspaces = recentWorkspaces.map((w) => {
          const pinnedIndex = pinnedIds.indexOf(w.id);
          const unpinnedIndex = unpinnedIds.indexOf(w.id);
          if (pinnedIndex !== -1) return { ...w, isPinned: true, pinnedOrder: pinnedIndex };
          if (unpinnedIndex !== -1) return { ...w, isPinned: false, unpinnedOrder: unpinnedIndex };
          return w;
        });
        persistRecentWorkspaces(recentWorkspaces);
        return { ok: true, data: recentWorkspaces };
      },
      removeFromSidebar: async (workspaceId: string) => {
        recentWorkspaces = recentWorkspaces.filter((entry) => entry.id !== workspaceId);
        persistRecentWorkspaces(recentWorkspaces);
        return { ok: true, data: recentWorkspaces };
      },
      restoreToSidebar: async () => ({ ok: true, data: recentWorkspaces }),
      listTreeForWorkspace: async (workspacePath: string) => {
        const params = new URLSearchParams({ rootPath: workspacePath });
        return requestPreviewApi<WorkspaceTreeNode[]>(`/workspace/tree?${params.toString()}`);
      },
      listGitStatusForWorkspace: async (workspacePath: string) => {
        const params = new URLSearchParams({ rootPath: workspacePath });
        return requestPreviewApi<GitSnapshot>(`/workspace/git-status?${params.toString()}`);
      },
      hideFromRightPanels: async (workspaceId: string) => {
        const entry = recentWorkspaces.find((item) => item.id === workspaceId);
        if (entry) {
          entry.hiddenFromRightPanels = true;
        }
        persistRecentWorkspaces(recentWorkspaces);
        return { ok: true, data: recentWorkspaces };
      },
      showInRightPanels: async (workspaceId: string) => {
        const entry = recentWorkspaces.find((item) => item.id === workspaceId);
        if (entry) {
          entry.hiddenFromRightPanels = false;
        }
        persistRecentWorkspaces(recentWorkspaces);
        return { ok: true, data: recentWorkspaces };
      },
      revealInFileManager: async (workspacePath: string) =>
        requestPreviewApi<boolean>('/workspace/reveal', {
          method: 'POST',
          body: JSON.stringify({ path: workspacePath }),
        }),
      createFile: async (relativePath: string, content = '') => {
        if (!currentWorkspace)
          return {
            ok: false,
            error: { code: IpcErrorCode.NOT_FOUND, message: 'active workspace' },
          };
        return requestPreviewApi<WorkspaceFileDocument>('/workspace/create-file', {
          method: 'POST',
          body: JSON.stringify({ rootPath: currentWorkspace.rootPath, relativePath, content }),
        });
      },
      createFolder: async (relativePath: string) => {
        if (!currentWorkspace)
          return {
            ok: false,
            error: { code: IpcErrorCode.NOT_FOUND, message: 'active workspace' },
          };
        return requestPreviewApi<boolean>('/workspace/create-folder', {
          method: 'POST',
          body: JSON.stringify({ rootPath: currentWorkspace.rootPath, relativePath }),
        });
      },
      readFile: async (relativePath: string) => {
        if (!currentWorkspace)
          return {
            ok: false,
            error: { code: IpcErrorCode.NOT_FOUND, message: 'active workspace' },
          };
        const params = new URLSearchParams({ rootPath: currentWorkspace.rootPath, relativePath });
        return requestPreviewApi<WorkspaceFileDocument>(`/workspace/file?${params.toString()}`);
      },
      readFileForWorkspace: async (workspacePath: string, relativePath: string) => {
        const params = new URLSearchParams({ rootPath: workspacePath, relativePath });
        return requestPreviewApi<WorkspaceFileDocument>(`/workspace/file?${params.toString()}`);
      },
      getChangePreview: async (relativePath: string) => {
        if (!currentWorkspace)
          return {
            ok: false,
            error: { code: IpcErrorCode.NOT_FOUND, message: 'active workspace' },
          };
        const params = new URLSearchParams({ rootPath: currentWorkspace.rootPath, relativePath });
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
        if (!currentWorkspace) return { ok: true, data: [] as WorkspaceTreeNode[] };
        const params = new URLSearchParams({ rootPath: currentWorkspace.rootPath });
        return requestPreviewApi<WorkspaceTreeNode[]>(`/workspace/tree?${params.toString()}`);
      },
      search: async (query: string) => {
        if (!currentWorkspace) return { ok: true, data: [] as WorkspaceSearchHit[] };
        const params = new URLSearchParams({ rootPath: currentWorkspace.rootPath, query });
        return requestPreviewApi<WorkspaceSearchHit[]>(`/workspace/search?${params.toString()}`);
      },
      outline: async (relativePath: string) => {
        if (!currentWorkspace) return { ok: true, data: [] };
        const params = new URLSearchParams({ rootPath: currentWorkspace.rootPath, relativePath });
        return requestPreviewApi(`/workspace/outline?${params.toString()}`);
      },
      renameFile: async (relativePath: string, newName: string) => {
        if (!currentWorkspace)
          return {
            ok: false,
            error: { code: IpcErrorCode.NOT_FOUND, message: 'active workspace' },
          };
        return requestPreviewApi<boolean>('/workspace/rename-file', {
          method: 'POST',
          body: JSON.stringify({ rootPath: currentWorkspace.rootPath, relativePath, newName }),
        });
      },
      deleteFile: async (relativePath: string) => {
        if (!currentWorkspace)
          return {
            ok: false,
            error: { code: IpcErrorCode.NOT_FOUND, message: 'active workspace' },
          };
        return requestPreviewApi<boolean>('/workspace/delete-file', {
          method: 'POST',
          body: JSON.stringify({ rootPath: currentWorkspace.rootPath, relativePath }),
        });
      },
      duplicateFile: async (srcRelativePath: string, dstRelativePath: string) => {
        if (!currentWorkspace)
          return {
            ok: false,
            error: { code: IpcErrorCode.NOT_FOUND, message: 'active workspace' },
          };
        return requestPreviewApi<boolean>('/workspace/duplicate-file', {
          method: 'POST',
          body: JSON.stringify({
            rootPath: currentWorkspace.rootPath,
            srcRelativePath,
            dstRelativePath,
          }),
        });
      },
      getAbsolutePath: async (relativePath: string) => {
        if (!currentWorkspace)
          return {
            ok: false,
            error: { code: IpcErrorCode.NOT_FOUND, message: 'active workspace' },
          };
        const params = new URLSearchParams({ rootPath: currentWorkspace.rootPath, relativePath });
        return requestPreviewApi<string>(`/workspace/absolute-path?${params.toString()}`);
      },
      moveFile: async (relativePath: string, newPath: string) => {
        if (!currentWorkspace)
          return {
            ok: false,
            error: { code: IpcErrorCode.NOT_FOUND, message: 'active workspace' },
          };
        return requestPreviewApi<boolean>('/workspace/move-file', {
          method: 'POST',
          body: JSON.stringify({ rootPath: currentWorkspace.rootPath, relativePath, newPath }),
        });
      },
      setEditorDirtyPaths: async () => ({ ok: true, data: true }),
      onFileChanged: () => () => undefined,
      getGitStatus: async () => {
        if (!currentWorkspace) {
          return {
            ok: true,
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
        const params = new URLSearchParams({ rootPath: currentWorkspace.rootPath });
        return requestPreviewApi<GitSnapshot>(`/workspace/git-status?${params.toString()}`);
      },
      listGitBranches: async () => {
        if (!currentWorkspace)
          return {
            ok: false,
            error: { code: IpcErrorCode.NOT_FOUND, message: 'active workspace' },
          };
        const params = new URLSearchParams({ rootPath: currentWorkspace.rootPath });
        return requestPreviewApi<GitBranchSummary[]>(
          `/workspace/git-branches?${params.toString()}`
        );
      },
      switchGitBranch: async (input: WorkspaceGitBranchSwitchInput) => {
        if (!currentWorkspace)
          return {
            ok: false,
            error: { code: IpcErrorCode.NOT_FOUND, message: 'active workspace' },
          };
        const result = await requestPreviewApi<WorkspaceGitBranchChangeResult>(
          '/workspace/git-switch',
          {
            method: 'POST',
            body: JSON.stringify({ rootPath: currentWorkspace.rootPath, input }),
          }
        );
        if (result.ok) {
          currentWorkspace = result.data.workspace;
          setMockActiveWorkspace(result.data.workspace);
        }
        return result;
      },
      createGitBranch: async (input: WorkspaceGitBranchCreateInput) => {
        if (!currentWorkspace)
          return {
            ok: false,
            error: { code: IpcErrorCode.NOT_FOUND, message: 'active workspace' },
          };
        const result = await requestPreviewApi<WorkspaceGitBranchChangeResult>(
          '/workspace/git-create-branch',
          {
            method: 'POST',
            body: JSON.stringify({ rootPath: currentWorkspace.rootPath, input }),
          }
        );
        if (result.ok) {
          currentWorkspace = result.data.workspace;
          setMockActiveWorkspace(result.data.workspace);
        }
        return result;
      },
    },

    retrieval: {
      getStatus: async () => {
        if (!currentWorkspace) return { ok: true, data: undefined };
        const params = new URLSearchParams({
          rootPath: currentWorkspace.rootPath,
          workspaceId: currentWorkspace.id,
        });
        const result = await requestPreviewApi<RetrievalSnapshot>(
          `/retrieval/status?${params.toString()}`
        );
        if (result.ok) retrievalStatus = result.data;
        return result.ok ? { ok: true, data: result.data } : result;
      },
      getRepoMap: async (): Promise<IpcResult<RepoMapNode[]>> => {
        const status = retrievalStatus
          ? ({ ok: true, data: retrievalStatus } satisfies IpcResult<RetrievalSnapshot>)
          : await previewBridge.retrieval.getStatus();
        if (!status.ok) return status;
        return { ok: true, data: repoMapEntriesToTree(status.data?.repoMap ?? []) };
      },
      rebuildIndex: async () => ({ ok: true, data: true }),
    },

    browser: {
      navigate: async () => {},
      goBack: async () => true,
      goForward: async () => true,
      reload: async () => {},
      onUrlChanged: () => () => {},
    },
    ci: {
      getStatus: async (config: {
        owner: string;
        repo: string;
        branch: string;
        workflowId?: string | null;
        accessToken?: string | null;
      }) => {
        const param = new URLSearchParams();
        param.set('owner', config.owner);
        param.set('repo', config.repo);
        param.set('branch', config.branch);
        const token = typeof config.accessToken === 'string' ? config.accessToken.trim() : '';
        const headers: Record<string, string> = {};
        if (token) {
          headers['X-CI-Access-Token'] = token;
        }
        return requestPreviewApi<CiStatusSnapshot>(`/ci/status?${param.toString()}`, { headers });
      },
      getStatusWithoutToken: async (owner: string, repo: string, branch: string) => {
        const param = new URLSearchParams();
        param.set('owner', owner);
        param.set('repo', repo);
        param.set('branch', branch);
        return requestPreviewApi<CiStatusSnapshot>(`/ci/status?${param.toString()}`);
      },
      setAccessToken: async (token: string) => {
        return requestPreviewApi<boolean>('/ci/set-access-token', {
          method: 'POST',
          body: JSON.stringify({ token }),
          headers: { 'Content-Type': 'application/json' },
        });
      },
      clearAccessToken: async () => {
        return requestPreviewApi<boolean>('/ci/clear-access-token', {
          method: 'POST',
        });
      },
      hasAccessToken: async () => {
        return requestPreviewApi<boolean>('/ci/has-access-token');
      },
    },
  };

  (window as { digitalLife: DigitalLifeBridge }).digitalLife = previewBridge;
}
