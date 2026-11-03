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
  /** 版本操作在途：与 DSH 读数一致，改为中性扫光胶囊，不展示中途值。 */
  busy?: boolean;
  /**
   * 当前来源解析为「无」（如钉住系统安装但本机没有副本）：`current` 只是宿主的
   * 选中记录，并不在生效，必须显示「未安装」而不是它。
   */
  unavailable?: boolean;
}

/** 无运行态插槽时的通用读数：只显示版本号；只有完全没有读数时才展示失败文案。 */
export function FallbackReadout({
  current,
  failed,
  busy = false,
  unavailable = false,
}: FallbackReadoutProps) {
  const { t } = useTCopy();
  if (busy) {
    return (
      <span
        className="adl-harness-version__readout-loading"
        role="status"
        aria-label={t.harnessVersionLoading}
      />
    );
  }
  if (failed && current === null) {
    return (
      <span className="adl-harness-version__readout-value is-empty">
        {t.harnessVersionLoadFailed}
      </span>
    );
  }
  if (unavailable) {
    return (
      <span className="adl-harness-version__readout-value is-empty">
        {t.harnessVersionNotInstalled}
      </span>
    );
  }
  return (
    <span className={`adl-harness-version__readout-value${current ? '' : ' is-empty'}`}>
      {current ?? t.harnessVersionNotInstalled}
    </span>
  );
}
