import { useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { DOWNLOAD_REFRESH_FAILED } from '@stores/slices/browserDownloadsSlice';
import type { IpcError } from '@shared/ipc';
import type { CopyDict } from '@i18n';
import type { DownloadSettings } from '@shared/ipc/download';
import { resetDownloadPathToDefault } from '@shared/settings-reset/downloadPathReset';
import type { GroupResetStep } from '@shared/settings-reset/types';

/**
 * 下载路径是否全默认（路径空串 = 系统默认 + 迁移开关关闭）。
 * `loaded = false`（未成功回读）视为未知 → false，恢复按钮 fail-open 保持启用；
 * 「存储」与「浏览器」两组共用此口径，防漂移。
 */
export function isDownloadPathAtDefault(settings: DownloadSettings, loaded: boolean): boolean {
  return loaded && settings.default_path === '' && !settings.auto_migrate_on_path_change;
}

/** 下载恢复分支变体（Phase 4 R2-R10-L2 抽取，块级对话框与组级清单同源，防漂移）。
 * `migrateOverride`：块级对话框传开框快照开关（M4-R：展示文案与搬运行为同源）；
 * 组级清单用实时值（不传）。 */
export type DownloadResetVariant = 'on' | 'off' | 'switchOnly' | 'hidden';
export function downloadResetBlockVariant(
  settings: DownloadSettings,
  loaded: boolean,
  migrateOverride?: boolean,
): DownloadResetVariant {
  if (isDownloadPathAtDefault(settings, loaded)) {
    return 'hidden';
  }
  const migrate = migrateOverride ?? settings.auto_migrate_on_path_change;
  if (settings.default_path !== '') {
    return migrate ? 'on' : 'off';
  }
  return migrate ? 'switchOnly' : 'off';
}

/**
 * 下载路径恢复失败的提示文案（路径步三分支：刷新失败 / 迁移失败 / 选取失败；
 * 开关步两分支：刷新失败 / 通用失败）。与改造前逐字一致，单块、存储组级与浏览器组级
 * 共用，防文案漂移。`migrate` 取调用方的开框快照（块级）或组级对话框快照。
 * 非下载路径家族的步骤（挂起 / 下载模式）不经过此函数：其失败恒为通用失败文案。
 */
export function downloadResetFailureCopy(
  t: CopyDict,
  failedStep: GroupResetStep,
  error: IpcError | undefined,
  migrate: boolean,
): string {
  if (error?.message === DOWNLOAD_REFRESH_FAILED) {
    return t.storageDownloadRefreshFailed;
  }
  if (failedStep !== 'downloadPath') {
    return t.settingsUpdateFailed;
  }
  if (migrate) {
    return formatT(t, 'storageDownloadMigrateFailed', {
      error: error?.message ?? t.storageUnknownError,
    });
  }
  return formatT(t, 'storagePickFailed', { error: error?.message ?? t.storageUnknownError });
}

/**
 * 下载路径恢复默认的共享序列（单块/存储组级/浏览器组级共用，防漂移）：写盘序列委托
 * 给 `resetDownloadPathToDefault`（路径写回系统默认 + 开关复位，解耦，成败都执行），
 * 本 hook 仅按返回的 `failedStep` 呈现失败文案；返回整体 ok。调用方决定后续：
 * 单块成功关框，组级记 failed 汇总。
 */
export function useDownloadPathReset(): {
  resetDownloadToDefault: (migrate: boolean) => Promise<boolean>;
} {
  const changeDownloadPath = useAppStore((s) => s.changeDownloadPath);
  const updateDownloadSettings = useAppStore((s) => s.updateDownloadSettings);
  const showToast = useAppStore((s) => s.showToast);
  const { t } = useTCopy();

  const resetDownloadToDefault = useCallback(
    async (migrate: boolean): Promise<boolean> => {
      const result = await resetDownloadPathToDefault(
        { changeDownloadPath, updateDownloadSettings },
        migrate,
      );
      if (result.ok) {
        return true;
      }
      showToast(downloadResetFailureCopy(t, result.failedStep, result.error, migrate), 'error');
      return false;
    },
    [changeDownloadPath, updateDownloadSettings, showToast, t],
  );

  return { resetDownloadToDefault };
}
