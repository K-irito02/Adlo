import type {
  DshResolvedSource,
  DshVersionCatalog,
  DshVersionSourceMode,
  DshVersionStatus,
  DshVersionTaskResult,
} from './dsh';
import type { IpcResult } from '@ai-digital-life/kernel';

/**
 * OpenCode CLI 的版本管理桥接。
 *
 * 版本状态/目录/任务的形状与 DSH 完全相同（同一套 `adl_harness_version` 内核），
 * 因此直接复用 `DshVersion*` 形状；OpenCode 没有运行态（端口/标签/auth）。
 */
export interface OpencodeSystemInfo {
  path: string;
  version: string | null;
}

export interface OpencodeVersionSource {
  mode: DshVersionSourceMode;
  effective: DshResolvedSource;
  resolvedByMode: Record<DshVersionSourceMode, DshResolvedSource>;
  hostVersion: string | null;
}

export interface OpencodeSourceStatus {
  system: OpencodeSystemInfo | null;
  versionSource: OpencodeVersionSource;
  config: { version_source: DshVersionSourceMode };
}

export interface OpencodeBridge {
  getVersionTask: () => Promise<IpcResult<DshVersionTaskResult>>;
  cancelVersionTask: () => Promise<IpcResult<boolean>>;
  getVersionStatus: () => Promise<IpcResult<DshVersionStatus>>;
  getVersionCatalog: () => Promise<IpcResult<DshVersionCatalog>>;
  installVersion: (version: string, select?: boolean) => Promise<IpcResult<string>>;
  update: () => Promise<IpcResult<string>>;
  revert: (version: string) => Promise<IpcResult<string>>;
  uninstall: (version: string) => Promise<IpcResult<boolean>>;
  reinstall: () => Promise<IpcResult<string>>;
  getSourceStatus: () => Promise<IpcResult<OpencodeSourceStatus>>;
  saveVersionSource: (mode: DshVersionSourceMode) => Promise<IpcResult<boolean>>;
}
