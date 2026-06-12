import React from 'react';
import type { PatchReviewFilter } from './patchReview';
import { useTCopy } from '../../i18n/useTCopy';

export interface PatchReviewSummaryProps {
  activePatchSet: { title: string; summary: string };
  reviewCounts: { total: number; accepted: number; rejected: number; pending: number };
  patchReviewFilter: PatchReviewFilter;
  onSetPatchReviewFilter: (filter: PatchReviewFilter) => void;
  onAcceptAllHunks: () => void;
  onRejectAllHunks: () => void;
}

export function PatchReviewSummary({
  activePatchSet,
  reviewCounts,
  patchReviewFilter,
  onSetPatchReviewFilter,
  onAcceptAllHunks,
  onRejectAllHunks,
}: PatchReviewSummaryProps) {
  const { t } = useTCopy();
  return (
    <article className="adl-patch-review-summary">
      <header className="adl-patch-review-summary__header">
        <div>
          <strong>{activePatchSet.title}</strong>
          <p>{activePatchSet.summary}</p>
        </div>
        <span className="adl-chip adl-chip--info">
          {reviewCounts.total} {t.changesSummaryPatchFiles}
        </span>
      </header>

      <div className="adl-patch-review-summary__stats">
        <div className="adl-review-stat">
          <span>{t.batchAcceptAll}</span>
          <strong>{reviewCounts.accepted}</strong>
        </div>
        <div className="adl-review-stat">
          <span>{t.batchRejectAll}</span>
          <strong>{reviewCounts.rejected}</strong>
        </div>
        <div className="adl-review-stat">
          <span>{t.approvalPendingCount}</span>
          <strong>{reviewCounts.pending}</strong>
        </div>
      </div>

      <div className="adl-patch-review-summary__actions">
        <div className="adl-segmented" role="tablist" aria-label={t.validationSummary}>
          {(['all', 'pending', 'accepted', 'rejected'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              aria-pressed={patchReviewFilter === filter ? 'true' : 'false'}
              onClick={() => onSetPatchReviewFilter(filter)}
            >
              {filter === 'all'
                ? t.auditFilterAll
                : filter === 'pending'
                  ? t.approvalPendingCount
                  : filter === 'accepted'
                    ? t.approvalApproved
                    : t.approvalRejected}
            </button>
          ))}
        </div>
        <div className="adl-patch-review-summary__batch">
          <button
            type="button"
            className="adl-btn adl-btn--ghost adl-btn--sm"
            onClick={onAcceptAllHunks}
          >
            {t.batchAcceptAll}
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--ghost adl-btn--sm"
            onClick={onRejectAllHunks}
          >
            {t.batchRejectAll}
          </button>
        </div>
      </div>
    </article>
  );
}
