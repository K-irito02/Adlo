import { useTCopy } from '@i18n/useTCopy';

interface ManualVersionRowProps {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onInstall: () => void;
}

/** 「指定版本」行：手动输入版本号后安装。 */
export function ManualVersionRow({ value, disabled, onChange, onInstall }: ManualVersionRowProps) {
  const { t } = useTCopy();
  return (
    <div className="adl-settings-row" data-settings-row={t.harnessVersionManual}>
      <div className="adl-settings-row__label">
        <div className="adl-settings-row__label-text">
          <span>{t.harnessVersionManual}</span>
        </div>
      </div>
      <div className="adl-settings-row__control">
        <input
          className="adl-settings-input"
          value={value}
          placeholder={t.harnessVersionManualPlaceholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="adl-harness-version__action-btn"
          disabled={disabled || !value.trim()}
          onClick={onInstall}
        >
          {t.harnessVersionInstall}
        </button>
      </div>
    </div>
  );
}
