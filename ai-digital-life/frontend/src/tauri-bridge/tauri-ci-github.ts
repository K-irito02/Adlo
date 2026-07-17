import type { GitHubBridge } from '../shared/ipc/github';
import type { CiStatusSnapshot } from '@ai-digital-life/kernel';
import { invokeIpc } from './tauri-shared';

export function createTauriGithubBridge(): GitHubBridge {
  return {
    getStatus: (config) => invokeIpc<CiStatusSnapshot>('ci_get_status', { config }),
    getStatusWithoutToken: (owner, repo, branch) =>
      invokeIpc<CiStatusSnapshot>('ci_get_status_without_token', {
        owner,
        repo,
        branch,
      }),
    setAccessToken: (token: string) => invokeIpc<boolean>('ci_set_access_token', { token }),
    clearAccessToken: () => invokeIpc<boolean>('ci_clear_access_token'),
    hasAccessToken: () => invokeIpc<boolean>('ci_has_access_token'),
    getJobLogs: (config, runId) =>
      invokeIpc<Record<number, string>>('ci_get_job_logs', { config, runId }),
  };
}
