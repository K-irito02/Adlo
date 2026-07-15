import type { CiStatusSnapshot } from '@ai-digital-life/kernel';
import { requestPreviewApi } from './preview-api';

export function createPreviewTaskBridge() {
  const ciGetStatus = async (config: {
    owner: string;
    repo: string;
    branch: string;
    workflowId?: string | null;
    accessToken?: string | null;
  }) => {
    const param = new URLSearchParams();
    param.set('owner', config.owner);
    param.set('repo', config.repo);
    param.set('branch', config.branch);
    const token = typeof config.accessToken === 'string' ? config.accessToken.trim() : '';
    const headers: Record<string, string> = {};
    if (token) {
      headers['X-CI-Access-Token'] = token;
    }
    return requestPreviewApi<CiStatusSnapshot>(`/ci/status?${param.toString()}`, { headers });
  };

  const ciGetStatusWithoutToken = async (owner: string, repo: string, branch: string) => {
    const param = new URLSearchParams();
    param.set('owner', owner);
    param.set('repo', repo);
    param.set('branch', branch);
    return requestPreviewApi<CiStatusSnapshot>(`/ci/status?${param.toString()}`);
  };

  const ciSetAccessToken = async (token: string) => {
    return requestPreviewApi<boolean>('/ci/set-access-token', {
      method: 'POST',
      body: JSON.stringify({ token }),
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const ciClearAccessToken = async () => {
    return requestPreviewApi<boolean>('/ci/clear-access-token', {
      method: 'POST',
    });
  };

  const ciHasAccessToken = async () => {
    return requestPreviewApi<boolean>('/ci/has-access-token');
  };

  const ciGetJobLogs = async (
    config: {
      owner: string;
      repo: string;
      branch: string;
      workflowId?: string | null;
      accessToken?: string | null;
    },
    runId: number
  ) => {
    return requestPreviewApi<Record<number, string>>('/ci/status/job-logs', {
      method: 'POST',
      body: JSON.stringify({ config, runId }),
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const makeCiBridge = () => ({
    getStatus: ciGetStatus,
    getStatusWithoutToken: ciGetStatusWithoutToken,
    setAccessToken: ciSetAccessToken,
    clearAccessToken: ciClearAccessToken,
    hasAccessToken: ciHasAccessToken,
    getJobLogs: ciGetJobLogs,
  });

  const ciBridge = makeCiBridge();

  return {
    ci: ciBridge,
    github: makeCiBridge(),
  };
}
