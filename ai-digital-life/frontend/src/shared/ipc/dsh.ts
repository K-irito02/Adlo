import type { IpcResult } from '@ai-digital-life/kernel';

export type { IpcResult };

/**
 * dsh（DeepSeek Harness）宿主壳桥接能力。
 * 业务逻辑位于 `crates/server` 的 `/dsh/*` HTTP handler（httpBridge 直连）。
 * 用于: 拉起/关闭 dsh 进程、查询/升级/回退/卸载/重装 dsh cli 版本。
 */
export interface DshBridge {
  /**
   * 拉起 dsh 进程并返回就绪信息（已运行时返回已有 URL）
   * @returns 就绪 URL + 是否释放过被残留 dsh 占用的默认端口，如 http://127.0.0.1:<port>
   * @see httpBridge.ts → dsh.open (/dsh/open)
   */
  open: () => Promise<IpcResult<DshOpenResult>>;
  /**
   * 关闭 dsh。keep=true 保留进程运行；keep=false 停进程
   * @see httpBridge.ts → dsh.close (/dsh/close)
   */
  close: (keep: boolean) => Promise<IpcResult<boolean>>;
  /**
   * 查询 dsh 版本目录状态（当前选中/已装列表/最新可用/是否有更新）
   * @see httpBridge.ts → dsh.getVersionStatus (/dsh/get-version-status)
   */
  getVersionStatus: () => Promise<IpcResult<DshVersionStatus>>;
  /**
   * 升级 dsh 到最新可用版本，返回新版本串
   * @see httpBridge.ts → dsh.update (/dsh/update)
   */
  update: () => Promise<IpcResult<string>>;
  /**
   * 回退到指定已装版本，返回该版本串
   * @see httpBridge.ts → dsh.revert (/dsh/revert)
   */
  revert: (version: string) => Promise<IpcResult<string>>;
  /**
   * 卸载指定版本
   * @see httpBridge.ts → dsh.uninstall (/dsh/uninstall)
   */
  uninstall: (version: string) => Promise<IpcResult<boolean>>;
  /**
   * 按当前选中版本重装最新可用版本，返回新版本串
   * @see httpBridge.ts → dsh.reinstall (/dsh/reinstall)
   */
  reinstall: () => Promise<IpcResult<string>>;
}

/**
 * `/dsh/open` 结果：就绪 URL + 是否因端口被残留 dsh 占用而自动释放过进程。
 */
export interface DshOpenResult {
  url: string | null;
  freedPort: boolean;
}

/**
 * dsh 版本目录状态（与 Rust `adl_dsh_version::VersionStatus` serde camelCase 对齐）
 */
export interface DshVersionStatus {
  currentSelected: string | null;
  installed: string[];
  latestAvailable: string | null;
  hasUpdate: boolean;
}
