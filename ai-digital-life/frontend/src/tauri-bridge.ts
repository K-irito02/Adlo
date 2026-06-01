import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { IpcErrorCode } from "./shared/ipc";
import type { DigitalLifeBridge, PtyOutputEvent, PtySessionInfo } from "./shared/ipc";
import type {
  AgentRunDetail,
  AppInfo,
  AppPreferencePatch,
  AuditEntry,
  ApprovalRequestSummary,
  CheckpointPayloadPreview,
  CommandRequest,
  CommandRunResult,
  ConversationDetail,
  ConversationSendResult,
  ConversationSessionRecord,
  DigitalLifeModelStreamEventV1,
  DigitalLifeRunActivityEventV1,
  DigitalLifeTerminalStreamEventV1,
  GitBranchSummary,
  GitSnapshot,
  HealthSnapshot,
  IpcResult,
  ModelGatewayHealthSnapshot,
  PatchApplicationResult,
  PatchSet,
  RecentWorkspaceEntry,
  RepoMapNode,
  RetrievalSnapshot,
  ReorderSessionsInput,
  ReorderWorkspacesInput,
  RuntimeDiagnosticsSnapshot,
  TaskCenterSnapshot,
  WorkspaceChangePreview,
  WorkspaceFileChangedEvent,
  WorkspaceFileDocument,
  WorkspaceGitBranchChangeResult,
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
  WorkspaceMeta,
  WorkspaceSearchHit,
  WorkspaceTreeNode
} from "@ai-digital-life/kernel";
import { repoMapEntriesToTree } from "./app/utils/repoMapFromEntries";

async function invokeIpc<T>(cmd: string, args?: Record<string, unknown>): Promise<IpcResult<T>> {
  try {
    return await invoke<IpcResult<T>>(cmd, args);
  } catch (e) {
    // TypeError 通常表示网络/超时错误
    if (e instanceof TypeError) {
      const message = e.message;
      return { ok: false, error: { code: IpcErrorCode.NETWORK_ERROR, message } };
    }
    // Tauri 后端返回的结构化错误 — 透传 error code
    if (e && typeof e === "object" && "code" in e && "message" in e) {
      const { code, message } = e as { code: string; message: string };
      return { ok: false, error: { code: code as IpcErrorCode, message } };
    }
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: IpcErrorCode.INVOKE_ERROR, message } };
  }
}

function subscribeChannel<T>(
  eventName: string,
  listener: (payload: T) => void
): () => void {
  let active = true;
  let ul: UnlistenFn | undefined;
  void listen<T>(eventName, (event) => {
    if (active) {
      listener(event.payload);
    }
  }).then((unlisten) => {
    if (active) {
      ul = unlisten;
    } else {
      void unlisten();
    }
  });
  return () => {
    active = false;
    void ul?.();
  };
}

export function isTauriShell(): boolean {
  try {
    if (typeof window === "undefined") {
      return false;
    }
    const candidate = window as typeof window & {
      __TAURI__?: unknown;
      __TAURI_INTERNALS__?: unknown;
    };
    return Boolean(candidate.__TAURI_INTERNALS__ ?? candidate.__TAURI__);
  } catch {
    return false;
  }
}

export function createTauriBridge(): DigitalLifeBridge {
  const win = () => getCurrentWindow();

  return {
    subscribeModelStream: (listener: (event: DigitalLifeModelStreamEventV1) => void) =>
      subscribeChannel<DigitalLifeModelStreamEventV1>("digital-life://model-stream", listener),

    subscribeRunActivity: (listener: (event: DigitalLifeRunActivityEventV1) => void) =>
      subscribeChannel<DigitalLifeRunActivityEventV1>("digital-life://run-activity", listener),

    subscribeTerminalStream: (listener: (event: DigitalLifeTerminalStreamEventV1) => void) =>
      subscribeChannel<DigitalLifeTerminalStreamEventV1>("digital-life://terminal-stream", listener),

    subscribePtyOutput: (listener: (event: PtyOutputEvent) => void) =>
      subscribeChannel<PtyOutputEvent>("digital-life://pty-output", listener),

    window: {
      minimize: () => win().minimize(),
      maximize: () => win().toggleMaximize(),
      close: () => win().close(),
      isMaximized: () => win().isMaximized(),
      setTitle: (title: string) => win().setTitle(title)
    },

    app: {
      getInfo: () => invokeIpc<AppInfo>("app_get_info"),
      getHealth: () => invokeIpc<HealthSnapshot>("app_get_health"),
      getDiagnostics: () => invokeIpc<RuntimeDiagnosticsSnapshot>("app_get_diagnostics"),
      getModelHealth: () => invokeIpc<ModelGatewayHealthSnapshot>("app_get_model_health"),
      updatePreferences: (patch: AppPreferencePatch) => invokeIpc<AppInfo>("app_update_preferences", { patch })
    },

    workspace: {
      listRecent: () => invokeIpc<RecentWorkspaceEntry[]>("workspace_list_recent"),
      open: (workspacePath: string) => invokeIpc<WorkspaceMeta>("workspace_open", { workspacePath }),
      clearCurrent: () => invokeIpc<boolean>("workspace_clear_current"),
      pickDirectory: async () => {
        const result = await invokeIpc<string | null>("workspace_pick_directory");
        return result.ok ? { ok: true, data: result.data ?? undefined } : result;
      },
      pin: (workspaceId: string) => invokeIpc<RecentWorkspaceEntry[]>("workspace_pin", { workspaceId }),
      unpin: (workspaceId: string) => invokeIpc<RecentWorkspaceEntry[]>("workspace_unpin", { workspaceId }),
      reorder: (input: ReorderWorkspacesInput) => invokeIpc<RecentWorkspaceEntry[]>("workspace_reorder", { input }),
      removeFromSidebar: (workspaceId: string) =>
        invokeIpc<RecentWorkspaceEntry[]>("workspace_remove_from_sidebar", { workspaceId }),
      restoreToSidebar: (workspaceId: string) =>
        invokeIpc<RecentWorkspaceEntry[]>("workspace_restore_to_sidebar", { workspaceId }),
      listTreeForWorkspace: (workspacePath: string) =>
        invokeIpc<WorkspaceTreeNode[]>("workspace_list_tree", { workspacePath }),
      listGitStatusForWorkspace: (workspacePath) =>
        invokeIpc<GitSnapshot>("workspace_get_git_status", { workspacePath }),
      hideFromRightPanels: (workspaceId: string) =>
        invokeIpc<RecentWorkspaceEntry[]>("workspace_hide_from_right_panels", { workspaceId }),
      showInRightPanels: (workspaceId: string) =>
        invokeIpc<RecentWorkspaceEntry[]>("workspace_show_in_right_panels", { workspaceId }),
      revealInFileManager: (workspacePath: string) =>
        invokeIpc<boolean>("workspace_reveal_in_file_manager", { path: workspacePath }),
      createFile: (relativePath: string, content = "") =>
        invokeIpc<WorkspaceFileDocument>("workspace_create_file", { relativePath, content }),
      createFolder: (relativePath: string) =>
        invokeIpc<boolean>("workspace_create_folder", { relativePath }),
      readFile: (relativePath: string) => invokeIpc<WorkspaceFileDocument>("workspace_read_file", { relativePath }),
      readFileForWorkspace: (workspacePath: string, relativePath: string) => 
        invokeIpc<WorkspaceFileDocument>("workspace_read_file", { workspacePath, relativePath }),
      getChangePreview: (relativePath: string) =>
        invokeIpc<WorkspaceChangePreview>("workspace_get_change_preview", { relativePath }),
      getChangePreviewForWorkspace: (workspacePath: string, relativePath: string) =>
        invokeIpc<WorkspaceChangePreview>("workspace_get_change_preview", { workspacePath, relativePath }),
      listTree: () => invokeIpc<WorkspaceTreeNode[]>("workspace_list_tree"),
      search: (query: string) => invokeIpc<WorkspaceSearchHit[]>("workspace_search", { query }),
      outline: (relativePath: string) => invokeIpc("workspace_outline", { relativePath }),
      setEditorDirtyPaths: (relativePaths: string[]) =>
        invokeIpc<boolean>("workspace_set_editor_dirty_paths", { relativePaths }),
      renameFile: (relativePath: string, newName: string) =>
        invokeIpc<boolean>("workspace_rename_file", { relativePath, newName }),
      deleteFile: (relativePath: string) =>
        invokeIpc<boolean>("workspace_delete_file", { relativePath }),
      duplicateFile: (srcRelativePath: string, dstRelativePath: string) =>
        invokeIpc<boolean>("workspace_duplicate_file", { relativePath: srcRelativePath, newPath: dstRelativePath }),
      getAbsolutePath: (relativePath: string) =>
        invokeIpc<string>("workspace_get_absolute_path", { relativePath }),
      moveFile: (relativePath: string, newPath: string) =>
        invokeIpc<boolean>("workspace_move_file", { relativePath, newPath }),
      onFileChanged: (listener: (event: WorkspaceFileChangedEvent) => void) =>
        subscribeChannel<WorkspaceFileChangedEvent>("digital-life://workspace-file-changed", listener),
      getGitStatus: () => invokeIpc<GitSnapshot>("workspace_get_git_status"),
      listGitBranches: () => invokeIpc<GitBranchSummary[]>("workspace_list_git_branches"),
      switchGitBranch: (input: WorkspaceGitBranchSwitchInput) =>
        invokeIpc<WorkspaceGitBranchChangeResult>("workspace_switch_git_branch", { input }),
      createGitBranch: (input: WorkspaceGitBranchCreateInput) =>
        invokeIpc<WorkspaceGitBranchChangeResult>("workspace_create_git_branch", { input })
    },

    retrieval: {
      getStatus: () => invokeIpc<RetrievalSnapshot | undefined>("retrieval_get_status"),
      getRepoMap: async (): Promise<IpcResult<RepoMapNode[]>> => {
        const snapshot = await invokeIpc<RetrievalSnapshot | undefined>("retrieval_get_status");
        if (!snapshot.ok) {
          return snapshot;
        }
        return { ok: true, data: repoMapEntriesToTree(snapshot.data?.repoMap ?? []) };
      },
      rebuildIndex: () => invokeIpc<boolean>("retrieval_rebuild_index")
    },

    conversation: {
      createSession: (title?: string, workspaceId?: string) => invokeIpc<ConversationSessionRecord>("conversation_create_session", { title, workspaceId }),
      listSessions: () => invokeIpc<ConversationSessionRecord[]>("conversation_list_sessions"),
      getSession: (sessionId: string) =>
        invokeIpc<ConversationDetail | undefined>("conversation_get_session", { sessionId }),
      renameSession: (input: { sessionId: string; title: string }) =>
        invokeIpc<ConversationSessionRecord>("conversation_rename_session", { input }),
      pinSession: (sessionId: string) => invokeIpc<ConversationSessionRecord>("conversation_pin_session", { sessionId }),
      unpinSession: (sessionId: string) =>
        invokeIpc<ConversationSessionRecord>("conversation_unpin_session", { sessionId }),
      reorderSessions: (input: ReorderSessionsInput) =>
        invokeIpc<ConversationSessionRecord[]>("conversation_reorder_sessions", { input }),
      markSessionRead: (input: { sessionId: string; readAt?: number }) =>
        invokeIpc<ConversationSessionRecord>("conversation_mark_session_read", { input }),
      markSessionUnread: (sessionId: string) =>
        invokeIpc<ConversationSessionRecord>("conversation_mark_session_unread", { sessionId }),
      archiveSession: (sessionId: string) =>
        invokeIpc<ConversationSessionRecord>("conversation_archive_session", { sessionId }),
      archiveAllInWorkspace: () =>
        invokeIpc<ConversationSessionRecord[]>("conversation_archive_all_in_workspace"),
      deleteSession: (sessionId: string) => invokeIpc<boolean>("conversation_delete_session", { sessionId }),
      sendMessage: (input: { sessionId: string; content: string; scenario?: "chat" | "plan" | "code-edit" }) =>
        invokeIpc<ConversationSendResult>("conversation_send_message", { input }),
      cancelMessage: (runId: string) =>
        invokeIpc<AgentRunDetail | undefined>("conversation_cancel_message", { runId })
    },

    agent: {
      startRun: (input: { sessionId: string; prompt: string; scenario?: "chat" | "plan" | "code-edit" }) =>
        invokeIpc<ConversationSendResult>("agent_start_run", { input }),
      getRun: (runId: string) => invokeIpc<AgentRunDetail | undefined>("agent_get_run", { runId }),
      retryRun: (runId: string) => invokeIpc<AgentRunDetail | undefined>("agent_retry_run", { runId }),
      abortRun: (runId: string) => invokeIpc<AgentRunDetail | undefined>("agent_abort_run", { runId })
    },

    patch: {
      getPatchSet: (patchSetId: string) => invokeIpc<PatchSet | undefined>("patch_get_patch_set", { patchSetId }),
      setHunkDecision: (input: { patchSetId: string; hunkId: string; decision: "pending" | "accepted" | "rejected" }) =>
        invokeIpc<PatchSet>("patch_set_hunk_decision", { input }),
      applyPatchSet: (patchSetId: string) =>
        invokeIpc<PatchApplicationResult>("patch_apply_patch_set", { patchSetId }),
      rollbackPatchSet: (patchSetId: string) =>
        invokeIpc<PatchSet>("patch_rollback_patch_set", { patchSetId })
    },

    command: {
      run: (input: { command: string; args: string[]; shell?: boolean }) =>
        invokeIpc<CommandRunResult>("command_run", { input }),
      listRecent: (limit?: number) => invokeIpc<CommandRequest[]>("command_list_recent", { limit })
    },

    pty: {
      create: (input: { shell?: string; cwd?: string; cols: number; rows: number }) =>
        invokeIpc<{ sessionId: string }>("pty_create", { input }),
      input: (sessionId: string, data: string) =>
        invokeIpc<boolean>("pty_input", { sessionId, data }),
      resize: (sessionId: string, cols: number, rows: number) =>
        invokeIpc<boolean>("pty_resize", { sessionId, cols, rows }),
      kill: (sessionId: string) =>
        invokeIpc<boolean>("pty_kill", { sessionId }),
      list: () => invokeIpc<PtySessionInfo[]>("pty_list")
    },

    task: {
      getSnapshot: () => invokeIpc<TaskCenterSnapshot>("task_get_snapshot"),
      listPendingApprovals: () => invokeIpc<ApprovalRequestSummary[]>("task_list_pending_approvals"),
      getCheckpointPreview: (checkpointId: string) =>
        invokeIpc<CheckpointPayloadPreview | undefined>("task_get_checkpoint_preview", { checkpointId }),
      restoreCheckpoint: (checkpointId: string) =>
        invokeIpc<TaskCenterSnapshot>("task_restore_checkpoint", { checkpointId }),
      decideApproval: (input: { approvalId: string; decision: "approved" | "rejected"; reason?: string }) =>
        invokeIpc<TaskCenterSnapshot>("task_decide_approval", { input }),
      listAuditEntries: (limit?: number) => invokeIpc<AuditEntry[]>("task_list_audit_entries", { limit })
    }
    ,
    runActivity: {
      listByRunId: (runId: string, limit?: number) =>
        invokeIpc<DigitalLifeRunActivityEventV1[]>("run_activity_list_by_run_id", { runId, limit })
    }
    ,
    browser: {
      navigate: (url: string) => invokeIpc<void>("browser_navigate", { url }).then(() => undefined),
      goBack: () => invokeIpc<boolean>("browser_go_back").then((r) => r.ok && !!r.data),
      goForward: () => invokeIpc<boolean>("browser_go_forward").then((r) => r.ok && !!r.data),
      reload: () => invokeIpc<void>("browser_reload").then(() => undefined),
      onUrlChanged: (listener: (url: string) => void) => {
        let active = true;
        let ul: UnlistenFn | undefined;
        void listen<{ url: string }>("digital-life://browser-url-changed", (event) => {
          if (active) {
            listener(event.payload.url);
          }
        }).then((unlisten) => {
          if (active) {
            ul = unlisten;
          } else {
            void unlisten();
          }
        });
        return () => {
          active = false;
          void ul?.();
        };
      },
    }
  };
}
