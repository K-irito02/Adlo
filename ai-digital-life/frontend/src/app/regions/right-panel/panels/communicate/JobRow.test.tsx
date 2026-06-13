import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TCopyProvider } from '@app/i18n/TCopyContext';
import { JobRow } from './JobRow';
import type { CiJobSummary } from '@ai-digital-life/kernel';

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
});

function WithTCopy({ children }: { children: React.ReactNode }) {
  return (
    <TCopyProvider t={mockT as any} locale="zh-CN">
      {children}
    </TCopyProvider>
  );
}

describe('JobRow', () => {
  const job: CiJobSummary = {
    jobId: 1,
    runId: 1,
    name: 'Test Job',
    status: 'completed',
    conclusion: 'success',
    startedAt: null,
    completedAt: null,
    htmlUrl: null,
    stepResults: [
      {
        name: 'Step 1',
        status: 'completed',
        conclusion: 'success',
        startedAt: null,
        completedAt: null,
      },
      {
        name: 'Step 2',
        status: 'completed',
        conclusion: 'failure',
        startedAt: null,
        completedAt: null,
      },
    ],
  };

  it('renders job name and conclusion', () => {
    const html = renderToStaticMarkup(
      <WithTCopy>
        <JobRow job={job} onViewLogs={() => {}} />
      </WithTCopy>
    );
    expect(html).toContain('Test Job');
    expect(html).toContain('success');
  });

  it('renders with status class on card', () => {
    const html = renderToStaticMarkup(
      <WithTCopy>
        <JobRow job={job} onViewLogs={() => {}} />
      </WithTCopy>
    );
    expect(html).toContain('adl-github-card--status');
    expect(html).toContain('is-success');
  });

  it('does not render steps when collapsed', () => {
    const html = renderToStaticMarkup(
      <WithTCopy>
        <JobRow job={job} onViewLogs={() => {}} />
      </WithTCopy>
    );
    expect(html).not.toContain('adl-github-timeline');
  });

  it('renders log button', () => {
    const html = renderToStaticMarkup(
      <WithTCopy>
        <JobRow job={job} onViewLogs={() => {}} />
      </WithTCopy>
    );
    expect(html).toContain('adl-github__log-btn');
  });
});
