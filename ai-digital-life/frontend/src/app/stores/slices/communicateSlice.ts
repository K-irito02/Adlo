import type { CiJobSummary, CiStatusSnapshot, CiRepoConfig } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';
import type { DigitalLifeBridge } from '../../../shared/ipc';
import { createDebouncedWrite, createUiId } from '../shared';

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

/** Per-workspace CI configuration */
export interface GitWorkspaceCiConfig {
  owner: string;
  repo: string;
  branch: string;
  workflowId: string | null;
  accessToken: string | null;
  /** Whether this workspace has been configured */
  configured: boolean;
}

export interface GitHubCiFolderState {
  id: string;
  name: string;
  createdAt: number;
  parentId?: string;
  parentType?: 'workspace' | 'folder';
}

/** GitHub tree node types */
export type GitHubTreeNodeType = 'workspace' | 'overview' | 'workflows' | 'jobs' | 'logs';

/** GitHub tree node (for displaying in the navigator) */
export interface GitHubTreeNode {
  path: string;
  name: string;
  kind: 'directory' | 'file';
  children: GitHubTreeNode[];
  nodeType: GitHubTreeNodeType;
  workspaceId?: string;
}

export type GitHubCategoryType = 'ci-workspace';

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

  /** Per-workspace CI configs keyed by workspaceId */
  gitHubWorkspaceConfigs: Record<string, GitWorkspaceCiConfig>;
  /** Tree expansion state for GitHub navigator */
  gitHubTreeExpanded: Record<string, boolean>;
  /** Whether the workspace tree is fully expanded */
  gitHubAllTreeExpanded: boolean;
  /** Selected tree path in GitHub navigator */
  selectedGitHubTreePath: string | null;
  /** Active CI workspace ID (which workspace's CI is shown) */
  activeCiWorkspaceId: string | null;
  /** Active sub-section within the selected workspace */
  activeWorkspaceSection: 'overview' | 'workflows' | 'jobs' | 'logs' | 'help';
  /** User-created CI folders (non-workspace directories with CI sub-entries) */
  gitHubCiFolders: GitHubCiFolderState[];

  // New actions
  setGitHubWorkspaceConfig: (workspaceId: string, config: GitWorkspaceCiConfig) => void;
  removeGitHubWorkspaceConfig: (workspaceId: string) => void;
  clearAllGitHubWorkspaceConfigs: () => void;
  setGitHubTreeExpanded: (expanded: Record<string, boolean>) => void;
  toggleGitHubTreePath: (path: string) => void;
  expandAllGitHubTree: () => void;
  collapseAllGitHubTree: () => void;
  setSelectedGitHubTreePath: (path: string | null) => void;
  setActiveCiWorkspaceId: (workspaceId: string | null) => void;
  setActiveWorkspaceSection: (section: 'overview' | 'workflows' | 'jobs' | 'logs') => void;
  refreshCiStatusForWorkspace: (workspaceId: string) => Promise<void>;
  gitHubCreateFolder: (parentId?: string, parentType?: 'workspace' | 'folder') => void;
  gitHubDeleteFolder: (folderId: string) => void;
  gitHubRenameFolder: (folderId: string, name: string) => void;
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

    gitHubWorkspaceConfigs: {},
    gitHubTreeExpanded: {},
    gitHubAllTreeExpanded: false,
    selectedGitHubTreePath: null,
    activeCiWorkspaceId: null,
    activeWorkspaceSection: 'overview',
    gitHubCiFolders: [],

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
      if (!state.ciAutoRefreshOnPush) return;
      for (const [wsId, config] of Object.entries(state.gitHubWorkspaceConfigs)) {
        if (config.configured) {
          void state.refreshCiStatusForWorkspace(wsId);
        }
      }
      // Also refresh legacy single-workspace config if present
      if (state.ciConfig.owner && state.ciConfig.repo) {
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

    setGitHubWorkspaceConfig: (workspaceId, config) => {
      set((state) => ({
        gitHubWorkspaceConfigs: { ...state.gitHubWorkspaceConfigs, [workspaceId]: config },
      }));
    },

    removeGitHubWorkspaceConfig: (workspaceId) => {
      set((state) => {
        const next = { ...state.gitHubWorkspaceConfigs };
        delete next[workspaceId];
        return { gitHubWorkspaceConfigs: next };
      });
    },

    clearAllGitHubWorkspaceConfigs: () => {
      set({ gitHubWorkspaceConfigs: {}, activeCiWorkspaceId: null, selectedGitHubTreePath: null });
    },

    setGitHubTreeExpanded: (expanded) => set({ gitHubTreeExpanded: expanded }),

    toggleGitHubTreePath: (path) => {
      set((state) => ({
        gitHubTreeExpanded: {
          ...state.gitHubTreeExpanded,
          [path]: !state.gitHubTreeExpanded[path],
        },
      }));
    },

    expandAllGitHubTree: () => {
      set((state) => {
        const paths: Record<string, boolean> = {};
        for (const ws of state.recentWorkspaces) {
          paths[`github-workspace:${ws.id}`] = true;
        }
        for (const folder of state.gitHubCiFolders) {
          paths[`github-folder:${folder.id}`] = true;
        }
        return { gitHubTreeExpanded: paths };
      });
    },

    collapseAllGitHubTree: () => set({ gitHubTreeExpanded: {} }),

    setSelectedGitHubTreePath: (path) => set({ selectedGitHubTreePath: path }),

    setActiveCiWorkspaceId: (workspaceId) => set({ activeCiWorkspaceId: workspaceId }),

    setActiveWorkspaceSection: (section) => set({ activeWorkspaceSection: section }),

    gitHubCreateFolder: (parentId, parentType) => {
      set((state) => {
        const folderCount = state.gitHubCiFolders.length;
        const newFolder: GitHubCiFolderState = {
          id: createUiId('gh-ci-folder'),
          name: `目录 ${folderCount + 1}`,
          createdAt: Date.now(),
          parentId,
          parentType,
        };
        const nextFolders = [...state.gitHubCiFolders, newFolder];
        const parentPath = parentId
          ? parentType === 'workspace'
            ? `github-workspace:${parentId}`
            : `github-folder:${parentId}`
          : null;
        const nextExpanded = parentPath
          ? { ...state.gitHubTreeExpanded, [parentPath]: true }
          : state.gitHubTreeExpanded;
        return { gitHubCiFolders: nextFolders, gitHubTreeExpanded: nextExpanded };
      });
    },

    gitHubDeleteFolder: (folderId) => {
      set((state) => {
        const idsToDelete = new Set<string>([folderId]);
        const findDescendants = (parentId: string) => {
          for (const f of state.gitHubCiFolders) {
            if (f.parentId === parentId && !idsToDelete.has(f.id)) {
              idsToDelete.add(f.id);
              findDescendants(f.id);
            }
          }
        };
        findDescendants(folderId);
        const nextFolders = state.gitHubCiFolders.filter((f) => !idsToDelete.has(f.id));
        return { gitHubCiFolders: nextFolders };
      });
    },

    gitHubRenameFolder: (folderId, name) => {
      set((state) => ({
        gitHubCiFolders: state.gitHubCiFolders.map((f) => (f.id === folderId ? { ...f, name } : f)),
      }));
    },

    refreshCiStatusForWorkspace: async (workspaceId) => {
      const state = _get();
      const config = state.gitHubWorkspaceConfigs[workspaceId];
      if (!config || !config.configured) {
        set({ ciError: '请先配置仓库 owner 和 repo' });
        return;
      }
      set({ ciLoading: true, ciError: null });
      try {
        const bridge = getBridge();
        if (!bridge || !bridge.github) {
          set({ ciError: 'bridge not ready', ciLoading: false });
          return;
        }
        const token = isTauriMode() ? null : (config.accessToken ?? '');
        const result = await bridge.github.getStatus({
          owner: config.owner,
          repo: config.repo,
          branch: config.branch,
          workflowId: config.workflowId,
          accessToken: token,
        });
        if (result.ok) {
          set({ ciSnapshot: result.data, ciJobs: result.data.jobs ?? [], ciLoading: false });
        } else {
          set({ ciError: result.error?.message ?? '获取 CI 状态失败', ciLoading: false });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set({ ciError: message, ciLoading: false });
      }
    },
  };
};
