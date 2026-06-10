import type { CiJobSummary, CiStatusSnapshot, CiRepoConfig } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';
import type { DigitalLifeBridge } from '../../../shared/ipc';
import { createDebouncedWrite } from '../shared';

const CI_CONFIG_KEY = 'adl-ui:ci-config';
const CI_ACCESS_TOKEN_KEY = 'adl-ui:ci-access-token';
const CI_AUTO_REFRESH_ON_PUSH_KEY = 'adl-ui:ci-auto-refresh-on-push';
const ACTIVE_PLATFORM_KEY = 'adl-ui:active-communicate-platform';
const ACTIVE_GITHUB_SECTION_KEY = 'adl-ui:active-github-section';
const COMMUNICATE_NAVIGATOR_COLLAPSED_KEY = 'adl-ui:communicate-navigator-collapsed';

const { scheduleWrite } = createDebouncedWrite(50);

export type PlatformId = 'github' | 'feishu' | 'qq' | 'wechat' | 'email';
export type GitHubSection = 'overview' | 'workflows' | 'jobs' | 'logs' | 'settings' | 'help';

export interface PlatformState {
  ready: boolean;
  loading: boolean;
  error: string | null;
}

export interface CommunicateSlice {
  activePlatform: PlatformId;
  activeGitHubSection: GitHubSection;
  platforms: Record<string, PlatformState>;

  ciConfig: CiRepoConfig;
  ciAccessToken: string;
  ciLoading: boolean;
  ciError: string | null;
  ciSnapshot: CiStatusSnapshot | null;
  ciJobs: CiJobSummary[];
  ciAutoRefreshOnPush: boolean;
  ciPersisted: boolean;
  communicateNavigatorCollapsed: boolean;
  selectedLogJobId: number | null;
  cachedJobLogs: Record<number, string>;
  logLoading: boolean;
  logError: string | null;

  setActivePlatform: (platform: PlatformId) => void;
  setActiveGitHubSection: (section: GitHubSection) => void;
  setCiConfig: (config: CiRepoConfig) => void;
  setCiAccessToken: (token: string) => Promise<void>;
  clearCiAccessToken: () => Promise<void>;
  setCiAutoRefreshOnPush: (enabled: boolean) => void;
  refreshCiStatus: () => Promise<void>;
  notifyGitPushed: () => void;
  clearCiState: () => void;
  toggleCommunicateNavigator: () => void;
  setSelectedLogJobId: (jobId: number | null) => void;
  setCachedJobLogs: (logs: Record<number, string>) => void;
  setLogLoading: (loading: boolean) => void;
  setLogError: (error: string | null) => void;
}

function getBridge(): DigitalLifeBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { digitalLife: DigitalLifeBridge | undefined }).digitalLife ?? null;
}

function isTauriMode(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  );
}

let _defaultsHydrated = false;

async function hydrateCommunicateDefaults(): Promise<{
  config: CiRepoConfig;
  token: string;
  autoRefresh: boolean;
  activePlatform: PlatformId;
  activeGitHubSection: GitHubSection;
  navigatorCollapsed: boolean;
}> {
  const defaultCfg: CiRepoConfig = {
    owner: '',
    repo: '',
    branch: 'main',
    workflowId: null,
    accessToken: null,
  };
  if (typeof window === 'undefined') {
    return {
      config: defaultCfg,
      token: '',
      autoRefresh: true,
      activePlatform: 'github',
      activeGitHubSection: 'overview',
      navigatorCollapsed: false,
    };
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
    if (rawFlag === '0') autoRefresh = false;
    else if (rawFlag === '1') autoRefresh = true;
  } catch {
    /* ignore */
  }

  let token = '';
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
        token = '::stored::';
      }
    } catch {
      /* ignore */
    }
  } else if (bridge && bridge.github && typeof bridge.github.hasAccessToken === 'function') {
    try {
      const hasResult = await bridge.github.hasAccessToken();
      if (hasResult && hasResult.ok && hasResult.data) {
        const storedToken = window.localStorage.getItem(CI_ACCESS_TOKEN_KEY);
        token = typeof storedToken === 'string' && storedToken.length > 0 ? storedToken : '';
      }
    } catch {
      /* ignore */
    }
  }

  let activePlatform: PlatformId = 'github';
  let activeGitHubSection: GitHubSection = 'overview';
  let navigatorCollapsed = false;
  try {
    const storedPlatform = window.localStorage.getItem(ACTIVE_PLATFORM_KEY);
    if (
      storedPlatform === 'github' ||
      storedPlatform === 'feishu' ||
      storedPlatform === 'qq' ||
      storedPlatform === 'wechat' ||
      storedPlatform === 'email'
    ) {
      activePlatform = storedPlatform as PlatformId;
    }
    const storedSection = window.localStorage.getItem(ACTIVE_GITHUB_SECTION_KEY);
    if (
      storedSection === 'overview' ||
      storedSection === 'workflows' ||
      storedSection === 'jobs' ||
      storedSection === 'settings' ||
      storedSection === 'help'
    ) {
      activeGitHubSection = storedSection as GitHubSection;
    }
    navigatorCollapsed = window.localStorage.getItem(COMMUNICATE_NAVIGATOR_COLLAPSED_KEY) === '1';
  } catch {
    /* ignore */
  }

  _defaultsHydrated = true;
  return { config, token, autoRefresh, activePlatform, activeGitHubSection, navigatorCollapsed };
}

export const createCommunicateSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): CommunicateSlice => {
  if (typeof window !== 'undefined') {
    void hydrateCommunicateDefaults().then(
      ({ config, token, autoRefresh, activePlatform, activeGitHubSection, navigatorCollapsed }) => {
        set({
          ciConfig: config,
          ciAccessToken: token,
          ciAutoRefreshOnPush: autoRefresh,
          activePlatform,
          activeGitHubSection,
          communicateNavigatorCollapsed: navigatorCollapsed,
        });
      }
    );
  }

  return {
    activePlatform: 'github',
    activeGitHubSection: 'overview',
    platforms: {
      github: { ready: true, loading: false, error: null },
      feishu: { ready: false, loading: false, error: null },
      qq: { ready: false, loading: false, error: null },
      wechat: { ready: false, loading: false, error: null },
      email: { ready: false, loading: false, error: null },
    },

    ciConfig: { owner: '', repo: '', branch: 'main', workflowId: null, accessToken: null },
    ciAccessToken: '',
    ciLoading: false,
    ciError: null,
    ciSnapshot: null,
    ciJobs: [],
    ciAutoRefreshOnPush: true,
    ciPersisted: true,
    communicateNavigatorCollapsed: false,
    selectedLogJobId: null,
    cachedJobLogs: {},
    logLoading: false,
    logError: null,

    setActivePlatform: (platform) => {
      set({ activePlatform: platform });
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(ACTIVE_PLATFORM_KEY, platform);
        } catch {
          /* ignore */
        }
      }
    },

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
        if (!bridge || !bridge.github) {
          set({ ciError: 'bridge not ready', ciLoading: false });
          return;
        }
        const accessToken = isTauriMode() ? null : token;
        const result = await bridge.github.getStatus({
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

    toggleCommunicateNavigator: () =>
      set((state) => {
        const next = !state.communicateNavigatorCollapsed;
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(COMMUNICATE_NAVIGATOR_COLLAPSED_KEY, next ? '1' : '0');
          } catch {
            /* ignore */
          }
        }
        return { communicateNavigatorCollapsed: next };
      }),

    setSelectedLogJobId: (jobId) => set({ selectedLogJobId: jobId }),

    setCachedJobLogs: (logs) => set({ cachedJobLogs: logs }),

    setLogLoading: (loading) => set({ logLoading: loading }),

    setLogError: (error) => set({ logError: error }),
  };
};
