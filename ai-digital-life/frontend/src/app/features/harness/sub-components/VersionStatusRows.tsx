import type { ReactNode } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { SettingsHintButton } from '@components/settings/SettingsHintButton';
import {
  SettingsRowRefresh,
  type SettingsRowRefreshState,
} from '@components/settings/SettingsRefreshButton';

interface CurrentVersionRowProps {
  /** 行内「?」提示内容（DSH 传入当前版本说明；缺省不渲染）。 */
  hint?: string;
  /** 标签下描述小字（旧行文案；缺省不渲染）。 */
  desc?: string;
  /** 卸载二次确认时的行内警告（适配器提供；`undefined` 时不渲染）。 */
  uninstallWarn?: string;
  /** 本行刷新（状态腿）：标题右侧悬停显现；缺省不渲染。 */
  refresh?: SettingsRowRefreshState;
  /** 读数位扫光态（本腿刷新在途且已有旧值）。 */
  spinning?: boolean;
  /** 刷新按钮禁用（卡片忙碌门）。 */
  disabled?: boolean;
  /** 行内读数：运行态插槽或通用回退读数。 */
  children: ReactNode;
}

/**
 * 当前版本行：`?` 提示在标题左侧，刷新在标题右侧（悬停显现）；
 * 右侧为行内版本读数（单值，纵向居中对齐）。
 */
export function CurrentVersionRow({
  hint,
  desc,
  uninstallWarn,
  refresh,
  spinning,
  disabled,
  children,
}: CurrentVersionRowProps) {
  const { t } = useTCopy();
  return (
    <div
      className="adl-settings-row adl-harness-version__row--center"
      data-settings-row={t.harnessVersionCurrent}
    >
      <div className="adl-settings-row__label">
        <div className="adl-settings-row__label-text">
          {hint ? <SettingsHintButton content={hint} /> : null}
          <span>{t.harnessVersionCurrent}</span>
          <SettingsRowRefresh refresh={refresh} disabled={disabled} />
        </div>
        {desc ? <small>{desc}</small> : null}
        {uninstallWarn ? (
          <small className="adl-harness-version__row-warn">{uninstallWarn}</small>
        ) : null}
      </div>
      <div className="adl-settings-row__control">
        <div className="adl-harness-version__readout adl-harness-version__control-slot">
          <div className={spinning ? 'adl-harness-version__control-hidden' : undefined}>
            {children}
          </div>
          {spinning ? (
            <span
              className="adl-harness-version__readout-loading adl-harness-version__control-overlay"
              role="status"
              aria-label={t.harnessVersionLoading}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface FallbackReadoutProps {
  current: string | null;
  failed: boolean;
}

/** 无运行态插槽时的通用读数：只显示版本号，未安装时显示中性占位文案。 */
export function FallbackReadout({ current, failed }: FallbackReadoutProps) {
  const { t } = useTCopy();
  if (failed) {
    return (
      <span className="adl-harness-version__readout-value is-empty">
        {t.harnessVersionLoadFailed}
      </span>
    );
  }
  return (
    <span className={`adl-harness-version__readout-value${current ? '' : ' is-empty'}`}>
      {current ?? t.harnessVersionNotInstalled}
    </span>
  );
}
