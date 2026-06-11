import React from 'react';
import type { CiStatusSnapshot } from '@ai-digital-life/kernel';
import { StatusDot } from './StatusDot';

export function WorkflowsView({ snapshot }: { snapshot: CiStatusSnapshot | null }) {
  if (!snapshot?.jobs?.length) {
    return (
      <div className="adl-github__empty">
        <p>暂无 Workflow 数据</p>
      </div>
    );
  }

  return (
    <div className="adl-github__jobs" style={{ padding: '8px 12px 0' }}>
      {snapshot.jobs.map((job) => (
        <div key={job.jobId} style={{ marginBottom: 8 }}>
          <h4 className="adl-github__section-title" style={{ marginBottom: 4 }}>
            <StatusDot conclusion={job.conclusion} status={job.status} />
            <span style={{ marginLeft: 6 }}>{job.name}</span>
          </h4>
          <div
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              paddingLeft: 14,
            }}
          >
            {job.stepResults.length} 个 Step
          </div>
        </div>
      ))}
    </div>
  );
}
