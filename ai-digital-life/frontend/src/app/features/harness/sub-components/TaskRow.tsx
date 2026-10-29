import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';

interface TaskRowProps {
  stageText: string;
  cancelLabel: string;
  percent: number | null;
  done: number;
  total: number;
  hasLiveTask: boolean;
  cancellable: boolean;
  showPercent: boolean;
  showCounts: boolean;
  onCancel: () => void;
}

/**
 * 版本任务独立卡（无行内选择器的通道形态才渲染，旧 OpenCode 任务卡）：
 * 阶段文案 + 可选百分比/计数 + 取消。行内选择器形态下任务行内展示，不用本卡。
 */
export function TaskRow({
  stageText,
  cancelLabel,
  percent,
  done,
  total,
  hasLiveTask,
  cancellable,
  showPercent,
  showCounts,
  onCancel,
}: TaskRowProps) {
  const { t } = useTCopy();
  return (
    <div className="adl-settings-card">
      <div className="adl-settings-row">
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <span>{stageText}</span>
          </div>
        </div>
        <div className="adl-settings-row__control">
          <div className="adl-harness-version__version-task">
            {showCounts && hasLiveTask && total > 0 ? (
              <span className="adl-harness-version__version-task-count">
                {formatT(t, 'harnessVersionTaskCount', { done, total })}
              </span>
            ) : null}
            {showPercent ? (
              <span className="adl-harness-version__version-task-count">
                {percent === null ? '—' : `${percent}%`}
              </span>
            ) : null}
            <button
              type="button"
              className="adl-harness-version__action-btn"
              disabled={!hasLiveTask || !cancellable}
              onClick={onCancel}
            >
              {cancelLabel || t.harnessVersionCancel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
