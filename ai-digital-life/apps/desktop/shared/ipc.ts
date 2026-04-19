import type {
  AgentRunDetail,
  AppInfo,
  AppPreferencePatch,
  CommandRunResult,
  CheckpointPayloadPreview,
  ConversationDetail,
  ConversationSendResult,
  ConversationSessionRecord,
  HealthSnapshot,
  IpcResult,
  ModelGatewayHealthSnapshot,
  PatchApplicationResult,
  PatchSet,
  RecentWorkspaceEntry,
  RetrievalSnapshot,
  RuntimeDiagnosticsSnapshot,
  ApprovalRequestSummary,
  TaskCenterSnapshot,
  FileOutlineItem,
  WorkspaceFileChangedEvent,
  WorkspaceFileDocument,
  WorkspaceSearchHit,
  WorkspaceMeta
} from "@ai-digital-life/kernel";

export interface DigitalLifeBridge {
  app: {
    getInfo: () => Promise<IpcResult<AppInfo>>;
    getHealth: () => Promise<IpcResult<HealthSnapshot>>;
    getDiagnostics: () => Promise<IpcResult<RuntimeDiagnosticsSnapshot>>;
    getModelHealth: () => Promise<IpcResult<ModelGatewayHealthSnapshot>>;
    updatePreferences: (patch: AppPreferencePatch) => Promise<IpcResult<AppInfo>>;
  };
  workspace: {
    listRecent: () => Promise<IpcResult<RecentWorkspaceEntry[]>>;
    open: (workspacePath: string) => Promise<IpcResult<WorkspaceMeta>>;
    readFile: (relativePath: string) => Promise<IpcResult<WorkspaceFileDocument>>;
    search: (query: string) => Promise<IpcResult<WorkspaceSearchHit[]>>;
    outline: (relativePath: string) => Promise<IpcResult<FileOutlineItem[]>>;
    onFileChanged: (listener: (event: WorkspaceFileChangedEvent) => void) => () => void;
  };
  retrieval: {
    getStatus: () => Promise<IpcResult<RetrievalSnapshot | undefined>>;
  };
  conversation: {
    createSession: (title?: string) => Promise<IpcResult<ConversationSessionRecord>>;
    listSessions: () => Promise<IpcResult<ConversationSessionRecord[]>>;
    getSession: (sessionId: string) => Promise<IpcResult<ConversationDetail | undefined>>;
    sendMessage: (input: { sessionId: string; content: string; scenario?: "chat" | "plan" | "code-edit" }) => Promise<IpcResult<ConversationSendResult>>;
    cancelMessage: (runId: string) => Promise<IpcResult<AgentRunDetail | undefined>>;
  };
  agent: {
    startRun: (input: { sessionId: string; prompt: string; scenario?: "chat" | "plan" | "code-edit" }) => Promise<IpcResult<ConversationSendResult>>;
    getRun: (runId: string) => Promise<IpcResult<AgentRunDetail | undefined>>;
    retryRun: (runId: string) => Promise<IpcResult<AgentRunDetail | undefined>>;
    abortRun: (runId: string) => Promise<IpcResult<AgentRunDetail | undefined>>;
  };
  patch: {
    getPatchSet: (patchSetId: string) => Promise<IpcResult<PatchSet | undefined>>;
    setHunkDecision: (input: { patchSetId: string; hunkId: string; decision: "pending" | "accepted" | "rejected" }) => Promise<IpcResult<PatchSet>>;
    applyPatchSet: (patchSetId: string) => Promise<IpcResult<PatchApplicationResult>>;
    rollbackPatchSet: (patchSetId: string) => Promise<IpcResult<PatchSet>>;
  };
  command: {
    getProfiles: () => Promise<IpcResult<Array<{ id: string; label: string }>>>;
    run: (input: { command: string; args: string[]; shell?: boolean }) => Promise<IpcResult<CommandRunResult>>;
  };
  task: {
    getSnapshot: () => Promise<IpcResult<TaskCenterSnapshot>>;
    listPendingApprovals?: () => Promise<IpcResult<ApprovalRequestSummary[]>>;
    getCheckpointPreview: (checkpointId: string) => Promise<IpcResult<CheckpointPayloadPreview | undefined>>;
    restoreCheckpoint: (checkpointId: string) => Promise<IpcResult<TaskCenterSnapshot>>;
    decideApproval: (input: { approvalId: string; decision: "approved" | "rejected"; reason?: string }) => Promise<IpcResult<TaskCenterSnapshot>>;
  };
}
