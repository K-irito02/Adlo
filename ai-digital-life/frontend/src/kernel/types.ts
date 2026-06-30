import { type APPROVAL_POLICY_MODE, type APP_STATE_SCHEMA_VERSION } from './constants';
import type { RiskLevel } from './types-task';

// ════════════════════════════════════════════════════════
// Config / Preferences
// ════════════════════════════════════════════════════════

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
export type LanguageCode = 'zh-CN' | 'en-US';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type ModelProviderId = 'deepseek' | 'minimax';

export interface ModelProviderPreference {
  enabled: boolean;
  priority: number;
  modelId: string;
}

export interface ModelPreferences {
  providers: Record<ModelProviderId, ModelProviderPreference>;
}

export interface AppPreferencePatch {
  language?: LanguageCode;
  themeMode?: ThemeMode;
  modelPreferences?: Partial<Record<ModelProviderId, Partial<ModelProviderPreference>>>;
}

export interface ConfigSnapshot {
  language: LanguageCode;
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  logLevel: LogLevel;
  maxRecentWorkspaces: number;
  modelPreferences: ModelPreferences;
}

// ════════════════════════════════════════════════════════
// Window / Workspace
// ════════════════════════════════════════════════════════

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized: boolean;
}

export interface RecentWorkspaceEntry {
  id: string;
  path: string;
  rootPath: string;
  name: string;
  lastOpenedAt: number;
  isPinned: boolean;
  pinnedOrder: number;
  unpinnedOrder: number;
  removedFromSidebar: boolean;
  available: boolean;
  hiddenFromRightPanels: boolean;
}

export type WorkspaceType = 'node' | 'python' | 'java' | 'go' | 'rust' | 'unknown';
export type WorkspaceStatus =
  | 'initializing'
  | 'ready'
  | 'indexing'
  | 'degraded'
  | 'error'
  | 'closed';

export interface GitSnapshot {
  isRepo: boolean;
  branch?: string;
  head?: string;
  ahead?: number;
  behind?: number;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  conflicts: string[];
  capturedAt: number;
}

export interface GitBranchSummary {
  name: string;
  isCurrent: boolean;
}

export interface WorkspaceGitBranchSwitchInput {
  branchName: string;
  allowStash: boolean;
}

export interface WorkspaceGitBranchCreateInput {
  branchName: string;
  baseBranch?: string;
  allowStash: boolean;
}

export interface WorkspaceMeta {
  id: string;
  path: string;
  rootPath: string;
  name: string;
  type: WorkspaceType;
  status: WorkspaceStatus;
  gitSnapshot?: GitSnapshot;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
}

export interface WorkspaceGitBranchChangeResult {
  workspace: WorkspaceMeta;
  gitSnapshot: GitSnapshot;
  previousBranch?: string;
  currentBranch: string;
  stashedChanges: boolean;
}

// ════════════════════════════════════════════════════════
// Session / App State
// ════════════════════════════════════════════════════════

export type SessionStatus = 'active' | 'paused' | 'completed' | 'archived';

export interface SessionSummary {
  lastUserIntent?: string;
  lastIndexVersion?: string;
  lastCheckpointId?: string;
  lastTaskId?: string;
  notes?: string[];
}

export interface SessionMeta {
  id: string;
  workspaceId: string;
  status: SessionStatus;
  approvalMode: typeof APPROVAL_POLICY_MODE;
  currentTaskId?: string;
  summary: SessionSummary;
  createdAt: number;
  updatedAt: number;
}

export interface AppStateV1 {
  schemaVersion: typeof APP_STATE_SCHEMA_VERSION;
  currentWorkspacePath?: string;
  recentWorkspaces: RecentWorkspaceEntry[];
  windowState: WindowState;
}

// ════════════════════════════════════════════════════════
// Health / Diagnostics
// ════════════════════════════════════════════════════════

export interface LogEntrySummary {
  timestamp: number;
  level: LogLevel;
  scope: string;
  message: string;
  context?: Record<string, unknown>;
  durationMs?: number;
  error?: {
    name: string;
    message: string;
  };
}

export type HealthStatus = 'healthy' | 'degraded' | 'unavailable';

export interface HealthComponent {
  name: 'main' | 'worker' | 'storage' | 'recovery' | 'migration' | 'models';
  status: HealthStatus;
  detail: string;
  updatedAt: number;
}

export interface HealthSnapshot {
  timestamp: number;
  components: HealthComponent[];
}

export interface RuntimeLifecycleSnapshot {
  currentStartedAt: number;
  lastShutdownAt?: number;
  lastShutdownWasClean: boolean;
  recoveredFromCrash: boolean;
}

export interface MigrationDiagnostics {
  change: 'none' | 'upgrade';
  fromVersion?: string;
  toVersion: string;
  backupPath?: string;
  executedScripts: Array<{
    scriptId: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled-back';
    error?: string;
  }>;
}

export interface EventDiagnostics {
  emitted: number;
  byType: Record<string, number>;
}

export interface RuntimeDiagnosticsSnapshot {
  lifecycle: RuntimeLifecycleSnapshot;
  migration: MigrationDiagnostics;
  events: EventDiagnostics;
  recentErrors: Array<{
    id: string;
    timestamp: number;
    name: string;
    message: string;
  }>;
}

// ════════════════════════════════════════════════════════
// Retrieval
// ════════════════════════════════════════════════════════

export type RetrievalStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface RetrievalFileTypeCount {
  extension: string;
  count: number;
}

export interface RepoMapEntry {
  path: string;
  type: 'file' | 'directory';
}

export interface RetrievalSnapshot {
  workspaceId: string;
  rootPath: string;
  status: RetrievalStatus;
  scannedFiles: number;
  indexedTextFiles: number;
  startedAt?: number;
  updatedAt: number;
  completedAt?: number;
  lastError?: string;
  topExtensions: RetrievalFileTypeCount[];
  repoMap: RepoMapEntry[];
}

export interface AppInfo {
  appName: string;
  version: string;
  config: ConfigSnapshot;
  currentWorkspace?: WorkspaceMeta;
  recentLogs: LogEntrySummary[];
}

// ════════════════════════════════════════════════════════
// Tool Invocation / Base Event
// ════════════════════════════════════════════════════════

export interface ToolInvocationRecord {
  id: string;
  runId: string;
  toolName: string;
  summary: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
}

export interface BaseEvent<TType extends string = string, TPayload = Record<string, unknown>> {
  type: TType;
  timestamp: number;
  payload: TPayload;
}

// ════════════════════════════════════════════════════════
// Indexing / Repo Map / Audit / Settings / Reference
// ════════════════════════════════════════════════════════

export type IndexingState = 'idle' | 'indexing' | 'indexed' | 'error';

export interface IndexingStatus {
  state: IndexingState;
  scannedFiles: number;
  totalFiles: number;
  excludedFiles: number;
  lastIndexedAt?: number;
  error?: string;
}

export interface RepoMapNode {
  path: string;
  name: string;
  kind: 'file' | 'directory';
  fileCount: number;
  primaryLanguage?: string;
  children: RepoMapNode[];
}

export interface AuditEntry {
  id: string;
  timestamp: number;
  operationType:
    | 'command'
    | 'file-write'
    | 'file-delete'
    | 'patch-apply'
    | 'patch-rollback'
    | 'approval';
  summary: string;
  riskLevel: RiskLevel;
  decision?: 'approved' | 'rejected' | 'auto';
  detail?: string;
}

export type SettingsGroupId = 'general' | 'model' | 'agent' | 'workspace' | 'shortcuts';

export interface SettingItem {
  id: string;
  groupId: SettingsGroupId;
  label: string;
  description?: string;
  type: 'toggle' | 'select' | 'input' | 'password' | 'readonly';
  value: string | boolean | number;
  options?: Array<{ value: string; label: string }>;
}

export type GitFileStatus =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'untracked'
  | 'conflicted'
  | 'unchanged';

export type SlashCommandId = 'plan' | 'edit' | 'fix' | 'explain' | 'test' | 'review';

export interface SlashCommand {
  id: SlashCommandId;
  label: string;
  description: string;
}

export type ReferenceKind = 'file' | 'symbol' | 'terminal' | 'selection';

export interface ReferenceItem {
  id: string;
  kind: ReferenceKind;
  label: string;
  detail?: string;
  path?: string;
  line?: number;
}
