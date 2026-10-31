import type { ReactNode } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { SettingsHintButton } from '@components/settings/SettingsHintButton';
import { HarnessRefreshButton, type HarnessRowRefresh } from './VersionStatusRows';

interface UpdateRowProps {
  mode: 'install' | 'check';
  /** 后端已给出可解析的最新版本；false 时不得显示「已是最新」。 */
  hasLatest: boolean;
  /** 目录拉取失败时同样不显示更新结论（避免误报「已是最新」）。 */
  catalogFailed: boolean;
  hasUpdate: boolean;
  /** 行内「?」提示内容；缺省不渲染。 */
  hint?: string;
  /** 标签下描述小字；缺省不渲染。 */
  desc?: string;
  /** 检查更新发现的新版本提示（标题下方蓝色小字；无新版本时为 null）。 */
  updateNote?: ReactNode;
  disabled: boolean;
  /** 任一分腿刷新在途：检查按钮禁用，保证读数一致。 */
  refreshBusy?: boolean;
  /** 本行刷新（状态+目录腿）：标题前置按钮；缺省不渲染。 */
  refresh?: HarnessRowRefresh;
  onInstall: () => void;
  onCheck: () => void;
}

/**
 * 「检查更新」行：`install` 模式直接装最新，`check` 模式只查询并
 * 由适配器提示结果。`check` 模式不显示更新状态提示。
 */
export function UpdateRow({
  mode,
  hasLatest,
  catalogFailed,
  hasUpdate,
  hint,
  desc,
  updateNote,
  disabled,
  refreshBusy,
  refresh,
  onInstall,
  onCheck,
}: UpdateRowProps) {
  const { t } = useTCopy();
  return (
    <div
      className="adl-settings-row adl-harness-version__row--center"
      data-settings-row={t.harnessVersionUpdate}
    >
      <div className="adl-settings-row__label">
        <div className="adl-settings-row__label-text">
          {refresh ? <HarnessRefreshButton refresh={refresh} disabled={disabled} /> : null}
          <span>{t.harnessVersionUpdate}</span>
          {hint ? <SettingsHintButton content={hint} /> : null}
        </div>
        {desc ? <small>{desc}</small> : null}
        {updateNote}
      </div>
      <div className="adl-settings-row__control adl-harness-version__version-actions">
        {mode === 'install' && hasLatest && !catalogFailed ? (
          <span className="adl-harness-version__readout-sub">
            {hasUpdate ? t.harnessVersionHasUpdate : t.harnessVersionNoUpdate}
          </span>
        ) : null}
        <button
          type="button"
          className="adl-harness-version__action-btn"
          disabled={disabled || refreshBusy === true}
          onClick={mode === 'check' ? onCheck : onInstall}
        >
          {mode === 'check' ? t.harnessVersionUpdate : t.harnessVersionUpdateAction}
        </button>
      </div>
    </div>
  );
}
