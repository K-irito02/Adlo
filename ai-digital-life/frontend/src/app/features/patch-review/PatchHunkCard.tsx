import React from 'react';
import { IconChevronDown, IconChevronRight, IconTarget } from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import type { PatchHunkSummary } from './patchReview';
import type { PatchHunkDecision } from '@ai-digital-life/kernel';
import { useTCopy } from '@i18n/useTCopy';

export interface PatchHunkCardProps {
  summary: PatchHunkSummary;
  relativePath: string;
  selectedPatchHunkId: string | undefined;
  onTogglePatchHunkCollapse: (hunkId: string) => void;
  onSelectPatchHunk: (
    relativePath: string,
    hunkId: string,
    targetLine: number,
    options?: { activateTool: boolean }
  ) => void;
  onSetHunkDecision: (hunkId: string, decision: PatchHunkDecision) => void;
}

export function PatchHunkCard({
  summary,
  relativePath,
  selectedPatchHunkId,
  onTogglePatchHunkCollapse,
  onSelectPatchHunk,
  onSetHunkDecision,
}: PatchHunkCardProps) {
  const { t } = useTCopy();
  const isSelected = summary.id === selectedPatchHunkId;
  return (
    <section
      className={`adl-patch-hunk-card adl-patch-hunk-card--${summary.changeKind}${isSelected ? ' is-selected' : ''}`}
    >
      <div className="adl-patch-hunk-card__summary">
        <button
          type="button"
          className="adl-patch-hunk-card__toggle"
          onClick={() => onTogglePatchHunkCollapse(summary.id)}
          aria-expanded={summary.isCollapsed ? 'false' : 'true'}
          aria-label={summary.isCollapsed ? t.expandDetails : t.collapseDetails}
        >
          {summary.isCollapsed ? (
            <IconChevronRight size={12} decorative />
          ) : (
            <IconChevronDown size={12} decorative />
          )}
        </button>
        <button
          type="button"
          className="adl-patch-hunk-card__jump"
          onClick={() =>
            onSelectPatchHunk(relativePath, summary.id, summary.targetLine, { activateTool: true })
          }
        >
          <div>
            <strong>{summary.preview}</strong>
            <small>
              -{summary.oldStart}:{summary.oldLines} / +{summary.newStart}:{summary.newLines}
            </small>
          </div>
          <span className={`adl-decision-chip adl-decision-chip--${summary.decision}`}>
            {summary.decision === 'accepted'
              ? t.approvalApproved
              : summary.decision === 'rejected'
                ? t.approvalRejected
                : t.approvalPendingCount}
          </span>
        </button>
        <TooltipSimple content={t.conflictViewDiff} placement="top">
          <button
            type="button"
            className="adl-tool-context__iconbtn"
            onClick={() =>
              onSelectPatchHunk(relativePath, summary.id, summary.targetLine, {
                activateTool: true,
              })
            }
            aria-label={t.conflictViewDiff}
          >
            <IconTarget size={14} decorative />
          </button>
        </TooltipSimple>
      </div>

      {!summary.isCollapsed ? (
        <div className="adl-patch-hunk-card__details">
          <div className="adl-patch-hunk-card__toolbar">
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--sm"
              onClick={() =>
                onSelectPatchHunk(relativePath, summary.id, summary.targetLine, {
                  activateTool: true,
                })
              }
            >
              {t.conflictViewDiff}
            </button>
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--sm"
              onClick={() => onSetHunkDecision(summary.id, 'accepted')}
            >
              {t.accept}
            </button>
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--sm"
              onClick={() => onSetHunkDecision(summary.id, 'rejected')}
            >
              {t.reject}
            </button>
          </div>
          <div className="adl-patch-hunk-card__preview">
            <pre>{summary.preview}</pre>
          </div>
        </div>
      ) : null}
    </section>
  );
}
