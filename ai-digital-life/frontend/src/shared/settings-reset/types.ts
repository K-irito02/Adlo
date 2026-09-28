import type { IpcError, IpcResult } from '@ai-digital-life/kernel';

/** 「恢复全部默认」的执行单元（顺序即 UI 展示顺序）。 */
export type GroupKey = 'preferences' | 'browser' | 'dsh' | 'storage';

export type GroupResetResult = { ok: true } | { ok: false; failedStep: string; error?: IpcError };

/** 下载路径恢复的纯序列依赖（由调用方注入 store action，本模块不 import stores）。 */
export interface DownloadPathResetDeps {
  changeDownloadPath: (path: string, migrate: boolean) => Promise<IpcResult<void>>;
  updateDownloadSettings: (
    mode?: string,
    defaultPath?: string,
    autoMigrate?: boolean,
  ) => Promise<IpcResult<void>>;
}
