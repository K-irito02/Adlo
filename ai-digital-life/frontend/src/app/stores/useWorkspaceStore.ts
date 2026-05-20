/**
 * Workspace Store - 工作区状态管理
 * 
 * 这是一个独立的 Zustand store，专注于工作区相关的状态。
 * 注意：目前这是一个概念验证模块，实际使用时需要与主 store 协调。
 */

import { create } from "zustand";
import type {
  AppInfo,
  GitSnapshot,
  GitBranchSummary,
  WorkspaceTreeNode,
  WorkspaceSearchHit,
  IndexingStatus,
  RepoMapNode,
  WorkspaceGitBranchSwitchInput,
  WorkspaceGitBranchCreateInput,
  ReorderWorkspacesInput,
  RecentWorkspaceEntry
} from "@ai-digital-life/kernel";
import {
  workspaceRequestSeq as sharedWorkspaceRequestSeq,
  queueLowPriorityRefresh,
} from "./shared";

export type WorkspaceState = {
  // State
  appInfo?: AppInfo;
  recentWorkspaces: RecentWorkspaceEntry[];
  workspaceTree: WorkspaceTreeNode[];
  searchQuery: string;
  searchResults: WorkspaceSearchHit[];
  gitSnapshot?: GitSnapshot;
  gitBranches: GitBranchSummary[];
  workspaceContextMode: "workspace" | "global";
  indexingStatus?: IndexingStatus;
  repoMap: RepoMapNode[];
  
  // Actions
  setAppInfo: (appInfo: AppInfo | undefined) => void;
  setRecentWorkspaces: (workspaces: RecentWorkspaceEntry[]) => void;
  setWorkspaceTree: (tree: WorkspaceTreeNode[]) => void;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: WorkspaceSearchHit[]) => void;
  setGitSnapshot: (snapshot: GitSnapshot | undefined) => void;
  setGitBranches: (branches: GitBranchSummary[]) => void;
  setWorkspaceContextMode: (mode: "workspace" | "global") => void;
  setIndexingStatus: (status: IndexingStatus | undefined) => void;
  setRepoMap: (map: RepoMapNode[]) => void;
};

let localWorkspaceRequestSeq = sharedWorkspaceRequestSeq;

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  // Initial state
  recentWorkspaces: [],
  workspaceTree: [],
  searchQuery: "",
  searchResults: [],
  gitBranches: [],
  workspaceContextMode: "workspace",
  repoMap: [],

  // Actions
  setAppInfo: (appInfo) => set({ appInfo }),
  setRecentWorkspaces: (recentWorkspaces) => set({ recentWorkspaces }),
  setWorkspaceTree: (workspaceTree) => set({ workspaceTree }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSearchResults: (searchResults) => set({ searchResults }),
  setGitSnapshot: (gitSnapshot) => set({ gitSnapshot }),
  setGitBranches: (gitBranches) => set({ gitBranches }),
  setWorkspaceContextMode: (workspaceContextMode) => set({ workspaceContextMode }),
  setIndexingStatus: (indexingStatus) => set({ indexingStatus }),
  setRepoMap: (repoMap) => set({ repoMap }),
}));

// Workspace-related actions that interact with the backend
export const workspaceActions = {
  openWorkspace: async (workspacePath: string) => {
    const result = await window.digitalLife.workspace.open(workspacePath);
    return result;
  },

  refreshWorkspace: async (setState: (partial: Partial<WorkspaceState>) => void, requestSeq: number) => {
    const currentSeq = ++localWorkspaceRequestSeq;
    
    const [treeResult, gitStatusResult] = await Promise.all([
      window.digitalLife.workspace.listTree(),
      window.digitalLife.workspace.getGitStatus()
    ]);

    if (currentSeq !== requestSeq) {
      return;
    }

    setState({
      workspaceTree: treeResult.ok ? treeResult.data : [],
      gitSnapshot: gitStatusResult.ok ? gitStatusResult.data : undefined
    });
  },

  searchFiles: async (query: string, setState: (partial: Partial<WorkspaceState>) => void) => {
    setState({ searchQuery: query });
    
    if (!query.trim()) {
      setState({ searchResults: [] });
      return;
    }

    const result = await window.digitalLife.workspace.search(query);
    if (result.ok) {
      setState({ searchResults: result.data });
    }
  },

  fetchGitStatus: async (setState: (partial: Partial<WorkspaceState>) => void) => {
    const result = await window.digitalLife.workspace.getGitStatus();
    if (result.ok) {
      setState({ gitSnapshot: result.data });
    }
  },

  fetchGitBranches: async (setState: (partial: Partial<WorkspaceState>) => void) => {
    const result = await window.digitalLife.workspace.listGitBranches();
    if (result.ok) {
      setState({ gitBranches: result.data });
    }
  },

  switchGitBranch: async (input: WorkspaceGitBranchSwitchInput) => {
    return await window.digitalLife.workspace.switchGitBranch(input);
  },

  createGitBranch: async (input: WorkspaceGitBranchCreateInput) => {
    return await window.digitalLife.workspace.createGitBranch(input);
  },

  reorderWorkspaces: async (input: ReorderWorkspacesInput) => {
    return await window.digitalLife.workspace.reorder(input);
  },

  pinWorkspace: async (workspaceId: string) => {
    return await window.digitalLife.workspace.pin(workspaceId);
  },

  unpinWorkspace: async (workspaceId: string) => {
    return await window.digitalLife.workspace.unpin(workspaceId);
  },
};
