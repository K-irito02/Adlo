import type { CiJobSummary, CiStatusSnapshot, CiRepoConfig } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';
import type { GitWorkspaceCiConfig } from './githubRepoSliceTypes';
import { CI_ERROR_CODES } from '@shared/ciErrors';
import { createDebouncedWrite, makePersistedWriter, readJson } from '../shared';
import {
  type GitHubSection,
  getBridge,
  isTauriMode,
  hydrateCiConfigDefaults,
  hydrateCiStatusDefaults,
} from './githubSliceHelpers';
import { executeCiStatusRefresh } from './githubCiRefresh';

const CI_CONFIG_KEY = 'adl-ui:ci-config';
const CI_ACCESS_TOKEN_KEY = 'adl-ui:ci-access-token';
const CI_AUTO_REFRESH_ON_PUSH_KEY = 'adl-ui:ci-auto-refresh-on-push';
const ACTIVE_GITHUB_SECTION_KEY = 'adl-ui:active-github-section';
const CI_SNAPSHOTS_KEY = 'adl-ui:ci-snapshots';
const CI_LOG_CACHES_KEY = 'adl-ui:ci-log-caches';

// 50ms: shared cross-slice writer for config
const writeCiConfig = makePersistedWriter(CI_CONFIG_KEY);
// 300ms: independent writers for bulkier CI snapshots/log caches
const snapshotsWriter = createDebouncedWrite(300);
const logCachesWriter = createDebouncedWrite(300);
const writeCiSnapshots = (value: unknown) => snapshotsWriter.scheduleWrite(CI_SNAPSHOTS_KEY, value);
const writeCiLogCaches = (value: unknown) =>
  logCachesWriter.scheduleWrite(CI_LOG_CACHES_KEY, value);

export type { GitHubSection } from './githubSliceHelpers';

function hydrateCiSnapshots(): Record<string, CiStatusSnapshot> {
  return readJson<Record<string, CiStatusSnapshot>>(CI_SNAPSHOTS_KEY, {});
}

function hydrateCiLogCaches(): Record<
  string,
  { selectedJobId: number | null; logs: Record<number, string> }
> {
  return readJson<Record<string, { selectedJobId: number | null; logs: Record<number, string> }>>(
    CI_LOG_CACHES_KEY,
    {}
  );
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
  ciLogCaches: Record<string, { selectedJobId: number | null; logs: Record<number, string> }>;

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
    data: Partial<{ selectedJobId: number | null; logs: Record<number, string> }>
  ) => void;
}

export const createGitHubSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): GitHubSlice => {
  if (typeof window !== 'undefined') {
    void hydrateCiConfigDefaults().then(({ config, token, autoRefresh }) => {
      set({
        ciConfig: config,
        ciAccessToken: token,
        ciAutoRefreshOnPush: autoRefresh,
      });
    });
    void hydrateCiStatusDefaults().then(({ activeGitHubSection }) => {
      set({ activeGitHubSection });
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
      set({ activeGitHubSection: section });
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(ACTIVE_GITHUB_SECTION_KEY, section);
        } catch {
          /* ignore */
        }
      }
    },

    setCiConfig: (config) => {
      set({ ciConfig: config });
      writeCiConfig({
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
        } catch {
          /* ignore */
        }
      }

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

      if (bridge && bridge.github && typeof bridge.github.clearAccessToken === 'function') {
        try {
          await bridge.github.clearAccessToken();
        } catch {
          /* ignore */
        }
      }

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
        (params) => bridge.github.getStatus(params)
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
        writeCiLogCaches(next);
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
        (params) => bridge.github.getStatus(params)
      );
      if (result.ok) {
        set((state) => {
          const nextSnapshots = { ...state.ciSnapshots, [id]: result.snapshot };
          writeCiSnapshots(nextSnapshots);
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
