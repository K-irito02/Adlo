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

export interface AppPreferencePatch {
  language?: LanguageCode;
  themeMode?: ThemeMode;
}

export interface ConfigSnapshot {
  language: LanguageCode;
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  logLevel: LogLevel;
  maxRecentWorkspaces: number;
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
  name: "main" | "worker" | "storage" | "recovery" | "migration";
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
