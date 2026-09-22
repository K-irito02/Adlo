import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { SettingsHeader } from '../../components/settings/SettingsHeader';

export function BrowserDownloadSettings() {
  const { t } = useTCopy();
  const downloadSettings = useAppStore((s) => s.downloadSettings);
  const isLoadingSettings = useAppStore((s) => s.isLoadingSettings);
  const updateDownloadSettings = useAppStore((s) => s.updateDownloadSettings);

  const isAutoSave = downloadSettings.mode === 'auto';

  const handleModeChange = (auto: boolean) => {
    void updateDownloadSettings(auto ? 'auto' : 'ask');
  };

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
          <select
            className="adl-settings-select"
            value={isAutoSave ? 'auto' : 'ask'}
            onChange={(e) => handleModeChange(e.target.value === 'auto')}
            disabled={isLoadingSettings}
          >
            <option value="auto">{t.browserDownloadSettingsModeAuto}</option>
            <option value="ask">{t.browserDownloadSettingsModeAsk}</option>
          </select>
        </div>
      </div>
    </div>
  );
}
