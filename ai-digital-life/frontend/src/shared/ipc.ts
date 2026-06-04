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
  WorkspaceMeta,
} from '@ai-digital-life/kernel';

export enum IpcErrorCode {
  NOT_FOUND = 'NOT_FOUND',
  INVALID_INPUT = 'INVALID_INPUT',
  STORAGE_ERROR = 'STORAGE_ERROR',
  WORKSPACE_ERROR = 'WORKSPACE_ERROR',
  CONFIG_ERROR = 'CONFIG_ERROR',
  IO_ERROR = 'IO_ERROR',
  MIGRATION_ERROR = 'MIGRATION_ERROR',
  SECURITY_ERROR = 'SECURITY_ERROR',
  APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
  PATCH_ERROR = 'PATCH_ERROR',
  TERMINAL_ERROR = 'TERMINAL_ERROR',
  MODEL_ERROR = 'MODEL_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INVOKE_ERROR = 'INVOKE_ERROR',
  PREVIEW_API_ERROR = 'PREVIEW_API_ERROR',
}

export function createIpcError(code: IpcErrorCode, message: string) {
  return { code, message };
}

export interface PtySessionInfo {
  sessionId: string;
  shell: string;
  cwd: string;
  cols: number;
  rows: number;
  status: 'Running' | 'Terminated';
  output?: string;
}

export interface PtyOutputEvent {
  sessionId: string;
  data: string;
}

// ============================================
// Digital Life Bridge - 拆分为子接口 + 组合
// ============================================

export interface WindowBridge {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  setTitle: (title: string) => Promise<void>;
}

export interface AppBridge {
  getInfo: () => Promise<IpcResult<AppInfo>>;
  getHealth: () => Promise<IpcResult<HealthSnapshot>>;
  getDiagnostics: () => Promise<IpcResult<RuntimeDiagnosticsSnapshot>>;
  getModelHealth: () => Promise<IpcResult<ModelGatewayHealthSnapshot>>;
  updatePreferences: (patch: AppPreferencePatch) => Promise<IpcResult<AppInfo>>;
}

export interface WorkspaceBridge {
  listRecent: () => Promise<IpcResult<RecentWorkspaceEntry[]>>;
  open: (workspacePath: string) => Promise<IpcResult<WorkspaceMeta>>;
  clearCurrent: () => Promise<IpcResult<boolean>>;
  pickDirectory: () => Promise<IpcResult<string | undefined>>;
  pin: (workspaceId: string) => Promise<IpcResult<RecentWorkspaceEntry[]>>;
  unpin: (workspaceId: string) => Promise<IpcResult<RecentWorkspaceEntry[]>>;
  reorder: (input: ReorderWorkspacesInput) => Promise<IpcResult<RecentWorkspaceEntry[]>>;
  removeFromSidebar: (workspaceId: string) => Promise<IpcResult<RecentWorkspaceEntry[]>>;
  restoreToSidebar: (workspaceId: string) => Promise<IpcResult<RecentWorkspaceEntry[]>>;
  listTreeForWorkspace: (workspacePath: string) => Promise<IpcResult<WorkspaceTreeNode[]>>;
  listGitStatusForWorkspace: (workspacePath: string) => Promise<IpcResult<GitSnapshot>>;
  hideFromRightPanels: (workspaceId: string) => Promise<IpcResult<RecentWorkspaceEntry[]>>;
  showInRightPanels: (workspaceId: string) => Promise<IpcResult<RecentWorkspaceEntry[]>>;
  revealInFileManager: (workspacePath: string) => Promise<IpcResult<boolean>>;
  createFile: (relativePath: string, content?: string) => Promise<IpcResult<WorkspaceFileDocument>>;
  createFolder: (relativePath: string) => Promise<IpcResult<boolean>>;
  readFile: (relativePath: string) => Promise<IpcResult<WorkspaceFileDocument>>;
  readFileForWorkspace: (
    workspacePath: string,
    relativePath: string
  ) => Promise<IpcResult<WorkspaceFileDocument>>;
  getChangePreview: (relativePath: string) => Promise<IpcResult<WorkspaceChangePreview>>;
  getChangePreviewForWorkspace: (
    workspacePath: string,
    relativePath: string
  ) => Promise<IpcResult<WorkspaceChangePreview>>;
  listTree: () => Promise<IpcResult<WorkspaceTreeNode[]>>;
  search: (query: string) => Promise<IpcResult<WorkspaceSearchHit[]>>;
  outline: (relativePath: string) => Promise<IpcResult<FileOutlineItem[]>>;
  setEditorDirtyPaths: (relativePaths: string[]) => Promise<IpcResult<boolean>>;
  onFileChanged: (listener: (event: WorkspaceFileChangedEvent) => void) => () => void;
  renameFile: (relativePath: string, newName: string) => Promise<IpcResult<boolean>>;
  deleteFile: (relativePath: string) => Promise<IpcResult<boolean>>;
  duplicateFile: (srcRelativePath: string, dstRelativePath: string) => Promise<IpcResult<boolean>>;
  getAbsolutePath: (relativePath: string) => Promise<IpcResult<string>>;
  moveFile: (relativePath: string, newPath: string) => Promise<IpcResult<boolean>>;
  getGitStatus: () => Promise<IpcResult<GitSnapshot>>;
  listGitBranches: () => Promise<IpcResult<GitBranchSummary[]>>;
  switchGitBranch: (
    input: WorkspaceGitBranchSwitchInput
  ) => Promise<IpcResult<WorkspaceGitBranchChangeResult>>;
  createGitBranch: (
    input: WorkspaceGitBranchCreateInput
  ) => Promise<IpcResult<WorkspaceGitBranchChangeResult>>;
}

export interface RetrievalBridge {
  getStatus: () => Promise<IpcResult<RetrievalSnapshot | undefined>>;
  getRepoMap: () => Promise<IpcResult<RepoMapNode[]>>;
  rebuildIndex: () => Promise<IpcResult<boolean>>;
}

export interface ConversationBridge {
  createSession: (
    title?: string,
    workspaceId?: string
  ) => Promise<IpcResult<ConversationSessionRecord>>;
  listSessions: () => Promise<IpcResult<ConversationSessionRecord[]>>;
  getSession: (sessionId: string) => Promise<IpcResult<ConversationDetail | undefined>>;
  renameSession: (input: {
    sessionId: string;
    title: string;
  }) => Promise<IpcResult<ConversationSessionRecord>>;
  pinSession: (sessionId: string) => Promise<IpcResult<ConversationSessionRecord>>;
  unpinSession: (sessionId: string) => Promise<IpcResult<ConversationSessionRecord>>;
  reorderSessions: (input: ReorderSessionsInput) => Promise<IpcResult<ConversationSessionRecord[]>>;
  markSessionRead: (input: {
    sessionId: string;
    readAt?: number;
  }) => Promise<IpcResult<ConversationSessionRecord>>;
  markSessionUnread: (sessionId: string) => Promise<IpcResult<ConversationSessionRecord>>;
  archiveSession: (sessionId: string) => Promise<IpcResult<ConversationSessionRecord>>;
  archiveAllInWorkspace: () => Promise<IpcResult<ConversationSessionRecord[]>>;
  deleteSession: (sessionId: string) => Promise<IpcResult<boolean>>;
  sendMessage: (input: {
    sessionId: string;
    content: string;
    scenario?: 'chat' | 'plan' | 'code-edit';
  }) => Promise<IpcResult<ConversationSendResult>>;
  cancelMessage: (runId: string) => Promise<IpcResult<AgentRunDetail | undefined>>;
}

export interface AgentBridge {
  startRun: (input: {
    sessionId: string;
    prompt: string;
    scenario?: 'chat' | 'plan' | 'code-edit';
  }) => Promise<IpcResult<ConversationSendResult>>;
  getRun: (runId: string) => Promise<IpcResult<AgentRunDetail | undefined>>;
  retryRun: (runId: string) => Promise<IpcResult<AgentRunDetail | undefined>>;
  abortRun: (runId: string) => Promise<IpcResult<AgentRunDetail | undefined>>;
}

export interface PatchBridge {
  getPatchSet: (patchSetId: string) => Promise<IpcResult<PatchSet | undefined>>;
  setHunkDecision: (input: {
    patchSetId: string;
    hunkId: string;
    decision: 'pending' | 'accepted' | 'rejected';
  }) => Promise<IpcResult<PatchSet>>;
  applyPatchSet: (patchSetId: string) => Promise<IpcResult<PatchApplicationResult>>;
  rollbackPatchSet: (patchSetId: string) => Promise<IpcResult<PatchSet>>;
}

export interface CommandBridge {
  run: (input: {
    command: string;
    args: string[];
    shell?: boolean;
  }) => Promise<IpcResult<CommandRunResult>>;
  listRecent: (limit?: number) => Promise<IpcResult<CommandRequest[]>>;
}

export interface PtyBridge {
  create: (input: {
    shell?: string;
    cwd?: string;
    cols: number;
    rows: number;
  }) => Promise<IpcResult<{ sessionId: string }>>;
  input: (sessionId: string, data: string) => Promise<IpcResult<boolean>>;
  resize: (sessionId: string, cols: number, rows: number) => Promise<IpcResult<boolean>>;
  kill: (sessionId: string) => Promise<IpcResult<boolean>>;
  list: () => Promise<IpcResult<PtySessionInfo[]>>;
}

export interface TaskBridge {
  getSnapshot: () => Promise<IpcResult<TaskCenterSnapshot>>;
  listPendingApprovals?: () => Promise<IpcResult<ApprovalRequestSummary[]>>;
  getCheckpointPreview: (
    checkpointId: string
  ) => Promise<IpcResult<CheckpointPayloadPreview | undefined>>;
  restoreCheckpoint: (checkpointId: string) => Promise<IpcResult<TaskCenterSnapshot>>;
  decideApproval: (input: {
    approvalId: string;
    decision: 'approved' | 'rejected';
    reason?: string;
  }) => Promise<IpcResult<TaskCenterSnapshot>>;
  listAuditEntries: (limit?: number) => Promise<IpcResult<AuditEntry[]>>;
}

export interface RunActivityBridge {
  listByRunId: (
    runId: string,
    limit?: number
  ) => Promise<IpcResult<DigitalLifeRunActivityEventV1[]>>;
}

export interface BrowserBridge {
  navigate: (url: string) => Promise<void>;
  goBack: () => Promise<boolean>;
  goForward: () => Promise<boolean>;
  reload: () => Promise<void>;
  onUrlChanged: (listener: (url: string) => void) => () => void;
}

export interface DigitalLifeBridge {
  subscribeModelStream: (listener: (event: DigitalLifeModelStreamEventV1) => void) => () => void;
  subscribeRunActivity: (listener: (event: DigitalLifeRunActivityEventV1) => void) => () => void;
  subscribeTerminalStream: (
    listener: (event: DigitalLifeTerminalStreamEventV1) => void
  ) => () => void;
  subscribePtyOutput: (listener: (event: PtyOutputEvent) => void) => () => void;
  window: WindowBridge;
  app: AppBridge;
  workspace: WorkspaceBridge;
  retrieval: RetrievalBridge;
  conversation: ConversationBridge;
  agent: AgentBridge;
  patch: PatchBridge;
  command: CommandBridge;
  pty: PtyBridge;
  task: TaskBridge;
  runActivity: RunActivityBridge;
  browser: BrowserBridge;
}
