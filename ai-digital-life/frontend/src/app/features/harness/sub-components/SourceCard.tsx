import type { ReactNode } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { SettingsHintButton } from '@components/settings/SettingsHintButton';
import { SettingsSelect } from '@components/settings/SettingsSelect';
import type { HarnessVersionSourceMode } from '../harnessVersionBridge';

export interface HarnessSourceOption {
  value: string;
  label: string;
}

interface SourceRowProps {
  mode: HarnessVersionSourceMode;
  options: HarnessSourceOption[];
  hint: string;
  /** 标签下描述小字；缺省不渲染。 */
  desc?: string;
  disabled: boolean;
  /** 来源说明行（工具专属：托管/延迟生效/无可用来源提示）。 */
  note: ReactNode;
  onChange: (mode: HarnessVersionSourceMode) => void;
}

/** 「版本来源」行：三态选择 + 工具专属说明（旧 DSH 卡内首行）。 */
export function SourceRow({ mode, options, hint, desc, disabled, note, onChange }: SourceRowProps) {
  const { t } = useTCopy();
  return (
    <div className="adl-settings-row" data-settings-row={t.harnessVersionSourceTitle}>
      <div className="adl-settings-row__label">
        <div className="adl-settings-row__label-text">
          <SettingsHintButton content={hint} />
          <span>{t.harnessVersionSourceTitle}</span>
        </div>
        {desc ? <small>{desc}</small> : null}
        {note}
      </div>
      <div className="adl-settings-row__control">
        <SettingsSelect
          value={mode}
          options={options}
          onChange={(value) => onChange(value as HarnessVersionSourceMode)}
          label={t.harnessVersionSourceTitle}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

/** 「系统安装路径」读数行（`extraRows` 形态才渲染，旧 DSH 无此行）。 */
export function SystemPathRow({
  systemPath,
  systemVersion,
  hint,
  desc,
}: {
  systemPath: string | null;
  /** 系统安装的版本号（探测到路径但版本未知时为 null）。 */
  systemVersion?: string | null;
  /** 行内「?」提示内容；缺省不渲染。 */
  hint?: string;
  /** 标签下描述小字；缺省不渲染。 */
  desc?: string;
}) {
  const { t } = useTCopy();
  return (
    <div className="adl-settings-row">
      <div className="adl-settings-row__label">
        <div className="adl-settings-row__label-text">
          {hint ? <SettingsHintButton content={hint} /> : null}
          <span>{t.harnessVersionSystemPath}</span>
        </div>
        {desc ? <small>{desc}</small> : null}
      </div>
      <div className="adl-settings-row__control">
        <span className="adl-harness-version__readout-value">
          {systemPath ?? t.harnessVersionSystemNotDetected}
        </span>
        {systemPath ? (
          <small className="adl-harness-version__readout-sub">
            {systemVersion ?? t.harnessVersionSystemVersionUnknown}
          </small>
        ) : null}
      </div>
    </div>
  );
}
