import { useCallback, useMemo } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { SettingsSelect } from '../../components/settings/SettingsSelect';

export function BrowserDownloadSettings() {
  const { t } = useTCopy();
  const downloadSettings = useAppStore((s) => s.downloadSettings);
  const isLoadingSettings = useAppStore((s) => s.isLoadingSettings);
  const updateDownloadSettings = useAppStore((s) => s.updateDownloadSettings);
  const showToast = useAppStore((s) => s.showToast);

  const isAutoSave = downloadSettings.mode === 'auto';

  const handleModeChange = useCallback(
    (auto: boolean) => {
      void updateDownloadSettings(auto ? 'auto' : 'ask').then((result) => {
        if (!result.ok) {
          showToast(t.settingsUpdateFailed, 'error');
        }
      });
    },
    [updateDownloadSettings, showToast, t],
  );

  const handleSelectChange = useCallback(
    (v: string) => handleModeChange(v === 'auto'),
    [handleModeChange],
  );

  // options 身份稳定，避免下游 SettingsSelect 订阅 effect 每渲染重绑监听。
  const selectOptions = useMemo(
    () => [
      { value: 'auto', label: t.browserDownloadSettingsModeAuto },
      { value: 'ask', label: t.browserDownloadSettingsModeAsk },
    ],
    [t.browserDownloadSettingsModeAuto, t.browserDownloadSettingsModeAsk],
  );

  return (
    <div className="adl-settings-section adl-settings-card adl-browser-settings">
      <SettingsHeader
        title={t.browserDownloadSettingsTitle}
        description={t.browserDownloadSettingsDesc}
      />

      {/* Download mode（默认下载路径已移入「存储」设置组的存储引擎区） */}
      <div className="adl-settings-row">
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <span>{t.browserDownloadSettingsMode}</span>
          </div>
          <small>{t.browserDownloadSettingsModeDesc}</small>
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
  );
}
