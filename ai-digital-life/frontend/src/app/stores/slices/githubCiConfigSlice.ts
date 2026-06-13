import type { CiRepoConfig } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';
import type { DigitalLifeBridge } from '../../../shared/ipc';
import { createDebouncedWrite, createUiId, readJson } from '../shared';

const CI_CONFIG_KEY = 'adl-ui:ci-config';
const CI_ACCESS_TOKEN_KEY = 'adl-ui:ci-access-token';
const CI_AUTO_REFRESH_ON_PUSH_KEY = 'adl-ui:ci-auto-refresh-on-push';

const GH_WORKSPACE_CONFIGS_KEY = 'adl-ui:github-workspace-configs';
const GH_CI_FOLDERS_KEY = 'adl-ui:github-ci-folders';

const { scheduleWrite } = createDebouncedWrite(50);
const { scheduleWrite: schedulePersist } = createDebouncedWrite(300);

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

async function hydrateCiConfigDefaults(): Promise<{
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
    return {
      config: defaultCfg,
      token: '',
      autoRefresh: true,
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

  if (!token && typeof window !== 'undefined') {
    try {
      const storedToken = window.localStorage.getItem(CI_ACCESS_TOKEN_KEY);
      if (typeof storedToken === 'string' && storedToken.length > 0) {
        token = storedToken;
      }
    } catch {
      /* ignore */
    }
  }

  return { config, token, autoRefresh };
}

/** Strip accessToken for secure localStorage persistence */
function stripTokenFromConfig(
  config: GitWorkspaceCiConfig
): Omit<GitWorkspaceCiConfig, 'accessToken'> & { accessToken: null } {
  return { ...config, accessToken: null };
}

function stripTokenFromFolders(folders: GitHubCiFolderState[]): GitHubCiFolderState[] {
  return folders.map((f) => {
    if (f.ciConfig?.accessToken) {
      return { ...f, ciConfig: { ...f.ciConfig, accessToken: null } };
    }
    return f;
  });
}

function scheduleWorkspaceConfigsWrite(configs: Record<string, GitWorkspaceCiConfig>): void {
  const stripped: Record<string, ReturnType<typeof stripTokenFromConfig>> = {};
  for (const [id, cfg] of Object.entries(configs)) {
    stripped[id] = stripTokenFromConfig(cfg);
  }
  schedulePersist(GH_WORKSPACE_CONFIGS_KEY, stripped);
}

function scheduleFoldersWrite(folders: GitHubCiFolderState[]): void {
  schedulePersist(GH_CI_FOLDERS_KEY, stripTokenFromFolders(folders));
}

async function hydrateGitHubConfigs(): Promise<Record<string, GitWorkspaceCiConfig>> {
  const saved = readJson<
    Record<string, Omit<GitWorkspaceCiConfig, 'accessToken'> & { accessToken?: string | null }>
  >(GH_WORKSPACE_CONFIGS_KEY, {});
  const result: Record<string, GitWorkspaceCiConfig> = {};
  for (const [id, cfg] of Object.entries(saved)) {
    if (cfg && typeof cfg === 'object' && cfg.owner) {
      result[id] = {
        owner: cfg.owner,
        repo: cfg.repo,
        branch: cfg.branch ?? 'main',
        workflowId: cfg.workflowId ?? null,
        accessToken: null,
        configured: cfg.configured ?? true,
      };
    }
  }
  return result;
}

async function hydrateGitHubFolders(): Promise<GitHubCiFolderState[]> {
  const saved = readJson<GitHubCiFolderState[]>(GH_CI_FOLDERS_KEY, []);
  if (!Array.isArray(saved)) {
    return [];
  }
  return saved.map((f) => {
    if (f.ciConfig) {
      return { ...f, ciConfig: { ...f.ciConfig, accessToken: null } };
    }
    return f;
  });
}

export interface GitHubCiConfigSlice {
  ciConfig: CiRepoConfig;
  ciAccessToken: string;
  ciAutoRefreshOnPush: boolean;

  /** Per-workspace CI configs keyed by workspaceId */
  gitHubWorkspaceConfigs: Record<string, GitWorkspaceCiConfig>;
  /** Active CI workspace ID (which workspace's CI is shown) */
  activeCiWorkspaceId: string | null;
  /** Active CI folder ID (which folder's CI data is currently loaded) */
  activeCiFolderId: string | null;
  /** Active sub-section within the selected workspace */
  activeWorkspaceSection: 'overview' | 'workflows' | 'jobs' | 'logs' | 'help';
  /** User-created CI folders (non-workspace directories with CI sub-entries) */
  gitHubCiFolders: GitHubCiFolderState[];

  setCiConfig: (config: CiRepoConfig) => void;
  setCiAccessToken: (token: string) => Promise<void>;
  clearCiAccessToken: () => Promise<void>;
  setCiAutoRefreshOnPush: (enabled: boolean) => void;
  setGitHubWorkspaceConfig: (workspaceId: string, config: GitWorkspaceCiConfig) => void;
  removeGitHubWorkspaceConfig: (workspaceId: string) => void;
  clearAllGitHubWorkspaceConfigs: () => void;
  setActiveCiWorkspaceId: (workspaceId: string | null) => void;
  setActiveCiFolderId: (folderId: string | null) => void;
  setActiveWorkspaceSection: (section: 'overview' | 'workflows' | 'jobs' | 'logs') => void;
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
  gitHubPinWorkspace: (workspaceId: string) => void;
  gitHubUnpinWorkspace: (workspaceId: string) => void;
}

export const createGitHubCiConfigSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): GitHubCiConfigSlice => {
  if (typeof window !== 'undefined') {
    void hydrateCiConfigDefaults().then(({ config, token, autoRefresh }) => {
      set({
        ciConfig: config,
        ciAccessToken: token,
        ciAutoRefreshOnPush: autoRefresh,
      });
    });
    void hydrateGitHubConfigs().then((configs) => {
      if (Object.keys(configs).length > 0) {
        set({ gitHubWorkspaceConfigs: configs });
      }
    });
    void hydrateGitHubFolders().then((folders) => {
      if (folders.length > 0) {
        set({ gitHubCiFolders: folders });
      }
    });
  }

  return {
    ciConfig: { owner: '', repo: '', branch: 'main', workflowId: null, accessToken: null },
    ciAccessToken: '',
    ciAutoRefreshOnPush: true,

    gitHubWorkspaceConfigs: {},
    activeCiWorkspaceId: null,
    activeCiFolderId: null,
    activeWorkspaceSection: 'overview',
    gitHubCiFolders: [],

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

    setGitHubWorkspaceConfig: (workspaceId, config) => {
      set((state) => {
        const next = { ...state.gitHubWorkspaceConfigs, [workspaceId]: config };
        scheduleWorkspaceConfigsWrite(next);
        return { gitHubWorkspaceConfigs: next };
      });
    },

    removeGitHubWorkspaceConfig: (workspaceId) => {
      set((state) => {
        const next = { ...state.gitHubWorkspaceConfigs };
        delete next[workspaceId];
        scheduleWorkspaceConfigsWrite(next);
        return { gitHubWorkspaceConfigs: next };
      });
    },

    clearAllGitHubWorkspaceConfigs: () => {
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem(GH_WORKSPACE_CONFIGS_KEY);
        } catch {
          /* ignore */
        }
      }
      set({
        gitHubWorkspaceConfigs: {},
        activeCiWorkspaceId: null,
        activeCiFolderId: null,
        selectedGitHubTreePath: null,
      });
    },

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
        scheduleFoldersWrite(nextFolders);
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
        scheduleFoldersWrite(nextFolders);
        return { gitHubCiFolders: nextFolders };
      });
    },

    gitHubRenameFolder: (folderId, name) => {
      set((state) => {
        const nextFolders = state.gitHubCiFolders.map((f) =>
          f.id === folderId ? { ...f, name } : f
        );
        scheduleFoldersWrite(nextFolders);
        return { gitHubCiFolders: nextFolders };
      });
    },

    gitHubSaveFolderConfig: (folderId, owner, repo, branch, accessToken) => {
      set((state) => {
        const nextFolders = state.gitHubCiFolders.map((f) =>
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
        );
        scheduleFoldersWrite(nextFolders);
        return { gitHubCiFolders: nextFolders };
      });
    },

    gitHubDeleteFolderConfig: (folderId) => {
      set((state) => {
        const nextFolders = state.gitHubCiFolders.map((f) =>
          f.id === folderId ? { ...f, ciConfig: undefined } : f
        );
        scheduleFoldersWrite(nextFolders);
        return { gitHubCiFolders: nextFolders };
      });
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
        const nextFolders = state.gitHubCiFolders.map((f) =>
          idsToDelete.has(f.id) ? { ...f, ciConfig: undefined } : f
        );
        scheduleFoldersWrite(nextFolders);
        return { gitHubCiFolders: nextFolders };
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
        const nextFolders = state.gitHubCiFolders.map((f) =>
          idsToDelete.has(f.id) ? { ...f, ciConfig: undefined } : f
        );
        scheduleFoldersWrite(nextFolders);
        return {
          gitHubCiFolders: nextFolders,
          ...(shouldClear ? { ciSnapshot: null, ciJobs: [], ciError: null } : {}),
        };
      });
    },

    gitHubPinWorkspace: (workspaceId) => {
      set((state) => {
        const pinnedWorkspaces = state.recentWorkspaces.filter((w) => w.isPinned);
        const maxPinnedOrder = Math.max(...pinnedWorkspaces.map((w) => w.pinnedOrder ?? 0), 0);
        return {
          recentWorkspaces: state.recentWorkspaces.map((w) =>
            w.id === workspaceId ? { ...w, isPinned: true, pinnedOrder: maxPinnedOrder + 1 } : w
          ),
        };
      });
    },

    gitHubUnpinWorkspace: (workspaceId) => {
      set((state) => ({
        recentWorkspaces: state.recentWorkspaces.map((w) =>
          w.id === workspaceId ? { ...w, isPinned: false, pinnedOrder: 0 } : w
        ),
      }));
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
        const nextFolders = state.gitHubCiFolders.map((f) =>
          f.id === folderId ? { ...f, pinnedOrder: maxPinnedOrder + 1 } : f
        );
        scheduleFoldersWrite(nextFolders);
        return { gitHubCiFolders: nextFolders };
      });
    },

    gitHubUnpinFolder: (folderId) => {
      set((state) => {
        const nextFolders = state.gitHubCiFolders.map((f) =>
          f.id === folderId ? { ...f, pinnedOrder: undefined } : f
        );
        scheduleFoldersWrite(nextFolders);
        return { gitHubCiFolders: nextFolders };
      });
    },

    clearAllFolderConfigs: () => {
      set((state) => {
        const nextFolders = state.gitHubCiFolders.map((f) => ({ ...f, ciConfig: undefined }));
        scheduleFoldersWrite(nextFolders);
        return { gitHubCiFolders: nextFolders };
      });
    },

    clearAllFolders: () => {
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem(GH_CI_FOLDERS_KEY);
        } catch {
          /* ignore */
        }
      }
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
      set((state) => {
        const nextFolders = state.gitHubCiFolders.map((f) => ({ ...f, ciConfig: undefined }));
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.removeItem(GH_WORKSPACE_CONFIGS_KEY);
          } catch {
            /* ignore */
          }
        }
        scheduleFoldersWrite(nextFolders);
        return { gitHubWorkspaceConfigs: {}, gitHubCiFolders: nextFolders };
      });
    },

    clearAllCiConfigsAndData: () => {
      set((state) => {
        const nextFolders = state.gitHubCiFolders.map((f) => ({ ...f, ciConfig: undefined }));
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.removeItem(GH_WORKSPACE_CONFIGS_KEY);
          } catch {
            /* ignore */
          }
        }
        scheduleFoldersWrite(nextFolders);
        return {
          gitHubWorkspaceConfigs: {},
          gitHubCiFolders: nextFolders,
          ciSnapshot: null,
          ciJobs: [],
          ciError: null,
        };
      });
    },

    resetAllToOriginal: () => {
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem(GH_WORKSPACE_CONFIGS_KEY);
          window.localStorage.removeItem(GH_CI_FOLDERS_KEY);
        } catch {
          /* ignore */
        }
      }
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
  };
};
