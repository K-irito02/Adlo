import type { CiStatusSnapshot } from '@ai-digital-life/kernel';
import { StatusDot } from './StatusDot';
import {
  statusColor,
  formatCommit,
  formatTime,
  formatRelativeTime,
  type RelativeTimeResult,
} from './githubPanelUtils';
import { JobRow } from './JobRow';
import { TooltipSimple } from '@components/Tooltip';
import { IconClock, IconClipboardList } from '@app/icons';

function resolveRelativeTime(
  result: RelativeTimeResult | string,
  copy: Record<string, string>
): string {
  if (typeof result === 'string') {
    return result;
  }
  let str = copy[result.key] ?? result.key;
  for (const [k, v] of Object.entries(result.params)) {
    str = str.replace(`{${k}}`, String(v));
  }
  return str;
}

function LoadingSkeleton() {
  return (
    <div className="adl-github-overview">
      <div className="adl-github-skeleton adl-github-skeleton--title" />
      <div className="adl-github-skeleton adl-github-skeleton--line" style={{ width: '80%' }} />
      <div className="adl-github-skeleton adl-github-skeleton--line" style={{ width: '60%' }} />
      <div className="adl-github-skeleton adl-github-skeleton--card" />
      <div className="adl-github-skeleton adl-github-skeleton--card" />
    </div>
  );
}

export function OverviewView({
  snapshot,
  loading,
  branch,
  copy,
  locale,
  onViewLogs,
}: {
  snapshot: CiStatusSnapshot | null;
  loading: boolean;
  branch: string;
  copy: Record<string, string>;
  locale: 'zh-CN' | 'en-US';
  onViewLogs: (jobId: number) => void;
}) {
  if (loading && !snapshot) {
    return <LoadingSkeleton />;
  }

  if (!snapshot) {
    return (
      <div className="adl-github-empty">
        <IconClipboardList width={28} height={28} />
        <p>{copy.ciConfigToQuery}</p>
        <span>{copy.ciConfigToQueryHint}</span>
      </div>
    );
  }

  return (
    <div>
      {snapshot.latestRun ? (
        <>
          <div className="adl-github-hero">
            <div className="adl-github-hero__header">
              <StatusDot
                conclusion={snapshot.latestRun.conclusion}
                status={snapshot.latestRun.status}
                animated
              />
              <span className="adl-github-hero__name">{snapshot.latestRun.name}</span>
              <span
                className="adl-chip adl-chip--xs"
                style={{
                  color: statusColor(snapshot.latestRun.conclusion, snapshot.latestRun.status),
                }}
              >
                {snapshot.latestRun.conclusion ?? snapshot.latestRun.status}
              </span>
              <TooltipSimple content={formatTime(snapshot.latestRun.runStartedAt, locale)}>
                <span className="adl-github-hero__time">
                  {resolveRelativeTime(formatRelativeTime(snapshot.latestRun.runStartedAt), copy)}
                </span>
              </TooltipSimple>
            </div>
            <div className="adl-github-card">
              <div className="adl-github-card__meta">
                <span className="adl-github-card__meta-item">
                  <span className="adl-github-card__meta-label">{copy.ciTriggeredBy}:</span>
                  {snapshot.latestRun.actor ?? '—'}
                </span>
                <span className="adl-github-card__meta-item">
                  <span className="adl-github-card__meta-label">{copy.ciEvent}:</span>
                  {snapshot.latestRun.event ?? '—'}
                </span>
                <span className="adl-github-card__meta-item">
                  <span className="adl-github-card__meta-label">{copy.ciSha}:</span>
                  <code className="adl-github__sha">
                    {formatCommit(snapshot.latestRun.headSha)}
                  </code>
                </span>
                <span className="adl-github-card__meta-item">
                  <span className="adl-github-card__meta-label">{copy.ciStartedAt}:</span>
                  {formatTime(snapshot.latestRun.runStartedAt, locale)}
                </span>
              </div>
              {snapshot.latestRun.htmlUrl && (
                <div className="adl-github-card__link-wrap">
                  <a
                    className="adl-github__link"
                    href={snapshot.latestRun.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {copy.ciViewOnGitHub}
                  </a>
                </div>
              )}
            </div>
          </div>

          {snapshot.jobs.length > 0 && (
            <div className="adl-github-section">
              <h4 className="adl-github-section__title">
                {copy.ciJobsTitle}
                <span className="adl-github-section__count">({snapshot.jobs.length})</span>
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
        <div className="adl-github-empty">
          <IconClock width={28} height={28} />
          <p>{copy.ciNoWorkflowRuns}</p>
          <span>{copy.ciNoWorkflowRunsHint?.replace('{branch}', branch) ?? ''}</span>
        </div>
      )}
    </div>
  );
}
