/**
 * CI 状态切片
 * 管理 GitHub Actions 运行状态
 *
 * 安全说明：
 * - Tauri 桌面模式：`ciAccessToken` 不持久化到前端，仅通过 `tauri-bridge` 调用 Rust credential crate（系统钥匙串优先，
 *   fallback 为加密文件存储）
 * - 浏览器开发模式：仅保存在内存 + localStorage 镜像中（key: adl:browser.ciAccessToken）
 * - 发送请求时通过 HTTP header 传递，避免出现在 URL 或日志中
 * - 任何代码路径禁止将 token 写入 console.log / error / 调试输出
 */
import type { CiJobSummary, CiStatusSnapshot, CiRepoConfig } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';
import type { DigitalLifeBridge } from '@shared/ipc/digital-life';
import { CI_ERROR_CODES } from '@shared/ciErrors';
import { persistField } from '../persisted/apply';
import { persist } from '../persisted/persist';
import { executeCiStatusRefresh } from './githubCiRefresh';

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

/**
 * Tauri 模式的令牌存在标记：bridge 钥匙串有 token 时前端以 '::stored::' 占位
 * （只写不回读，不在前端回显）。配置与自刷新开关由 hydrateAll 拥有，此处不再读盘。
 */
async function hydrateCiTokenMarker(): Promise<string | undefined> {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const bridge = getBridge();
  if (
    isTauriMode() &&
    bridge &&
    bridge.github &&
    typeof bridge.github.hasAccessToken === 'function'
  ) {
    try {
      const hasResult = await bridge.github.hasAccessToken();
      if (hasResult && hasResult.ok && hasResult.data) {
        return '::stored::'; // 标记后端已有 token（不在前端回显）
      }
    } catch (err) {
      console.warn('ciSlice: localStorage/bridge operation failed:', err);
    }
  }
  return undefined;
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
  _get: () => StoreState,
): CiSlice => {
  // 启动时仅补 Tauri 钥匙串存在标记；配置 / 令牌镜像 / 开关由 hydrateAll 同步水合。
  if (typeof window !== 'undefined') {
    void hydrateCiTokenMarker().then((token) => {
      if (token !== undefined) {
        set({ ciAccessToken: token });
      }
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
      // 内存保留完整 config（含调用方传入的 accessToken）；落盘剥离 token（旧 writeCiConfig 同形）。
      set({ ciConfig: config });
      persist('adl:browser.ciConfig', {
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
      if (bridge && bridge.github && typeof bridge.github.setAccessToken === 'function') {
        try {
          await bridge.github.setAccessToken(sanitized);
        } catch (err) {
          console.warn('ciSlice: localStorage/bridge operation failed:', err);
        }
      }

      // 同时保存到本地镜像以便页面刷新后恢复（新键；清空时写空串，读侧等价于旧 removeItem）。
      set({ ciAccessToken: sanitized });
      persist('adl:browser.ciAccessToken', sanitized);
    },

    clearCiAccessToken: async () => {
      const bridge = getBridge();

      // 调用 bridge API（Tauri 模式或浏览器预览模式）
      if (bridge && bridge.github && typeof bridge.github.clearAccessToken === 'function') {
        try {
          await bridge.github.clearAccessToken();
        } catch (err) {
          console.warn('ciSlice: localStorage/bridge operation failed:', err);
        }
      }

      // 同时清除本地镜像
      set({ ciAccessToken: '' });
      persist('adl:browser.ciAccessToken', '');
    },

    setCiAutoRefreshOnPush: (enabled) => {
      set(persistField('adl:browser.ciAutoRefreshOnPush', enabled));
    },

    refreshCiStatus: async () => {
      const state = _get();
      const config = state.ciConfig;
      if (!config.owner || !config.repo) {
        set({
          ciError: CI_ERROR_CODES.CONFIG_MISSING_REPO,
          ciSnapshot: null,
          ciJobs: [],
        });
        return;
      }

      set({ ciLoading: true, ciError: null });

      const bridge = getBridge();
      if (!bridge || !bridge.github) {
        set({ ciError: 'bridge not ready', ciLoading: false });
        return;
      }
      const accessToken = isTauriMode() ? null : state.ciAccessToken;
      const result = await executeCiStatusRefresh(
        {
          owner: config.owner,
          repo: config.repo,
          branch: config.branch,
          workflowId: config.workflowId,
          accessToken,
        },
        (params) => bridge.github.getStatus(params),
      );

      if (result.ok) {
        set({
          ciSnapshot: result.snapshot,
          ciJobs: result.snapshot.jobs ?? [],
          ciLoading: false,
        });
      } else {
        set({ ciError: result.error, ciLoading: false });
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
