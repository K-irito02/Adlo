import type { IpcResult } from '@ai-digital-life/kernel';

export type EnvSourceMode = 'auto' | 'system' | 'host' | 'custom';
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
export type EnvTaskKind = `env-${string}-install` | `env-${string}-uninstall`;
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
  /** 环境检测使用的数据根（后端 `storage.paths().root`），助手据此定位 env-hosted/。 */
  dataDir: string;
  dshReady: boolean;
}
export interface EnvBridge {
  getStatus: () => Promise<IpcResult<EnvStatus>>;
  /** 后端已接受的安装请求（`{started:true}`）；终态经 `/env/status` 的 task 轮询。 */
  install: (dep: string, version?: string) => Promise<IpcResult<{ started: boolean }>>;
  /** 后端已接受的卸载请求（`{started:true}`）；终态经 `/env/status` 的 task 轮询。 */
  uninstall: (dep: string, version?: string) => Promise<IpcResult<{ started: boolean }>>;
  selectSource: (dep: string, mode: EnvSourceMode) => Promise<IpcResult<boolean>>;
  setCustomPath: (dep: string, path: string) => Promise<IpcResult<boolean>>;
  /** 重检请求已受理（`{started:true}`）；结果经后续状态刷新/轮询读取。 */
  recheck: (dep?: string) => Promise<IpcResult<{ started: boolean }>>;
}
