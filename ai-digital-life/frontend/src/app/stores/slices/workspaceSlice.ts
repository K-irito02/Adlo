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
import { workspaceRequestSeq as sharedWorkspaceRequestSeq, queueLowPriorityRefresh } from "../shared";

// 保持向后兼容的变量
let workspaceRequestSeq = sharedWorkspaceRequestSeq;

export interface WorkspaceSlice {
  appInfo?: AppInfo;
  recentWorkspaces: RecentWorkspaceEntry[];
  workspaceTree: WorkspaceTreeNode[];
  gitSnapshot?: GitSnapshot;
  gitBranches: GitBranchSummary[];
  workspaceContextMode: "workspace" | "global";
  indexingStatus?: IndexingStatus;
  repoMap: RepoMapNode[];

  setAppInfo: (appInfo: AppInfo | undefined) => void;
  setRecentWorkspaces: (workspaces: RecentWorkspaceEntry[]) => void;
  setWorkspaceTree: (tree: WorkspaceTreeNode[]) => void;
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
  set: (partial: Partial<WorkspaceSlice> | ((state: WorkspaceSlice) => Partial<WorkspaceSlice>)) => void,
  get: () => WorkspaceSlice
): WorkspaceSlice => ({
  recentWorkspaces: [],
  workspaceTree: [],
  repoMap: [],
  gitBranches: [],
  workspaceContextMode: "workspace",

  setAppInfo: (appInfo) => set({ appInfo }),
  setRecentWorkspaces: (workspaces) => set({ recentWorkspaces: workspaces }),
  setWorkspaceTree: (tree) => set({ workspaceTree: tree }),
  setGitSnapshot: (snapshot) => set({ gitSnapshot: snapshot }),
  setGitBranches: (branches) => set({ gitBranches: branches }),
  setWorkspaceContextMode: (mode) => set({ workspaceContextMode: mode }),
  setIndexingStatus: (status) => set({ indexingStatus: status }),
  setRepoMap: (map) => set({ repoMap: map })
});
