/**
 * 工作区切片
 * 管理应用和工作区相关状态
 */
import type { AppInfo, RecentWorkspaceEntry, WorkspaceTreeNode, GitSnapshot } from '@adlo/kernel';
import type { StoreState } from '../StoreState';
import { persistField } from '../persisted/apply';
import { applyWorkspacePrune } from '../persisted/pruneWiring';

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
   * 外部文件（不属于任何侧栏工作区）的隐藏工作区根：`Record<externalId, rootPath>`。
   *
   * 独立于 `recentWorkspaces`：后者会被 `setRecentWorkspaces` 整体替换（添加/移除
   * 工作区、切换、启动都会），若外部文件的根只存在数组条目里，一次刷新就会让
   * 保存/对账/绝对路径全部失去目标。这里的内存映射不参与侧栏渲染、不落盘，
   * 只在应用会话内有效（重启即消失，草稿本身也只活在内存里）。
   */
  externalFileRoots: Record<string, string>;
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
  /**
   * 每个工作区正在执行的远端 Git 操作（push / pull）。
   *
   * 放在 store 而不是工作区行组件的局部 state：右下角错误卡片的「重试」在
   * 组件树之外触发，只有共享状态才能让重试同样进入忙碌扫光，并与菜单/行内
   * 按钮互斥（同一工作区同时只允许一个远端操作）。
   */
  gitOpsBusy: Record<string, 'push' | 'pull' | undefined>;

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
  setGitOpsBusy: (workspaceId: string, label: 'push' | 'pull' | null) => void;
}

/**
 * 工作区切片创建器（仅包含状态和简单 setters）
 */
export const createWorkspaceSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): WorkspaceSlice => {
  return {
    recentWorkspaces: [],
    externalFileRoots: {},
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
    gitOpsBusy: {},

    setAppInfo: (appInfo) => set({ appInfo }),
    setRecentWorkspaces: (workspaces) => {
      set({ recentWorkspaces: workspaces });
      // 工作区参照清单就绪：剪掉已不存在工作区 / 标签的孤儿条目（规格 §3.5.1）。
      // 空清单时 prune 层直接跳过（R7），此处无须设防。
      applyWorkspacePrune();
    },
    setWorkspaceTrees: (trees) => set({ workspaceTrees: trees }),
    setWorkspaceTreeLoading: (loading) => set({ workspaceTreeLoading: loading }),
    setWorkspaceTreeRefreshing: (refreshing) => set({ workspaceTreeRefreshing: refreshing }),
    setWorkspaceTreeErrors: (errors) => set({ workspaceTreeErrors: errors }),
    setWorkspaceTreeExpandedInFileNav: (expanded) =>
      set(persistField('adl:files.workspaceExpanded', expanded)),
    setRefreshingAllWorkspaces: (refreshing) => set({ refreshingAllWorkspaces: refreshing }),
    setWorkspaceChangesExpanded: (expanded) =>
      set(persistField('adl:changes.workspaceExpanded', expanded)),
    setWorkspaceChangesTreeData: (data) => set({ workspaceChangesTreeData: data }),
    setWorkspaceChangesTreeLoading: (loading) => set({ workspaceChangesTreeLoading: loading }),
    setWorkspaceChangesTreeErrors: (errors) => set({ workspaceChangesTreeErrors: errors }),
    setChangesTreeRefreshing: (refreshing) => set({ changesTreeRefreshing: refreshing }),
    setRefreshingAllChanges: (refreshing) => set({ refreshingAllChanges: refreshing }),
    setGitOpsBusy: (workspaceId, label) =>
      set((state) => {
        const next: Record<string, 'push' | 'pull' | undefined> = { ...state.gitOpsBusy };
        if (label) {
          next[workspaceId] = label;
        } else {
          delete next[workspaceId];
        }
        return { gitOpsBusy: next };
      }),
  };
};
