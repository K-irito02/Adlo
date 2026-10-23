import type { IpcResult } from '@ai-digital-life/kernel';

export type EnvSourceMode = 'auto' | 'system' | 'host';
export type EnvEffectiveSource = 'system' | 'host' | 'none';
export interface EnvDependencyState {
  mode: EnvSourceMode;
  effective: EnvEffectiveSource;
  origin: 'path' | 'registry' | 'bundled' | 'manual';
  installedVersion: string | null;
  baselineVersion: string;
  meetsBaseline: boolean;
  path: string | null;
  customPath?: string;
}
export interface EnvNetState {
  registryOk: boolean;
  registryLatencyMs: number;
  ciTokenConfigured: boolean;
}
// wire-exact: 后端 ProgressSnapshot 为 snake_case（Task 5 决议），前端照原样接收，不做 camelCase 映射
export type EnvTaskKind =
  | `env-${string}-install`
  | `env-${string}-uninstall`
  | `env-${string}-reinstall`;
export interface EnvTask {
  kind: EnvTaskKind;
  version: string;
  phase: 'preparing' | 'installing' | 'removing' | 'finalizing';
  /** 0-100；null 表示总量未知（不确定进度条）。 */
  percent: number | null;
  done: number;
  total: number;
  cancellable: boolean;
  error?: string | null;
}
export interface EnvStatus {
  node: EnvDependencyState;
  git: EnvDependencyState;
  bash: EnvDependencyState;
  webview2: EnvDependencyState;
  adlserver: EnvDependencyState;
  netprobe: EnvNetState;
  task: EnvTask | null;
  dshReady: boolean;
}
export interface EnvBridge {
  getStatus: () => Promise<IpcResult<EnvStatus>>;
  install: (dep: string, version?: string) => Promise<IpcResult<boolean>>;
  selectSource: (dep: string, mode: EnvSourceMode) => Promise<IpcResult<boolean>>;
  setCustomPath: (dep: string, path: string) => Promise<IpcResult<boolean>>;
  recheck: (dep?: string) => Promise<IpcResult<boolean>>;
}
