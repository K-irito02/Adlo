import type {
  AppInfo,
  AppPreferencePatch,
  GitBranchSummary,
  GitSnapshot,
  IpcResult,
  RecentWorkspaceEntry,
  RepoMapNode,
  RetrievalSnapshot,
  WorkspaceGitBranchChangeResult,
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
  WorkspaceFileDocument,
  WorkspaceMeta,
  WorkspaceSearchHit,
  WorkspaceTreeNode
} from "@ai-digital-life/kernel";
import { mockDigitalLifeBridge, setMockActiveWorkspace } from "./mock-bridge";
import { repoMapEntriesToTree } from "./app/repoMapFromEntries";
import type { DigitalLifeBridge } from "./shared/ipc";

const PREVIEW_API_PREFIX = "/__adl_preview_api__";
const PREVIEW_RECENT_STORAGE_KEY = "adl.preview.recent-workspaces.v1";
const PREVIEW_PREFERENCES_STORAGE_KEY = "adl.preview.preferences.v1";

type PreviewWorkspaceOpenPayload = {
  meta: WorkspaceMeta;
  recent: RecentWorkspaceEntry;
  retrieval: RetrievalSnapshot;
};

type PreviewPreferenceState = Pick<AppInfo["config"], "language" | "themeMode" | "resolvedTheme" | "modelPreferences">;

function loadRecentWorkspaces(): RecentWorkspaceEntry[] {
  try {
    const raw = window.localStorage.getItem(PREVIEW_RECENT_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as RecentWorkspaceEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistRecentWorkspaces(entries: RecentWorkspaceEntry[]) {
  try {
    window.localStorage.setItem(PREVIEW_RECENT_STORAGE_KEY, JSON.stringify(entries.slice(0, 12)));
  } catch {
    // ignore persistence errors in preview mode
  }
}

function loadPreviewPreferences(): Partial<PreviewPreferenceState> {
  try {
    const raw = window.localStorage.getItem(PREVIEW_PREFERENCES_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Partial<PreviewPreferenceState>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persistPreviewPreferences(config: PreviewPreferenceState) {
  try {
    window.localStorage.setItem(
      PREVIEW_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        language: config.language,
        themeMode: config.themeMode,
        resolvedTheme: config.resolvedTheme,
        modelPreferences: config.modelPreferences
      } satisfies PreviewPreferenceState)
    );
  } catch {
    // ignore persistence errors in preview mode
  }
}

function createBaseAppInfo(): AppInfo {
  const savedPreferences = loadPreviewPreferences();
  return {
    appName: "AI Digital Life",
    version: "0.1.0",
    config: {
      language: savedPreferences.language ?? "zh-CN",
      themeMode: savedPreferences.themeMode ?? "system",
      resolvedTheme: savedPreferences.resolvedTheme ?? "light",
      logLevel: "info",
      maxRecentWorkspaces: 10,
      modelPreferences: savedPreferences.modelPreferences ?? {
        providers: {
          deepseek: {
            enabled: true,
            priority: 1,
            modelId: "deepseek-v4-pro"
          },
          minimax: {
            enabled: true,
            priority: 2,
            modelId: "MiniMax-M2.7"
          }
        }
      }
    },
    recentLogs: [
      {
        timestamp: Date.now(),
        level: "info",
        scope: "preview",
        message: "Preview mode: workspace data comes from the local Vite preview API."
      }
    ]
  };
}

async function requestPreviewApi<T>(pathname: string, init?: RequestInit): Promise<IpcResult<T>> {
  try {
    const response = await fetch(`${PREVIEW_API_PREFIX}${pathname}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {})
      }
    });
    return (await response.json()) as IpcResult<T>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: {
        code: "PREVIEW_API_ERROR",
        message
      }
    };
  }
}

function updateRecentWorkspaces(
  currentEntries: RecentWorkspaceEntry[],
  entry: RecentWorkspaceEntry
): RecentWorkspaceEntry[] {
  const next = [entry, ...currentEntries.filter((candidate) => candidate.path !== entry.path)];
  const normalized = next.map((candidate, index) => ({
    ...candidate,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: index,
    removedFromSidebar: false,
    available: true
  }));
  persistRecentWorkspaces(normalized);
  return normalized;
}

export function setupPreviewBridge(): void {
  if (typeof window === "undefined" || window.digitalLife) {
    return;
  }

  const appInfo = createBaseAppInfo();
  let recentWorkspaces = loadRecentWorkspaces();
  let currentWorkspace: WorkspaceMeta | undefined;
  let retrievalStatus: RetrievalSnapshot | undefined;
  setMockActiveWorkspace(undefined);

  const previewBridge: DigitalLifeBridge = {
    ...mockDigitalLifeBridge,
    app: {
      getInfo: async () => ({
        ok: true,
        data: {
          ...appInfo,
          currentWorkspace
        }
      }),
      getHealth: mockDigitalLifeBridge.app.getHealth,
      getDiagnostics: mockDigitalLifeBridge.app.getDiagnostics,
      getModelHealth: mockDigitalLifeBridge.app.getModelHealth,
      updatePreferences: async (patch: AppPreferencePatch) => {
        const nextConfig = { ...appInfo.config };
        if (patch.language) {
          nextConfig.language = patch.language;
        }
        if (patch.themeMode) {
          nextConfig.themeMode = patch.themeMode;
          nextConfig.resolvedTheme = patch.themeMode === "dark" ? "dark" : "light";
        }
        if (patch.modelPreferences) {
          const nextProviders = { ...nextConfig.modelPreferences.providers };
          if (patch.modelPreferences.deepseek) {
            nextProviders.deepseek = {
              ...nextProviders.deepseek,
              ...patch.modelPreferences.deepseek
            };
          }
          if (patch.modelPreferences.minimax) {
            nextProviders.minimax = {
              ...nextProviders.minimax,
              ...patch.modelPreferences.minimax
            };
          }
          nextConfig.modelPreferences = {
            ...nextConfig.modelPreferences,
            providers: nextProviders
          };
        }
        appInfo.config = nextConfig;
        persistPreviewPreferences(nextConfig);
        return {
          ok: true,
          data: {
            ...appInfo,
            currentWorkspace
          }
        };
      }
    },
    workspace: {
      listRecent: async () => ({ ok: true, data: recentWorkspaces }),
      open: async (workspacePath: string) => {
        const result = await requestPreviewApi<PreviewWorkspaceOpenPayload>("/workspace/open", {
          method: "POST",
          body: JSON.stringify({ workspacePath })
        });
        if (!result.ok) {
          return result;
        }
        currentWorkspace = result.data.meta;
        retrievalStatus = result.data.retrieval;
        setMockActiveWorkspace(result.data.meta);
        recentWorkspaces = updateRecentWorkspaces(recentWorkspaces, result.data.recent);
        appInfo.recentLogs.unshift({
          timestamp: Date.now(),
          level: "info",
          scope: "workspace",
          message: `Preview mode: opened real local workspace ${result.data.meta.rootPath}`
        });
        return { ok: true, data: result.data.meta };
      },
      clearCurrent: async () => {
        currentWorkspace = undefined;
        retrievalStatus = undefined;
        setMockActiveWorkspace(undefined);
        return { ok: true, data: true };
      },
      pickDirectory: async () => ({
        ok: false,
        error: {
          code: "UNSUPPORTED",
          message: "Browser preview does not provide a native directory picker. Enter the workspace path manually."
        }
      }),
      pin: async () => ({ ok: true, data: recentWorkspaces }),
      unpin: async () => ({ ok: true, data: recentWorkspaces }),
      reorder: async () => ({ ok: true, data: recentWorkspaces }),
      removeFromSidebar: async (workspaceId: string) => {
        recentWorkspaces = recentWorkspaces.filter((entry) => entry.id !== workspaceId);
        persistRecentWorkspaces(recentWorkspaces);
        return { ok: true, data: recentWorkspaces };
      },
      restoreToSidebar: async () => ({ ok: true, data: recentWorkspaces }),
      revealInFileManager: async (workspacePath: string) =>
        requestPreviewApi<boolean>("/workspace/reveal", {
          method: "POST",
          body: JSON.stringify({ path: workspacePath })
        }),
      createFile: async (relativePath: string, content = "") => {
        if (!currentWorkspace) {
          return { ok: false, error: { code: "NOT_FOUND", message: "active workspace" } };
        }
        return requestPreviewApi<WorkspaceFileDocument>("/workspace/create-file", {
          method: "POST",
          body: JSON.stringify({
            rootPath: currentWorkspace.rootPath,
            relativePath,
            content
          })
        });
      },
      createFolder: async (relativePath: string) => {
        if (!currentWorkspace) {
          return { ok: false, error: { code: "NOT_FOUND", message: "active workspace" } };
        }
        return requestPreviewApi<boolean>("/workspace/create-folder", {
          method: "POST",
          body: JSON.stringify({
            rootPath: currentWorkspace.rootPath,
            relativePath
          })
        });
      },
      readFile: async (relativePath: string) => {
        if (!currentWorkspace) {
          return { ok: false, error: { code: "NOT_FOUND", message: "active workspace" } };
        }
        const params = new URLSearchParams({
          rootPath: currentWorkspace.rootPath,
          relativePath
        });
        return requestPreviewApi<WorkspaceFileDocument>(`/workspace/file?${params.toString()}`);
      },
      listTree: async () => {
        if (!currentWorkspace) {
          return { ok: true, data: [] as WorkspaceTreeNode[] };
        }
        const params = new URLSearchParams({ rootPath: currentWorkspace.rootPath });
        return requestPreviewApi<WorkspaceTreeNode[]>(`/workspace/tree?${params.toString()}`);
      },
      search: async (query: string) => {
        if (!currentWorkspace) {
          return { ok: true, data: [] as WorkspaceSearchHit[] };
        }
        const params = new URLSearchParams({
          rootPath: currentWorkspace.rootPath,
          query
        });
        return requestPreviewApi<WorkspaceSearchHit[]>(`/workspace/search?${params.toString()}`);
      },
      outline: async (relativePath: string) => {
        if (!currentWorkspace) {
          return { ok: true, data: [] };
        }
        const params = new URLSearchParams({
          rootPath: currentWorkspace.rootPath,
          relativePath
        });
        return requestPreviewApi(`/workspace/outline?${params.toString()}`);
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
              capturedAt: Date.now()
            } satisfies GitSnapshot
          };
        }
        const params = new URLSearchParams({ rootPath: currentWorkspace.rootPath });
        return requestPreviewApi<GitSnapshot>(`/workspace/git-status?${params.toString()}`);
      },
      listGitBranches: async () => {
        if (!currentWorkspace) {
          return { ok: false, error: { code: "NOT_FOUND", message: "active workspace" } };
        }
        const params = new URLSearchParams({ rootPath: currentWorkspace.rootPath });
        return requestPreviewApi<GitBranchSummary[]>(`/workspace/git-branches?${params.toString()}`);
      },
      switchGitBranch: async (input: WorkspaceGitBranchSwitchInput) => {
        if (!currentWorkspace) {
          return { ok: false, error: { code: "NOT_FOUND", message: "active workspace" } };
        }
        const result = await requestPreviewApi<WorkspaceGitBranchChangeResult>("/workspace/git-switch", {
          method: "POST",
          body: JSON.stringify({ rootPath: currentWorkspace.rootPath, input })
        });
        if (result.ok) {
          currentWorkspace = result.data.workspace;
          setMockActiveWorkspace(result.data.workspace);
        }
        return result;
      },
      createGitBranch: async (input: WorkspaceGitBranchCreateInput) => {
        if (!currentWorkspace) {
          return { ok: false, error: { code: "NOT_FOUND", message: "active workspace" } };
        }
        const result = await requestPreviewApi<WorkspaceGitBranchChangeResult>("/workspace/git-create-branch", {
          method: "POST",
          body: JSON.stringify({ rootPath: currentWorkspace.rootPath, input })
        });
        if (result.ok) {
          currentWorkspace = result.data.workspace;
          setMockActiveWorkspace(result.data.workspace);
        }
        return result;
      }
    },
    retrieval: {
      getStatus: async () => {
        if (!currentWorkspace) {
          return { ok: true, data: undefined };
        }
        const params = new URLSearchParams({
          rootPath: currentWorkspace.rootPath,
          workspaceId: currentWorkspace.id
        });
        const result = await requestPreviewApi<RetrievalSnapshot>(`/retrieval/status?${params.toString()}`);
        if (result.ok) {
          retrievalStatus = result.data;
        }
        return result.ok ? { ok: true, data: result.data } : result;
      },
      getRepoMap: async (): Promise<IpcResult<RepoMapNode[]>> => {
        const status = retrievalStatus
          ? ({ ok: true, data: retrievalStatus } satisfies IpcResult<RetrievalSnapshot>)
          : await previewBridge.retrieval.getStatus();
        if (!status.ok) {
          return status;
        }
        return {
          ok: true,
          data: repoMapEntriesToTree(status.data?.repoMap ?? [])
        };
      },
      rebuildIndex: async () => ({ ok: true, data: true })
    }
  };

  (window as typeof window & { digitalLife: DigitalLifeBridge }).digitalLife = previewBridge;
}
