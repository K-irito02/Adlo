import type { IpcResult } from '@adlo/kernel';

/** `app_update_check` 的返回载荷（Rust 侧 `UpdateCheck`，camelCase）。 */
export interface AppUpdateCheckResult {
  /** 当前安装版本，取自壳层 `package_info`，与「关于」页同源。 */
  currentVersion: string;
  available: boolean;
  version: string | null;
  /** 已裁剪为纯文本首段；卡片不渲染 Markdown。 */
  notes: string | null;
  publishedAt: string | null;
  /** 命中的更新源 URL。 */
  source: string | null;
  /** 仅当所有来源都失败时给出。 */
  error: string | null;
}

/** 下载进度（`digital-life://app-update-progress`）。 */
export interface AppUpdateProgress {
  downloaded: number;
  total: number | null;
}

/**
 * 应用自身更新桥接能力。
 *
 * 只覆盖 Tauri 桌面端：浏览器模式没有可被替换的安装体，`supported` 为 `false`，
 * 所有方法返回失败、订阅为空操作（见 ADR-0026）。
 */
export interface UpdateBridge {
  readonly supported: boolean;
  /** @command app_update_check */
  check: () => Promise<IpcResult<AppUpdateCheckResult>>;
  /** 只下载、不安装；结果留在壳层内存里等用户点安装（ADR-0027）。 @command app_update_download */
  download: () => Promise<IpcResult<void>>;
  /** 安装已下载的更新；Windows 上会关闭应用并自动重启。 @command app_update_install */
  install: () => Promise<IpcResult<void>>;
  onProgress: (listener: (event: AppUpdateProgress) => void) => () => void;
  onInstalling: (listener: () => void) => () => void;
}
