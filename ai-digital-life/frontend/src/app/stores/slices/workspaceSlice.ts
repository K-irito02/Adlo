/**
 * 工作区切片
 * 管理应用和工作区相关状态
 */
import type {
  AppInfo,
  RecentWorkspaceEntry,
  WorkspaceTreeNode,
  GitSnapshot,
  GitBranchSummary,
  IndexingStatus,
  RepoMapNode
} from "@ai-digital-life/kernel";
import type { StoreState } from "../StoreState";
import { queueLowPriorityRefresh } from "../shared";

export interface WorkspaceSlice {
  appInfo?: AppInfo;
  recentWorkspaces: RecentWorkspaceEntry[];
  workspaceTree: WorkspaceTreeNode[];            // @deprecated 使用 workspaceTrees
  workspaceTrees: Record<string, WorkspaceTreeNode[]>;
  workspaceTreeLoading: Record<string, boolean>;
  workspaceTreeErrors: Record<string, string | undefined>;
  workspaceTreeExpandedInFileNav: Record<string, boolean>;
  gitSnapshot?: GitSnapshot;
  gitBranches: GitBranchSummary[];
  workspaceContextMode: "workspace" | "global";
  indexingStatus?: IndexingStatus;
  repoMap: RepoMapNode[];

  setAppInfo: (appInfo: AppInfo | undefined) => void;
  setRecentWorkspaces: (workspaces: RecentWorkspaceEntry[]) => void;
  setWorkspaceTree: (tree: WorkspaceTreeNode[]) => void;
  setWorkspaceTrees: (trees: Record<string, WorkspaceTreeNode[]>) => void;
  setWorkspaceTreeLoading: (loading: Record<string, boolean>) => void;
  setWorkspaceTreeErrors: (errors: Record<string, string | undefined>) => void;
  setWorkspaceTreeExpandedInFileNav: (expanded: Record<string, boolean>) => void;
  setGitSnapshot: (snapshot: GitSnapshot | undefined) => void;
  setGitBranches: (branches: GitBranchSummary[]) => void;
  setWorkspaceContextMode: (mode: "workspace" | "global") => void;
  setIndexingStatus: (status: IndexingStatus | undefined) => void;
  setRepoMap: (map: RepoMapNode[]) => void;
}

/**
 * 工作区切片创建器（仅包含状态和简单 setters）
 */
export const createWorkspaceSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState
): WorkspaceSlice => ({
  recentWorkspaces: [],
  workspaceTree: [],
  workspaceTrees: {},
  workspaceTreeLoading: {},
  workspaceTreeErrors: {},
  workspaceTreeExpandedInFileNav: {},
  repoMap: [],
  gitBranches: [],
  workspaceContextMode: "workspace",

  setAppInfo: (appInfo) => set({ appInfo }),
  setRecentWorkspaces: (workspaces) => set({ recentWorkspaces: workspaces }),
  setWorkspaceTree: (tree) => set({ workspaceTree: tree }),
  setWorkspaceTrees: (trees) => set({ workspaceTrees: trees }),
  setWorkspaceTreeLoading: (loading) => set({ workspaceTreeLoading: loading }),
  setWorkspaceTreeErrors: (errors) => set({ workspaceTreeErrors: errors }),
  setWorkspaceTreeExpandedInFileNav: (expanded) => set({ workspaceTreeExpandedInFileNav: expanded }),
  setGitSnapshot: (snapshot) => set({ gitSnapshot: snapshot }),
  setGitBranches: (branches) => set({ gitBranches: branches }),
  setWorkspaceContextMode: (mode) => set({ workspaceContextMode: mode }),
  setIndexingStatus: (status) => set({ indexingStatus: status }),
  setRepoMap: (map) => set({ repoMap: map })
});
