/**
 * CI 状态切片
 * 管理 GitHub Actions 运行状态
 *
 * 安全说明：
 * - Tauri 桌面模式：`ciAccessToken` 不持久化到前端，仅通过 `tauri-bridge` 调用 Rust credential crate（系统钥匙串优先，
 *   fallback 为加密文件存储）
 * - 浏览器开发模式：仅保存在内存 + localStorage 中（key: adl-ui:ci-access-token）
 * - 发送请求时通过 HTTP header 传递，避免出现在 URL 或日志中
 * - 任何代码路径禁止将 token 写入 console.log / error / 调试输出
 */
import type { CiJobSummary, CiStatusSnapshot, CiRepoConfig } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';
import type { DigitalLifeBridge } from '@shared/ipc';
import { createDebouncedWrite } from '../shared';

// Local storage keys
const CI_CONFIG_KEY = 'adl-ui:ci-config';
const CI_ACCESS_TOKEN_KEY = 'adl-ui:ci-access-token';
const CI_AUTO_REFRESH_ON_PUSH_KEY = 'adl-ui:ci-auto-refresh-on-push';

// Batch write scheduler — coalesces multiple localStorage writes into one
const { scheduleWrite } = createDebouncedWrite(50);

function getBridge(): DigitalLifeBridge | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.digitalLife ?? null;
}

function isTauriMode(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  );
}

let _defaultsHydrated = false;

async function hydrateCiDefaults(): Promise<{
  config: CiRepoConfig;
  token: string;
  autoRefresh: boolean;
}> {
  const defaultCfg: CiRepoConfig = {
    owner: '',
    repo: '',
    branch: 'main',
    workflowId: null,
    accessToken: null,
  };
  if (typeof window === 'undefined') {
    return { config: defaultCfg, token: '', autoRefresh: true };
  }

  let config: CiRepoConfig = { ...defaultCfg };
  let autoRefresh = true;

  try {
    const rawConfig = window.localStorage.getItem(CI_CONFIG_KEY);
    if (rawConfig) {
      const parsed = JSON.parse(rawConfig);
      if (parsed && typeof parsed === 'object') {
        config = {
          owner: typeof parsed.owner === 'string' ? parsed.owner : '',
          repo: typeof parsed.repo === 'string' ? parsed.repo : '',
          branch: typeof parsed.branch === 'string' ? parsed.branch : 'main',
          workflowId: parsed.workflowId ?? null,
          accessToken: null,
        };
      }
    }
    const rawFlag = window.localStorage.getItem(CI_AUTO_REFRESH_ON_PUSH_KEY);
    if (rawFlag === '0') {
      autoRefresh = false;
    } else if (rawFlag === '1') {
      autoRefresh = true;
    }
  } catch {
    /* ignore */
  }

  // Token 读取：Tauri 模式走 credential crate，浏览器模式走 server API
  let token = '';
  const bridge = getBridge();
  if (isTauriMode() && bridge && bridge.ci && typeof bridge.ci.hasAccessToken === 'function') {
    try {
      const hasResult = await bridge.ci.hasAccessToken();
      if (hasResult && hasResult.ok && hasResult.data) {
        token = '::stored::'; // 标记后端已有 token（不在前端回显）
      }
    } catch {
      /* ignore */
    }
  } else if (bridge && bridge.ci && typeof bridge.ci.hasAccessToken === 'function') {
    // 浏览器预览模式：尝试从 server 读取
    try {
      const hasResult = await bridge.ci.hasAccessToken();
      if (hasResult && hasResult.ok && hasResult.data) {
        // Server 有 token，尝试从 localStorage 获取实际值用于后续请求
        const storedToken = window.localStorage.getItem(CI_ACCESS_TOKEN_KEY);
        token = typeof storedToken === 'string' && storedToken.length > 0 ? storedToken : '';
      }
    } catch {
      /* ignore */
    }
  }

  _defaultsHydrated = true;
  return { config, token, autoRefresh };
}

export interface CiSlice {
  ciConfig: CiRepoConfig;
  ciAccessToken: string;
  ciLoading: boolean;
  ciError: string | null;
  ciSnapshot: CiStatusSnapshot | null;
  ciJobs: CiJobSummary[];
  ciAutoRefreshOnPush: boolean;
  ciPersisted: boolean;

  setCiConfig: (config: CiRepoConfig) => void;
  setCiAccessToken: (token: string) => Promise<void>;
  clearCiAccessToken: () => Promise<void>;
  setCiAutoRefreshOnPush: (enabled: boolean) => void;
  refreshCiStatus: () => Promise<void>;
  notifyGitPushed: () => void;
  clearCiState: () => void;
}

export const createCiSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): CiSlice => {
  // 启动时异步读取 token，立即同步读取配置
  if (typeof window !== 'undefined') {
    void hydrateCiDefaults().then(({ config, token, autoRefresh }) => {
      set({ ciConfig: config, ciAccessToken: token, ciAutoRefreshOnPush: autoRefresh });
    });
  }

  return {
    ciConfig: { owner: '', repo: '', branch: 'main', workflowId: null, accessToken: null },
    ciAccessToken: '',
    ciLoading: false,
    ciError: null,
    ciSnapshot: null,
    ciJobs: [],
    ciAutoRefreshOnPush: true,
    ciPersisted: true,

    setCiConfig: (config) => {
      set({ ciConfig: config });
      scheduleWrite(CI_CONFIG_KEY, {
        owner: config.owner,
        repo: config.repo,
        branch: config.branch,
        workflowId: config.workflowId ?? null,
      });
    },

    setCiAccessToken: async (token) => {
      const sanitized = typeof token === 'string' ? token : '';
      const bridge = getBridge();

      // 调用 bridge API（Tauri 模式或浏览器预览模式）
      if (bridge && bridge.ci && typeof bridge.ci.setAccessToken === 'function') {
        try {
          await bridge.ci.setAccessToken(sanitized);
        } catch {
          /* ignore - 继续使用 localStorage 存储 */
        }
      }

      // 同时保存到 localStorage 以便页面刷新后能从 server 恢复
      set({ ciAccessToken: sanitized });
      if (typeof window !== 'undefined') {
        try {
          if (sanitized.length > 0) {
            window.localStorage.setItem(CI_ACCESS_TOKEN_KEY, sanitized);
          } else {
            window.localStorage.removeItem(CI_ACCESS_TOKEN_KEY);
          }
        } catch {
          /* ignore */
        }
      }
    },

    clearCiAccessToken: async () => {
      const bridge = getBridge();

      // 调用 bridge API（Tauri 模式或浏览器预览模式）
      if (bridge && bridge.ci && typeof bridge.ci.clearAccessToken === 'function') {
        try {
          await bridge.ci.clearAccessToken();
        } catch {
          /* ignore */
        }
      }

      // 同时清除 localStorage
      set({ ciAccessToken: '' });
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem(CI_ACCESS_TOKEN_KEY);
        } catch {
          /* ignore */
        }
      }
    },

    setCiAutoRefreshOnPush: (enabled) => {
      set({ ciAutoRefreshOnPush: enabled });
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(CI_AUTO_REFRESH_ON_PUSH_KEY, enabled ? '1' : '0');
        } catch {
          /* ignore */
        }
      }
    },

    refreshCiStatus: async () => {
      const state = _get();
      const config = state.ciConfig;
      const token = state.ciAccessToken;
      if (!config.owner || !config.repo) {
        set({
          ciError: '请先配置仓库 owner 和 repo',
          ciSnapshot: null,
          ciJobs: [],
        });
        return;
      }

      set({ ciLoading: true, ciError: null });

      try {
        const bridge = getBridge();
        if (!bridge || !bridge.ci) {
          set({ ciError: 'bridge not ready', ciLoading: false });
          return;
        }
        // Tauri 模式下 token 由后端 credential crate 注入；前端不传 accessToken
        const accessToken = isTauriMode() ? null : token;
        const result = await bridge.ci.getStatus({
          owner: config.owner,
          repo: config.repo,
          branch: config.branch,
          workflowId: config.workflowId,
          accessToken,
        });

        if (result.ok) {
          set({
            ciSnapshot: result.data,
            ciJobs: result.data.jobs ?? [],
            ciLoading: false,
          });
        } else {
          set({
            ciError: result.error?.message ?? '获取 CI 状态失败',
            ciLoading: false,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set({ ciError: message, ciLoading: false });
      }
    },

    notifyGitPushed: () => {
      const state = _get();
      if (state.ciAutoRefreshOnPush && state.ciConfig.owner && state.ciConfig.repo) {
        void state.refreshCiStatus();
      }
    },

    clearCiState: () =>
      set({
        ciSnapshot: null,
        ciJobs: [],
        ciError: null,
      }),
  };
};
