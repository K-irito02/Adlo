import { useState, useMemo } from 'react';
import type { CiStatusSnapshot } from '@ai-digital-life/kernel';
import { StatusDot } from './StatusDot';
import { statusColor, formatDuration, statusClass } from './githubPanelUtils';
import { useTCopy } from '@app/i18n/useTCopy';

type FilterKey = 'all' | 'success' | 'failure' | 'running';

export function WorkflowsView({ snapshot }: { snapshot: CiStatusSnapshot | null }) {
  const { t } = useTCopy();
  const [filter, setFilter] = useState<FilterKey>('all');

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all', label: t.ciFilterAll },
    { key: 'success', label: t.ciFilterSuccess },
    { key: 'failure', label: t.ciFilterFailure },
    { key: 'running', label: t.ciFilterRunning },
  ];

  const jobs = useMemo(() => {
    if (!snapshot?.jobs?.length) {
      return [];
    }
    switch (filter) {
      case 'success':
        return snapshot.jobs.filter((j) => j.conclusion === 'success');
      case 'failure':
        return snapshot.jobs.filter(
          (j) => j.conclusion === 'failure' || j.conclusion === 'cancelled'
        );
      case 'running':
        return snapshot.jobs.filter((j) => j.status === 'in_progress' || j.status === 'queued');
      default:
        return snapshot.jobs;
    }
  }, [snapshot?.jobs, filter]);

  if (!snapshot?.jobs?.length) {
    return (
      <div className="adl-github-empty">
        <p>{t.ciNoWorkflowData}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="adl-github-filter">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`adl-github-filter__btn${filter === f.key ? ' is-active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="adl-github-jobs__list">
        {jobs.map((job) => {
          const total = job.stepResults.length;
          const successCount = job.stepResults.filter((s) => s.conclusion === 'success').length;
          const sClass = statusClass(job.conclusion, job.status);
          const pct = total > 0 ? Math.round((successCount / total) * 100) : 0;
          return (
            <div
              key={job.jobId}
              className={`adl-github-card adl-github-card--status ${sClass}`}
              style={{ marginBottom: 6 }}
            >
              <div className="adl-github-card__header" style={{ cursor: 'default' }}>
                <StatusDot conclusion={job.conclusion} status={job.status} animated />
                <span className="adl-github-card__title">{job.name}</span>
                <span
                  className="adl-chip adl-chip--xs"
                  style={{ color: statusColor(job.conclusion, job.status) }}
                >
                  {job.conclusion ?? job.status}
                </span>
                <span className="adl-github__job-duration adl-text--secondary">
                  {formatDuration(job.startedAt, job.completedAt)}
                </span>
              </div>
              <div className="adl-github-card__body">
                <div className="adl-github-progress">
                  <div className="adl-github-progress__bar">
                    <div
                      className={`adl-github-progress__fill ${sClass}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="adl-github-progress__text">
                    {successCount}/{total}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        {jobs.length === 0 && (
          <div className="adl-github-empty adl-github-empty--compact">
            <p>{t.ciNoWorkflowData}</p>
          </div>
        )}
      </div>
    </div>
  );
}
