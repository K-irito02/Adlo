import React from 'react';
import { describe, expect, it, vi, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TCopyProvider } from '@app/i18n/TCopyContext';
import { GitHubLogViewer } from './GitHubLogViewer';
import type { CiStatusSnapshot } from '@ai-digital-life/kernel';

beforeAll(() => {
  vi.stubGlobal('window', {
    __TAURI_INTERNALS__: undefined,
    digitalLife: undefined,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    location: { origin: 'http://localhost' },
  } as any);
});

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

describe('GitHubLogViewer', () => {
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
        stepResults: [],
      },
    ],
    logs: null,
    capturedAtMs: Date.now(),
    error: null,
  };

  it('renders toolbar with job selector', () => {
    const html = renderToStaticMarkup(
      <WithTCopy>
        <GitHubLogViewer
          snapshot={snapshot}
          config={{ owner: 'test', repo: 'test', branch: 'main' }}
          dirKey="test"
        />
      </WithTCopy>,
    );
    expect(html).toContain('adl-logviewer__toolbar');
    expect(html).toContain('adl-logviewer__job-select-wrap');
  });

  it('renders search input', () => {
    const html = renderToStaticMarkup(
      <WithTCopy>
        <GitHubLogViewer
          snapshot={snapshot}
          config={{ owner: 'test', repo: 'test', branch: 'main' }}
          dirKey="test"
        />
      </WithTCopy>,
    );
    expect(html).toContain('adl-logviewer__search-wrap');
    expect(html).toContain('adl-logviewer__search-input');
    expect(html).toContain('adl-logviewer__search-icon');
  });

  it('renders collapse blank checkbox', () => {
    const html = renderToStaticMarkup(
      <WithTCopy>
        <GitHubLogViewer
          snapshot={snapshot}
          config={{ owner: 'test', repo: 'test', branch: 'main' }}
          dirKey="test"
        />
      </WithTCopy>,
    );
    expect(html).toContain('adl-logviewer__checkbox');
    expect(html).toContain('adl-logviewer__checkbox-box');
    expect(html).toContain('adl-logviewer__checkbox-label');
  });

  it('renders GitHub link when htmlUrl exists', () => {
    const snapWithUrl: CiStatusSnapshot = {
      ...snapshot,
      latestRun: {
        runId: 1,
        name: 'CI',
        status: 'completed',
        conclusion: 'success',
        headSha: 'abc',
        headBranch: 'main',
        htmlUrl: 'https://github.com/test/repo/actions/runs/1',
        runStartedAt: null,
        updatedAt: null,
        actor: null,
        event: null,
      },
    };
    const html = renderToStaticMarkup(
      <WithTCopy>
        <GitHubLogViewer
          snapshot={snapWithUrl}
          config={{ owner: 'test', repo: 'test', branch: 'main' }}
          dirKey="test"
        />
      </WithTCopy>,
    );
    expect(html).toContain('adl-github__link');
  });
});
