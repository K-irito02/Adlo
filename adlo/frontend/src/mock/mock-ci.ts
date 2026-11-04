import type { GitHubBridge, CiRepoConfig, CiStatusSnapshot } from "../shared/ipc/github";
import type { IpcResult } from "@adlo/kernel";

/**
 * Mock GitHub bridge（mock-bridge 用）。
 *
 * token 三方法（set/clear/hasAccessToken）仅为满足 GitHubBridge 接口形状而保留；
 * store 侧的 CI/GitHub 状态已随 remove-communicate-panel 删除，全仓已无调用方。
 * localStorage 键 'adl:browser.ciAccessToken' 已退出 persist registry（启动即被清理），
 * 此处仅作 mock 内部往返，不再与任何 store 共享语义。
 *
 * NOTE: mock bridge keeps synchronous direct localStorage IO on purpose —
 * `hasAccessToken` must observe `setAccessToken` immediately, which the shared
 * debounced persist channel cannot guarantee. Non-legacy key, out of the
 * persist-channel gate scope.
 */
function createTokenManagement(
  storageKey: string,
  label: string
): Pick<GitHubBridge, 'setAccessToken' | 'clearAccessToken' | 'hasAccessToken'> {
  return {
    setAccessToken: async (token: string): Promise<IpcResult<boolean>> => {
      if (typeof window !== 'undefined') {
        try {
          if (token.length > 0) {
            window.localStorage.setItem(storageKey, token);
          } else {
            window.localStorage.removeItem(storageKey);
          }
        } catch (e) {
          console.warn(`[mock-bridge] Failed to set ${label} access token in localStorage`, e);
        }
      }
      return { ok: true, data: true };
    },
    clearAccessToken: async (): Promise<IpcResult<boolean>> => {
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem(storageKey);
        } catch (e) {
          console.warn(`[mock-bridge] Failed to remove ${label} access token from localStorage`, e);
        }
      }
      return { ok: true, data: true };
    },
    hasAccessToken: async (): Promise<IpcResult<boolean>> => {
      if (typeof window !== 'undefined') {
        try {
          return {
            ok: true,
            data: !!window.localStorage.getItem(storageKey)?.length,
          };
        } catch (e) {
          console.warn(`[mock-bridge] Failed to check ${label} access token in localStorage`, e);
          return { ok: true, data: false };
        }
      }
      return { ok: true, data: false };
    },
  };
}

const mockStatusHandlers: Pick<
  GitHubBridge,
  'getStatus' | 'getStatusWithoutToken' | 'getJobLogs'
> = {
  getStatus: async (config: CiRepoConfig): Promise<IpcResult<CiStatusSnapshot>> => ({
    ok: true,
    data: {
      repo: `${config.owner}/${config.repo}`,
      branch: config.branch,
      latestRun: null,
      jobs: [],
      logs: null,
      capturedAtMs: Date.now(),
      error: null,
    },
  }),
  getStatusWithoutToken: async (
    owner: string,
    repo: string,
    branch: string
  ): Promise<IpcResult<CiStatusSnapshot>> => ({
    ok: true,
    data: {
      repo: `${owner}/${repo}`,
      branch,
      latestRun: null,
      jobs: [],
      logs: null,
      capturedAtMs: Date.now(),
      error: null,
    },
  }),
  getJobLogs: async (
    _config: CiRepoConfig,
    _runId: number
  ): Promise<IpcResult<Record<number, string>>> => ({
    ok: true,
    data: {
      1: '[2024-01-01T00:00:00Z] Mock log line 1\n[2024-01-01T00:00:01Z] Mock log line 2\n',
    },
  }),
};

export const mockGithub: GitHubBridge = {
  ...createTokenManagement('adl:browser.ciAccessToken', 'GitHub'),
  ...mockStatusHandlers,
};
