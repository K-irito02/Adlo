import type {
  AgentRunDetail,
  AppInfo,
  AppPreferencePatch,
  AuditEntry,
  CommandRequest,
  CommandRunResult,
  CommandRunStreamStart,
  DigitalLifeTerminalStreamEventV1,
  CheckpointPayloadPreview,
  ConversationDetail,
  ConversationSendResult,
  ConversationSessionRecord,
  DigitalLifeModelStreamEventV1,
  DigitalLifeRunActivityEventV1,
  GitSnapshot,
  HealthSnapshot,
  IndexingStatus,
  IpcResult,
  ModelGatewayHealthSnapshot,
  PatchApplicationResult,
  PatchSet,
  ReorderSessionsInput,
  ReorderWorkspacesInput,
  RecentWorkspaceEntry,
  RepoMapNode,
  RetrievalSnapshot,
  RuntimeDiagnosticsSnapshot,
  ApprovalRequestSummary,
  TaskCenterSnapshot,
  FileOutlineItem,
  WorkspaceFileChangedEvent,
  WorkspaceFileDocument,
  WorkspaceTreeNode,
  WorkspaceSearchHit,
  WorkspaceMeta
} from "@ai-digital-life/kernel";

export interface DigitalLifeBridge {
  /** Subscribe to Main-originated model stream events (typed, no secrets). */
  subscribeModelStream: (listener: (event: DigitalLifeModelStreamEventV1) => void) => () => void;
  /** Subscribe to Main-originated agent run activity events (typed, no chain-of-thought). */
  subscribeRunActivity: (listener: (event: DigitalLifeRunActivityEventV1) => void) => () => void;
  /** Subscribe to Main-originated terminal stream events (typed, no secrets). */
  subscribeTerminalStream: (listener: (event: DigitalLifeTerminalStreamEventV1) => void) => () => void;
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    setTitle: (title: string) => Promise<void>;
  };
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
    pin: (workspaceId: string) => Promise<IpcResult<RecentWorkspaceEntry[]>>;
    unpin: (workspaceId: string) => Promise<IpcResult<RecentWorkspaceEntry[]>>;
    reorder: (input: ReorderWorkspacesInput) => Promise<IpcResult<RecentWorkspaceEntry[]>>;
    removeFromSidebar: (workspaceId: string) => Promise<IpcResult<RecentWorkspaceEntry[]>>;
    restoreToSidebar: (workspaceId: string) => Promise<IpcResult<RecentWorkspaceEntry[]>>;
    revealInFileManager: (workspacePath: string) => Promise<IpcResult<boolean>>;
    createFile: (relativePath: string, content?: string) => Promise<IpcResult<WorkspaceFileDocument>>;
    createFolder: (relativePath: string) => Promise<IpcResult<boolean>>;
    readFile: (relativePath: string) => Promise<IpcResult<WorkspaceFileDocument>>;
    listTree: () => Promise<IpcResult<WorkspaceTreeNode[]>>;
    search: (query: string) => Promise<IpcResult<WorkspaceSearchHit[]>>;
    outline: (relativePath: string) => Promise<IpcResult<FileOutlineItem[]>>;
    /** Replace the set of workspace-relative paths considered dirty in the editor (best-effort). */
    setEditorDirtyPaths: (relativePaths: string[]) => Promise<IpcResult<boolean>>;
    onFileChanged: (listener: (event: WorkspaceFileChangedEvent) => void) => () => void;
    getGitStatus: () => Promise<IpcResult<GitSnapshot>>;
  };
  retrieval: {
    getStatus: () => Promise<IpcResult<RetrievalSnapshot | undefined>>;
    getRepoMap: () => Promise<IpcResult<RepoMapNode[]>>;
    rebuildIndex: () => Promise<IpcResult<boolean>>;
  };
  conversation: {
    createSession: (title?: string) => Promise<IpcResult<ConversationSessionRecord>>;
    listSessions: () => Promise<IpcResult<ConversationSessionRecord[]>>;
    getSession: (sessionId: string) => Promise<IpcResult<ConversationDetail | undefined>>;
    renameSession: (input: { sessionId: string; title: string }) => Promise<IpcResult<ConversationSessionRecord>>;
    pinSession: (sessionId: string) => Promise<IpcResult<ConversationSessionRecord>>;
    unpinSession: (sessionId: string) => Promise<IpcResult<ConversationSessionRecord>>;
    reorderSessions: (input: ReorderSessionsInput) => Promise<IpcResult<ConversationSessionRecord[]>>;
    markSessionRead: (input: { sessionId: string; readAt?: number }) => Promise<IpcResult<ConversationSessionRecord>>;
    markSessionUnread: (sessionId: string) => Promise<IpcResult<ConversationSessionRecord>>;
    archiveSession: (sessionId: string) => Promise<IpcResult<ConversationSessionRecord>>;
    archiveAllInWorkspace: () => Promise<IpcResult<ConversationSessionRecord[]>>;
    deleteSession: (sessionId: string) => Promise<IpcResult<boolean>>;
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
    /** Start a governed command with incremental stdout/stderr events (`digitalLife:terminalStream`). */
    runStream: (input: { command: string; args: string[]; shell?: boolean }) => Promise<IpcResult<CommandRunStreamStart>>;
    /** Stop a stream started via `runStream` (best-effort SIGTERM). */
    stopStream: (executionId: string) => Promise<IpcResult<boolean>>;
    listRecent: (limit?: number) => Promise<IpcResult<CommandRequest[]>>;
  };
  task: {
    getSnapshot: () => Promise<IpcResult<TaskCenterSnapshot>>;
    listPendingApprovals?: () => Promise<IpcResult<ApprovalRequestSummary[]>>;
    getCheckpointPreview: (checkpointId: string) => Promise<IpcResult<CheckpointPayloadPreview | undefined>>;
    restoreCheckpoint: (checkpointId: string) => Promise<IpcResult<TaskCenterSnapshot>>;
    decideApproval: (input: { approvalId: string; decision: "approved" | "rejected"; reason?: string }) => Promise<IpcResult<TaskCenterSnapshot>>;
    listAuditEntries: (limit?: number) => Promise<IpcResult<AuditEntry[]>>;
  };
  runActivity: {
    listByRunId: (runId: string, limit?: number) => Promise<IpcResult<DigitalLifeRunActivityEventV1[]>>;
  };
}
