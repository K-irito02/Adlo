import type { CiRepoConfig } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';
import type { DigitalLifeBridge } from '../../../shared/ipc';
import { createDebouncedWrite, createUiId } from '../shared';

const CI_CONFIG_KEY = 'adl-ui:ci-config';
const CI_ACCESS_TOKEN_KEY = 'adl-ui:ci-access-token';
const CI_AUTO_REFRESH_ON_PUSH_KEY = 'adl-ui:ci-auto-refresh-on-push';

const { scheduleWrite } = createDebouncedWrite(50);

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

  return { config, token, autoRefresh };
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
  };
};
