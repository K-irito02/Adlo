import type { CiJobSummary, CiStatusSnapshot, CiRepoConfig } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';
import type { DigitalLifeBridge } from '../../../shared/ipc';
import { createDebouncedWrite, createUiId } from '../shared';

const CI_CONFIG_KEY = 'adl-ui:ci-config';
const CI_ACCESS_TOKEN_KEY = 'adl-ui:ci-access-token';
const CI_AUTO_REFRESH_ON_PUSH_KEY = 'adl-ui:ci-auto-refresh-on-push';
const ACTIVE_GITHUB_SECTION_KEY = 'adl-ui:active-github-section';

const { scheduleWrite } = createDebouncedWrite(50);

export type GitHubSection = 'overview' | 'workflows' | 'jobs' | 'logs' | 'settings' | 'help';

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
  /** Optional CI configuration for this folder */
  ciConfig?: GitWorkspaceCiConfig;
  /** Pin order within siblings (smaller number = higher priority, undefined = not pinned) */
  pinnedOrder?: number;
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

export interface GitHubSlice {
  activeGitHubSection: GitHubSection;
  ciConfig: CiRepoConfig;
  ciAccessToken: string;
  ciLoading: boolean;
  ciError: string | null;
  ciSnapshot: CiStatusSnapshot | null;
  ciJobs: CiJobSummary[];
  ciAutoRefreshOnPush: boolean;
  selectedLogJobId: number | null;
  cachedJobLogs: Record<number, string>;
  logLoading: boolean;
  logError: string | null;

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
  /** Active CI folder ID (which folder's CI data is currently loaded) */
  activeCiFolderId: string | null;
  /** Active sub-section within the selected workspace */
  activeWorkspaceSection: 'overview' | 'workflows' | 'jobs' | 'logs' | 'help';
  /** User-created CI folders (non-workspace directories with CI sub-entries) */
  gitHubCiFolders: GitHubCiFolderState[];

  setActiveGitHubSection: (section: GitHubSection) => void;
  setCiConfig: (config: CiRepoConfig) => void;
  setCiAccessToken: (token: string) => Promise<void>;
  clearCiAccessToken: () => Promise<void>;
  setCiAutoRefreshOnPush: (enabled: boolean) => void;
  refreshCiStatus: () => Promise<void>;
  notifyGitPushed: () => void;
  setSelectedLogJobId: (jobId: number | null) => void;
  setCachedJobLogs: (logs: Record<number, string>) => void;
  setLogLoading: (loading: boolean) => void;
  setLogError: (error: string | null) => void;
  setGitHubWorkspaceConfig: (workspaceId: string, config: GitWorkspaceCiConfig) => void;
  removeGitHubWorkspaceConfig: (workspaceId: string) => void;
  clearAllGitHubWorkspaceConfigs: () => void;
  setGitHubTreeExpanded: (expanded: Record<string, boolean>) => void;
  toggleGitHubTreePath: (path: string) => void;
  expandAllGitHubTree: () => void;
  collapseAllGitHubTree: () => void;
  setSelectedGitHubTreePath: (path: string | null) => void;
  setActiveCiWorkspaceId: (workspaceId: string | null) => void;
  setActiveCiFolderId: (folderId: string | null) => void;
  setActiveWorkspaceSection: (section: 'overview' | 'workflows' | 'jobs' | 'logs') => void;
  refreshCiStatusForWorkspace: (workspaceId: string) => Promise<void>;
  gitHubCreateFolder: (parentId?: string, parentType?: 'workspace' | 'folder') => void;
  gitHubDeleteFolder: (folderId: string) => void;
  gitHubRenameFolder: (folderId: string, name: string) => void;
  gitHubSaveFolderConfig: (
    folderId: string,
    owner: string,
    repo: string,
    branch: string,
    accessToken?: string
  ) => void;
  gitHubDeleteFolderConfig: (folderId: string) => void;
  gitHubDeleteFolderConfigRecursive: (folderId: string) => void;
  gitHubDeleteFolderDataRecursive: (folderId: string) => void;
  gitHubDeleteFolderConfigAndDataRecursive: (folderId: string) => void;
  clearAllFolderConfigs: () => void;
  clearAllFolders: () => void;
  clearAllCiData: () => void;
  clearAllCiConfigs: () => void;
  clearAllCiConfigsAndData: () => void;
  resetAllToOriginal: () => void;
  gitHubPinFolder: (folderId: string) => void;
  gitHubUnpinFolder: (folderId: string) => void;
}

function getBridge(): DigitalLifeBridge | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return (window as unknown as { digitalLife: DigitalLifeBridge | undefined }).digitalLife ?? null;
}

function isTauriMode(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  );
}

async function hydrateGitHubDefaults(): Promise<{
  config: CiRepoConfig;
  token: string;
  autoRefresh: boolean;
  activeGitHubSection: GitHubSection;
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
      activeGitHubSection: 'overview',
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
    if (rawFlag === '0') {
      autoRefresh = false;
    } else if (rawFlag === '1') {
      autoRefresh = true;
    }
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

  let activeGitHubSection: GitHubSection = 'overview';
  try {
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
  } catch {
    /* ignore */
  }

  return { config, token, autoRefresh, activeGitHubSection };
}

export const createGitHubSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): GitHubSlice => {
  if (typeof window !== 'undefined') {
    void hydrateGitHubDefaults().then(({ config, token, autoRefresh, activeGitHubSection }) => {
      set({
        ciConfig: config,
        ciAccessToken: token,
        ciAutoRefreshOnPush: autoRefresh,
        activeGitHubSection,
      });
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
    selectedLogJobId: null,
    cachedJobLogs: {},
    logLoading: false,
    logError: null,

    gitHubWorkspaceConfigs: {},
    gitHubTreeExpanded: {},
    gitHubAllTreeExpanded: false,
    selectedGitHubTreePath: null,
    activeCiWorkspaceId: null,
    activeCiFolderId: null,
    activeWorkspaceSection: 'overview',
    gitHubCiFolders: [],

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
      if (!state.ciAutoRefreshOnPush) {
        return;
      }
      for (const [wsId, config] of Object.entries(state.gitHubWorkspaceConfigs)) {
        if (config.configured) {
          void state.refreshCiStatusForWorkspace(wsId);
        }
      }
      if (state.ciConfig.owner && state.ciConfig.repo) {
        void state.refreshCiStatus();
      }
    },

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
      set({
        gitHubWorkspaceConfigs: {},
        activeCiWorkspaceId: null,
        activeCiFolderId: null,
        selectedGitHubTreePath: null,
      });
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

    setActiveCiFolderId: (folderId) => set({ activeCiFolderId: folderId }),

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

    gitHubSaveFolderConfig: (folderId, owner, repo, branch, accessToken) => {
      set((state) => ({
        gitHubCiFolders: state.gitHubCiFolders.map((f) =>
          f.id === folderId
            ? {
                ...f,
                ciConfig: {
                  owner,
                  repo,
                  branch,
                  workflowId: null,
                  accessToken: accessToken ?? null,
                  configured: true,
                },
              }
            : f
        ),
      }));
    },

    gitHubDeleteFolderConfig: (folderId) => {
      set((state) => ({
        gitHubCiFolders: state.gitHubCiFolders.map((f) =>
          f.id === folderId ? { ...f, ciConfig: undefined } : f
        ),
      }));
    },

    gitHubDeleteFolderConfigRecursive: (folderId) => {
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
        return {
          gitHubCiFolders: state.gitHubCiFolders.map((f) =>
            idsToDelete.has(f.id) ? { ...f, ciConfig: undefined } : f
          ),
        };
      });
    },

    gitHubDeleteFolderDataRecursive: (folderId) => {
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
        const affectedWorkspaceIds = new Set<string>();
        for (const id of idsToDelete) {
          let currentId: string | null = id;
          while (currentId) {
            const folder = state.gitHubCiFolders.find((f) => f.id === currentId);
            if (!folder) {
              break;
            }
            if (folder.parentType === 'workspace') {
              if (folder.parentId) {
                affectedWorkspaceIds.add(folder.parentId);
              }
              break;
            }
            currentId = folder.parentId ?? null;
          }
        }
        const shouldClear =
          affectedWorkspaceIds.size === 0 ||
          (state.activeCiWorkspaceId != null &&
            affectedWorkspaceIds.has(state.activeCiWorkspaceId));
        if (shouldClear) {
          return { ciSnapshot: null, ciJobs: [], ciError: null };
        }
        return state;
      });
    },

    gitHubDeleteFolderConfigAndDataRecursive: (folderId) => {
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
        const affectedWorkspaceIds = new Set<string>();
        for (const id of idsToDelete) {
          let currentId: string | null = id;
          while (currentId) {
            const folder = state.gitHubCiFolders.find((f) => f.id === currentId);
            if (!folder) {
              break;
            }
            if (folder.parentType === 'workspace') {
              if (folder.parentId) {
                affectedWorkspaceIds.add(folder.parentId);
              }
              break;
            }
            currentId = folder.parentId ?? null;
          }
        }
        const shouldClear =
          affectedWorkspaceIds.size === 0 ||
          (state.activeCiWorkspaceId != null &&
            affectedWorkspaceIds.has(state.activeCiWorkspaceId));
        return {
          gitHubCiFolders: state.gitHubCiFolders.map((f) =>
            idsToDelete.has(f.id) ? { ...f, ciConfig: undefined } : f
          ),
          ...(shouldClear ? { ciSnapshot: null, ciJobs: [], ciError: null } : {}),
        };
      });
    },

    gitHubPinFolder: (folderId) => {
      set((state) => {
        const folder = state.gitHubCiFolders.find((f) => f.id === folderId);
        if (!folder) {
          return state;
        }
        const siblings = state.gitHubCiFolders.filter(
          (f) => f.parentId === folder.parentId && f.parentType === folder.parentType
        );
        const maxPinnedOrder = Math.max(
          ...siblings.filter((s) => s.pinnedOrder !== undefined).map((s) => s.pinnedOrder!),
          0
        );
        return {
          gitHubCiFolders: state.gitHubCiFolders.map((f) =>
            f.id === folderId ? { ...f, pinnedOrder: maxPinnedOrder + 1 } : f
          ),
        };
      });
    },

    gitHubUnpinFolder: (folderId) => {
      set((state) => ({
        gitHubCiFolders: state.gitHubCiFolders.map((f) =>
          f.id === folderId ? { ...f, pinnedOrder: undefined } : f
        ),
      }));
    },

    clearAllFolderConfigs: () => {
      set((state) => ({
        gitHubCiFolders: state.gitHubCiFolders.map((f) => ({ ...f, ciConfig: undefined })),
      }));
    },

    clearAllFolders: () => {
      set({
        gitHubCiFolders: [],
        ciSnapshot: null,
        ciJobs: [],
        ciError: null,
      });
    },

    clearAllCiData: () => {
      set({
        ciSnapshot: null,
        ciJobs: [],
        ciError: null,
      });
    },

    clearAllCiConfigs: () => {
      set((state) => ({
        gitHubWorkspaceConfigs: {},
        gitHubCiFolders: state.gitHubCiFolders.map((f) => ({ ...f, ciConfig: undefined })),
      }));
    },

    clearAllCiConfigsAndData: () => {
      set((state) => ({
        gitHubWorkspaceConfigs: {},
        gitHubCiFolders: state.gitHubCiFolders.map((f) => ({ ...f, ciConfig: undefined })),
        ciSnapshot: null,
        ciJobs: [],
        ciError: null,
      }));
    },

    resetAllToOriginal: () => {
      set({
        gitHubCiFolders: [],
        gitHubWorkspaceConfigs: {},
        ciSnapshot: null,
        ciJobs: [],
        ciError: null,
        activeCiWorkspaceId: null,
        activeCiFolderId: null,
        selectedGitHubTreePath: null,
        gitHubTreeExpanded: {},
      });
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
