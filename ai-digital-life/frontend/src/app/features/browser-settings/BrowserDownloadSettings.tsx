import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { SettingsHeader } from '../../components/settings/SettingsHeader';

export function BrowserDownloadSettings() {
  const { t } = useTCopy();
  const downloadSettings = useAppStore((s) => s.downloadSettings);
  const isLoadingSettings = useAppStore((s) => s.isLoadingSettings);
  const updateDownloadSettings = useAppStore((s) => s.updateDownloadSettings);

  const isAutoSave = downloadSettings.mode === 'auto';
  const defaultPath = downloadSettings.default_path || undefined;

  const handleModeChange = (auto: boolean) => {
    void updateDownloadSettings(auto ? 'auto' : 'ask');
  };

  const handlePathChange = async () => {
    const bridge = window.digitalLife?.workspace;
    if (!bridge?.pickDirectory) {
      return;
    }
    const result = await bridge.pickDirectory();
    if (result.ok && result.data) {
      void updateDownloadSettings(undefined, result.data);
    }
  };

  return (
    <div className="adl-settings-section adl-browser-settings">
      <SettingsHeader
        title={t.browserDownloadSettingsTitle}
        description={t.browserDownloadSettingsDesc}
      />

      {/* Default download path */}
      <div className="adl-settings-row">
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <span>{t.browserDownloadSettingsPath}</span>
          </div>
          <small>{t.browserDownloadSettingsPathDesc}</small>
        </div>
        <div className="adl-settings-row__control" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            {isLoadingSettings ? '...' : (defaultPath ?? t.browserDownloadSettingsPathDefault)}
          </span>
          <button
            type="button"
            className="adl-btn adl-btn--ghost"
            onClick={() => void handlePathChange()}
            disabled={isLoadingSettings}
          >
            {t.browserDownloadSettingsChangePath}
          </button>
        </div>
      </div>

      {/* Download mode */}
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
