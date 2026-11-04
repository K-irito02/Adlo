import { useTCopy } from '@i18n/useTCopy';

interface ResetSourceRowProps {
  disabled: boolean;
  /** 来源已是 auto 时禁用（恢复默认无意义）。 */
  atDefault: boolean;
  onReset: () => void;
}

/** 「恢复默认」来源操作卡（仅 OpenCode 提供）。 */
export function ResetSourceRow({ disabled, atDefault, onReset }: ResetSourceRowProps) {
  const { t } = useTCopy();
  return (
    <div className="adl-settings-card">
      <div className="adl-settings-row">
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <span>{t.harnessVersionResetDefaults}</span>
          </div>
        </div>
        <div className="adl-settings-row__control">
          <button
            type="button"
            className="adl-harness-version__action-btn"
            disabled={disabled || atDefault}
            onClick={onReset}
          >
            {t.harnessVersionResetDefaults}
          </button>
        </div>
      </div>
    </div>
  );
}
