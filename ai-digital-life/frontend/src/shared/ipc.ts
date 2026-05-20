import type {
  AgentRunDetail,
  AppInfo,
  AppPreferencePatch,
  AuditEntry,
  CommandRequest,
  CommandRunResult,
  DigitalLifeTerminalStreamEventV1,
  CheckpointPayloadPreview,
  ConversationDetail,
  ConversationSendResult,
  ConversationSessionRecord,
  GitBranchSummary,
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
  WorkspaceChangePreview,
  WorkspaceFileDocument,
  WorkspaceGitBranchChangeResult,
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
  WorkspaceTreeNode,
  WorkspaceSearchHit,
  WorkspaceMeta
} from "@ai-digital-life/kernel";

export interface PtySessionInfo {
  sessionId: string;
  shell: string;
  cwd: string;
  cols: number;
  rows: number;
  status: "Running" | "Terminated";
}

export interface PtyOutputEvent {
  sessionId: string;
  data: string;
}

export interface DigitalLifeBridge {
  subscribeModelStream: (listener: (event: DigitalLifeModelStreamEventV1) => void) => () => void;
  subscribeRunActivity: (listener: (event: DigitalLifeRunActivityEventV1) => void) => () => void;
  subscribeTerminalStream: (listener: (event: DigitalLifeTerminalStreamEventV1) => void) => () => void;
  subscribePtyOutput: (listener: (event: PtyOutputEvent) => void) => () => void;
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
    clearCurrent: () => Promise<IpcResult<boolean>>;
    pickDirectory: () => Promise<IpcResult<string | undefined>>;
    pin: (workspaceId: string) => Promise<IpcResult<RecentWorkspaceEntry[]>>;
    unpin: (workspaceId: string) => Promise<IpcResult<RecentWorkspaceEntry[]>>;
    reorder: (input: ReorderWorkspacesInput) => Promise<IpcResult<RecentWorkspaceEntry[]>>;
    removeFromSidebar: (workspaceId: string) => Promise<IpcResult<RecentWorkspaceEntry[]>>;
    restoreToSidebar: (workspaceId: string) => Promise<IpcResult<RecentWorkspaceEntry[]>>;
    revealInFileManager: (workspacePath: string) => Promise<IpcResult<boolean>>;
    createFile: (relativePath: string, content?: string) => Promise<IpcResult<WorkspaceFileDocument>>;
    createFolder: (relativePath: string) => Promise<IpcResult<boolean>>;
    readFile: (relativePath: string) => Promise<IpcResult<WorkspaceFileDocument>>;
    getChangePreview: (relativePath: string) => Promise<IpcResult<WorkspaceChangePreview>>;
    listTree: () => Promise<IpcResult<WorkspaceTreeNode[]>>;
    search: (query: string) => Promise<IpcResult<WorkspaceSearchHit[]>>;
    outline: (relativePath: string) => Promise<IpcResult<FileOutlineItem[]>>;
    /** Replace the set of workspace-relative paths considered dirty in the editor (best-effort). */
    setEditorDirtyPaths: (relativePaths: string[]) => Promise<IpcResult<boolean>>;
    onFileChanged: (listener: (event: WorkspaceFileChangedEvent) => void) => () => void;
    renameFile: (relativePath: string, newName: string) => Promise<IpcResult<boolean>>;
    deleteFile: (relativePath: string) => Promise<IpcResult<boolean>>;
    duplicateFile: (srcRelativePath: string, dstRelativePath: string) => Promise<IpcResult<boolean>>;
    getAbsolutePath: (relativePath: string) => Promise<IpcResult<string>>;
    moveFile: (relativePath: string, newPath: string) => Promise<IpcResult<boolean>>;
    getGitStatus: () => Promise<IpcResult<GitSnapshot>>;
    listGitBranches: () => Promise<IpcResult<GitBranchSummary[]>>;
    switchGitBranch: (input: WorkspaceGitBranchSwitchInput) => Promise<IpcResult<WorkspaceGitBranchChangeResult>>;
    createGitBranch: (input: WorkspaceGitBranchCreateInput) => Promise<IpcResult<WorkspaceGitBranchChangeResult>>;
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
    run: (input: { command: string; args: string[]; shell?: boolean }) => Promise<IpcResult<CommandRunResult>>;
    listRecent: (limit?: number) => Promise<IpcResult<CommandRequest[]>>;
  };
  pty: {
    create: (input: { shell?: string; cwd?: string; cols: number; rows: number }) => Promise<IpcResult<{ sessionId: string }>>;
    input: (sessionId: string, data: string) => Promise<IpcResult<boolean>>;
    resize: (sessionId: string, cols: number, rows: number) => Promise<IpcResult<boolean>>;
    kill: (sessionId: string) => Promise<IpcResult<boolean>>;
    list: () => Promise<IpcResult<PtySessionInfo[]>>;
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
