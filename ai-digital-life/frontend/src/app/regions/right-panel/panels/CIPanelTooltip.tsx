/**
 * CI 面板 - 快速帮助弹窗（方案A）
 * 简洁的浮动提示，覆盖在面板上方
 */
import React from 'react';
import { workspaceSelectors } from '../../../stores/selectors';
import { getAppCopy } from '../../../i18n';

interface CIPanelTooltipProps {
  onClose: () => void;
}

export function CIPanelTooltip({ onClose }: CIPanelTooltipProps) {
  const appInfo = workspaceSelectors.useAppInfo();
  const copy = getAppCopy(appInfo);

  return (
    <>
      <div className="ci-tooltip__overlay" onClick={onClose} />
      <div className="ci-tooltip">
        <div className="ci-tooltip__header">
          <span className="ci-tooltip__title">{copy.ciTooltipQuickStart}</span>
          <button type="button" className="ci-tooltip__close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="ci-tooltip__body">
          <div className="ci-tooltip__row">
            <span className="ci-tooltip__icon">🚀</span>
            <div className="ci-tooltip__content">
              <strong>{copy.ciTooltipQuickStart}</strong>
              <p>{copy.ciTooltipQuickStartContent}</p>
            </div>
          </div>

          <div className="ci-tooltip__divider" />

          <div className="ci-tooltip__row">
            <span className="ci-tooltip__icon">🔄</span>
            <div className="ci-tooltip__content">
              <strong>{copy.ciTooltipAutoRefresh}</strong>
              <p>{copy.ciTooltipAutoRefreshContent}</p>
            </div>
          </div>

          <div className="ci-tooltip__divider" />

          <div className="ci-tooltip__row">
            <span className="ci-tooltip__icon">🔘</span>
            <div className="ci-tooltip__content">
              <strong>{copy.ciTooltipManualRefresh}</strong>
              <p>{copy.ciTooltipManualRefreshContent}</p>
            </div>
          </div>

          <div className="ci-tooltip__divider" />

          <div className="ci-tooltip__status-legend">
            <span className="ci-tooltip__legend-title">{copy.ciTooltipStatusLegend}</span>
            <div className="ci-tooltip__legend-items">
              <div className="ci-tooltip__legend-item">
                <span className="ci-tooltip__dot ci-tooltip__dot--success" />
                <span>{copy.ciTooltipStatusSuccess}</span>
              </div>
              <div className="ci-tooltip__legend-item">
                <span className="ci-tooltip__dot ci-tooltip__dot--failure" />
                <span>{copy.ciTooltipStatusFailure}</span>
              </div>
              <div className="ci-tooltip__legend-item">
                <span className="ci-tooltip__dot ci-tooltip__dot--in-progress" />
                <span>{copy.ciTooltipStatusInProgress}</span>
              </div>
              <div className="ci-tooltip__legend-item">
                <span className="ci-tooltip__dot ci-tooltip__dot--skipped" />
                <span>{copy.ciTooltipStatusSkipped}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .ci-tooltip__overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.3);
          z-index: 100;
        }
        .ci-tooltip {
          position: fixed;
          top: 60px;
          right: 12px;
          width: 280px;
          background: var(--surface-primary);
          border: 1px solid var(--border);
          border-radius: 8px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
          z-index: 101;
          overflow: hidden;
        }
        .ci-tooltip__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          border-bottom: 1px solid var(--border);
          background: var(--surface-secondary);
        }
        .ci-tooltip__title {
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--text-primary);
        }
        .ci-tooltip__close {
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          color: var(--text-tertiary);
          cursor: pointer;
          border-radius: 4px;
          font-size: 10px;
        }
        .ci-tooltip__close:hover {
          background: var(--surface-hover);
          color: var(--text-primary);
        }
        .ci-tooltip__body {
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .ci-tooltip__row {
          display: flex;
          gap: 10px;
          align-items: flex-start;
        }
        .ci-tooltip__icon {
          font-size: 14px;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .ci-tooltip__content {
          flex: 1;
          min-width: 0;
        }
        .ci-tooltip__content strong {
          display: block;
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 2px;
        }
        .ci-tooltip__content p {
          font-size: var(--text-xs);
          color: var(--text-secondary);
          margin: 0;
          line-height: 1.4;
        }
        .ci-tooltip__divider {
          height: 1px;
          background: var(--border);
          margin: 0 -12px;
        }
        .ci-tooltip__status-legend {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .ci-tooltip__legend-title {
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--text-primary);
        }
        .ci-tooltip__legend-items {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px;
        }
        .ci-tooltip__legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: var(--text-xs);
          color: var(--text-secondary);
        }
        .ci-tooltip__dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .ci-tooltip__dot--success {
          background: var(--success);
        }
        .ci-tooltip__dot--failure {
          background: var(--danger);
        }
        .ci-tooltip__dot--in-progress {
          background: var(--warning);
        }
        .ci-tooltip__dot--skipped {
          background: var(--text-tertiary);
        }
      `}</style>
    </>
  );
}
