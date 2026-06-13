import type { CiJobSummary, CiStatusSnapshot } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';
import type { DigitalLifeBridge } from '../../../shared/ipc';
import type { GitWorkspaceCiConfig } from './githubCiConfigSlice';
import { createDebouncedWrite, readJson } from '../shared';

const ACTIVE_GITHUB_SECTION_KEY = 'adl-ui:active-github-section';
const CI_SNAPSHOTS_KEY = 'adl-ui:ci-snapshots';
const CI_LOG_CACHES_KEY = 'adl-ui:ci-log-caches';

const { scheduleWrite: scheduleSnapshotsWrite } = createDebouncedWrite(300);
const { scheduleWrite: scheduleLogCachesWrite } = createDebouncedWrite(300);

export type GitHubSection = 'overview' | 'workflows' | 'jobs' | 'logs' | 'settings' | 'help';

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

async function hydrateCiStatusDefaults(): Promise<{
  activeGitHubSection: GitHubSection;
}> {
  if (typeof window === 'undefined') {
    return {
      activeGitHubSection: 'overview',
    };
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

  return { activeGitHubSection };
}

export interface GitHubCiStatusSlice {
  activeGitHubSection: GitHubSection;
  ciLoading: boolean;
  ciError: string | null;
  ciSnapshot: CiStatusSnapshot | null;
  ciJobs: CiJobSummary[];

  /** CI data cached per workspace/folder ID */
  ciSnapshots: Record<string, CiStatusSnapshot>;
  /** Log caches per directory: selected job ID + fetched log texts */
  ciLogCaches: Record<string, { selectedJobId: number | null; logs: Record<number, string> }>;

  /** Tree expansion state for GitHub navigator */
  gitHubTreeExpanded: Record<string, boolean>;
  /** Whether the workspace tree is fully expanded */
  gitHubAllTreeExpanded: boolean;
  /** Selected tree path in GitHub navigator */
  selectedGitHubTreePath: string | null;

  setActiveGitHubSection: (section: GitHubSection) => void;
  refreshCiStatus: () => Promise<void>;
  notifyGitPushed: () => void;
  setGitHubTreeExpanded: (expanded: Record<string, boolean>) => void;
  toggleGitHubTreePath: (path: string) => void;
  expandAllGitHubTree: () => void;
  collapseAllGitHubTree: () => void;
  setSelectedGitHubTreePath: (path: string | null) => void;
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

export const createGitHubCiStatusSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): GitHubCiStatusSlice => {
  if (typeof window !== 'undefined') {
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

    ciLoading: false,
    ciError: null,
    ciSnapshot: null,
    ciJobs: [],
    ciSnapshots: {},
    ciLogCaches: {},

    gitHubTreeExpanded: {},
    gitHubAllTreeExpanded: false,
    selectedGitHubTreePath: null,

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
        scheduleLogCachesWrite(CI_LOG_CACHES_KEY, next);
        return { ciLogCaches: next };
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
        const collectFolderPaths = (
          parentId: string | undefined,
          parentType: string | undefined
        ) => {
          const children = state.gitHubCiFolders.filter(
            (f) =>
              f.parentId === parentId &&
              (!f.parentType || f.parentType === parentType || parentType === undefined)
          );
          for (const child of children) {
            paths[`github-folder:${child.id}`] = true;
            collectFolderPaths(child.id, 'folder');
          }
        };
        collectFolderPaths(undefined, undefined);
        return { gitHubTreeExpanded: paths, gitHubAllTreeExpanded: true };
      });
    },

    collapseAllGitHubTree: () => set({ gitHubTreeExpanded: {}, gitHubAllTreeExpanded: false }),

    setSelectedGitHubTreePath: (path) => set({ selectedGitHubTreePath: path }),

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
        const msg = '请先配置仓库 owner 和 repo';
        set({ ciError: msg });
        return;
      }
      set({ ciLoading: true, ciError: null });
      try {
        const bridge = getBridge();
        if (!bridge || !bridge.github) {
          const msg = 'bridge not ready';
          set({ ciError: msg, ciLoading: false });
          return;
        }
        const token = isTauriMode() ? null : (config.accessToken ?? state.ciAccessToken ?? '');
        const result = await bridge.github.getStatus({
          owner: config.owner,
          repo: config.repo,
          branch: config.branch,
          workflowId: config.workflowId,
          accessToken: token,
        });
        if (result.ok) {
          set((state) => {
            const nextSnapshots = { ...state.ciSnapshots, [id]: result.data };
            scheduleSnapshotsWrite(CI_SNAPSHOTS_KEY, nextSnapshots);
            return {
              ciSnapshot: result.data,
              ciJobs: result.data.jobs ?? [],
              ciLoading: false,
              ciSnapshots: nextSnapshots,
            };
          });
        } else {
          const msg = result.error?.message ?? '获取 CI 状态失败';
          set({ ciError: msg, ciLoading: false });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set({ ciError: message, ciLoading: false });
      }
    },
  };
};
