import type { IpcResult } from '@adlo/kernel';
import type { AppPreferencePatch } from '@shared/ipc-types.generated';
import { DEFAULT_BROWSER_SUSPEND_MS, DEFAULT_DOWNLOAD_MODE } from '@shared/defaultPreferences';
import { resetDownloadPathToDefault } from './downloadPathReset';
import type { DownloadPathResetDeps, GroupResetResult } from './types';

export interface BrowserResetDeps {
  updatePreferences: (patch: AppPreferencePatch) => Promise<boolean>;
  updateDownloadSettings: (
    mode?: string,
    defaultPath?: string,
    autoMigrate?: boolean,
  ) => Promise<IpcResult<void>>;
  downloadPath: DownloadPathResetDeps;
  /** 浏览器组还包含 localStorage 侧的共享 profile 开关；同步复位，无失败路径。 */
  resetShareProfile: () => void;
  /** 编排器无对话框快照，程序化流程取执行时实时的下载迁移开关。 */
  migrateAtOpen: boolean;
}

/**
 * 浏览器组恢复默认：共享 profile（复位开）→ 挂起时长 + 挂起白名单（开关关 + 清空）
 * → 下载模式 → 下载路径（含迁移开关复位）。任一步失败即返回 `failedStep` 并短路
 * 后续步；路径步的 `failedStep` 由其自身透传。
 */
export async function executeBrowserResetPlan(deps: BrowserResetDeps): Promise<GroupResetResult> {
  deps.resetShareProfile();
  const suspendOk = await deps.updatePreferences({
    browserInactiveTabSuspendMs: DEFAULT_BROWSER_SUSPEND_MS,
    browserSuspendWhitelistEnabled: false,
    browserSuspendWhitelist: [],
  });
  if (!suspendOk) {
    return { ok: false, failedStep: 'suspend' };
  }
  const mode = await deps.updateDownloadSettings(DEFAULT_DOWNLOAD_MODE);
  if (!mode.ok) {
    return { ok: false, failedStep: 'downloadMode', error: mode.error };
  }
  return resetDownloadPathToDefault(deps.downloadPath, deps.migrateAtOpen);
}
