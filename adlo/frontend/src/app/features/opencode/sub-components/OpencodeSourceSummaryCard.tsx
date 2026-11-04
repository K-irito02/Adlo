import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { useAppStore } from '@stores/slicedStore';
import { anchorFor } from '@components/settings/settingsSearchIndex';
import { SettingsHintButton } from '@components/settings/SettingsHintButton';
import { useSourceSummaryGrace } from '@hooks/useSourceSummaryGrace';
import type { OpencodeSourceStatus } from '@shared/ipc/opencode';

/**
 * 当前下载源独立沉底卡（OpenCode 自己的 source-status，不读取 DSH 的全局状态）。
 * 来源状态未到时画中性扫光/失败文案，不渲染「— 「—」」这种占位读数。
 */
export function OpencodeSourceSummaryCard({ source }: { source: OpencodeSourceStatus | null }) {
  const { t } = useTCopy();
  const setActiveSettingsGroup = useAppStore((s) => s.setActiveSettingsGroup);
  const timedOut = useSourceSummaryGrace(source !== null);

  const summaryLabel = source
    ? formatT(t, 'dshSourceSummary', {
        title: t.opencodeSourceSummaryTitle,
        registry: source.config.npm_registry,
      })
    : '';
  const summaryMode = source
    ? formatT(t, 'dshSourceSummaryMode', {
        mode:
          source.config.source_mode === 'auto' ? t.dshSettingsSourceAuto : t.dshSourceSummaryManual,
      })
    : '';

  return (
    <div
      className="adl-settings-card"
      data-testid="opencode-source-summary-card"
      data-settings-anchor={anchorFor('opencode', 'source')}
    >
      <div className="adl-settings-row" data-settings-row={t.opencodeSourceSummaryTitle}>
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <SettingsHintButton content={t.opencodeSourceSummaryHint} />
            {source === null ? (
              timedOut ? (
                <span className="adl-harness-version__readout-sub">
                  {t.dshSourceSummaryUnavailable}
                </span>
              ) : null
            ) : (
              <>
                <span>{summaryLabel}</span>
                <span className="adl-harness-version__readout-sub">{summaryMode}</span>
              </>
            )}
          </div>
        </div>
        <div className="adl-settings-row__control">
          <button
            type="button"
            className="adl-harness-version__action-btn"
            onClick={() => setActiveSettingsGroup('network')}
          >
            {t.opencodeSourceSummaryGoModify}
          </button>
        </div>
      </div>
    </div>
  );
}
