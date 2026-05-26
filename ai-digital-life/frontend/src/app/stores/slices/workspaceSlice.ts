/**
 * 工作区切片
 * 管理应用和工作区相关状态
 */
import type {
  AppInfo,
  RecentWorkspaceEntry,
  WorkspaceTreeNode,
  GitSnapshot,
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
  gitSnapshots: Record<string, GitSnapshot>;
  workspaceChangesExpanded: Record<string, boolean>;
  workspaceChangesTreeData: Record<string, WorkspaceTreeNode[]>;
  workspaceChangesTreeLoading: Record<string, boolean>;
  workspaceChangesTreeErrors: Record<string, string | undefined>;
  workspaceContextMode: "workspace" | "global";

  setAppInfo: (appInfo: AppInfo | undefined) => void;
  setRecentWorkspaces: (workspaces: RecentWorkspaceEntry[]) => void;
  setWorkspaceTree: (tree: WorkspaceTreeNode[]) => void;
  setWorkspaceTrees: (trees: Record<string, WorkspaceTreeNode[]>) => void;
  setWorkspaceTreeLoading: (loading: Record<string, boolean>) => void;
  setWorkspaceTreeErrors: (errors: Record<string, string | undefined>) => void;
  setWorkspaceTreeExpandedInFileNav: (expanded: Record<string, boolean>) => void;
  setGitSnapshots: (snapshots: Record<string, GitSnapshot>) => void;
  setWorkspaceChangesExpanded: (expanded: Record<string, boolean>) => void;
  setWorkspaceChangesTreeData: (data: Record<string, WorkspaceTreeNode[]>) => void;
  setWorkspaceChangesTreeLoading: (loading: Record<string, boolean>) => void;
  setWorkspaceChangesTreeErrors: (errors: Record<string, string | undefined>) => void;
  setWorkspaceContextMode: (mode: "workspace" | "global") => void;
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
  gitSnapshots: {},
  workspaceChangesExpanded: {},
  workspaceChangesTreeData: {},
  workspaceChangesTreeLoading: {},
  workspaceChangesTreeErrors: {},
  workspaceContextMode: "workspace",

  setAppInfo: (appInfo) => set({ appInfo }),
  setRecentWorkspaces: (workspaces) => set({ recentWorkspaces: workspaces }),
  setWorkspaceTree: (tree) => set({ workspaceTree: tree }),
  setWorkspaceTrees: (trees) => set({ workspaceTrees: trees }),
  setWorkspaceTreeLoading: (loading) => set({ workspaceTreeLoading: loading }),
  setWorkspaceTreeErrors: (errors) => set({ workspaceTreeErrors: errors }),
  setWorkspaceTreeExpandedInFileNav: (expanded) => set({ workspaceTreeExpandedInFileNav: expanded }),
  setGitSnapshots: (snapshots) => set({ gitSnapshots: snapshots }),
  setWorkspaceChangesExpanded: (expanded) => set({ workspaceChangesExpanded: expanded }),
  setWorkspaceChangesTreeData: (data) => set({ workspaceChangesTreeData: data }),
  setWorkspaceChangesTreeLoading: (loading) => set({ workspaceChangesTreeLoading: loading }),
  setWorkspaceChangesTreeErrors: (errors) => set({ workspaceChangesTreeErrors: errors }),
  setWorkspaceContextMode: (mode) => set({ workspaceContextMode: mode }),
});
