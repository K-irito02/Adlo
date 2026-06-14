import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TCopyProvider } from '@app/i18n/TCopyContext';
import { OverviewView } from './OverviewView';
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

const mockCopy: Record<string, string> = {
  ciConfigToQuery: '配置仓库信息以查询',
  ciConfigToQueryHint: '请配置 owner 和 repo',
  ciNoWorkflowRuns: '暂无运行',
  ciNoWorkflowRunsHint: '在 {branch} 分支上',
  ciTriggeredBy: '触发者',
  ciEvent: '事件',
  ciSha: 'SHA',
  ciStartedAt: '开始时间',
  ciViewOnGitHub: '在 GitHub 上查看',
  ciJobsTitle: '任务',
};

describe('OverviewView', () => {
  const snapshot: CiStatusSnapshot = {
    repo: 'test/repo',
    branch: 'main',
    latestRun: {
      runId: 1,
      name: 'CI Build',
      status: 'completed',
      conclusion: 'success',
      headSha: 'abc123def456',
      headBranch: 'main',
      htmlUrl: 'https://github.com/test/repo/actions/runs/1',
      runStartedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      actor: 'testuser',
      event: 'push',
    },
    jobs: [
      {
        jobId: 1,
        runId: 1,
        name: 'Test Job',
        status: 'completed',
        conclusion: 'success',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        htmlUrl: null,
        stepResults: [
          {
            name: 'Step 1',
            status: 'completed',
            conclusion: 'success',
            startedAt: null,
            completedAt: null,
          },
        ],
      },
    ],
    logs: null,
    capturedAtMs: Date.now(),
    error: null,
  };

  it('renders loading state', () => {
    const html = renderToStaticMarkup(
      <WithTCopy>
        <OverviewView
          snapshot={null}
          loading
          branch=""
          copy={{}}
          onViewLogs={() => {}}
          locale="zh-CN"
        />
      </WithTCopy>
    );
    expect(html).toContain('adl-github-skeleton');
  });

  it('renders empty state when no snapshot', () => {
    const html = renderToStaticMarkup(
      <WithTCopy>
        <OverviewView
          snapshot={null}
          loading={false}
          branch=""
          copy={{}}
          onViewLogs={() => {}}
          locale="zh-CN"
        />
      </WithTCopy>
    );
    expect(html).toContain('adl-github-empty');
  });

  it('renders run card with snapshot data', () => {
    const html = renderToStaticMarkup(
      <WithTCopy>
        <OverviewView
          snapshot={snapshot}
          loading={false}
          branch="main"
          copy={mockCopy}
          onViewLogs={() => {}}
          locale="zh-CN"
        />
      </WithTCopy>
    );
    expect(html).toContain('adl-github-hero');
    expect(html).toContain('CI Build');
    expect(html).toContain('testuser');
  });

  it('renders section title with job count', () => {
    const html = renderToStaticMarkup(
      <WithTCopy>
        <OverviewView
          snapshot={snapshot}
          loading={false}
          branch="main"
          copy={mockCopy}
          onViewLogs={() => {}}
          locale="zh-CN"
        />
      </WithTCopy>
    );
    expect(html).toContain('adl-github-section__title');
    expect(html).toContain('1');
  });

  it('renders no-runs empty state when latestRun is null', () => {
    const noRunSnapshot: CiStatusSnapshot = { ...snapshot, latestRun: null };
    const html = renderToStaticMarkup(
      <WithTCopy>
        <OverviewView
          snapshot={noRunSnapshot}
          loading={false}
          branch="main"
          copy={mockCopy}
          onViewLogs={() => {}}
          locale="zh-CN"
        />
      </WithTCopy>
    );
    expect(html).toContain('adl-github-empty');
  });
});
