import type {
  AppInfo,
  AppPreferencePatch,
  GitBranchSummary,
  GitSnapshot,
  IpcResult,
  RecentWorkspaceEntry,
  RepoMapNode,
  RetrievalSnapshot,
  WorkspaceChangePreview,
  WorkspaceGitBranchChangeResult,
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
  WorkspaceFileDocument,
  WorkspaceMeta,
  WorkspaceSearchHit,
  WorkspaceTreeNode
} from "@ai-digital-life/kernel";
import { applyPreferencePatch } from "./app/utils/preferencesMerger";
import { mockDigitalLifeBridge, setMockActiveWorkspace } from "./mock-bridge";
import { repoMapEntriesToTree } from "./app/repoMapFromEntries";
import type { DigitalLifeBridge, PtyOutputEvent, PtySessionInfo } from "./shared/ipc";
import { IpcErrorCode } from "./shared/ipc";

const PREVIEW_API_PREFIX = "/__adl_preview_api__";
const PREVIEW_RECENT_STORAGE_KEY = "adl.preview.recent-workspaces.v1";
const PREVIEW_PREFERENCES_STORAGE_KEY = "adl.preview.preferences.v1";
const PREVIEW_ACTIVE_WORKSPACE_STORAGE_KEY = "adl.preview.active-workspace.v1";

const MAX_PTY_LISTENERS = 32;
const ptyOutputListeners = new Set<(event: PtyOutputEvent) => void>();
let ptySseEventSource: EventSource | null = null;
let ptySseListenersCount = 0;

function connectPtySse(onCleanup: () => void): void {
  const es = new EventSource(`${PREVIEW_API_PREFIX}/pty/output`);
  ptySseEventSource = es;
  es.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data) as PtyOutputEvent;
      ptyOutputListeners.forEach((fn) => fn(parsed));
    } catch {
      // ignore parse errors
    }
  };
  es.onerror = () => {
    es.close();
    ptySseEventSource = null;
    onCleanup();
  };
}

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

function loadActiveWorkspacePath(): string | undefined {
  try {
    return window.localStorage.getItem(PREVIEW_ACTIVE_WORKSPACE_STORAGE_KEY)?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function persistActiveWorkspacePath(workspacePath?: string) {
  try {
    if (!workspacePath?.trim()) {
      window.localStorage.removeItem(PREVIEW_ACTIVE_WORKSPACE_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(PREVIEW_ACTIVE_WORKSPACE_STORAGE_KEY, workspacePath.trim());
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
        code: IpcErrorCode.PREVIEW_API_ERROR,
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
      level: "info",
      scope: "workspace",
      message: `Preview mode: opened real local workspace ${payload.meta.rootPath}`
    });
  };

  const openWorkspaceFromPreviewApi = async (workspacePath: string): Promise<IpcResult<WorkspaceMeta>> => {
    const result = await requestPreviewApi<PreviewWorkspaceOpenPayload>("/workspace/open", {
      method: "POST",
      body: JSON.stringify({ workspacePath })
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

  const previewBridge: DigitalLifeBridge = {
    ...mockDigitalLifeBridge,
    subscribePtyOutput: (listener) => {
      if (ptyOutputListeners.size >= MAX_PTY_LISTENERS) {
        console.warn("preview-bridge: PTY listener limit reached, dropping oldest listener");
        const oldest = ptyOutputListeners.values().next().value;
        if (oldest) ptyOutputListeners.delete(oldest);
      }
      ptyOutputListeners.add(listener);
      ptySseListenersCount += 1;
      if (!ptySseEventSource) {
        connectPtySse(() => { ptySseListenersCount = Math.max(0, ptySseListenersCount - 1); });
      }
      return () => {
        ptyOutputListeners.delete(listener);
        ptySseListenersCount -= 1;
        if (ptySseListenersCount <= 0 && ptySseEventSource) {
          ptySseEventSource.close();
          ptySseEventSource = null;
          ptySseListenersCount = 0;
        }
      };
    },
    pty: {
      create: async (input) => requestPreviewApi<{ sessionId: string }>("/pty/create", {
        method: "POST",
        body: JSON.stringify({ shell: input.shell, cwd: input.cwd, cols: input.cols, rows: input.rows })
      }),
      input: async (sessionId, data) => requestPreviewApi<boolean>("/pty/input", {
        method: "POST",
        body: JSON.stringify({ sessionId, data })
      }),
      resize: async (sessionId, cols, rows) => requestPreviewApi<boolean>("/pty/resize", {
        method: "POST",
        body: JSON.stringify({ sessionId, cols, rows })
      }),
      kill: async (sessionId) => requestPreviewApi<boolean>("/pty/kill", {
        method: "POST",
        body: JSON.stringify({ sessionId })
      }),
      list: async () => requestPreviewApi<PtySessionInfo[]>("/pty/list")
    },
    app: {
      getInfo: async () => {
        await ensureCurrentWorkspaceRestored();
        return {
          ok: true,
          data: {
            ...appInfo,
            currentWorkspace
          }
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
            currentWorkspace
          }
        };
      }
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
        const result = await requestPreviewApi<string | undefined>("/workspace/pick-directory", {
          method: "POST"
        });
        if (!result.ok) {
          return { ok: true, data: undefined };
        }
        return { ok: true, data: result.data };
      },
      pin: async (workspaceId: string) => {
        const workspace = recentWorkspaces.find((w) => w.id === workspaceId);
        if (!workspace) {
          return { ok: false, error: { code: IpcErrorCode.NOT_FOUND, message: "workspace not found" } };
        }
        const pinnedCount = recentWorkspaces.filter((w) => w.isPinned).length;
        recentWorkspaces = recentWorkspaces.map((w) =>
          w.id === workspaceId
            ? { ...w, isPinned: true, pinnedOrder: pinnedCount }
            : w
        );
        persistRecentWorkspaces(recentWorkspaces);
        return { ok: true, data: recentWorkspaces };
      },
      unpin: async (workspaceId: string) => {
        const workspace = recentWorkspaces.find((w) => w.id === workspaceId);
        if (!workspace) {
          return { ok: false, error: { code: IpcErrorCode.NOT_FOUND, message: "workspace not found" } };
        }
        recentWorkspaces = recentWorkspaces.map((w) =>
          w.id === workspaceId
            ? { ...w, isPinned: false, pinnedOrder: 0 }
            : w
        );
        const pinnedWorkspaces = recentWorkspaces.filter((w) => w.isPinned);
        pinnedWorkspaces.sort((a, b) => a.pinnedOrder - b.pinnedOrder);
        const unpinnedWorkspaces = recentWorkspaces.filter((w) => !w.isPinned);
        unpinnedWorkspaces.sort((a, b) => a.unpinnedOrder - b.unpinnedOrder);
        recentWorkspaces = [...pinnedWorkspaces, ...unpinnedWorkspaces];
        persistRecentWorkspaces(recentWorkspaces);
        return { ok: true, data: recentWorkspaces };
      },
      reorder: async (input: { pinnedIds: string[]; unpinnedIds: string[] }) => {
        const { pinnedIds, unpinnedIds } = input;
        recentWorkspaces = recentWorkspaces.map((w) => {
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
        persistRecentWorkspaces(recentWorkspaces);
        return { ok: true, data: recentWorkspaces };
      },
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
          return { ok: false, error: { code: IpcErrorCode.NOT_FOUND, message: "active workspace" } };
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
          return { ok: false, error: { code: IpcErrorCode.NOT_FOUND, message: "active workspace" } };
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
          return { ok: false, error: { code: IpcErrorCode.NOT_FOUND, message: "active workspace" } };
        }
        const params = new URLSearchParams({
          rootPath: currentWorkspace.rootPath,
          relativePath
        });
        return requestPreviewApi<WorkspaceFileDocument>(`/workspace/file?${params.toString()}`);
      },
      getChangePreview: async (relativePath: string) => {
        if (!currentWorkspace) {
          return { ok: false, error: { code: IpcErrorCode.NOT_FOUND, message: "active workspace" } };
        }
        const params = new URLSearchParams({
          rootPath: currentWorkspace.rootPath,
          relativePath
        });
        return requestPreviewApi<WorkspaceChangePreview>(`/workspace/change-preview?${params.toString()}`);
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
      renameFile: async (relativePath: string, newName: string) => {
        if (!currentWorkspace) {
          return { ok: false, error: { code: IpcErrorCode.NOT_FOUND, message: "active workspace" } };
        }
        return requestPreviewApi<boolean>("/workspace/rename-file", {
          method: "POST",
          body: JSON.stringify({ rootPath: currentWorkspace.rootPath, relativePath, newName })
        });
      },
      deleteFile: async (relativePath: string) => {
        if (!currentWorkspace) {
          return { ok: false, error: { code: IpcErrorCode.NOT_FOUND, message: "active workspace" } };
        }
        return requestPreviewApi<boolean>("/workspace/delete-file", {
          method: "POST",
          body: JSON.stringify({ rootPath: currentWorkspace.rootPath, relativePath })
        });
      },
      duplicateFile: async (srcRelativePath: string, dstRelativePath: string) => {
        if (!currentWorkspace) {
          return { ok: false, error: { code: IpcErrorCode.NOT_FOUND, message: "active workspace" } };
        }
        return requestPreviewApi<boolean>("/workspace/duplicate-file", {
          method: "POST",
          body: JSON.stringify({ rootPath: currentWorkspace.rootPath, srcRelativePath, dstRelativePath })
        });
      },
      getAbsolutePath: async (relativePath: string) => {
        if (!currentWorkspace) {
          return { ok: false, error: { code: IpcErrorCode.NOT_FOUND, message: "active workspace" } };
        }
        const params = new URLSearchParams({ rootPath: currentWorkspace.rootPath, relativePath });
        return requestPreviewApi<string>(`/workspace/absolute-path?${params.toString()}`);
      },
      moveFile: async (relativePath: string, newPath: string) => {
        if (!currentWorkspace) {
          return { ok: false, error: { code: IpcErrorCode.NOT_FOUND, message: "active workspace" } };
        }
        return requestPreviewApi<boolean>("/workspace/move-file", {
          method: "POST",
          body: JSON.stringify({ rootPath: currentWorkspace.rootPath, relativePath, newPath })
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
              capturedAt: Date.now()
            } satisfies GitSnapshot
          };
        }
        const params = new URLSearchParams({ rootPath: currentWorkspace.rootPath });
        return requestPreviewApi<GitSnapshot>(`/workspace/git-status?${params.toString()}`);
      },
      listGitBranches: async () => {
        if (!currentWorkspace) {
          return { ok: false, error: { code: IpcErrorCode.NOT_FOUND, message: "active workspace" } };
        }
        const params = new URLSearchParams({ rootPath: currentWorkspace.rootPath });
        return requestPreviewApi<GitBranchSummary[]>(`/workspace/git-branches?${params.toString()}`);
      },
      switchGitBranch: async (input: WorkspaceGitBranchSwitchInput) => {
        if (!currentWorkspace) {
          return { ok: false, error: { code: IpcErrorCode.NOT_FOUND, message: "active workspace" } };
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
          return { ok: false, error: { code: IpcErrorCode.NOT_FOUND, message: "active workspace" } };
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
