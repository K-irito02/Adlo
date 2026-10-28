import type { ReactNode } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { SettingsHintButton } from '@components/settings/SettingsHintButton';
import type { HarnessVersionSourceMode, HarnessVersionSourceStatus } from '../harnessVersionBridge';

interface SourceCardProps {
  source: HarnessVersionSourceStatus | null;
  sourceHint: string;
  disabled: boolean;
  onSourceChange: (mode: HarnessVersionSourceMode) => void;
  /** 适配器插槽已渲染好的说明行 / 尾部内容。 */
  note: ReactNode;
  footer: ReactNode;
}

/** 「版本来源」卡：三态选择 + 系统安装路径读数 + 适配器说明/尾部插槽。 */
export function SourceCard({
  source,
  sourceHint,
  disabled,
  onSourceChange,
  note,
  footer,
}: SourceCardProps) {
  const { t } = useTCopy();
  return (
    <div className="adl-settings-card">
      <div className="adl-settings-row" data-settings-row={t.harnessVersionSourceTitle}>
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <SettingsHintButton content={sourceHint} />
            <span>{t.harnessVersionSourceTitle}</span>
          </div>
        </div>
        <div className="adl-settings-row__control">
          <select
            className="adl-settings-dropdown"
            value={source?.mode ?? 'auto'}
            disabled={disabled}
            onChange={(event) => onSourceChange(event.target.value as HarnessVersionSourceMode)}
          >
            <option value="auto">{t.harnessVersionSourceAuto}</option>
            <option value="system">{t.harnessVersionSourceSystem}</option>
            <option value="host">{t.harnessVersionSourceHost}</option>
          </select>
        </div>
      </div>
      <div className="adl-settings-row">
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <span>{t.harnessVersionSystemPath}</span>
          </div>
        </div>
        <div className="adl-settings-row__control">
          <span className="adl-harness-version__value">
            {source?.systemPath ?? t.harnessVersionSystemNotDetected}
          </span>
        </div>
      </div>
      {note ? (
        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <span className="adl-harness-version__hint">{note}</span>
            </div>
          </div>
        </div>
      ) : null}
      {footer}
    </div>
  );
}
