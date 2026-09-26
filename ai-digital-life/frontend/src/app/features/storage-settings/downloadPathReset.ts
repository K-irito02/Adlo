import { useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { DOWNLOAD_REFRESH_FAILED } from '@stores/slices/browserDownloadsSlice';
import type { DownloadSettings } from '@shared/ipc/download';

/**
 * 下载路径是否全默认（路径空串 = 系统默认 + 迁移开关关闭）。
 * `loaded = false`（未成功回读）视为未知 → false，恢复按钮 fail-open 保持启用；
 * 「存储」与「浏览器」两组共用此口径，防漂移。
 */
export function isDownloadPathAtDefault(settings: DownloadSettings, loaded: boolean): boolean {
  return loaded && settings.default_path === '' && !settings.auto_migrate_on_path_change;
}

/**
 * 下载路径恢复默认的共享序列（单块/存储组级/浏览器组级共用，防漂移）：路径写回
 * 系统默认（空串，migrate 按调用方传入的开框快照）+ 开关复位关闭（解耦，成败都执行）。
 * 各自 toast；返回整体 ok。调用方决定后续：单块成功关框，组级记 failed 汇总。
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
      let ok = true;
      const result = await changeDownloadPath('', migrate);
      if (!result.ok) {
        showToast(
          result.error.message === DOWNLOAD_REFRESH_FAILED
            ? t.storageDownloadRefreshFailed
            : migrate
              ? t.storageDownloadMigrateFailed.replace(
                  '{error}',
                  result.error.message ?? t.storageUnknownError,
                )
              : t.storagePickFailed.replace(
                  '{error}',
                  result.error.message ?? t.storageUnknownError,
                ),
          'error',
        );
        ok = false;
      }
      const upd = await updateDownloadSettings(undefined, undefined, false);
      if (!upd.ok) {
        showToast(
          upd.error.message === DOWNLOAD_REFRESH_FAILED
            ? t.storageDownloadRefreshFailed
            : t.settingsUpdateFailed,
          'error',
        );
        ok = false;
      }
      return ok;
    },
    [changeDownloadPath, updateDownloadSettings, showToast, t],
  );

  return { resetDownloadToDefault };
}
