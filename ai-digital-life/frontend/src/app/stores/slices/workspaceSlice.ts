/**
 * 工作区切片
 * 管理应用和工作区相关状态
 */
import type {
  AppInfo,
  RecentWorkspaceEntry,
  WorkspaceTreeNode,
  GitSnapshot,
} from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';
import { queueLowPriorityRefresh } from '../shared';

// Local storage keys
const WORKSPACE_TREE_EXPANDED_KEY = 'adl-ui:workspace-tree-expanded';
const WORKSPACE_CHANGES_EXPANDED_KEY = 'adl-ui:workspace-changes-expanded';

// Helper functions
function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      return JSON.parse(raw) as T;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

// Batch write scheduler — coalesces multiple localStorage writes into one
const pendingWrites = new Map<string, unknown>();
let writeScheduled = false;

function scheduleWrite(key: string, value: unknown): void {
  pendingWrites.set(key, value);
  scheduleFlush();
}

function scheduleFlush(): void {
  if (writeScheduled) return;
  writeScheduled = true;
  const flush = () => {
    writeScheduled = false;
    for (const [key, value] of pendingWrites) {
      writeJson(key, value);
    }
    pendingWrites.clear();
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(flush, { timeout: 500 });
  } else {
    setTimeout(flush, 50);
  }
}

// Lazy localStorage hydration — reads persisted values in idle time
let _defaultsHydrated = false;

function hydrateWorkspaceDefaults(
  get: () => StoreState,
  set: (partial: Partial<StoreState>) => void
): void {
  if (_defaultsHydrated) return;
  _defaultsHydrated = true;
  const doHydrate = () => {
    const treeExpanded = readJson<Record<string, boolean>>(WORKSPACE_TREE_EXPANDED_KEY, {});
    const changesExpanded = readJson<Record<string, boolean>>(WORKSPACE_CHANGES_EXPANDED_KEY, {});
    set({
      workspaceTreeExpandedInFileNav: treeExpanded,
      workspaceChangesExpanded: changesExpanded,
    });
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(doHydrate, { timeout: 1000 });
  } else {
    setTimeout(doHydrate, 200);
  }
}

export interface WorkspaceSlice {
  appInfo?: AppInfo;
  recentWorkspaces: RecentWorkspaceEntry[];
  workspaceTree: WorkspaceTreeNode[]; // @deprecated 使用 workspaceTrees
  workspaceTrees: Record<string, WorkspaceTreeNode[]>;
  workspaceTreeLoading: Record<string, boolean>;
  workspaceTreeErrors: Record<string, string | undefined>;
  workspaceTreeExpandedInFileNav: Record<string, boolean>;
  gitSnapshots: Record<string, GitSnapshot>;
  workspaceChangesExpanded: Record<string, boolean>;
  workspaceChangesTreeData: Record<string, WorkspaceTreeNode[]>;
  workspaceChangesTreeLoading: Record<string, boolean>;
  workspaceChangesTreeErrors: Record<string, string | undefined>;
  workspaceContextMode: 'workspace' | 'global';

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
  setWorkspaceContextMode: (mode: 'workspace' | 'global') => void;
}

/**
 * 工作区切片创建器（仅包含状态和简单 setters）
 */
export const createWorkspaceSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState
): WorkspaceSlice => {
  hydrateWorkspaceDefaults(get, set);
  return {
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
    workspaceContextMode: 'workspace',

    setAppInfo: (appInfo) => set({ appInfo }),
    setRecentWorkspaces: (workspaces) => set({ recentWorkspaces: workspaces }),
    setWorkspaceTree: (tree) => set({ workspaceTree: tree }),
    setWorkspaceTrees: (trees) => set({ workspaceTrees: trees }),
    setWorkspaceTreeLoading: (loading) => set({ workspaceTreeLoading: loading }),
    setWorkspaceTreeErrors: (errors) => set({ workspaceTreeErrors: errors }),
    setWorkspaceTreeExpandedInFileNav: (expanded) => {
      scheduleWrite(WORKSPACE_TREE_EXPANDED_KEY, expanded);
      set({ workspaceTreeExpandedInFileNav: expanded });
    },
    setGitSnapshots: (snapshots) => set({ gitSnapshots: snapshots }),
    setWorkspaceChangesExpanded: (expanded) => {
      scheduleWrite(WORKSPACE_CHANGES_EXPANDED_KEY, expanded);
      set({ workspaceChangesExpanded: expanded });
    },
    setWorkspaceChangesTreeData: (data) => set({ workspaceChangesTreeData: data }),
    setWorkspaceChangesTreeLoading: (loading) => set({ workspaceChangesTreeLoading: loading }),
    setWorkspaceChangesTreeErrors: (errors) => set({ workspaceChangesTreeErrors: errors }),
    setWorkspaceContextMode: (mode) => set({ workspaceContextMode: mode }),
  };
};
