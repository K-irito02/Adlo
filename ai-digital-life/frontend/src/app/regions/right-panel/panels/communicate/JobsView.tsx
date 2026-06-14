import React, { useState, useMemo } from 'react';
import type { CiStatusSnapshot } from '@ai-digital-life/kernel';
import { JobRow } from './JobRow';
import { useTCopy } from '@app/i18n/useTCopy';

type FilterKey = 'all' | 'success' | 'failure' | 'running';

export function JobsView({
  snapshot,
  onViewLogs,
}: {
  snapshot: CiStatusSnapshot | null;
  onViewLogs: (jobId: number) => void;
}) {
  const { t } = useTCopy();
  const [filter, setFilter] = useState<FilterKey>('all');

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all', label: t.ciFilterAll },
    { key: 'success', label: t.ciFilterSuccess },
    { key: 'failure', label: t.ciFilterFailure },
    { key: 'running', label: t.ciFilterRunning },
  ];

  const filteredJobs = useMemo(() => {
    if (!snapshot?.jobs?.length) {
      return [];
    }
    let result = snapshot.jobs;
    switch (filter) {
      case 'success':
        result = result.filter((j) => j.conclusion === 'success');
        break;
      case 'failure':
        result = result.filter((j) => j.conclusion === 'failure' || j.conclusion === 'cancelled');
        break;
      case 'running':
        result = result.filter((j) => j.status === 'in_progress' || j.status === 'queued');
        break;
    }
    return result;
  }, [snapshot?.jobs, filter]);

  if (!snapshot?.jobs?.length) {
    return (
      <div className="adl-github-empty">
        <p>{t.ciNoJobData}</p>
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
      {filteredJobs.length > 0 ? (
        <div className="adl-github-section" style={{ paddingTop: 6 }}>
          <ul className="adl-github__job-list" style={{ padding: 0 }}>
            {filteredJobs.map((job) => (
              <JobRow key={job.jobId} job={job} onViewLogs={onViewLogs} />
            ))}
          </ul>
        </div>
      ) : (
        <div className="adl-github-empty" style={{ padding: '24px 16px' }}>
          <p>{t.ciNoJobData}</p>
        </div>
      )}
    </div>
  );
}
