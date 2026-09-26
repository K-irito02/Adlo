import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { DEFAULT_DOWNLOAD_MODE } from '@shared/defaultPreferences';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { SettingsSelect } from '../../components/settings/SettingsSelect';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { IconResetDefaults } from '../../icons';

/**
 * 「下载设置」块（下载模式）：块级 header（恢复默认图标 + 主标题）在卡片之外，
 * 卡内副标题「下载模式」+ 合并后的描述（原块描述与行描述合成一句）。
 * 恢复默认经确认对话框写自动保存（settingsResetGroupConfirm* 通用键，
 * WorkspaceSettings 块级确认同源）；失败保持对话框供重试。
 *
 * @param onOpenChange 确认对话框开合通知：父级（浏览器组）把它纳入组级恢复的
 * 入口守卫，避免键盘路径多框叠加（与 DownloadPathBlock 同构）。
 */
export function BrowserDownloadSettings({
  onOpenChange,
}: {
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTCopy();
  const downloadSettings = useAppStore((s) => s.downloadSettings);
  const downloadSettingsLoaded = useAppStore((s) => s.downloadSettingsLoaded);
  const isLoadingSettings = useAppStore((s) => s.isLoadingSettings);
  const updateDownloadSettings = useAppStore((s) => s.updateDownloadSettings);
  const showToast = useAppStore((s) => s.showToast);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    onOpenChange?.(confirm);
  }, [confirm, onOpenChange]);

  const isAutoSave = downloadSettings.mode === DEFAULT_DOWNLOAD_MODE;
  /** 恢复默认可用性：加载未知/失败 → 未知不禁用（fail-open）。 */
  const atDefault = downloadSettingsLoaded && isAutoSave;

  const applyMode = useCallback(
    async (auto: boolean): Promise<boolean> => {
      const result = await updateDownloadSettings(auto ? DEFAULT_DOWNLOAD_MODE : 'ask');
      if (!result.ok) {
        showToast(t.settingsUpdateFailed, 'error');
      }
      return result.ok;
    },
    [updateDownloadSettings, showToast, t],
  );

  const handleSelectChange = useCallback(
    (v: string) => {
      void applyMode(v === 'auto');
    },
    [applyMode],
  );

  /** 恢复默认确认：写自动保存；成功才关框，失败保持打开供检查/重试。 */
  const handleResetConfirm = useCallback(() => {
    void applyMode(true).then((ok) => {
      if (ok) {
        setConfirm(false);
      }
    });
  }, [applyMode]);

  // options 身份稳定，避免下游 SettingsSelect 订阅 effect 每渲染重绑监听。
  const selectOptions = useMemo(
    () => [
      { value: 'auto', label: t.browserDownloadSettingsModeAuto },
      { value: 'ask', label: t.browserDownloadSettingsModeAsk },
    ],
    [t.browserDownloadSettingsModeAuto, t.browserDownloadSettingsModeAsk],
  );

  const resetLabel = formatT(t, 'settingsResetGroupToDefault', {
    group: t.browserDownloadSettingsTitle,
  });

  return (
    <>
      <div className="adl-settings-browser__header adl-settings-browser__header--section">
        <button
          type="button"
          className="adl-settings-row__reset"
          aria-label={resetLabel}
          title={resetLabel}
          data-testid="download-mode-reset"
          disabled={atDefault}
          onClick={() => setConfirm(true)}
        >
          <IconResetDefaults size={14} decorative />
        </button>
        <SettingsHeader title={t.browserDownloadSettingsTitle} />
      </div>
      <div className="adl-settings-card adl-browser-settings">
        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <span>{t.browserDownloadSettingsMode}</span>
            </div>
            <small>{t.browserDownloadSettingsModeHint}</small>
          </div>
          <div className="adl-settings-row__control">
            <SettingsSelect
              value={isAutoSave ? 'auto' : 'ask'}
              options={selectOptions}
              onChange={handleSelectChange}
              label={t.browserDownloadSettingsMode}
              disabled={isLoadingSettings}
            />
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        title={formatT(t, 'settingsResetGroupConfirmTitle', {
          group: t.browserDownloadSettingsTitle,
        })}
        message={formatT(t, 'settingsResetGroupConfirmMessage', {
          group: t.browserDownloadSettingsTitle,
        })}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        onConfirm={handleResetConfirm}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}
