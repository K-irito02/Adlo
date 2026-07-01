import type { StoreState } from '../StoreState';
import { createUiId } from '../shared';
import type { GitWorkspaceCiConfig, GitHubCiFolderState } from './githubRepoSliceTypes';
import {
  scheduleWorkspaceConfigsWrite,
  scheduleFoldersWrite,
  hydrateGitHubConfigs,
  hydrateGitHubFolders,
  collectDescendantFolderIds,
  collectAffectedWorkspaceIds,
} from './githubRepoSliceHelpers';

const GH_WORKSPACE_CONFIGS_KEY = 'adl-ui:github-workspace-configs';
const GH_CI_FOLDERS_KEY = 'adl-ui:github-ci-folders';

export type { GitWorkspaceCiConfig, GitHubCiFolderState } from './githubRepoSliceTypes';

export interface GitHubRepoSlice {
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

export const createGitHubRepoSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): GitHubRepoSlice => {
  if (typeof window !== 'undefined') {
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
    gitHubWorkspaceConfigs: {},
    activeCiWorkspaceId: null,
    activeCiFolderId: null,
    activeWorkspaceSection: 'overview',
    gitHubCiFolders: [],

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
        const idsToDelete = collectDescendantFolderIds(state.gitHubCiFolders, folderId);
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
        const idsToDelete = collectDescendantFolderIds(state.gitHubCiFolders, folderId);
        const nextFolders = state.gitHubCiFolders.map((f) =>
          idsToDelete.has(f.id) ? { ...f, ciConfig: undefined } : f
        );
        scheduleFoldersWrite(nextFolders);
        return { gitHubCiFolders: nextFolders };
      });
    },

    gitHubDeleteFolderDataRecursive: (folderId) => {
      set((state) => {
        const idsToDelete = collectDescendantFolderIds(state.gitHubCiFolders, folderId);
        const affectedWorkspaceIds = collectAffectedWorkspaceIds(
          state.gitHubCiFolders,
          idsToDelete
        );
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
        const idsToDelete = collectDescendantFolderIds(state.gitHubCiFolders, folderId);
        const affectedWorkspaceIds = collectAffectedWorkspaceIds(
          state.gitHubCiFolders,
          idsToDelete
        );
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
