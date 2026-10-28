import type { ReactNode } from 'react';
import { useTCopy } from '@i18n/useTCopy';

interface CurrentVersionRowProps {
  current: string | null;
  effectiveLabel: string;
  /** 二次确认卸载当前版本时的提示（适配器提供）。 */
  uninstallHint?: string;
  armed: boolean;
  runtimeReadout: ReactNode;
}

/** 当前版本行：版本号 + 生效来源 + 适配器运行态读数 + 卸载确认提示。 */
export function CurrentVersionRow({
  current,
  effectiveLabel,
  uninstallHint,
  armed,
  runtimeReadout,
}: CurrentVersionRowProps) {
  const { t } = useTCopy();
  return (
    <div className="adl-settings-row" data-settings-row={t.harnessVersionCurrent}>
      <div className="adl-settings-row__label">
        <div className="adl-settings-row__label-text">
          <span>{t.harnessVersionCurrent}</span>
        </div>
        {armed && uninstallHint ? (
          <small className="adl-harness-version__hint">{uninstallHint}</small>
        ) : null}
      </div>
      <div className="adl-settings-row__control">
        <span className="adl-harness-version__value">
          {current ?? t.harnessVersionNotInstalled}
        </span>
        <span className="adl-harness-version__hint">
          {t.harnessVersionEffectiveSource}: {effectiveLabel}
        </span>
        {runtimeReadout}
      </div>
    </div>
  );
}

/** 快照读取失败行 + 未安装引导横幅（两者都只在对应状态下出现）。 */
export function StatusRows({
  failed,
  showMissing,
  missingBanner,
}: {
  failed: boolean;
  showMissing: boolean;
  missingBanner: ReactNode;
}) {
  const { t } = useTCopy();
  return (
    <>
      {failed ? (
        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <span className="adl-harness-version__hint">{t.harnessVersionLoadFailed}</span>
            </div>
          </div>
        </div>
      ) : null}
      {!failed && showMissing ? (
        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <span className="adl-harness-version__hint">{missingBanner}</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
