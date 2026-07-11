import { getCurrentWindow } from '@tauri-apps/api/window';
import { type UnlistenFn } from '@tauri-apps/api/event';
import type {
  AppBridge,
  CommandBridge,
  CommandsConfigBridge,
  CustomAgentBridge,
  McpBridge,
  McpCatalog,
  McpServerConfig,
  McpServerInfo,
  PatchBridge,
  ReservedBridge,
  RetrievalBridge,
  RunActivityBridge,
  SessionForkBridge,
  TaskBridge,
  WindowBridge,
  AcpConfig,
  AgentConfig,
  CodeModeConfig,
  CommandConfig,
  HttpApiConfig,
} from '../shared/ipc';
import type {
  AppInfo,
  AppPreferencePatch,
  ApprovalRequestSummary,
  AuditEntry,
  CheckpointPayloadPreview,
  CommandRequest,
  CommandRunResult,
  ConversationSessionRecord,
  DigitalLifeRunActivityEventV1,
  HealthSnapshot,
  IpcResult,
  ModelGatewayHealthSnapshot,
  PatchApplicationResult,
  PatchSet,
  RepoMapNode,
  RetrievalSnapshot,
  RuntimeDiagnosticsSnapshot,
  TaskCenterSnapshot,
} from '@ai-digital-life/kernel';
import { invokeIpc } from './shared';
import { repoMapEntriesToTree } from '../shared/repoMapFromEntries';

export function createTauriWindowBridge(): WindowBridge {
  const win = () => getCurrentWindow();
  return {
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
            void Promise.resolve(unlisten()).catch(() => {});
          }
        });
      return () => {
        active = false;
        void Promise.resolve(ul?.()).catch(() => {});
      };
    },
  };
}

export function createTauriAppBridge(): AppBridge {
  return {
    getInfo: () => invokeIpc<AppInfo>('app_get_info'),
    getHealth: () => invokeIpc<HealthSnapshot>('app_get_health'),
    getDiagnostics: () => invokeIpc<RuntimeDiagnosticsSnapshot>('app_get_diagnostics'),
    getModelHealth: () => invokeIpc<ModelGatewayHealthSnapshot>('app_get_model_health'),
    updatePreferences: (patch: AppPreferencePatch) =>
      invokeIpc<AppInfo>('app_update_preferences', { patch }),
  };
}

export function createTauriRetrievalBridge(): RetrievalBridge {
  return {
    getStatus: () => invokeIpc<RetrievalSnapshot | undefined>('retrieval_get_status'),
    getRepoMap: async (): Promise<IpcResult<RepoMapNode[]>> => {
      const snapshot = await invokeIpc<RetrievalSnapshot | undefined>('retrieval_get_status');
      if (!snapshot.ok) {
        return snapshot;
      }
      return { ok: true, data: repoMapEntriesToTree(snapshot.data?.repoMap ?? []) };
    },
    rebuildIndex: () => invokeIpc<boolean>('retrieval_rebuild_index'),
  };
}

export function createTauriPatchBridge(): PatchBridge {
  return {
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
  };
}

export function createTauriCommandBridge(): CommandBridge {
  return {
    run: (input: { command: string; args: string[]; shell?: boolean }) =>
      invokeIpc<CommandRunResult>('command_run', { input }),
    listRecent: (limit?: number) => invokeIpc<CommandRequest[]>('command_list_recent', { limit }),
  };
}

export function createTauriTaskBridge(): TaskBridge {
  return {
    getSnapshot: () => invokeIpc<TaskCenterSnapshot>('task_get_snapshot'),
    listPendingApprovals: () => invokeIpc<ApprovalRequestSummary[]>('task_list_pending_approvals'),
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
  };
}

export function createTauriRunActivityBridge(): RunActivityBridge {
  return {
    listByRunId: (runId: string, limit?: number) =>
      invokeIpc<DigitalLifeRunActivityEventV1[]>('run_activity_list_by_run_id', { runId, limit }),
  };
}

export function createTauriMcpBridge(): McpBridge {
  return {
    listMcpServers: () => invokeIpc<McpServerInfo[]>('list_mcp_servers'),
    addMcpServer: (config: McpServerConfig) => invokeIpc<void>('add_mcp_server', { config }),
    removeMcpServer: (name: string) => invokeIpc<void>('remove_mcp_server', { name }),
    connectMcpServer: (name: string) => invokeIpc<void>('connect_mcp_server', { name }),
    disconnectMcpServer: (name: string) => invokeIpc<void>('disconnect_mcp_server', { name }),
    getMcpCatalog: () => invokeIpc<McpCatalog>('get_mcp_catalog'),
    loadMcpConfig: (path: string) => invokeIpc<number>('load_mcp_config', { path }),
  };
}

export function createTauriCommandsConfigBridge() {
  return {
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
  } satisfies CommandsConfigBridge;
}

export function createTauriSessionForkBridge() {
  return {
    forkSession: (parentSession, forkMessageId) =>
      invokeIpc<ConversationSessionRecord>('fork_session_cmd', { parentSession, forkMessageId }),
    listSessionForks: (workspaceId, parentSessionId) =>
      invokeIpc<ConversationSessionRecord[]>('list_session_forks', {
        workspaceId,
        parentSessionId,
      }),
  } satisfies SessionForkBridge;
}

export function createTauriReservedBridge() {
  return {
    acpGetStatus: () => invokeIpc<unknown>('acp_get_status'),
    acpGetConfig: () => invokeIpc<AcpConfig>('acp_get_config'),
    httpApiGetStatus: () => invokeIpc<unknown>('http_api_get_status'),
    httpApiGetConfig: () => invokeIpc<HttpApiConfig>('http_api_get_config'),
    codemodeExecute: (code) => invokeIpc<unknown>('codemode_execute', { code }),
    codemodeGetConfig: () => invokeIpc<CodeModeConfig>('codemode_get_config'),
  } satisfies ReservedBridge;
}

export function createTauriCustomAgentBridge() {
  return {
    listCustomAgents: (dataDir) => invokeIpc<AgentConfig[]>('list_custom_agents', { dataDir }),
    addCustomAgent: (dataDir, agent) =>
      invokeIpc<AgentConfig[]>('add_custom_agent', { dataDir, agent }),
    deleteCustomAgent: (dataDir, name) =>
      invokeIpc<AgentConfig[]>('delete_custom_agent', { dataDir, name }),
  } satisfies CustomAgentBridge;
}
