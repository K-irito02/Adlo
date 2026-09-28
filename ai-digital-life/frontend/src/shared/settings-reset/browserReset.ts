import type { IpcResult } from '@ai-digital-life/kernel';
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
  /** 编排器无对话框快照，程序化流程取执行时实时的下载迁移开关。 */
  migrateAtOpen: boolean;
}

/**
 * 浏览器组恢复默认：挂起时长 → 下载模式 → 下载路径（含迁移开关复位）。
 * 任一步失败即返回 `failedStep` 并短路后续步；路径步的 `failedStep` 由其自身透传。
 */
export async function executeBrowserResetPlan(deps: BrowserResetDeps): Promise<GroupResetResult> {
  const suspendOk = await deps.updatePreferences({
    browserInactiveTabSuspendMs: DEFAULT_BROWSER_SUSPEND_MS,
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
