import { useTCopy } from '@i18n/useTCopy';

interface TaskRowProps {
  stageText: string;
  cancelLabel: string;
  percent: number | null;
  done: number;
  total: number;
  cancellable: boolean;
  showPercent: boolean;
  showCounts: boolean;
  onCancel: () => void;
}

/** 版本任务行：阶段文案（适配器可覆盖）+ 可选百分比/计数 + 取消。 */
export function TaskRow({
  stageText,
  cancelLabel,
  percent,
  done,
  total,
  cancellable,
  showPercent,
  showCounts,
  onCancel,
}: TaskRowProps) {
  const { t, formatT } = useTCopy();
  return (
    <div className="adl-settings-card">
      <div className="adl-settings-row">
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <span>{stageText}</span>
          </div>
        </div>
        <div className="adl-settings-row__control adl-harness-version__progress">
          {showCounts && total > 0 ? (
            <span className="adl-harness-version__hint">
              {formatT(t, 'harnessVersionTaskCount', { done, total })}
            </span>
          ) : null}
          {showPercent ? (
            <span className="adl-harness-version__value">
              {percent === null ? '—' : `${percent}%`}
            </span>
          ) : null}
          {cancellable ? (
            <button type="button" className="adl-harness-version__action-btn" onClick={onCancel}>
              {cancelLabel || t.harnessVersionCancel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
