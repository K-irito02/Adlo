import type { ReactNode } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { SettingsHintButton } from '@components/settings/SettingsHintButton';
import { IconRefreshCw } from '@icons';

export interface HarnessRowRefresh {
  /** 按钮无障碍名后缀（完整名为 `重新加载：{label}`）。 */
  label: string;
  /** 本腿刷新在途：按钮转圈，读数位扫光。 */
  spinning: boolean;
  onRefresh: () => void;
}

export function HarnessRefreshButton({
  refresh,
  disabled,
}: {
  refresh: HarnessRowRefresh;
  disabled: boolean;
}) {
  const { t } = useTCopy();
  return (
    <button
      type="button"
      className="adl-harness-version__refresh-btn"
      title={t.harnessVersionRefreshRow}
      aria-label={`${t.harnessVersionRefreshRow}：${refresh.label}`}
      disabled={disabled || refresh.spinning}
      onClick={refresh.onRefresh}
    >
      <IconRefreshCw size={14} decorative className={refresh.spinning ? 'adl-spin' : undefined} />
    </button>
  );
}

interface CurrentVersionRowProps {
  /** 行内「?」提示内容（DSH 传入当前版本说明；缺省不渲染）。 */
  hint?: string;
  /** 标签下描述小字（旧行文案；缺省不渲染）。 */
  desc?: string;
  /** 检查更新发现的新版本提示（标题下方蓝色小字；无新版本时为 null）。 */
  updateNote?: ReactNode;
  /** 卸载二次确认时的行内警告（适配器提供；`undefined` 时不渲染）。 */
  uninstallWarn?: string;
  /** 本行刷新（状态腿）：标题前置按钮 + 读数位扫光；缺省不渲染。 */
  refresh?: HarnessRowRefresh;
  /** 读数位扫光态（本腿刷新在途且已有旧值）。 */
  spinning?: boolean;
  /** 刷新按钮禁用（卡片忙碌门）。 */
  disabled?: boolean;
  /** 行内读数：运行态插槽或通用回退读数。 */
  children: ReactNode;
}

/** 当前版本行：副标题 + 提示图标；右侧为行内版本读数。 */
export function CurrentVersionRow({
  hint,
  desc,
  updateNote,
  uninstallWarn,
  refresh,
  spinning,
  disabled,
  children,
}: CurrentVersionRowProps) {
  const { t } = useTCopy();
  return (
    <div className="adl-settings-row" data-settings-row={t.harnessVersionCurrent}>
      <div className="adl-settings-row__label">
        <div className="adl-settings-row__label-text">
          {refresh ? <HarnessRefreshButton refresh={refresh} disabled={disabled === true} /> : null}
          <span>{t.harnessVersionCurrent}</span>
          {hint ? <SettingsHintButton content={hint} /> : null}
        </div>
        {desc ? <small>{desc}</small> : null}
        {updateNote}
        {uninstallWarn ? (
          <small className="adl-harness-version__row-warn">{uninstallWarn}</small>
        ) : null}
      </div>
      <div className="adl-settings-row__control">
        <div className="adl-harness-version__readout">
          {spinning ? (
            <span
              className="adl-harness-version__readout-loading"
              role="status"
              aria-label={t.harnessVersionLoading}
            />
          ) : (
            children
          )}
        </div>
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

/** 无运行态插槽时的通用回退读数：版本号 + 生效来源副行（未安装时只显示未安装）。 */
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
      {current ? (
        <small className="adl-harness-version__readout-sub">
          {t.harnessVersionEffectiveSource}: {effectiveLabel}
        </small>
      ) : null}
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
