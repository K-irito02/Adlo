import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TCopyProvider } from '@app/i18n/TCopyContext';
import { WorkflowsView } from './WorkflowsView';
import type { CiStatusSnapshot } from '@ai-digital-life/kernel';

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

describe('WorkflowsView', () => {
  const snapshot: CiStatusSnapshot = {
    repo: 'test/repo',
    branch: 'main',
    latestRun: null,
    jobs: [
      {
        jobId: 1,
        runId: 1,
        name: 'Build',
        status: 'completed',
        conclusion: 'success',
        startedAt: null,
        completedAt: null,
        htmlUrl: null,
        stepResults: Array(5)
          .fill(null)
          .map((_, i) => ({
            name: `Step ${i + 1}`,
            status: 'completed',
            conclusion: 'success',
            startedAt: null,
            completedAt: null,
          })),
      },
      {
        jobId: 2,
        runId: 1,
        name: 'Test',
        status: 'completed',
        conclusion: 'failure',
        startedAt: null,
        completedAt: null,
        htmlUrl: null,
        stepResults: Array(3)
          .fill(null)
          .map((_, i) => ({
            name: `Step ${i + 1}`,
            status: 'completed',
            conclusion: i < 2 ? 'success' : 'failure',
            startedAt: null,
            completedAt: null,
          })),
      },
    ],
    logs: null,
    capturedAtMs: Date.now(),
    error: null,
  };

  it('renders empty state when no jobs', () => {
    const html = renderToStaticMarkup(
      <WithTCopy>
        <WorkflowsView snapshot={{ ...snapshot, jobs: [] }} />
      </WithTCopy>,
    );
    expect(html).toContain('adl-github-empty');
  });

  it('renders filter bar', () => {
    const html = renderToStaticMarkup(
      <WithTCopy>
        <WorkflowsView snapshot={snapshot} />
      </WithTCopy>,
    );
    expect(html).toContain('adl-github-filter');
  });

  it('renders workflow cards with progress bars', () => {
    const html = renderToStaticMarkup(
      <WithTCopy>
        <WorkflowsView snapshot={snapshot} />
      </WithTCopy>,
    );
    expect(html).toContain('adl-github-progress');
    expect(html).toContain('Build');
    expect(html).toContain('Test');
  });

  it('renders step count for each job', () => {
    const html = renderToStaticMarkup(
      <WithTCopy>
        <WorkflowsView snapshot={snapshot} />
      </WithTCopy>,
    );
    expect(html).toContain('5/5');
    expect(html).toContain('2/3');
  });
});
