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
import { STORAGE_HYDRATION_DELAY_MS } from '../constants';
import { readJson, writeJson } from '../shared';

// Local storage keys
const WORKSPACE_TREE_EXPANDED_KEY = 'adl-ui:workspace-tree-expanded';
const WORKSPACE_CHANGES_EXPANDED_KEY = 'adl-ui:workspace-changes-expanded';

// Batch write scheduler — coalesces multiple localStorage writes into one
const pendingWrites = new Map<string, unknown>();
let writeScheduled = false;

function scheduleWrite(key: string, value: unknown): void {
  pendingWrites.set(key, value);
  scheduleFlush();
}

function scheduleFlush(): void {
  if (writeScheduled) {
    return;
  }
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
  set: (partial: Partial<StoreState>) => void,
): void {
  if (_defaultsHydrated) {
    return;
  }
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
    setTimeout(doHydrate, STORAGE_HYDRATION_DELAY_MS);
  }
}

export interface WorkspaceSlice {
  /**
   * 应用元数据。`appInfo.currentWorkspace.gitSnapshot` 是 Git 快照的 Source C
   * （后端 workspace metadata 兜底，供 badge/header 使用），由
   * buildGitSnapshotSyncPatch() 在同步 A/B 时一并维护（详见 gitSlice.ts 文件头）。
   */
  appInfo?: AppInfo;
  recentWorkspaces: RecentWorkspaceEntry[];
  workspaceTrees: Record<string, WorkspaceTreeNode[]>;
  workspaceTreeLoading: Record<string, boolean>;
  workspaceTreeRefreshing: Record<string, boolean>;
  workspaceTreeErrors: Record<string, string | undefined>;
  workspaceTreeExpandedInFileNav: Record<string, boolean>;
  refreshingAllWorkspaces: boolean;
  /**
   * 所有工作区的 Git 快照映射表（Source B）
   * 用途：多工作区视图（文件树、变更树、Git 可视化）需要按工作区 ID 获取快照
   * 更新时机：bootstrap()、loadGitSnapshot()、refreshGitSnapshot()、fetchGitStatus()、
   *           switchGitBranch()、createGitBranch()、applyGitOperation()
   * 特点：Record<workspaceId, GitSnapshot>，支持按工作区独立刷新；写入均为合并写
   * （唯一例外：bootstrap 无当前工作区的复位分支会整体清空）
   *
   * 设计说明：
   * 与 gitSlice.gitSnapshot（Source A）及 appInfo.currentWorkspace.gitSnapshot（Source C）
   * 冗余并存，支持用户便利性和性能稳定性：
   * - 每个工作区相当于一个 tab 页面，可以独立刷新
   * - 每个工作区内有"刷新全部图表"按钮，只刷新当前工作区的图表
   * - 每个图表有单独的"刷新"按钮，只刷新当前图表
   * - 避免同时并发刷新所有工作区和图表
   *
   * 同步不变量：完整快照写入经 stores/gitSnapshotSync.ts 的 buildGitSnapshotSyncPatch()
   * 统一执行，保证 B 与（当前工作区时的）A/C 一致。例外：bootstrap 复位/loadBatch 级联
   * 批量写 B（详见 gitSlice.ts 文件头）。禁止手工整表替换 B 或直写单例 A。
   */
  gitSnapshots: Record<string, GitSnapshot>;
  workspaceChangesExpanded: Record<string, boolean>;
  workspaceChangesTreeData: Record<string, WorkspaceTreeNode[]>;
  workspaceChangesTreeLoading: Record<string, boolean>;
  workspaceChangesTreeErrors: Record<string, string | undefined>;
  /** Changes 面板单工作区「刷新中」状态（与 Files 的 workspaceTreeRefreshing 对齐） */
  changesTreeRefreshing: Record<string, boolean>;
  /** Changes 面板「刷新全部」进行中标记 */
  refreshingAllChanges: boolean;

  setAppInfo: (appInfo: AppInfo | undefined) => void;
  setRecentWorkspaces: (workspaces: RecentWorkspaceEntry[]) => void;
  setWorkspaceTrees: (trees: Record<string, WorkspaceTreeNode[]>) => void;
  setWorkspaceTreeLoading: (loading: Record<string, boolean>) => void;
  setWorkspaceTreeRefreshing: (refreshing: Record<string, boolean>) => void;
  setWorkspaceTreeErrors: (errors: Record<string, string | undefined>) => void;
  setWorkspaceTreeExpandedInFileNav: (expanded: Record<string, boolean>) => void;
  setRefreshingAllWorkspaces: (refreshing: boolean) => void;
  setWorkspaceChangesExpanded: (expanded: Record<string, boolean>) => void;
  setWorkspaceChangesTreeData: (data: Record<string, WorkspaceTreeNode[]>) => void;
  setWorkspaceChangesTreeLoading: (loading: Record<string, boolean>) => void;
  setWorkspaceChangesTreeErrors: (errors: Record<string, string | undefined>) => void;
  setChangesTreeRefreshing: (refreshing: Record<string, boolean>) => void;
  setRefreshingAllChanges: (refreshing: boolean) => void;
}

/**
 * 工作区切片创建器（仅包含状态和简单 setters）
 */
export const createWorkspaceSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState,
): WorkspaceSlice => {
  hydrateWorkspaceDefaults(get, set);
  return {
    recentWorkspaces: [],
    workspaceTrees: {},
    workspaceTreeLoading: {},
    workspaceTreeRefreshing: {},
    workspaceTreeErrors: {},
    workspaceTreeExpandedInFileNav: {},
    refreshingAllWorkspaces: false,
    gitSnapshots: {},
    workspaceChangesExpanded: {},
    workspaceChangesTreeData: {},
    workspaceChangesTreeLoading: {},
    workspaceChangesTreeErrors: {},
    changesTreeRefreshing: {},
    refreshingAllChanges: false,

    setAppInfo: (appInfo) => set({ appInfo }),
    setRecentWorkspaces: (workspaces) => set({ recentWorkspaces: workspaces }),
    setWorkspaceTrees: (trees) => set({ workspaceTrees: trees }),
    setWorkspaceTreeLoading: (loading) => set({ workspaceTreeLoading: loading }),
    setWorkspaceTreeRefreshing: (refreshing) => set({ workspaceTreeRefreshing: refreshing }),
    setWorkspaceTreeErrors: (errors) => set({ workspaceTreeErrors: errors }),
    setWorkspaceTreeExpandedInFileNav: (expanded) => {
      scheduleWrite(WORKSPACE_TREE_EXPANDED_KEY, expanded);
      set({ workspaceTreeExpandedInFileNav: expanded });
    },
    setRefreshingAllWorkspaces: (refreshing) => set({ refreshingAllWorkspaces: refreshing }),
    setWorkspaceChangesExpanded: (expanded) => {
      scheduleWrite(WORKSPACE_CHANGES_EXPANDED_KEY, expanded);
      set({ workspaceChangesExpanded: expanded });
    },
    setWorkspaceChangesTreeData: (data) => set({ workspaceChangesTreeData: data }),
    setWorkspaceChangesTreeLoading: (loading) => set({ workspaceChangesTreeLoading: loading }),
    setWorkspaceChangesTreeErrors: (errors) => set({ workspaceChangesTreeErrors: errors }),
    setChangesTreeRefreshing: (refreshing) => set({ changesTreeRefreshing: refreshing }),
    setRefreshingAllChanges: (refreshing) => set({ refreshingAllChanges: refreshing }),
  };
};
