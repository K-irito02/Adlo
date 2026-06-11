import React from 'react';
import type { CiStatusSnapshot } from '@ai-digital-life/kernel';
import { JobRow } from './JobRow';

export function JobsView({
  snapshot,
  onViewLogs,
}: {
  snapshot: CiStatusSnapshot | null;
  onViewLogs: (jobId: number) => void;
}) {
  if (!snapshot?.jobs?.length) {
    return (
      <div className="adl-github__empty">
        <p>暂无 Job 数据</p>
      </div>
    );
  }

  return (
    <div className="adl-github__jobs" style={{ padding: '8px 12px 0' }}>
      <h4 className="adl-github__section-title" style={{ marginBottom: 6 }}>
        {snapshot.jobs.length} 个 Job
      </h4>
      <ul className="adl-github__job-list">
        {snapshot.jobs.map((job) => (
          <JobRow key={job.jobId} job={job} onViewLogs={onViewLogs} />
        ))}
      </ul>
    </div>
  );
}
