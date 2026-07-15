import { useState } from 'react';
import type { ExecutionStepConversationBlock } from '@shared/ipc';
import type { CopyDict } from '../../i18n';
import { IconChevronDown, IconChevronRight, IconRefreshCw } from '../../icons';

interface StepBlockProps {
  t: CopyDict;
  block: ExecutionStepConversationBlock;
  onRetry?: (stepId: string) => void;
}

function statusLabel(t: CopyDict, status: ExecutionStepConversationBlock['status']): string {
  const map: Record<typeof status, keyof CopyDict> = {
    pending: 'stepPending',
    running: 'stepRunning',
    completed: 'stepCompleted',
    failed: 'stepFailed',
  };
  return t[map[status]] as string;
}

function statusColorClass(status: ExecutionStepConversationBlock['status']): string {
  switch (status) {
    case 'running':
      return 'adl-chip--info';
    case 'completed':
      return 'adl-chip--success';
    case 'failed':
      return 'adl-chip--danger';
    default:
      return 'adl-chip--muted';
  }
}

export function StepBlock({ t, block, onRetry }: StepBlockProps) {
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <div className={`adl-step-block adl-step-block--${block.status}`}>
      <div className="adl-step-block__header">
        <span className="adl-step-block__title">{block.title}</span>
        <span className={`adl-chip adl-chip--xs ${statusColorClass(block.status)}`}>
          {statusLabel(t, block.status)}
        </span>
        {block.status === 'running' && (
          <span className="adl-step-block__pulse" aria-hidden="true" />
        )}
      </div>

      {block.summary && <p className="adl-step-block__summary">{block.summary}</p>}

      {block.error && (
        <div className="adl-step-block__error">
          <span>{block.error}</span>
          {onRetry && (
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--xs"
              onClick={() => onRetry(block.stepId)}
            >
              <IconRefreshCw size={12} decorative />
              {t.retryStep}
            </button>
          )}
        </div>
      )}

      {block.toolCalls?.length ? (
        <div className="adl-step-block__tools">
          <button
            type="button"
            className="adl-step-block__toggle"
            onClick={() => setDetailOpen((v) => !v)}
          >
            {detailOpen ? (
              <IconChevronDown size={12} decorative />
            ) : (
              <IconChevronRight size={12} decorative />
            )}
            <span>
              {t.toolCallSummary} ({block.toolCalls.length})
            </span>
          </button>
          {detailOpen && (
            <ul className="adl-step-block__tool-list">
              {block.toolCalls.map((tc) => (
                <li
                  key={tc.id}
                  className={`adl-step-block__tool-item adl-step-block__tool-item--${tc.status}`}
                >
                  <strong>{tc.toolName}</strong>
                  <span>{tc.inputSummary}</span>
                  {tc.outputSummary && (
                    <span className="adl-step-block__tool-output">{tc.outputSummary}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
