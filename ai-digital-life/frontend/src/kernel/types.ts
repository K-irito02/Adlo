import type { APP_STATE_SCHEMA_VERSION } from './constants';

// ════════════════════════════════════════════════════════
// Config / Preferences
// ════════════════════════════════════════════════════════

// 本地导入 ConfigSnapshot/AgentSiteAllowEntry 供手写接口引用（re-export 不会把类型引入本地作用域）
import type { AgentSiteAllowEntry, ConfigSnapshot } from '../shared/ipc-types.generated';

// 废弃手写类型，统一使用 ts-rs 生成类型作为真源
export type {
  AgentSiteAllowEntry,
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

export type GitDivergeStatus = 'synced' | 'ahead' | 'behind' | 'diverged';

export type GitSwitchMode = 'local' | 'remote' | 'sync';

export interface GitBranchSummary {
  name: string;
  isCurrent: boolean;
  local: boolean;
  remote: boolean;
  hasStash: boolean;
  stashCount?: number;
  upstream?: string;
  ahead?: number;
  behind?: number;
  divergeStatus?: GitDivergeStatus;
  worktreePath?: string;
}

export interface WorktreeInfo {
  branch?: string;
  path: string;
  isMain: boolean;
  locked: boolean;
  prunable: boolean;
  head?: string;
}

export interface WorkspaceGitBranchSwitchInput {
  branchName: string;
  allowStash: boolean;
  mode?: GitSwitchMode;
}

export interface WorkspaceWorktreeEnsureInput {
  branchName: string;
  allowStash: boolean;
  mode?: GitSwitchMode;
}

export interface WorkspaceWorktreeEnsureResult {
  path: string;
  created: boolean;
  branch: string;
  gitSnapshot: GitSnapshot;
}

export interface WorkspaceWorktreeRemoveInput {
  branchName: string;
  force: boolean;
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

/**
 * `updatePreferences` 响应体（镜像 Rust `UpdatePreferencesResult`）：
 * 更新后的应用信息 + 本次被会话级 CLI/env 覆盖锁定的日志字段
 * （JSON 补丁名，如 `"logLevel"`）。被锁字段已落盘但运行期保持 CLI 值，
 * 调用方凭此弹"下次启动生效"提示。
 */
export interface UpdatePreferencesResult {
  info: AppInfo;
  sessionLockedFields: string[];
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

export type SettingsGroupId =
  | 'general'
  | 'workspace'
  | 'shortcuts'
  | 'terminal'
  | 'browser'
  | 'dsh'
  | 'storage'
  | 'openMethod';

export type SettingValue = string | boolean | number | string[] | AgentSiteAllowEntry[];

export interface SettingItem {
  id: string;
  groupId: SettingsGroupId;
  label: string;
  description?: string;
  type: 'toggle' | 'select' | 'input' | 'password' | 'readonly' | 'font' | 'allowlist';
  value: SettingValue;
  options?: { value: string; label: string }[];
  cssVar?: '--font-sans-custom' | '--font-mono-custom';
  disabled?: boolean;
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

// ════════════════════════════════════════════════════════
// Clipboard / System Monitor
// ════════════════════════════════════════════════════════

/**
 * 剪贴板条目类型 —— 与 Rust `ClipboardKind` 枚举（serde lowercase）的 JSON 取值一一对应，
 * 后端新增类型时需在此同步扩展联合。
 */
export type ClipboardKind = 'text' | 'image' | 'html' | 'rtf';

export interface ClipboardItem {
  id: string;
  kind: ClipboardKind;
  content?: string;
  /** 内容指纹：图片为像素哈希（去重），文本为 null */
  digest?: string | null;
  imagePath?: string;
  thumbPath?: string;
  imageWidth?: number;
  imageHeight?: number;
  /** 原图 PNG 文件体积（字节），供放大查看的"体积"读数；非图片或旧行为 undefined */
  imageBytes?: number;
  /** 富文本 HTML 载荷的 sidecar 文件路径 */
  htmlPath?: string;
  /** 富文本 RTF 载荷的 sidecar 文件路径 */
  rtfPath?: string;
  sourceApp?: string;
  createdAt: number;
}

export interface DiskStat {
  mount: string;
  total: number;
  available: number;
}

export interface NetStat {
  name: string;
  rxBps: number;
  txBps: number;
}

export interface ProcessStat {
  pid: number;
  name: string;
  cpuUsage: number;
  memory: number;
}

export interface SystemSnapshot {
  cpuTotal: number;
  cpuPerCore: number[];
  memoryUsed: number;
  memoryTotal: number;
  swapUsed: number;
  swapTotal: number;
  disks: DiskStat[];
  networks: NetStat[];
  processes: ProcessStat[];
  uptimeSecs: number;
}
