import { useTCopy } from '@i18n/useTCopy';
import { SettingsHintButton } from '@components/settings/SettingsHintButton';

interface ManualVersionRowProps {
  value: string;
  disabled: boolean;
  /** 任一分腿刷新在途：安装按钮禁用，保证读数一致。 */
  refreshBusy?: boolean;
  /** 行内「?」提示内容；缺省不渲染。 */
  hint?: string;
  /** 标签下描述小字；缺省不渲染。 */
  desc?: string;
  onChange: (value: string) => void;
  onInstall: () => void;
}

/** 「指定版本」行：手动输入版本号后安装。 */
export function ManualVersionRow({
  value,
  disabled,
  refreshBusy,
  hint,
  desc,
  onChange,
  onInstall,
}: ManualVersionRowProps) {
  const { t } = useTCopy();
  return (
    <div className="adl-settings-row" data-settings-row={t.harnessVersionManual}>
      <div className="adl-settings-row__label">
        <div className="adl-settings-row__label-text">
          {hint ? <SettingsHintButton content={hint} /> : null}
          <span>{t.harnessVersionManual}</span>
        </div>
        {desc ? <small>{desc}</small> : null}
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
          disabled={disabled || refreshBusy === true || !value.trim()}
          onClick={onInstall}
        >
          {t.harnessVersionInstall}
        </button>
      </div>
    </div>
  );
}
