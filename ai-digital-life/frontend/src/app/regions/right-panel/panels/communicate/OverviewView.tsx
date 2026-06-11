import React from 'react';
import type { CiStatusSnapshot } from '@ai-digital-life/kernel';
import { StatusDot } from './StatusDot';
import { statusColor, formatCommit, formatTime } from './githubPanelUtils';
import { JobRow } from './JobRow';

export function OverviewView({
  snapshot,
  loading,
  branch,
  copy,
  onViewLogs,
}: {
  snapshot: CiStatusSnapshot | null;
  loading: boolean;
  branch: string;
  copy: Record<string, string>;
  onViewLogs: (jobId: number) => void;
}) {
  if (loading && !snapshot) {
    return (
      <div className="adl-github__empty">
        <p>{'加载中…'}</p>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="adl-github__empty">
        <svg
          viewBox="0 0 24 24"
          width="32"
          height="32"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
        </svg>
        <p>{copy.ciConfigToQuery}</p>
        <span className="adl-text--tertiary">{copy.ciConfigToQueryHint}</span>
      </div>
    );
  }

  return (
    <div>
      {snapshot.latestRun ? (
        <>
          <div className="adl-github__run-summary">
            <div className="adl-github__run-title">
              <StatusDot
                conclusion={snapshot.latestRun.conclusion}
                status={snapshot.latestRun.status}
              />
              <span className="adl-github__run-name">{snapshot.latestRun.name}</span>
              <span
                className="adl-chip adl-chip--xs"
                style={{
                  color: statusColor(snapshot.latestRun.conclusion, snapshot.latestRun.status),
                }}
              >
                {snapshot.latestRun.conclusion ?? snapshot.latestRun.status}
              </span>
            </div>
            <div className="adl-github__run-meta">
              <span>
                <span className="adl-text--tertiary">{copy.ciTriggeredBy}:</span>{' '}
                {snapshot.latestRun.actor ?? '—'}
              </span>
              <span>
                <span className="adl-text--tertiary">{copy.ciEvent}:</span>{' '}
                {snapshot.latestRun.event ?? '—'}
              </span>
              <span>
                <span className="adl-text--tertiary">{copy.ciSha}:</span>
                <code className="adl-github__sha">{formatCommit(snapshot.latestRun.headSha)}</code>
              </span>
              <span>
                <span className="adl-text--tertiary">{copy.ciStartedAt}:</span>{' '}
                {formatTime(snapshot.latestRun.runStartedAt)}
              </span>
              {snapshot.latestRun.htmlUrl && (
                <a
                  className="adl-github__link"
                  href={snapshot.latestRun.htmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {copy.ciViewOnGithub}
                </a>
              )}
            </div>
          </div>

          {snapshot.jobs.length > 0 && (
            <div className="adl-github__jobs">
              <h4 className="adl-github__section-title">
                {copy.ciJobsTitle} ({snapshot.jobs.length})
              </h4>
              <ul className="adl-github__job-list">
                {snapshot.jobs.map((job) => (
                  <JobRow key={job.jobId} job={job} onViewLogs={onViewLogs} />
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div className="adl-github__empty">
          <svg
            viewBox="0 0 24 24"
            width="32"
            height="32"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          <p>{copy.ciNoWorkflowRuns}</p>
          <span className="adl-text--tertiary">
            {copy.ciNoWorkflowRunsHint.replace('{branch}', branch)}
          </span>
        </div>
      )}
    </div>
  );
}
