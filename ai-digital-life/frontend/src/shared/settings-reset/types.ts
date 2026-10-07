import type { IpcError, IpcResult } from '@ai-digital-life/kernel';

/** 「恢复全部默认」的执行单元（顺序即 UI 展示顺序）。 */
export type GroupKey = 'preferences' | 'browser' | 'dsh' | 'storage';

/**
 * 组级恢复的失败步骤码（内部契约，绝不展示给用户）：编排器与各组执行器的
 * 魔法字面量统一受此联合约束，拼写错误 / 重命名漏改可被编译器拦下。
 */
export type GroupResetStep =
  | 'preferences'
  | 'unexpected'
  | 'suspend'
  | 'downloadMode'
  | 'downloadPath'
  | 'downloadPathSwitch'
  | 'saveSourceConfig'
  | 'corePaths'
  | 'corePathsPreflight'
  | 'treeCache';

export type GroupResetResult =
  | { ok: true }
  | { ok: false; failedStep: GroupResetStep; error?: IpcError };

/** 下载路径恢复的失败步骤（仅下载族；为 `GroupResetStep` 的下载子集）。 */
export type DownloadResetStep = 'downloadPath' | 'downloadPathSwitch';

/** 下载路径恢复纯序列的结果：失败步骤必属下载族，调用方可安全选用下载族失败文案。 */
export type DownloadPathResetResult =
  | { ok: true }
  | { ok: false; failedStep: DownloadResetStep; error?: IpcError };

/** 下载路径恢复的纯序列依赖（由调用方注入 store action，本模块不 import stores）。 */
export interface DownloadPathResetDeps {
  changeDownloadPath: (path: string, migrate: boolean) => Promise<IpcResult<void>>;
  updateDownloadSettings: (
    mode?: string,
    defaultPath?: string,
    autoMigrate?: boolean,
  ) => Promise<IpcResult<void>>;
}
