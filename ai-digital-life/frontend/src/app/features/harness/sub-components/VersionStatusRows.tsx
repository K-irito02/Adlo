import type { ReactNode } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { SettingsHintButton } from '@components/settings/SettingsHintButton';

interface CurrentVersionRowProps {
  /** 行内「?」提示内容（DSH 传入当前版本说明；缺省不渲染）。 */
  hint?: string;
  /** 标签下描述小字（旧行文案；缺省不渲染）。 */
  desc?: string;
  /** 卸载二次确认时的行内警告（适配器提供；`undefined` 时不渲染）。 */
  uninstallWarn?: string;
  /** 行内读数：运行态插槽或通用回退读数。 */
  children: ReactNode;
}

/** 当前版本行：副标题 + 提示图标；右侧为行内版本读数。 */
export function CurrentVersionRow({ hint, desc, uninstallWarn, children }: CurrentVersionRowProps) {
  const { t } = useTCopy();
  return (
    <div className="adl-settings-row" data-settings-row={t.harnessVersionCurrent}>
      <div className="adl-settings-row__label">
        <div className="adl-settings-row__label-text">
          {hint ? <SettingsHintButton content={hint} /> : null}
          <span>{t.harnessVersionCurrent}</span>
        </div>
        {desc ? <small>{desc}</small> : null}
        {uninstallWarn ? (
          <small className="adl-harness-version__row-warn">{uninstallWarn}</small>
        ) : null}
      </div>
      <div className="adl-settings-row__control">
        <div className="adl-harness-version__readout">{children}</div>
      </div>
    </div>
  );
}

interface FallbackReadoutProps {
  current: string | null;
  effectiveLabel: string;
  /** 版本状态读取失败：读数区切错误态。 */
  failed: boolean;
}

/** 无运行态插槽时的通用回退读数：版本号 + 生效来源副行。 */
export function FallbackReadout({ current, effectiveLabel, failed }: FallbackReadoutProps) {
  const { t } = useTCopy();
  if (failed) {
    return (
      <span className="adl-harness-version__readout-value is-empty">
        {t.harnessVersionLoadFailed}
      </span>
    );
  }
  return (
    <>
      <span className={`adl-harness-version__readout-value${current ? '' : ' is-empty'}`}>
        {current ?? t.harnessVersionNotInstalled}
      </span>
      <small className="adl-harness-version__readout-sub">
        {t.harnessVersionEffectiveSource}: {effectiveLabel}
      </small>
    </>
  );
}

interface MissingBannerRowProps {
  visible: boolean;
  children: ReactNode;
}

/** 快照可读但未安装任何版本时的引导行（`extraRows` 形态才渲染）。 */
export function MissingBannerRow({ visible, children }: MissingBannerRowProps) {
  if (!visible) {
    return null;
  }
  return (
    <div className="adl-settings-row">
      <div className="adl-settings-row__label">
        <div className="adl-settings-row__label-text">
          <span className="adl-harness-version__readout-value is-empty">{children}</span>
        </div>
      </div>
    </div>
  );
}
