import type { ReactNode } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { SettingsHintButton } from '@components/settings/SettingsHintButton';
import {
  SettingsRowRefresh,
  type SettingsRowRefreshState,
} from '@components/settings/SettingsRefreshButton';
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
  /** 本行刷新（来源腿）：标题右侧悬停显现；缺省不渲染。 */
  refresh?: SettingsRowRefreshState;
  /** 来源说明行（工具专属：托管/延迟生效/无可用来源提示）。 */
  note: ReactNode;
  onChange: (mode: HarnessVersionSourceMode) => void;
}

/** 「版本来源」行：三态选择 + 工具专属说明（旧 DSH 卡内首行）。 */
export function SourceRow({
  mode,
  options,
  hint,
  desc,
  disabled,
  refresh,
  note,
  onChange,
}: SourceRowProps) {
  const { t } = useTCopy();
  return (
    // OpenCode 组不在 settings.css 的组级居中名单内（通用/浏览器/DSH 三组），
    // 故该行显式带 `--center`；窄档（≤600px）由堆叠规则覆盖回 stretch。
    <div
      className="adl-settings-row adl-settings-row--center"
      data-settings-row={t.harnessVersionSourceTitle}
    >
      <div className="adl-settings-row__label">
        <div className="adl-settings-row__label-text">
          <SettingsHintButton content={hint} />
          <span>{t.harnessVersionSourceTitle}</span>
          <SettingsRowRefresh refresh={refresh} disabled={disabled} />
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
