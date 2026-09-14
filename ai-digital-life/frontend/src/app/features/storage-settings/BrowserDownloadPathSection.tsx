import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';

/**
 * 「浏览器默认下载路径」区块（原「浏览器」设置组的 default_path 行，Plan C Task 5 移入「存储」组）。
 * 下载**模式**（auto/ask）仍留在「浏览器」组，这里只搬路径。
 */
export function BrowserDownloadPathSection() {
  const { t } = useTCopy();
  const downloadSettings = useAppStore((s) => s.downloadSettings);
  const isLoadingSettings = useAppStore((s) => s.isLoadingSettings);
  const updateDownloadSettings = useAppStore((s) => s.updateDownloadSettings);
  const showToast = useAppStore((s) => s.showToast);

  const defaultPath = downloadSettings.default_path || undefined;

  const handlePathChange = async () => {
    const bridge = window.digitalLife?.workspace;
    if (!bridge?.pickDirectory) {
      return;
    }
    const result = await bridge.pickDirectory();
    if (!result.ok) {
      showToast(t.storagePickFailed.replace('{error}', result.error.message), 'error');
      return;
    }
    if (result.data) {
      void updateDownloadSettings(undefined, result.data);
    }
  };

  return (
    <div className="adl-settings-row">
      <div className="adl-settings-row__label">
        <div className="adl-settings-row__label-text">
          <span>{t.browserDownloadSettingsPath}</span>
        </div>
        <small>{t.browserDownloadSettingsPathDesc}</small>
      </div>
      <div
        className="adl-settings-row__control"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
      >
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
  );
}
