import type { APPROVAL_POLICY_MODE, APP_STATE_SCHEMA_VERSION } from './constants';
import type { RiskLevel } from './types-task';

// ════════════════════════════════════════════════════════
// Config / Preferences
// ════════════════════════════════════════════════════════

// 本地导入 ConfigSnapshot 供手写 AppInfo 接口引用（re-export 不会把类型引入本地作用域）
import type { ConfigSnapshot } from '../shared/ipc-types.generated';

// 废弃手写类型，统一使用 ts-rs 生成类型作为真源
export type {
  AppPreferencePatch,
  ConfigSnapshot,
  ModelCapability,
  ModelDefinition,
  ModelProviderPreference,
  ModelProviderPreferencePatch,
  ModelTier,
  ThemeMode,
  Theme,
  LogMode,
} from '../shared/ipc-types.generated';

export type ModelProviderId = string;
export type ResolvedTheme = 'light' | 'dark';
export type LanguageCode = 'zh-CN' | 'en-US';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

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
  local: boolean;
  remote: boolean;
  hasStash: boolean;
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
  hasRestored: boolean;
}

export interface GitVisDailyCommit {
  date: string;
  count: number;
}
export interface GitVisHourlyBin {
  day: number;
  hour: number;
  count: number;
}
export interface GitVisContributorPeriod {
  period: string;
  count: number;
}
export interface GitVisContributorActivity {
  author: string;
  authorEmail: string;
  totalCommits: number;
  periods: GitVisContributorPeriod[];
}
export interface GitVisTimelinePoint {
  date: string;
  count: number;
  cumulative: number;
}
export interface GitVisCommitRow {
  hash: string;
  shortHash: string;
  date: string;
  author: string;
  authorEmail: string;
  message: string;
}
export interface GitVisCommitStats {
  dailyCommits: GitVisDailyCommit[];
  hourlyDistribution: GitVisHourlyBin[];
  contributorActivity: GitVisContributorActivity[];
  commitTimeline: GitVisTimelinePoint[];
  commits: GitVisCommitRow[];
}
export interface GitVisCodeEvolutionDay {
  date: string;
  additions: number;
  deletions: number;
}
export interface GitVisCodeEvolution {
  days: GitVisCodeEvolutionDay[];
}
export interface GitVisModuleEntry {
  module: string;
  count: number;
}
export interface GitVisContributorModule {
  author: string;
  authorEmail: string;
  modules: GitVisModuleEntry[];
}
export interface GitVisContributorModules {
  matrix: GitVisContributorModule[];
}
export interface GitVisBranchNode {
  hash: string;
  shortHash: string;
  parentHashes: string[];
  branch: string;
  date: string;
  message: string;
  author: string;
  authorEmail: string;
  tag?: string;
}
export interface GitVisBranchEdge {
  from: string;
  to: string;
}
export interface GitVisBranchGraph {
  nodes: GitVisBranchNode[];
  edges: GitVisBranchEdge[];
  branches: string[];
}
export interface GitVisFileHotspotNode {
  name: string;
  nodeType: string;
  changeCount?: number;
  additions?: number;
  deletions?: number;
  lastModified?: string;
  children?: GitVisFileHotspotNode[];
}
export interface GitVisFileHotspotFile {
  path: string;
  changeCount: number;
  additions: number;
  deletions: number;
  lastModified: string;
}
export interface GitVisFileHotspots {
  tree: GitVisFileHotspotNode;
  files: GitVisFileHotspotFile[];
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
  executedScripts: {
    scriptId: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled-back';
    error?: string;
  }[];
}

export interface EventDiagnostics {
  emitted: number;
  byType: Record<string, number>;
}

export interface RuntimeDiagnosticsSnapshot {
  lifecycle: RuntimeLifecycleSnapshot;
  migration: MigrationDiagnostics;
  events: EventDiagnostics;
  recentErrors: {
    id: string;
    timestamp: number;
    name: string;
    message: string;
  }[];
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

export type SettingsGroupId =
  | 'general'
  | 'workspace'
  | 'shortcuts'
  | 'commands'
  | 'permissions'
  | 'references'
  | 'lsp'
  | 'browser';

export interface SettingItem {
  id: string;
  groupId: SettingsGroupId;
  label: string;
  description?: string;
  type: 'toggle' | 'select' | 'input' | 'password' | 'readonly' | 'font';
  value: string | boolean | number;
  options?: { value: string; label: string }[];
  cssVar?: '--font-sans-custom' | '--font-mono-custom';
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
