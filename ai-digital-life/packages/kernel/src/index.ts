import crypto from "node:crypto";
import path from "node:path";

export const APP_NAME = "AI Digital Life";
export const APP_VERSION = "0.1.0";
export const APP_STATE_SCHEMA_VERSION = "1";
export const APPROVAL_POLICY_MODE = "manual";

export const EVENT_NAMES = {
  appInitialized: "app.initialized",
  appShutdown: "app.shutdown",
  configChanged: "config.changed",
  workspaceOpened: "workspace.opened",
  workspaceClosed: "workspace.closed",
  sessionRestored: "session.restored",
  retrievalStatusChanged: "retrieval.status-changed",
  taskUpserted: "task.upserted",
  approvalRequested: "approval.requested",
  approvalDecided: "approval.decided"
} as const;

export const ERROR_CODES = {
  invalidInput: "INVALID_INPUT",
  invalidWorkspace: "INVALID_WORKSPACE",
  notFound: "NOT_FOUND",
  stateReadFailed: "STATE_READ_FAILED",
  stateWriteFailed: "STATE_WRITE_FAILED",
  workerUnavailable: "WORKER_UNAVAILABLE",
  internal: "INTERNAL_ERROR"
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface IpcError {
  code: ErrorCode | string;
  message: string;
}

export type IpcResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: IpcError;
    };

export function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

export function err<T>(code: ErrorCode | string, message: string): IpcResult<T> {
  return { ok: false, error: { code, message } };
}

export abstract class AppError extends Error {
  readonly code: ErrorCode | string;

  protected constructor(code: ErrorCode | string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(ERROR_CODES.invalidInput, message, options);
  }
}

export class WorkspaceError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(ERROR_CODES.invalidWorkspace, message, options);
  }
}

export class StateStoreError extends AppError {
  constructor(code: ErrorCode, message: string, options?: ErrorOptions) {
    super(code, message, options);
  }
}

export type Result<T, E = Error> =
  | {
      success: true;
      value: T;
    }
  | {
      success: false;
      error: E;
    };

export function resultOk<T>(value: T): Result<T> {
  return { success: true, value };
}

export function resultErr<E>(error: E): Result<never, E> {
  return { success: false, error };
}

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
export type LanguageCode = "zh-CN" | "en-US";
export type LogLevel = "debug" | "info" | "warn" | "error";
export type ModelProviderId = "deepseek" | "minimax";

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

export type WorkspaceType = "node" | "python" | "java" | "go" | "rust" | "unknown";
export type WorkspaceStatus = "initializing" | "ready" | "indexing" | "degraded" | "error" | "closed";

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

export type SessionStatus = "active" | "paused" | "completed" | "archived";

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

export type HealthStatus = "healthy" | "degraded" | "unavailable";

export interface HealthComponent {
  name: "main" | "worker" | "storage" | "recovery" | "migration" | "models";
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
  change: "none" | "upgrade";
  fromVersion?: string;
  toVersion: string;
  backupPath?: string;
  executedScripts: Array<{
    scriptId: string;
    status: "pending" | "running" | "completed" | "failed" | "rolled-back";
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

export type RetrievalStatus = "idle" | "running" | "completed" | "failed";

export interface RetrievalFileTypeCount {
  extension: string;
  count: number;
}

export interface RepoMapEntry {
  path: string;
  type: "file" | "directory";
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

export type TaskStatus =
  | "pending"
  | "waiting-approval"
  | "approved"
  | "running"
  | "completed"
  | "failed"
  | "rejected"
  | "rolled-back";

export type RiskLevel = "low" | "medium" | "high";

export interface TaskOperation {
  kind: string;
  target?: string;
  params: Record<string, unknown>;
  riskLevel: RiskLevel;
  reversible: boolean;
}

export interface TaskRecord {
  id: string;
  workspaceId: string;
  sessionId: string;
  type: string;
  description: string;
  status: TaskStatus;
  priority: "low" | "medium" | "high" | "critical";
  operations: TaskOperation[];
  approvalId?: string;
  checkpointId?: string;
  resultJson?: string;
  errorJson?: string;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface TaskSummary {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  riskLevel: RiskLevel;
  updatedAt: number;
  detail: string;
}

export interface ApprovalRequestSummary {
  id: string;
  taskId: string;
  title: string;
  description: string;
  riskLevel: RiskLevel;
  impact: string[];
  reversible: boolean;
  createdAt: number;
  expiresAt?: number;
}

export interface ApprovalRecord {
  id: string;
  taskId: string;
  workspaceId: string;
  riskLevel: RiskLevel;
  request: ApprovalRequestSummary;
  decision?: "approved" | "rejected" | "timeout";
  reason?: string;
  approvedBy?: string;
  createdAt: number;
  decidedAt?: number;
  expiresAt?: number;
}

export interface AuditRecord {
  id: string;
  entityType: "task" | "approval" | "workspace" | "session";
  entityId: string;
  action: string;
  detail: string;
  createdAt: number;
}

export interface CheckpointRecord {
  id: string;
  sessionId: string;
  workspaceId: string;
  type: "approval-anchor" | "workspace-open" | "retrieval-anchor";
  description: string;
  manifest: Record<string, unknown>;
  createdAt: number;
}

export interface CheckpointPayloadAsset {
  path: string;
  kind: "file" | "directory";
  status: "captured" | "missing";
  size?: number;
  snapshotPath?: string;
}

export interface CheckpointPayloadPreview {
  checkpointId: string;
  manifestPath: string;
  rootPath?: string;
  assetCount: number;
  assets: CheckpointPayloadAsset[];
}

export interface ApprovalPolicySummary {
  mode: "manual";
  summary: string;
  highRiskRules: string[];
}

export interface TaskCenterSnapshot {
  tasks: TaskSummary[];
  pendingApprovals: ApprovalRequestSummary[];
  policy: ApprovalPolicySummary;
  currentSession?: SessionMeta;
  latestCheckpoint?: CheckpointRecord;
}

export type ConversationRole = "system" | "user" | "assistant" | "tool";
export type ConversationBlockType =
  | "markdown"
  | "plan"
  | "tool-call"
  | "approval"
  | "patch-summary"
  | "validation-result"
  | "final-summary";

export interface ConversationBlockBase {
  id: string;
  type: ConversationBlockType;
}

export interface MarkdownConversationBlock extends ConversationBlockBase {
  type: "markdown";
  text: string;
}

export interface PlanConversationBlock extends ConversationBlockBase {
  type: "plan";
  title: string;
  items: Array<{
    id: string;
    title: string;
    detail?: string;
    status: "pending" | "running" | "completed" | "failed";
  }>;
}

export interface ToolCallConversationBlock extends ConversationBlockBase {
  type: "tool-call";
  toolName: string;
  summary: string;
  status: "pending" | "running" | "completed" | "failed";
}

export interface ApprovalConversationBlock extends ConversationBlockBase {
  type: "approval";
  title: string;
  riskLevel: RiskLevel;
  summary: string;
}

export interface PatchSummaryConversationBlock extends ConversationBlockBase {
  type: "patch-summary";
  patchSetId: string;
  summary: string;
  fileCount: number;
  hunkCount: number;
}

export interface ValidationResultConversationBlock extends ConversationBlockBase {
  type: "validation-result";
  summary: string;
  status: "passed" | "failed" | "skipped";
  diagnostics: DiagnosticSummary[];
}

export interface FinalSummaryConversationBlock extends ConversationBlockBase {
  type: "final-summary";
  summary: string;
}

export type ConversationBlock =
  | MarkdownConversationBlock
  | PlanConversationBlock
  | ToolCallConversationBlock
  | ApprovalConversationBlock
  | PatchSummaryConversationBlock
  | ValidationResultConversationBlock
  | FinalSummaryConversationBlock;

export interface ConversationSessionRecord {
  id: string;
  workspaceId: string;
  title: string;
  status: "active" | "archived";
  isPinned: boolean;
  pinnedOrder: number;
  unpinnedOrder: number;
  manualUnread: boolean;
  lastReadAt?: number;
  archivedAt?: number;
  titleUpdatedAt?: number;
  createdAt: number;
  updatedAt: number;
  lastMessageAt: number;
}

export type SidebarOrderBucket = "pinned" | "unpinned";

export interface ReorderWorkspacesInput {
  pinnedIds: string[];
  unpinnedIds: string[];
}

export interface ReorderSessionsInput {
  workspaceId: string;
  pinnedIds: string[];
  unpinnedIds: string[];
}

export interface ConversationMessageRecord {
  id: string;
  sessionId: string;
  role: ConversationRole;
  content: string;
  blocks: ConversationBlock[];
  runId?: string;
  createdAt: number;
}

export interface ConversationDetail {
  session: ConversationSessionRecord;
  messages: ConversationMessageRecord[];
}

export interface ConversationSendResult {
  session: ConversationSessionRecord;
  userMessage: ConversationMessageRecord;
  assistantMessage: ConversationMessageRecord;
  runDetail: AgentRunDetail;
  patchSet?: PatchSet;
}

export type ConversationScenario = "chat" | "plan" | "code-edit";

export interface ModelDescriptor {
  providerId: ModelProviderId;
  modelId: string;
  displayName: string;
  priority: number;
  capabilities: Array<"chat" | "stream" | "code">;
}

export interface ModelChatMessage {
  role: ConversationRole;
  content: string;
}

export interface ModelTokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimated?: boolean;
}

export interface ModelRouteDecision {
  reason: string;
  chain: string[];
  synthetic?: boolean;
}

export interface ModelResponse {
  providerId: ModelProviderId;
  modelId: string;
  content: string;
  synthetic: boolean;
  requestId?: string;
  usage?: ModelTokenUsage;
  route?: ModelRouteDecision;
}

/** Main → Renderer: versioned model stream envelope (no secrets). */
export type DigitalLifeModelStreamEventV1 =
  | { v: 1; runId: string; seq: number; type: "delta"; text: string }
  | {
      v: 1;
      runId: string;
      seq: number;
      type: "route";
      providerId: ModelProviderId;
      modelId: string;
      reason: string;
    }
  | { v: 1; runId: string; seq: number; type: "usage"; usage: ModelTokenUsage }
  | { v: 1; runId: string; seq: number; type: "error"; message: string }
  | { v: 1; runId: string; seq: number; type: "done" };

export interface ModelCallAuditRecord {
  id: string;
  requestId: string;
  workspaceId: string;
  sessionId: string;
  runId?: string;
  providerId: ModelProviderId;
  modelId: string;
  scenario: ConversationScenario;
  routeMeta: ModelRouteDecision;
  promptTokens?: number | null;
  completionTokens?: number | null;
  latencyMs: number;
  error?: string;
  streamed: boolean;
  createdAt: number;
}

export interface ProviderHealthStatus {
  providerId: ModelProviderId;
  healthy: boolean;
  detail: string;
}

export interface ModelGatewayHealthSnapshot {
  checkedAt: number;
  providers: ProviderHealthStatus[];
}

export interface PromptRule {
  id: string;
  kind: "platform" | "project" | "session" | "workflow-phase" | "tool-contract" | "output-contract";
  content: string;
}

export interface ContextEntry {
  id: string;
  type: "file" | "search-hit" | "outline" | "diagnostic" | "message";
  label: string;
  content: string;
  tokenEstimate: number;
  path?: string;
}

export type PatchHunkDecision = "pending" | "accepted" | "rejected";
export type PatchSetStatus = "draft" | "ready" | "applying" | "applied" | "failed" | "rolled-back";

export interface PatchHunk {
  id: string;
  filePatchId: string;
  patchSetId: string;
  relativePath: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  preview: string;
  beforeText: string;
  afterText: string;
  decision: PatchHunkDecision;
}

export interface FilePatch {
  id: string;
  patchSetId: string;
  relativePath: string;
  language?: string;
  beforeContent: string;
  afterContent: string;
  hunks: PatchHunk[];
}

export interface PatchSet {
  id: string;
  workspaceId: string;
  sessionId: string;
  runId?: string;
  title: string;
  summary: string;
  status: PatchSetStatus;
  checkpointId?: string;
  filePatches: FilePatch[];
  createdAt: number;
  updatedAt: number;
}

export type AgentRunStatus =
  | "draft"
  | "planning"
  | "ready"
  | "executing"
  | "waiting-approval"
  | "applying"
  | "verifying"
  | "succeeded"
  | "failed"
  | "rolled-back"
  | "aborted";

export interface AgentPlanStep {
  id: string;
  runId: string;
  title: string;
  detail?: string;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: number;
  updatedAt: number;
}

export interface AgentRunRecord {
  id: string;
  workspaceId: string;
  sessionId: string;
  prompt: string;
  scenario: ConversationScenario;
  status: AgentRunStatus;
  summary?: string;
  patchSetId?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface AgentRunDetail {
  run: AgentRunRecord;
  steps: AgentPlanStep[];
}

export type CommandProfile = "build" | "test" | "lint" | "install" | "custom";

export interface CommandRequest {
  id: string;
  workspaceId: string;
  runId?: string;
  profile: CommandProfile;
  command: string;
  args: string[];
  shell: boolean;
  riskLevel: RiskLevel;
  createdAt: number;
}

export interface CommandExecutionResult {
  request: CommandRequest;
  exitCode: number | null;
  signal?: string;
  stdout: string;
  stderr: string;
  summary: string;
  success: boolean;
  startedAt: number;
  completedAt: number;
}

export interface CommandRunResult {
  status: "completed" | "waiting-approval";
  taskId: string;
  request: CommandRequest;
  result?: CommandExecutionResult;
  approvalRequest?: ApprovalRequestSummary;
}

/** Main → Renderer: versioned terminal stream (no env vars or secrets). */
export type DigitalLifeTerminalStreamEventV1 =
  | { v: 1; executionId: string; seq: number; type: "stdout"; text: string }
  | { v: 1; executionId: string; seq: number; type: "stderr"; text: string }
  | {
      v: 1;
      executionId: string;
      seq: number;
      type: "done";
      exitCode: number | null;
      success: boolean;
      summary: string;
      signal?: string;
    }
  | { v: 1; executionId: string; seq: number; type: "error"; message: string };

/** Result of starting a governed terminal stream (approval gate same as `command:run`). */
export type CommandRunStreamStart =
  | { mode: "waiting-approval"; taskId: string; request: CommandRequest; approvalRequest: ApprovalRequestSummary }
  | { mode: "started"; executionId: string; taskId: string; request: CommandRequest };

export interface DiagnosticSummary {
  id: string;
  source: "typescript" | "vite" | "eslint" | "vitest" | "jest" | "system";
  severity: "info" | "warning" | "error";
  message: string;
  path?: string;
  line?: number;
  column?: number;
}

export interface ValidationResult {
  id: string;
  workspaceId: string;
  runId?: string;
  patchSetId?: string;
  status: "passed" | "failed" | "skipped";
  summary: string;
  diagnostics: DiagnosticSummary[];
  createdAt: number;
}

export interface PatchApplicationResult {
  patchSet: PatchSet;
  repairPatchSet?: PatchSet;
  validation?: ValidationResult;
  commandResult?: CommandExecutionResult;
  rolledBack: boolean;
}

export interface WorkspaceSearchHit {
  path: string;
  line: number;
  preview: string;
}

export interface WorkspaceFileDocument {
  path: string;
  content: string;
  lastModifiedAt: number;
}

export interface WorkspaceFileChangedEvent {
  path: string;
  lastModifiedAt: number;
}

export interface WorkspaceTreeNode {
  path: string;
  name: string;
  kind: "file" | "directory";
  children: WorkspaceTreeNode[];
}

export interface FileOutlineItem {
  id: string;
  label: string;
  kind: "function" | "class" | "interface" | "type" | "const" | "heading";
  line: number;
}

export interface ToolInvocationRecord {
  id: string;
  runId: string;
  toolName: string;
  summary: string;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: number;
  updatedAt: number;
}

export interface BaseEvent<TType extends string = string, TPayload = Record<string, unknown>> {
  type: TType;
  timestamp: number;
  payload: TPayload;
}

export function defaultWindowState(): WindowState {
  return {
    width: 1280,
    height: 800,
    isMaximized: false
  };
}

export function defaultAppState(): AppStateV1 {
  return {
    schemaVersion: APP_STATE_SCHEMA_VERSION,
    recentWorkspaces: [],
    windowState: defaultWindowState()
  };
}

export function normalizePath(inputPath: string): string {
  return path.normalize(inputPath);
}

export function isChildPath(parentPath: string, childPath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function createWorkspaceId(workspacePath: string): string {
  return crypto.createHash("sha1").update(normalizePath(workspacePath)).digest("hex");
}

export function createId(prefix?: string): string {
  return prefix ? `${prefix}_${crypto.randomUUID()}` : crypto.randomUUID();
}

export function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export function sanitizeSensitiveData<T>(value: T): T {
  const sensitiveKeys = ["token", "apiKey", "password", "authorization", "secret"];

  function walk(input: unknown): unknown {
    if (Array.isArray(input)) {
      return input.map((item) => walk(item));
    }

    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>).map(([key, childValue]) => {
          if (sensitiveKeys.some((candidate) => key.toLowerCase().includes(candidate.toLowerCase()))) {
            return [key, "[REDACTED]"];
          }

          return [key, walk(childValue)];
        })
      );
    }

    return input;
  }

  return walk(value) as T;
}

export function toUserMessage(error: unknown): IpcError {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message
    };
  }

  if (error instanceof Error) {
    return {
      code: ERROR_CODES.internal,
      message: error.message
    };
  }

  return {
    code: ERROR_CODES.internal,
    message: "Unknown error."
  };
}
