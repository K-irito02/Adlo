import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { IpcErrorCode } from './shared/ipc';
import type {
  AcpConfig,
  AgentConfig,
  CodeModeConfig,
  DigitalLifeBridge,
  DurableBridge,
  DurableSessionState,
  HttpApiConfig,
  LspBridge,
  McpCatalog,
  McpServerConfig,
  McpServerInfo,
  PluginBridge,
  PluginInfo,
  ProviderInfo,
  ReferenceBridge,
  ReferenceConfig,
  PtyOutputEvent,
  PtySessionInfo,
  RevertResult,
  ReservedBridge,
  CommandsConfigBridge,
  CommandConfig,
  CustomAgentBridge,
  CompactionBridge,
  CompactSessionInput,
  SessionForkBridge,
  SymbolInfo,
  CompactSessionResult,
  DiagnosticInfo,
  PermissionBridge,
  PermissionRulesetConfig,
  PermissionDecision,
  SnapshotBridge,
  SnapshotRecord,
  SubagentTask,
  TaskToolInput,
  TaskToolOutput,
  WebFetchResult,
  WebSearchResult,
  WebToolsBridge,
} from './shared/ipc';
import type {
  AgentRunDetail,
  AppInfo,
  AppPreferencePatch,
  AuditEntry,
  ApprovalRequestSummary,
  CheckpointPayloadPreview,
  CiStatusSnapshot,
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
  WorkspaceTreeNode,
} from '@ai-digital-life/kernel';
import { EventBuffer } from './shared/eventBuffer';
import { repoMapEntriesToTree } from './shared/repoMapFromEntries';

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
    if (e && typeof e === 'object' && 'code' in e && 'message' in e) {
      const { code, message } = e as { code: string; message: string };
      return { ok: false, error: { code: code as IpcErrorCode, message } };
    }
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: IpcErrorCode.INVOKE_ERROR, message } };
  }
}

function subscribeChannel<T>(eventName: string, listener: (payload: T) => void): () => void {
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
      /* unlisten() is typed () => void but actually async; catch rejection via wrapper */
      void Promise.resolve(unlisten()).catch(() => {});
    }
  });
  return () => {
    active = false;
    void Promise.resolve(ul?.()).catch(() => {});
  };
}

export function isTauriShell(): boolean {
  try {
    if (typeof window === 'undefined') {
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
    subscribeModelStream: (listener: (event: DigitalLifeModelStreamEventV1) => void) => {
      const buf = new EventBuffer<DigitalLifeModelStreamEventV1>();
      const channelSub = subscribeChannel<DigitalLifeModelStreamEventV1>(
        'digital-life://model-stream',
        (payload) => {
          buf.push(payload);
          buf.scheduleFlush((events) => {
            for (const event of events) {
              listener(event);
            }
          });
        }
      );
      return channelSub;
    },

    subscribeRunActivity: (listener: (event: DigitalLifeRunActivityEventV1) => void) =>
      subscribeChannel<DigitalLifeRunActivityEventV1>('digital-life://run-activity', listener),

    subscribeTerminalStream: (listener: (event: DigitalLifeTerminalStreamEventV1) => void) =>
      subscribeChannel<DigitalLifeTerminalStreamEventV1>(
        'digital-life://terminal-stream',
        listener
      ),

    subscribePtyOutput: (listener: (event: PtyOutputEvent) => void) =>
      subscribeChannel<PtyOutputEvent>('digital-life://pty-output', listener),

    setLogMode: async (target: 'terminal' | 'debug', mode: 'overwrite' | 'append' | 'multi') => {
      await invoke('app_set_log_mode', { target, mode });
    },

    window: {
      minimize: () => win().minimize(),
      maximize: () => win().toggleMaximize(),
      close: () => win().close(),
      isMaximized: () => win().isMaximized(),
      setTitle: (title: string) => win().setTitle(title),
      onResized: (listener: () => void) => {
        let active = true;
        let ul: UnlistenFn | undefined;
        void win()
          .onResized(() => {
            if (active) {
              listener();
            }
          })
          .then((unlisten) => {
            if (active) {
              ul = unlisten;
            } else {
              /* unlisten() is typed () => void but actually async; catch rejection via wrapper */
              void Promise.resolve(unlisten()).catch(() => {});
            }
          });
        return () => {
          active = false;
          void Promise.resolve(ul?.()).catch(() => {});
        };
      },
    },

    app: {
      getInfo: () => invokeIpc<AppInfo>('app_get_info'),
      getHealth: () => invokeIpc<HealthSnapshot>('app_get_health'),
      getDiagnostics: () => invokeIpc<RuntimeDiagnosticsSnapshot>('app_get_diagnostics'),
      getModelHealth: () => invokeIpc<ModelGatewayHealthSnapshot>('app_get_model_health'),
      updatePreferences: (patch: AppPreferencePatch) =>
        invokeIpc<AppInfo>('app_update_preferences', { patch }),
    },

    workspace: {
      listRecent: () => invokeIpc<RecentWorkspaceEntry[]>('workspace_list_recent'),
      open: (workspacePath: string) =>
        invokeIpc<WorkspaceMeta>('workspace_open', { workspacePath }),
      clearCurrent: () => invokeIpc<boolean>('workspace_clear_current'),
      pickDirectory: async () => {
        const result = await invokeIpc<string | null>('workspace_pick_directory');
        return result.ok ? { ok: true, data: result.data ?? undefined } : result;
      },
      pin: (workspaceId: string) =>
        invokeIpc<RecentWorkspaceEntry[]>('workspace_pin', { workspaceId }),
      unpin: (workspaceId: string) =>
        invokeIpc<RecentWorkspaceEntry[]>('workspace_unpin', { workspaceId }),
      reorder: (input: ReorderWorkspacesInput) =>
        invokeIpc<RecentWorkspaceEntry[]>('workspace_reorder', { input }),
      removeFromSidebar: (workspaceId: string) =>
        invokeIpc<RecentWorkspaceEntry[]>('workspace_remove_from_sidebar', { workspaceId }),
      restoreToSidebar: (workspaceId: string) =>
        invokeIpc<RecentWorkspaceEntry[]>('workspace_restore_to_sidebar', { workspaceId }),
      listTreeForWorkspace: (workspacePath: string) =>
        invokeIpc<WorkspaceTreeNode[]>('workspace_list_tree', { workspacePath }),
      listGitStatusForWorkspace: (workspacePath) =>
        invokeIpc<GitSnapshot>('workspace_get_git_status', { workspacePath }),
      hideFromRightPanels: (workspaceId: string) =>
        invokeIpc<RecentWorkspaceEntry[]>('workspace_hide_from_right_panels', { workspaceId }),
      showInRightPanels: (workspaceId: string) =>
        invokeIpc<RecentWorkspaceEntry[]>('workspace_show_in_right_panels', { workspaceId }),
      revealInFileManager: (workspacePath: string) =>
        invokeIpc<boolean>('workspace_reveal_in_file_manager', { path: workspacePath }),
      createFile: (relativePath: string, content = '') =>
        invokeIpc<WorkspaceFileDocument>('workspace_create_file', { relativePath, content }),
      createFolder: (relativePath: string) =>
        invokeIpc<boolean>('workspace_create_folder', { relativePath }),
      readFile: (relativePath: string) =>
        invokeIpc<WorkspaceFileDocument>('workspace_read_file', { relativePath }),
      readFileForWorkspace: (workspacePath: string, relativePath: string) =>
        invokeIpc<WorkspaceFileDocument>('workspace_read_file', { workspacePath, relativePath }),
      getChangePreview: (relativePath: string) =>
        invokeIpc<WorkspaceChangePreview>('workspace_get_change_preview', { relativePath }),
      getChangePreviewForWorkspace: (workspacePath: string, relativePath: string) =>
        invokeIpc<WorkspaceChangePreview>('workspace_get_change_preview', {
          workspacePath,
          relativePath,
        }),
      listTree: () => invokeIpc<WorkspaceTreeNode[]>('workspace_list_tree'),
      search: (query: string) => invokeIpc<WorkspaceSearchHit[]>('workspace_search', { query }),
      outline: (relativePath: string) => invokeIpc('workspace_outline', { relativePath }),
      setEditorDirtyPaths: (relativePaths: string[]) =>
        invokeIpc<boolean>('workspace_set_editor_dirty_paths', { relativePaths }),
      renameFile: (relativePath: string, newName: string) =>
        invokeIpc<boolean>('workspace_rename_file', { relativePath, newName }),
      deleteFile: (relativePath: string) =>
        invokeIpc<boolean>('workspace_delete_file', { relativePath }),
      duplicateFile: (srcRelativePath: string, dstRelativePath: string) =>
        invokeIpc<boolean>('workspace_duplicate_file', {
          relativePath: srcRelativePath,
          newPath: dstRelativePath,
        }),
      getAbsolutePath: (relativePath: string) =>
        invokeIpc<string>('workspace_get_absolute_path', { relativePath }),
      moveFile: (relativePath: string, newPath: string) =>
        invokeIpc<boolean>('workspace_move_file', { relativePath, newPath }),
      onFileChanged: (listener: (event: WorkspaceFileChangedEvent) => void) =>
        subscribeChannel<WorkspaceFileChangedEvent>(
          'digital-life://workspace-file-changed',
          listener
        ),
      getGitStatus: () => invokeIpc<GitSnapshot>('workspace_get_git_status'),
      listGitBranches: () => invokeIpc<GitBranchSummary[]>('workspace_list_git_branches'),
      switchGitBranch: (input: WorkspaceGitBranchSwitchInput) =>
        invokeIpc<WorkspaceGitBranchChangeResult>('workspace_switch_git_branch', { input }),
      createGitBranch: (input: WorkspaceGitBranchCreateInput) =>
        invokeIpc<WorkspaceGitBranchChangeResult>('workspace_create_git_branch', { input }),
    },

    retrieval: {
      getStatus: () => invokeIpc<RetrievalSnapshot | undefined>('retrieval_get_status'),
      getRepoMap: async (): Promise<IpcResult<RepoMapNode[]>> => {
        const snapshot = await invokeIpc<RetrievalSnapshot | undefined>('retrieval_get_status');
        if (!snapshot.ok) {
          return snapshot;
        }
        return { ok: true, data: repoMapEntriesToTree(snapshot.data?.repoMap ?? []) };
      },
      rebuildIndex: () => invokeIpc<boolean>('retrieval_rebuild_index'),
    },

    conversation: {
      createSession: (title?: string, workspaceId?: string) =>
        invokeIpc<ConversationSessionRecord>('conversation_create_session', { title, workspaceId }),
      listSessions: () => invokeIpc<ConversationSessionRecord[]>('conversation_list_sessions'),
      getSession: (sessionId: string) =>
        invokeIpc<ConversationDetail | undefined>('conversation_get_session', { sessionId }),
      renameSession: (input: { sessionId: string; title: string }) =>
        invokeIpc<ConversationSessionRecord>('conversation_rename_session', { input }),
      pinSession: (sessionId: string) =>
        invokeIpc<ConversationSessionRecord>('conversation_pin_session', { sessionId }),
      unpinSession: (sessionId: string) =>
        invokeIpc<ConversationSessionRecord>('conversation_unpin_session', { sessionId }),
      reorderSessions: (input: ReorderSessionsInput) =>
        invokeIpc<ConversationSessionRecord[]>('conversation_reorder_sessions', { input }),
      markSessionRead: (input: { sessionId: string; readAt?: number }) =>
        invokeIpc<ConversationSessionRecord>('conversation_mark_session_read', { input }),
      markSessionUnread: (sessionId: string) =>
        invokeIpc<ConversationSessionRecord>('conversation_mark_session_unread', { sessionId }),
      archiveSession: (sessionId: string) =>
        invokeIpc<ConversationSessionRecord>('conversation_archive_session', { sessionId }),
      archiveAllInWorkspace: () =>
        invokeIpc<ConversationSessionRecord[]>('conversation_archive_all_in_workspace'),
      deleteSession: (sessionId: string) =>
        invokeIpc<boolean>('conversation_delete_session', { sessionId }),
      sendMessage: (input: {
        sessionId: string;
        content: string;
        scenario?: 'chat' | 'plan' | 'code-edit';
      }) => invokeIpc<ConversationSendResult>('conversation_send_message', { input }),
      cancelMessage: (runId: string) =>
        invokeIpc<AgentRunDetail | undefined>('conversation_cancel_message', { runId }),
    },

    agent: {
      startRun: (input: {
        sessionId: string;
        prompt: string;
        scenario?: 'chat' | 'plan' | 'code-edit';
      }) => invokeIpc<ConversationSendResult>('agent_start_run', { input }),
      getRun: (runId: string) => invokeIpc<AgentRunDetail | undefined>('agent_get_run', { runId }),
      retryRun: (runId: string) =>
        invokeIpc<AgentRunDetail | undefined>('agent_retry_run', { runId }),
      abortRun: (runId: string) =>
        invokeIpc<AgentRunDetail | undefined>('agent_abort_run', { runId }),
      listAgents: () => invokeIpc<AgentConfig[]>('list_agents'),
      selectAgent: (scenario: string, userPrompt: string) =>
        invokeIpc<AgentConfig>('select_agent', { scenario, userPrompt }),
      enterPlanMode: (workspaceId: string, workspaceRoot: string) =>
        invokeIpc<string>('enter_plan_mode', { workspaceId, workspaceRoot }),
      exitPlanMode: (workspaceId: string) =>
        invokeIpc<string | null>('exit_plan_mode', { workspaceId }),
      getPlanModeState: (workspaceId: string) =>
        invokeIpc<boolean>('get_plan_mode_state', { workspaceId }),
    },

    subagent: {
      spawnSubagent: (parentSessionId: string, input: TaskToolInput) =>
        invokeIpc<TaskToolOutput>('spawn_subagent', { parentSessionId, input }),
      getSubagentTask: (taskId: string) =>
        invokeIpc<SubagentTask | null>('get_subagent_task', { taskId }),
      listActiveSubagents: (workspaceId: string) =>
        invokeIpc<SubagentTask[]>('list_active_subagents', { workspaceId }),
      cancelSubagent: (taskId: string) => invokeIpc<boolean>('cancel_subagent', { taskId }),
    },

    patch: {
      getPatchSet: (patchSetId: string) =>
        invokeIpc<PatchSet | undefined>('patch_get_patch_set', { patchSetId }),
      setHunkDecision: (input: {
        patchSetId: string;
        hunkId: string;
        decision: 'pending' | 'accepted' | 'rejected';
      }) => invokeIpc<PatchSet>('patch_set_hunk_decision', { input }),
      applyPatchSet: (patchSetId: string) =>
        invokeIpc<PatchApplicationResult>('patch_apply_patch_set', { patchSetId }),
      rollbackPatchSet: (patchSetId: string) =>
        invokeIpc<PatchSet>('patch_rollback_patch_set', { patchSetId }),
    },

    command: {
      run: (input: { command: string; args: string[]; shell?: boolean }) =>
        invokeIpc<CommandRunResult>('command_run', { input }),
      listRecent: (limit?: number) => invokeIpc<CommandRequest[]>('command_list_recent', { limit }),
    },

    pty: {
      create: (input: { shell?: string; cwd?: string; cols: number; rows: number }) =>
        invokeIpc<{ sessionId: string }>('pty_create', { input }),
      input: (sessionId: string, data: string) =>
        invokeIpc<boolean>('pty_input', { sessionId, data }),
      resize: (sessionId: string, cols: number, rows: number) =>
        invokeIpc<boolean>('pty_resize', { sessionId, cols, rows }),
      kill: (sessionId: string) => invokeIpc<boolean>('pty_kill', { sessionId }),
      list: () => invokeIpc<PtySessionInfo[]>('pty_list'),
    },

    task: {
      getSnapshot: () => invokeIpc<TaskCenterSnapshot>('task_get_snapshot'),
      listPendingApprovals: () =>
        invokeIpc<ApprovalRequestSummary[]>('task_list_pending_approvals'),
      getCheckpointPreview: (checkpointId: string) =>
        invokeIpc<CheckpointPayloadPreview | undefined>('task_get_checkpoint_preview', {
          checkpointId,
        }),
      restoreCheckpoint: (checkpointId: string) =>
        invokeIpc<TaskCenterSnapshot>('task_restore_checkpoint', { checkpointId }),
      decideApproval: (input: {
        approvalId: string;
        decision: 'approved' | 'rejected';
        reason?: string;
      }) => invokeIpc<TaskCenterSnapshot>('task_decide_approval', { input }),
      listAuditEntries: (limit?: number) =>
        invokeIpc<AuditEntry[]>('task_list_audit_entries', { limit }),
    },
    runActivity: {
      listByRunId: (runId: string, limit?: number) =>
        invokeIpc<DigitalLifeRunActivityEventV1[]>('run_activity_list_by_run_id', { runId, limit }),
    },
    browser: {
      createForTab: (tabId: string, url: string) =>
        invokeIpc<string | null>('browser_create_for_tab', { tabId, url }).then((r) =>
          r.ok ? r.data : null
        ),
      activateTab: (tabId: string) =>
        invokeIpc<void>('browser_activate_tab', { tabId }).then(() => undefined),
      destroyTab: (tabId: string) =>
        invokeIpc<void>('browser_destroy_tab', { tabId }).then(() => undefined),
      navigateTab: (tabId: string, url: string) =>
        invokeIpc<void>('browser_navigate_tab', { tabId, url }).then(() => undefined),
      setTabBounds: (
        tabId: string,
        bounds: { x: number; y: number; width: number; height: number }
      ) => invokeIpc<void>('browser_set_tab_bounds', { tabId, bounds }).then(() => undefined),
      goBackTab: (tabId: string) =>
        invokeIpc<boolean>('browser_go_back_tab', { tabId }).then((r) => r.ok && !!r.data),
      goForwardTab: (tabId: string) =>
        invokeIpc<boolean>('browser_go_forward_tab', { tabId }).then((r) => r.ok && !!r.data),
      reloadTab: (tabId: string) =>
        invokeIpc<void>('browser_reload_tab', { tabId }).then(() => undefined),
      onUrlChanged: (listener: (url: string) => void) => {
        let active = true;
        let ul: UnlistenFn | undefined;
        void listen<{ url: string }>('digital-life://browser-url-changed', (event) => {
          if (active) {
            listener(event.payload.url);
          }
        }).then((unlisten) => {
          if (active) {
            ul = unlisten;
          } else {
            /* unlisten() is typed () => void but actually async; catch rejection via wrapper */
            void Promise.resolve(unlisten()).catch(() => {});
          }
        });
        return () => {
          active = false;
          void Promise.resolve(ul?.()).catch(() => {});
        };
      },
      onMetaChanged: (
        listener: (meta: { title: string; favicon: string; url: string }) => void
      ) => {
        let active = true;
        let ul: UnlistenFn | undefined;
        void listen<{ title: string; favicon: string; url: string }>(
          'digital-life://browser-meta-changed',
          (event) => {
            if (active) {
              listener(event.payload);
            }
          }
        ).then((unlisten) => {
          if (active) {
            ul = unlisten;
          } else {
            /* unlisten() is typed as () => void but actually async; catch rejection via wrapper */
            void Promise.resolve(unlisten()).catch(() => {});
          }
        });
        return () => {
          active = false;
          void Promise.resolve(ul?.()).catch(() => {});
        };
      },
      muteTab: (tabId: string, muted: boolean) =>
        invoke('browser_mute_tab', { tabId, muted }).then(() => undefined),
      onAudioStateChanged: (
        listener: (payload: { tabId: string; isPlaying: boolean; isMuted: boolean }) => void
      ) => {
        let active = true;
        let ul: UnlistenFn | undefined;
        void listen<{ tabId: string; isPlaying: boolean; isMuted: boolean }>(
          'digital-life://browser-audio-changed',
          (event) => {
            if (active) {
              listener(event.payload);
            }
          }
        ).then((unlisten) => {
          if (active) {
            ul = unlisten;
          } else {
            /* unlisten() is typed as () => void but actually async; catch rejection via wrapper */
            void Promise.resolve(unlisten()).catch(() => {});
          }
        });
        return () => {
          active = false;
          void Promise.resolve(ul?.()).catch(() => {});
        };
      },
      setBrowserColorScheme: (resolvedTheme: 'light' | 'dark') =>
        invokeIpc<void>('browser_set_color_scheme', { colorScheme: resolvedTheme }).then(
          () => undefined
        ),
      setZoom: (tabId: string, zoomFactor: number) =>
        invokeIpc<void>('browser_set_zoom', { tabId, zoomFactor }).then(() => undefined),
      clearCookies: (tabId: string) =>
        invokeIpc<void>('browser_clear_cookies', { tabId }).then(() => undefined),
      clearCache: (tabId: string) =>
        invokeIpc<void>('browser_clear_cache', { tabId }).then(() => undefined),
    },
    ci: {
      getStatus: (config) => invokeIpc<CiStatusSnapshot>('ci_get_status', { config }),
      getStatusWithoutToken: (owner, repo, branch) =>
        invokeIpc<CiStatusSnapshot>('ci_get_status_without_token', {
          owner,
          repo,
          branch,
        }),
      setAccessToken: (token: string) => invokeIpc<boolean>('ci_set_access_token', { token }),
      clearAccessToken: () => invokeIpc<boolean>('ci_clear_access_token'),
      hasAccessToken: () => invokeIpc<boolean>('ci_has_access_token'),
      getJobLogs: (config, runId) =>
        invokeIpc<Record<number, string>>('ci_get_job_logs', { config, runId }),
    },
    github: {
      getStatus: (config) => invokeIpc<CiStatusSnapshot>('ci_get_status', { config }),
      getStatusWithoutToken: (owner, repo, branch) =>
        invokeIpc<CiStatusSnapshot>('ci_get_status_without_token', {
          owner,
          repo,
          branch,
        }),
      setAccessToken: (token: string) => invokeIpc<boolean>('ci_set_access_token', { token }),
      clearAccessToken: () => invokeIpc<boolean>('ci_clear_access_token'),
      hasAccessToken: () => invokeIpc<boolean>('ci_has_access_token'),
      getJobLogs: (config, runId) =>
        invokeIpc<Record<number, string>>('ci_get_job_logs', { config, runId }),
    },

    mcp: {
      listMcpServers: () => invokeIpc<McpServerInfo[]>('list_mcp_servers'),
      addMcpServer: (config: McpServerConfig) => invokeIpc<void>('add_mcp_server', { config }),
      removeMcpServer: (name: string) => invokeIpc<void>('remove_mcp_server', { name }),
      connectMcpServer: (name: string) => invokeIpc<void>('connect_mcp_server', { name }),
      disconnectMcpServer: (name: string) => invokeIpc<void>('disconnect_mcp_server', { name }),
      getMcpCatalog: () => invokeIpc<McpCatalog>('get_mcp_catalog'),
      loadMcpConfig: (path: string) => invokeIpc<number>('load_mcp_config', { path }),
    },

    provider: {
      setProviderApiKey: (provider: string, apiKey: string) =>
        invokeIpc<boolean>('set_provider_api_key', { providerId: provider, apiKey }),
      clearProviderApiKey: (provider: string) =>
        invokeIpc<boolean>('clear_provider_api_key', { providerId: provider }),
      hasProviderApiKey: (provider: string) =>
        invokeIpc<boolean>('has_provider_api_key', { providerId: provider }),
      listSupportedProviders: () => invokeIpc<ProviderInfo[]>('list_supported_providers'),
    },

    snapshot: {
      createSnapshot: (params) => invokeIpc<SnapshotRecord>('create_snapshot', params),
      listSnapshots: (workspaceId, workspaceRoot) =>
        invokeIpc<SnapshotRecord[]>('list_snapshots', { workspaceId, workspaceRoot }),
      revertToSnapshot: (workspaceId, workspaceRoot, snapshotId) =>
        invokeIpc<RevertResult>('revert_to_snapshot_cmd', {
          workspaceId,
          workspaceRoot,
          snapshotId,
        }),
      pruneSnapshots: (workspaceId, workspaceRoot) =>
        invokeIpc<number>('prune_snapshots', { workspaceId, workspaceRoot }),
    } satisfies SnapshotBridge,

    webTools: {
      webFetch: (url) => invokeIpc<WebFetchResult>('web_fetch', { url }),
      webSearch: (query) => invokeIpc<WebSearchResult>('web_search', { query }),
    } satisfies WebToolsBridge,

    commandsConfig: {
      listCustomCommands: (dataDir) =>
        invokeIpc<CommandConfig[]>('list_custom_commands', { dataDir }),
      addCustomCommand: (dataDir, command) =>
        invokeIpc<CommandConfig[]>('add_custom_command', { dataDir, command }),
      updateCustomCommand: (dataDir, name, command) =>
        invokeIpc<CommandConfig[]>('update_custom_command', { dataDir, name, command }),
      deleteCustomCommand: (dataDir, name) =>
        invokeIpc<CommandConfig[]>('delete_custom_command', { dataDir, name }),
      renderCommandTemplate: (template, args, workspace) =>
        invokeIpc<string>('render_command_template', { template, args, workspace }),
    } satisfies CommandsConfigBridge,

    permission: {
      listPermissionRules: (dataDir) =>
        invokeIpc<PermissionRulesetConfig>('list_permission_rules', { dataDir }),
      addPermissionRule: (dataDir, rule) =>
        invokeIpc<PermissionRulesetConfig>('add_permission_rule', { dataDir, rule }),
      deletePermissionRule: (dataDir, index) =>
        invokeIpc<PermissionRulesetConfig>('delete_permission_rule', { dataDir, index }),
      setPermissionIncludeDefaults: (dataDir, include) =>
        invokeIpc<PermissionRulesetConfig>('set_permission_include_defaults', { dataDir, include }),
      evaluatePermission: (dataDir, toolName, command, args) =>
        invokeIpc<PermissionDecision>('evaluate_permission', { dataDir, toolName, command, args }),
    } satisfies PermissionBridge,

    compaction: {
      compactSession: (input) => invokeIpc<CompactSessionResult>('compact_session_cmd', { input }),
    } satisfies CompactionBridge,

    sessionFork: {
      forkSession: (parentSession, forkMessageId, existingForkCount) =>
        invokeIpc<ConversationSessionRecord>('fork_session_cmd', {
          parentSession,
          forkMessageId,
          existingForkCount,
        }),
      listSessionForks: (workspaceId, parentSessionId) =>
        invokeIpc<ConversationSessionRecord[]>('list_session_forks', {
          workspaceId,
          parentSessionId,
        }),
    } satisfies SessionForkBridge,

    lsp: {
      startServer: (workspaceId, workspaceRoot, server) =>
        invokeIpc<void>('lsp_start_server', { workspaceId, workspaceRoot, server }),
      stopServer: (workspaceId, server) =>
        invokeIpc<void>('lsp_stop_server', { workspaceId, server }),
      getSymbols: (workspaceId, filePath) =>
        invokeIpc<SymbolInfo[]>('lsp_get_symbols', { workspaceId, filePath }),
      getDiagnostics: (workspaceId, filePath) =>
        invokeIpc<DiagnosticInfo[]>('lsp_get_diagnostics', { workspaceId, filePath }),
      gotoDefinition: (workspaceId, filePath, line, column) =>
        invokeIpc<SymbolInfo | null>('lsp_goto_definition', {
          workspaceId,
          filePath,
          line,
          column,
        }),
    } satisfies LspBridge,

    plugin: {
      listPlugins: () => invokeIpc<PluginInfo[]>('list_plugins'),
      setPluginEnabled: (name: string, enabled: boolean) =>
        invokeIpc<void>('set_plugin_enabled', { name, enabled }),
    } satisfies PluginBridge,

    reference: {
      listReferences: (dataDir) => invokeIpc<ReferenceConfig[]>('list_references', { dataDir }),
      addReference: (dataDir, reference) =>
        invokeIpc<ReferenceConfig[]>('add_reference', { dataDir, reference }),
      removeReference: (dataDir, name) =>
        invokeIpc<ReferenceConfig[]>('remove_reference', { dataDir, name }),
      getReferencesPrompt: (dataDir) => invokeIpc<string>('get_references_prompt', { dataDir }),
    } satisfies ReferenceBridge,

    durable: {
      registerDurableSession: (sessionId, runId) =>
        invokeIpc<void>('register_durable_session', { sessionId, runId }),
      heartbeatDurableSession: (sessionId) =>
        invokeIpc<void>('heartbeat_durable_session', { sessionId }),
      findCrashedSessions: () => invokeIpc<DurableSessionState[]>('find_crashed_sessions'),
      recoverSession: (sessionId) => invokeIpc<boolean>('recover_session', { sessionId }),
    } satisfies DurableBridge,

    reserved: {
      acpGetStatus: () => invokeIpc<unknown>('acp_get_status'),
      acpGetConfig: () => invokeIpc<AcpConfig>('acp_get_config'),
      httpApiGetStatus: () => invokeIpc<unknown>('http_api_get_status'),
      httpApiGetConfig: () => invokeIpc<HttpApiConfig>('http_api_get_config'),
      codemodeExecute: (code) => invokeIpc<unknown>('codemode_execute', { code }),
      codemodeGetConfig: () => invokeIpc<CodeModeConfig>('codemode_get_config'),
    } satisfies ReservedBridge,

    customAgent: {
      listCustomAgents: (dataDir) => invokeIpc<AgentConfig[]>('list_custom_agents', { dataDir }),
      addCustomAgent: (dataDir, agent) =>
        invokeIpc<AgentConfig[]>('add_custom_agent', { dataDir, agent }),
      deleteCustomAgent: (dataDir, name) =>
        invokeIpc<AgentConfig[]>('delete_custom_agent', { dataDir, name }),
    } satisfies CustomAgentBridge,
  };
}
