import React, { useState } from 'react';
import type { CiJobSummary } from '@ai-digital-life/kernel';
import { statusColor, formatDuration, statusClass } from './githubPanelUtils';
import { useTCopy } from '@app/i18n/useTCopy';
import { TooltipSimple } from '@components/Tooltip';
import { IconChevronDown, IconChevronUp } from '@app/icons';

export const JobRow = React.memo(function JobRow({
  job,
  onViewLogs,
}: {
  job: CiJobSummary;
  onViewLogs: (jobId: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTCopy();
  const sClass = statusClass(job.conclusion, job.status);

  return (
    <li className={`adl-github-card adl-github-card--status ${sClass}`}>
      <div
        className="adl-github-card__header"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}
      >
        <span className="adl-github-card__title">{job.name}</span>
        <span
          className="adl-chip adl-chip--xs"
          style={{
            color: statusColor(job.conclusion, job.status),
            borderColor: statusColor(job.conclusion, job.status),
          }}
        >
          {job.conclusion ?? job.status}
        </span>
        <span className="adl-github__job-duration adl-text--secondary">
          {formatDuration(job.startedAt, job.completedAt)}
        </span>
        <TooltipSimple content={t.ciViewLog}>
          <button
            type="button"
            className="adl-github__log-btn"
            onClick={(e) => {
              e.stopPropagation();
              onViewLogs(job.jobId);
            }}
            aria-label={t.ciViewLog}
          >
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
              <path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H2zm1 3h10v1H3V4zm0 3h10v1H3V7zm0 3h7v1H3v-1z" />
            </svg>
          </button>
        </TooltipSimple>
        <button
          type="button"
          className="adl-github__log-btn"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          aria-label={expanded ? t.ciCollapse : t.ciExpand}
        >
          {expanded ? (
            <IconChevronUp width={12} height={12} />
          ) : (
            <IconChevronDown width={12} height={12} />
          )}
        </button>
      </div>
      {expanded && job.stepResults.length > 0 && (
        <div className="adl-github-card__body">
          <ul className="adl-github-timeline">
            {job.stepResults.map((step, i) => (
              <li
                key={i}
                className={`adl-github-timeline__step ${statusClass(step.conclusion, step.status)}`}
              >
                <span className="adl-github-timeline__step-name">{step.name}</span>
                <span className="adl-github-timeline__step-chip">
                  {step.conclusion ?? step.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
});
