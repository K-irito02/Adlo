import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { useAppStore } from '@stores/slicedStore';
import { anchorFor } from '@components/settings/settingsSearchIndex';
import { SettingsHintButton } from '@components/settings/SettingsHintButton';

/** 当前下载源独立沉底卡（只读 + 前往网络组修改，与 DSH 源卡同构）。 */
export function OpencodeSourceSummaryCard() {
  const { t } = useTCopy();
  const sourceStatus = useAppStore((s) => s.sourceStatus);
  const setActiveSettingsGroup = useAppStore((s) => s.setActiveSettingsGroup);

  const summaryLabel = formatT(t, 'dshSourceSummary', {
    title: t.opencodeSourceSummaryTitle,
    registry: sourceStatus?.config.npm_registry ?? t.dshSourceSummaryUnknown,
  });
  const summaryMode = formatT(t, 'dshSourceSummaryMode', {
    mode:
      sourceStatus?.config.source_mode === 'auto'
        ? t.dshSettingsSourceAuto
        : sourceStatus?.config.source_mode === 'manual'
          ? t.dshSourceSummaryManual
          : t.dshSourceSummaryUnknown,
  });

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
            <span>{summaryLabel}</span>
            <span className="adl-harness-version__readout-sub">{summaryMode}</span>
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
