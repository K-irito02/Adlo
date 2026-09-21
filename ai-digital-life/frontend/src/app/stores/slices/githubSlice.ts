import type { CiJobSummary, CiStatusSnapshot, CiRepoConfig } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';
import type { GitWorkspaceCiConfig } from './githubRepoSliceTypes';
import { CI_ERROR_CODES } from '@shared/ciErrors';
import { readJson } from '../shared';
import { persistField } from '../persisted/apply';
import { persist } from '../persisted/persist';
import { readCiSnapshots, readCiLogCaches, type CiLogCacheMap } from '../persisted/parsers';
import {
  type GitHubSection,
  getBridge,
  isTauriMode,
  hydrateCiTokenMarker,
} from './githubSliceHelpers';
import { executeCiStatusRefresh } from './githubCiRefresh';

export type { GitHubSection } from './githubSliceHelpers';

// 大对象延迟加载（Task 29）：sync:false 条目构造期跳过，此处按需从新键读取（旧代码
// 本就是 Promise 延迟加载，时序不变；300ms 独立去抖收敛为统一通道，关窗 flush 兜底）。
function hydrateCiSnapshots(): Record<string, CiStatusSnapshot> {
  return readCiSnapshots(readJson<unknown>('adl:browser.ciSnapshots', undefined)) ?? {};
}

function hydrateCiLogCaches(): CiLogCacheMap {
  return readCiLogCaches(readJson<unknown>('adl:browser.ciLogCaches', undefined)) ?? {};
}

export interface GitHubSlice {
  activeGitHubSection: GitHubSection;
  ciConfig: CiRepoConfig;
  ciAccessToken: string;
  ciLoading: boolean;
  ciError: string | null;
  ciSnapshot: CiStatusSnapshot | null;
  ciJobs: CiJobSummary[];
  ciAutoRefreshOnPush: boolean;

  /** CI data cached per workspace/folder ID */
  ciSnapshots: Record<string, CiStatusSnapshot>;
  /** Log caches per directory: selected job ID + fetched log texts */
  ciLogCaches: CiLogCacheMap;

  setActiveGitHubSection: (section: GitHubSection) => void;
  setCiConfig: (config: CiRepoConfig) => void;
  setCiAccessToken: (token: string) => Promise<void>;
  clearCiAccessToken: () => Promise<void>;
  setCiAutoRefreshOnPush: (enabled: boolean) => void;
  refreshCiStatus: () => Promise<void>;
  notifyGitPushed: () => void;
  refreshCiStatusForWorkspace: (workspaceId: string) => Promise<void>;
  /** Restore CI snapshot from cache for a given ID */
  restoreCiSnapshot: (id: string) => void;
  /** Read log cache for a given directory */
  getCiLogCache: (dirId: string) => { selectedJobId: number | null; logs: Record<number, string> };
  /** Update log cache for a given directory */
  updateCiLogCache: (
    dirId: string,
    data: Partial<{ selectedJobId: number | null; logs: Record<number, string> }>,
  ) => void;
}

export const createGitHubSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): GitHubSlice => {
  if (typeof window !== 'undefined') {
    // 仅补 Tauri 钥匙串存在标记；配置 / 分区 / 开关由 hydrateAll 同步水合，
    // 快照与日志缓存仍延迟加载（新键，时序不变）。
    void hydrateCiTokenMarker().then((token) => {
      if (token !== undefined) {
        set({ ciAccessToken: token });
      }
    });
    Promise.resolve().then(() => {
      const savedSnapshots = hydrateCiSnapshots();
      if (Object.keys(savedSnapshots).length > 0) {
        set({ ciSnapshots: savedSnapshots });
      }
    });
    Promise.resolve().then(() => {
      const savedLogCaches = hydrateCiLogCaches();
      if (Object.keys(savedLogCaches).length > 0) {
        set({ ciLogCaches: savedLogCaches });
      }
    });
  }

  return {
    activeGitHubSection: 'overview',

    ciConfig: { owner: '', repo: '', branch: 'main', workflowId: null, accessToken: null },
    ciAccessToken: '',
    ciLoading: false,
    ciError: null,
    ciSnapshot: null,
    ciJobs: [],
    ciAutoRefreshOnPush: true,
    ciSnapshots: {},
    ciLogCaches: {},

    setActiveGitHubSection: (section) => {
      set(persistField('adl:browser.githubSection', section));
    },

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

      if (bridge && bridge.github && typeof bridge.github.setAccessToken === 'function') {
        try {
          await bridge.github.setAccessToken(sanitized);
        } catch (err) {
          console.warn('githubSlice: localStorage/bridge operation failed:', err);
        }
      }

      // 本地镜像（新键；清空时写空串，读侧等价于旧 removeItem）
      set({ ciAccessToken: sanitized });
      persist('adl:browser.ciAccessToken', sanitized);
    },

    clearCiAccessToken: async () => {
      const bridge = getBridge();

      if (bridge && bridge.github && typeof bridge.github.clearAccessToken === 'function') {
        try {
          await bridge.github.clearAccessToken();
        } catch (err) {
          console.warn('githubSlice: localStorage/bridge operation failed:', err);
        }
      }

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
      if (!state.ciAutoRefreshOnPush) {
        return;
      }
      for (const [wsId, config] of Object.entries(state.gitHubWorkspaceConfigs)) {
        if (config.configured) {
          void state.refreshCiStatusForWorkspace(wsId);
        }
      }
      for (const folder of state.gitHubCiFolders) {
        if (folder.ciConfig?.configured) {
          void state.refreshCiStatusForWorkspace(folder.id);
        }
      }
      if (state.ciConfig.owner && state.ciConfig.repo) {
        void state.refreshCiStatus();
      }
    },

    getCiLogCache: (dirId) => {
      const state = _get();
      return state.ciLogCaches[dirId] ?? { selectedJobId: null, logs: {} };
    },

    updateCiLogCache: (dirId, data) => {
      set((state) => {
        const existing = state.ciLogCaches[dirId] ?? { selectedJobId: null, logs: {} };
        const next = {
          ...state.ciLogCaches,
          [dirId]: { ...existing, ...data },
        };
        persist('adl:browser.ciLogCaches', next);
        return { ciLogCaches: next };
      });
    },

    restoreCiSnapshot: (id) => {
      set((state) => {
        const cached = state.ciSnapshots[id];
        if (cached) {
          return { ciSnapshot: cached, ciJobs: cached.jobs ?? [] };
        }
        return { ciSnapshot: null, ciJobs: [], ciError: null };
      });
    },

    refreshCiStatusForWorkspace: async (id) => {
      const state = _get();
      let config = state.gitHubWorkspaceConfigs[id] as GitWorkspaceCiConfig | undefined;
      if (!config?.configured) {
        const folder = state.gitHubCiFolders.find((f) => f.id === id);
        if (folder?.ciConfig?.configured) {
          config = folder.ciConfig as GitWorkspaceCiConfig;
        }
      }
      if (!config || !config.configured) {
        set({ ciError: CI_ERROR_CODES.CONFIG_MISSING_REPO });
        return;
      }
      set({ ciLoading: true, ciError: null });
      const bridge = getBridge();
      if (!bridge || !bridge.github) {
        set({ ciError: 'bridge not ready', ciLoading: false });
        return;
      }
      const token = isTauriMode() ? null : (config.accessToken ?? state.ciAccessToken ?? '');
      const result = await executeCiStatusRefresh(
        {
          owner: config.owner,
          repo: config.repo,
          branch: config.branch,
          workflowId: config.workflowId,
          accessToken: token,
        },
        (params) => bridge.github.getStatus(params),
      );
      if (result.ok) {
        set((state) => {
          const nextSnapshots = { ...state.ciSnapshots, [id]: result.snapshot };
          persist('adl:browser.ciSnapshots', nextSnapshots);
          return {
            ciSnapshot: result.snapshot,
            ciJobs: result.snapshot.jobs ?? [],
            ciLoading: false,
            ciSnapshots: nextSnapshots,
          };
        });
      } else {
        set({ ciError: result.error, ciLoading: false });
      }
    },
  };
};
