import React from 'react';
import type { CiStatusSnapshot } from '@ai-digital-life/kernel';
import { JobRow } from './JobRow';
import { useTCopy } from '../../../../i18n/useTCopy';

export function JobsView({
  snapshot,
  onViewLogs,
}: {
  snapshot: CiStatusSnapshot | null;
  onViewLogs: (jobId: number) => void;
}) {
  const { t, formatT } = useTCopy();
  if (!snapshot?.jobs?.length) {
    return (
      <div className="adl-github__empty">
        <p>{t.ciNoJobData}</p>
      </div>
    );
  }

  return (
    <div className="adl-github__jobs" style={{ padding: '8px 12px 0' }}>
      <h4 className="adl-github__section-title" style={{ marginBottom: 6 }}>
        {formatT(t, 'jobCount', { count: snapshot.jobs.length })}
      </h4>
      <ul className="adl-github__job-list">
        {snapshot.jobs.map((job) => (
          <JobRow key={job.jobId} job={job} onViewLogs={onViewLogs} />
        ))}
      </ul>
    </div>
  );
}
