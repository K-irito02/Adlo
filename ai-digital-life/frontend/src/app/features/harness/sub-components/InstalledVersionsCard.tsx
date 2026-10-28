import { useTCopy } from '@i18n/useTCopy';

interface InstalledVersionsCardProps {
  installed: string[];
  current: string | null;
  disabled: boolean;
  uninstallArmed: string | null;
  onSwitch: (version: string) => void;
  onUninstall: (version: string) => void;
  onReinstall: () => void;
}

/** 已安装版本列表卡：逐版本切换/卸载 + 当前版本重装。 */
export function InstalledVersionsCard({
  installed,
  current,
  disabled,
  uninstallArmed,
  onSwitch,
  onUninstall,
  onReinstall,
}: InstalledVersionsCardProps) {
  const { t } = useTCopy();
  if (installed.length === 0) {
    return null;
  }
  return (
    <div className="adl-settings-card">
      <div className="adl-settings-row" data-settings-row={t.harnessVersionInstalled}>
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <span>{t.harnessVersionInstalled}</span>
          </div>
        </div>
      </div>
      {installed.map((version) => (
        <div className="adl-settings-row" key={version} data-harness-version-row={version}>
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <span>{version}</span>
              {version === current ? (
                <span className="adl-harness-version__badge">{t.harnessVersionCurrentBadge}</span>
              ) : null}
            </div>
          </div>
          <div className="adl-settings-row__control">
            <button
              type="button"
              className="adl-harness-version__action-btn"
              disabled={disabled || version === current}
              onClick={() => onSwitch(version)}
            >
              {t.harnessVersionSwitch}
            </button>
            <button
              type="button"
              className="adl-harness-version__action-btn adl-harness-version__action-btn--danger"
              disabled={disabled}
              onClick={() => onUninstall(version)}
            >
              {uninstallArmed === version
                ? t.harnessVersionConfirmUninstall
                : t.harnessVersionUninstall}
            </button>
          </div>
        </div>
      ))}
      <div className="adl-settings-row">
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <span>{t.harnessVersionReinstall}</span>
          </div>
        </div>
        <div className="adl-settings-row__control">
          <button
            type="button"
            className="adl-harness-version__action-btn"
            disabled={disabled || !current}
            onClick={onReinstall}
          >
            {t.harnessVersionReinstall}
          </button>
        </div>
      </div>
    </div>
  );
}
