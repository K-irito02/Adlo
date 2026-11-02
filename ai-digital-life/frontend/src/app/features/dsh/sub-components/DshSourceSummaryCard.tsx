import { useEffect, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { useAppStore } from '@stores/slicedStore';
import { anchorFor } from '@components/settings/settingsSearchIndex';
import { SettingsHintButton } from '@components/settings/SettingsHintButton';

/**
 * 当前下载源独立沉底卡（只读 + 前往网络组修改）。
 *
 * 来源状态未到时画中性扫光/失败文案，不渲染「— 「—」」这种占位读数。
 */
const SOURCE_SUMMARY_TIMEOUT_MS = 3000;

export function DshSourceSummaryCard() {
  const { t } = useTCopy();
  const sourceStatus = useAppStore((s) => s.sourceStatus);
  const setActiveSettingsGroup = useAppStore((s) => s.setActiveSettingsGroup);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (sourceStatus !== null) {
      setTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setTimedOut(true), SOURCE_SUMMARY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [sourceStatus]);

  const summaryLabel = sourceStatus
    ? formatT(t, 'dshSourceSummary', {
        title: t.dshSourceSummaryTitle,
        registry: sourceStatus.config.npm_registry,
      })
    : '';
  const summaryMode = sourceStatus
    ? formatT(t, 'dshSourceSummaryMode', {
        mode:
          sourceStatus.config.source_mode === 'auto'
            ? t.dshSettingsSourceAuto
            : t.dshSourceSummaryManual,
      })
    : '';

  return (
    <div
      className="adl-settings-card"
      data-testid="dsh-source-summary-card"
      data-settings-anchor={anchorFor('dsh', 'source')}
    >
      <div className="adl-settings-row" data-settings-row={t.dshSourceSummaryTitle}>
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <SettingsHintButton content={t.dshSourceSummaryHint} />
            {sourceStatus === null ? (
              timedOut ? (
                <span className="adl-dsh-settings__source-mode">
                  {t.dshSourceSummaryUnavailable}
                </span>
              ) : (
                <span
                  className="adl-source-summary__loading"
                  role="status"
                  aria-label={t.dshSourceSummaryLoading}
                />
              )
            ) : (
              <>
                <span>{summaryLabel}</span>
                <span className="adl-dsh-settings__source-mode">{summaryMode}</span>
              </>
            )}
          </div>
        </div>
        <div className="adl-settings-row__control">
          <button
            type="button"
            className="adl-dsh-settings__action-btn"
            onClick={() => setActiveSettingsGroup('network')}
          >
            {t.dshSourceSummaryGoModify}
          </button>
        </div>
      </div>
    </div>
  );
}
