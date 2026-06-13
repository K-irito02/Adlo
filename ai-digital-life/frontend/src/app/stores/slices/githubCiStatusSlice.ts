import type { CiJobSummary, CiStatusSnapshot } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';
import type { DigitalLifeBridge } from '../../../shared/ipc';

const ACTIVE_GITHUB_SECTION_KEY = 'adl-ui:active-github-section';

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
  selectedLogJobId: number | null;
  cachedJobLogs: Record<number, string>;
  logLoading: boolean;
  logError: string | null;

  /** Tree expansion state for GitHub navigator */
  gitHubTreeExpanded: Record<string, boolean>;
  /** Whether the workspace tree is fully expanded */
  gitHubAllTreeExpanded: boolean;
  /** Selected tree path in GitHub navigator */
  selectedGitHubTreePath: string | null;

  setActiveGitHubSection: (section: GitHubSection) => void;
  refreshCiStatus: () => Promise<void>;
  notifyGitPushed: () => void;
  setSelectedLogJobId: (jobId: number | null) => void;
  setCachedJobLogs: (logs: Record<number, string>) => void;
  setLogLoading: (loading: boolean) => void;
  setLogError: (error: string | null) => void;
  setGitHubTreeExpanded: (expanded: Record<string, boolean>) => void;
  toggleGitHubTreePath: (path: string) => void;
  expandAllGitHubTree: () => void;
  collapseAllGitHubTree: () => void;
  setSelectedGitHubTreePath: (path: string | null) => void;
  refreshCiStatusForWorkspace: (workspaceId: string) => Promise<void>;
}

export const createGitHubCiStatusSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): GitHubCiStatusSlice => {
  if (typeof window !== 'undefined') {
    void hydrateCiStatusDefaults().then(({ activeGitHubSection }) => {
      set({ activeGitHubSection });
    });
  }

  return {
    activeGitHubSection: 'overview',

    ciLoading: false,
    ciError: null,
    ciSnapshot: null,
    ciJobs: [],
    selectedLogJobId: null,
    cachedJobLogs: {},
    logLoading: false,
    logError: null,

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
      if (state.ciConfig.owner && state.ciConfig.repo) {
        void state.refreshCiStatus();
      }
    },

    setSelectedLogJobId: (jobId) => set({ selectedLogJobId: jobId }),

    setCachedJobLogs: (logs) => set({ cachedJobLogs: logs }),

    setLogLoading: (loading) => set({ logLoading: loading }),

    setLogError: (error) => set({ logError: error }),

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
