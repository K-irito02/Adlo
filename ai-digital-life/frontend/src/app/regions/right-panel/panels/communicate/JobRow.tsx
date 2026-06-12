import React, { useState } from 'react';
import type { CiJobSummary } from '@ai-digital-life/kernel';
import { StatusDot } from './StatusDot';
import { statusColor, formatDuration } from './githubPanelUtils';

export function JobRow({
  job,
  onViewLogs,
}: {
  job: CiJobSummary;
  onViewLogs: (jobId: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="adl-github__job">
      <div
        className="adl-github__job-header"
        onClick={() => setExpanded((v) => !v)}
        style={{ cursor: 'pointer' }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}
      >
        <StatusDot conclusion={job.conclusion} status={job.status} />
        <span className="adl-github__job-name">{job.name}</span>
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
        <button
          type="button"
          className="adl-github__log-btn"
          onClick={(e) => {
            e.stopPropagation();
            onViewLogs(job.jobId);
          }}
          title="查看日志"
        >
          <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
            <path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H2zm1 3h10v1H3V4zm0 3h10v1H3V7zm0 3h7v1H3v-1z" />
          </svg>
        </button>
        <span className="adl-github__job-toggle">{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && job.stepResults.length > 0 && (
        <ul className="adl-github__steps">
          {job.stepResults.map((step, i) => (
            <li key={i} className="adl-github__step">
              <StatusDot conclusion={step.conclusion} status={step.status} />
              <span>{step.name}</span>
              <span
                style={{
                  color: statusColor(step.conclusion, step.status),
                  fontSize: 'var(--text-xs)',
                  marginLeft: 'auto',
                }}
              >
                {step.conclusion ?? step.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
