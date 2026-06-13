import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TCopyProvider } from '../../../../i18n/TCopyContext';
import { JobsView } from './JobsView';
import type { CiStatusSnapshot } from '@ai-digital-life/kernel';

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
});

function WithTCopy({ children }: { children: React.ReactNode }) {
  return <TCopyProvider t={mockT as any} locale="zh-CN">{children}</TCopyProvider>;
}

describe('JobsView', () => {
  const snapshot: CiStatusSnapshot = {
    repo: 'test/repo',
    branch: 'main',
    latestRun: null,
    jobs: [
      {
        jobId: 1, runId: 1, name: 'Build', status: 'completed', conclusion: 'success',
        startedAt: null, completedAt: null, htmlUrl: null,
        stepResults: [{ name: 'S1', status: 'completed', conclusion: 'success', startedAt: null, completedAt: null }],
      },
    ],
    logs: null,
    capturedAtMs: Date.now(),
    error: null,
  };

  it('renders empty state when no jobs', () => {
    const html = renderToStaticMarkup(<WithTCopy><JobsView snapshot={{ ...snapshot, jobs: [] }} onViewLogs={() => {}} /></WithTCopy>);
    expect(html).toContain('adl-github-empty');
  });

  it('renders search input', () => {
    const html = renderToStaticMarkup(<WithTCopy><JobsView snapshot={snapshot} onViewLogs={() => {}} /></WithTCopy>);
    expect(html).toContain('adl-github-search');
  });

  it('renders filter bar', () => {
    const html = renderToStaticMarkup(<WithTCopy><JobsView snapshot={snapshot} onViewLogs={() => {}} /></WithTCopy>);
    expect(html).toContain('adl-github-filter');
  });

  it('renders job list', () => {
    const html = renderToStaticMarkup(<WithTCopy><JobsView snapshot={snapshot} onViewLogs={() => {}} /></WithTCopy>);
    expect(html).toContain('adl-github__job-list');
    expect(html).toContain('Build');
  });
});
