import crypto from "node:crypto";
import path from "node:path";

export const APP_NAME = "AI Digital Life";
export const APP_VERSION = "0.1.0";
export const APP_STATE_SCHEMA_VERSION = "1";

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

export interface WorkspaceMeta {
  id: string;
  path: string;
  rootPath: string;
  name: string;
  lastOpenedAt: number;
  status: "ready";
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
}

export type HealthStatus = "healthy" | "degraded" | "unavailable";

export interface HealthComponent {
  name: "main" | "worker" | "storage";
  status: HealthStatus;
  detail: string;
  updatedAt: number;
}

export interface HealthSnapshot {
  timestamp: number;
  components: HealthComponent[];
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
