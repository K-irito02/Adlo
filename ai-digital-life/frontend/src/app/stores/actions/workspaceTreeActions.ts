import type { StoreApi } from 'zustand';
import type { StoreState } from '../StoreState';
import type { WorkspaceTreeNode } from '@ai-digital-life/kernel';
import type { WorkspaceID } from '../../../shared/branded';
import { asWorkspaceID } from '../../../shared/branded';
import { createLazyLoader, batchExpandAll, expandSingle } from '../shared';
import { collectDirPaths } from '../persisted/prune';
import { applyTreeLoadedPrune } from '../persisted/pruneWiring';

/**
 * Workspace tree-loading and navigation-expansion actions.
 * Extracted from workspaceActions.ts to keep file sizes manageable.
 */
export function createWorkspaceTreeActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
) {
  const loadWorkspaceTreeInner = createLazyLoader<WorkspaceTreeNode[]>(
    (path) =>
      window.digitalLife.workspace
        .listTreeForWorkspace(path)
        .then((r) => (r.ok ? { ok: true as const, data: r.data.tree } : r)),
    (s, id) => ({ hasData: !!s.workspaceTrees[id], isLoading: !!s.workspaceTreeLoading[id] }),
    (g, id) => ({
      workspaceTreeLoading: { ...g().workspaceTreeLoading, [id]: true },
      workspaceTreeErrors: { ...g().workspaceTreeErrors, [id]: undefined },
    }),
    (g, id, data) => ({
      workspaceTrees: { ...g().workspaceTrees, [id]: data },
      workspaceTreeLoading: { ...g().workspaceTreeLoading, [id]: false },
    }),
    (g, id, message) => ({
      workspaceTreeLoading: { ...g().workspaceTreeLoading, [id]: false },
      workspaceTreeErrors: { ...g().workspaceTreeErrors, [id]: message },
    }),
  )(set, get);

  return {
    /**
     * [loadWorkspaceTree - 懒加载指定工作区的文件树]
     * @reads workspaceSlice.workspaceTrees, workspaceSlice.workspaceTreeLoading
     * @writes workspaceSlice.workspaceTrees, workspaceSlice.workspaceTreeLoading, workspaceSlice.workspaceTreeErrors
     * @see shared/ipc.ts → workspace.listTreeForWorkspace
     * @see mock-bridge.ts → workspace.listTreeForWorkspace
     * @see preview-bridge/index.ts → workspace.listTreeForWorkspace
     *
     * 成功加载后触发目录剪枝（规格 §3.5.1 / R2）；加载失败或复用缓存/并发跳过时不剪。
     */
    loadWorkspaceTree: async (workspaceId: WorkspaceID, workspacePath: string) => {
      const before = get();
      if (
        before.workspaceTrees[workspaceId] !== undefined ||
        before.workspaceTreeLoading[workspaceId] === true
      ) {
        // TEMP-RCA(事项1): 命中守卫会跳过加载；若 loading 永久为 true 即自锁（定案前删除）
        console.log('[ADL-DBG-RCA] loadWorkspaceTree skipped by guard', {
          workspaceId,
          hasData: before.workspaceTrees[workspaceId] !== undefined,
          isLoading: before.workspaceTreeLoading[workspaceId] === true,
        });
        // 本次未实际加载（已有数据 / 并发加载中）：实际完成的那一次会触发剪枝。
        await loadWorkspaceTreeInner(workspaceId, workspacePath);
        return;
      }
      await loadWorkspaceTreeInner(workspaceId, workspacePath);
      const state = get();
      if (state.workspaceTreeErrors[workspaceId] !== undefined) {
        // 加载失败 ≠ 目录被删：跳过剪枝（规格 §3.5.1）。
        return;
      }
      const tree = state.workspaceTrees[workspaceId];
      if (!tree) {
        return;
      }
      applyTreeLoadedPrune(workspaceId, collectDirPaths(tree));
    },

    /**
     * [toggleWorkspaceTreeInFileNav - 切换工作区在文件导航中的展开状态]
     * @reads workspaceSlice.workspaceTreeExpandedInFileNav
     * @writes workspaceSlice.workspaceTreeExpandedInFileNav
     * @see — 无桥接调用
     */
    toggleWorkspaceTreeInFileNav: (workspaceId: WorkspaceID) => {
      const current = get().workspaceTreeExpandedInFileNav;
      get().setWorkspaceTreeExpandedInFileNav({
        ...current,
        [workspaceId]: !current[workspaceId],
      });
    },

    /**
     * [expandWorkspaceTreeInFileNav - 展开指定工作区的文件树]
     * @reads workspaceSlice.workspaceTreeExpandedInFileNav, workspaceSlice.workspaceTrees
     * @writes workspaceSlice.workspaceTreeExpandedInFileNav, workspaceSlice.workspaceTrees (通过 loadWorkspaceTree)
     * @see shared/ipc.ts → workspace.listTreeForWorkspace (通过 loadWorkspaceTree)
     * @see mock-bridge.ts → workspace.listTreeForWorkspace (通过 loadWorkspaceTree)
     * @see preview-bridge/index.ts → workspace.listTreeForWorkspace (通过 loadWorkspaceTree)
     */
    expandWorkspaceTreeInFileNav: async (workspaceId: WorkspaceID, workspacePath: string) => {
      const state = get();
      await expandSingle(
        state.workspaceTreeExpandedInFileNav,
        workspaceId,
        (next) => get().setWorkspaceTreeExpandedInFileNav(next),
        !!state.workspaceTrees[workspaceId],
        () => get().loadWorkspaceTree(workspaceId, workspacePath),
      );
    },

    /**
     * [refreshOneWorkspaceTree - 刷新单个工作区的文件树]
     * @param silent 为 true 时视为静默刷新（仅更新数据），不触发该工作区刷新图标旋转
     * @reads workspaceSlice.workspaceTreeRefreshing, workspaceSlice.workspaceTreeErrors, workspaceSlice.workspaceTrees
     * @writes workspaceSlice.workspaceTreeRefreshing, workspaceSlice.workspaceTreeErrors, workspaceSlice.workspaceTrees
     * @see shared/ipc.ts → workspace.listTreeForWorkspace
     * @see mock-bridge.ts → workspace.listTreeForWorkspace
     * @see preview-bridge/index.ts → workspace.listTreeForWorkspace
     */
    refreshOneWorkspaceTree: async (
      workspaceId: WorkspaceID,
      workspacePath: string,
      options?: { silent?: boolean },
    ) => {
      const silent = options?.silent ?? false;
      if (!silent) {
        set({
          workspaceTreeRefreshing: { ...get().workspaceTreeRefreshing, [workspaceId]: true },
          workspaceTreeErrors: { ...get().workspaceTreeErrors, [workspaceId]: undefined },
        });
      }
      try {
        const result = await window.digitalLife.workspace.listTreeForWorkspace(workspacePath, {
          force: true,
        });
        if (!result.ok) {
          // 静默刷新失败同样记录错误，与 refreshGitSnapshot 的 silent 行为对齐，
          // 避免 create/rename/delete 后的校准刷新失败被静默吞掉（乐观结果可能失真）。
          set({
            workspaceTreeErrors: {
              ...get().workspaceTreeErrors,
              [workspaceId]: result.error.message,
            },
          });
          return;
        }
        set({
          workspaceTrees: { ...get().workspaceTrees, [workspaceId]: result.data.tree },
        });
      } finally {
        if (!silent) {
          set({
            workspaceTreeRefreshing: { ...get().workspaceTreeRefreshing, [workspaceId]: false },
          });
        }
      }
    },

    /**
     * [refreshAllWorkspaceTrees - 刷新所有已展开工作区的文件树]
     * @reads workspaceSlice.workspaceTreeExpandedInFileNav, workspaceSlice.recentWorkspaces
     * @writes workspaceSlice.refreshingAllWorkspaces, workspaceSlice.workspaceTrees (通过 refreshOneWorkspaceTree)
     * @see shared/ipc.ts → workspace.listTreeForWorkspace (通过 refreshOneWorkspaceTree)
     * @see mock-bridge.ts → workspace.listTreeForWorkspace (通过 refreshOneWorkspaceTree)
     * @see preview-bridge/index.ts → workspace.listTreeForWorkspace (通过 refreshOneWorkspaceTree)
     */
    refreshAllWorkspaceTrees: async () => {
      const state = get();
      const expandedIds = Object.entries(state.workspaceTreeExpandedInFileNav)
        .filter(([, expanded]) => expanded)
        .map(([id]) => id);
      if (expandedIds.length === 0) {
        return;
      }
      set({ refreshingAllWorkspaces: true });
      try {
        await Promise.allSettled(
          expandedIds.map((id) => {
            const ws = state.recentWorkspaces.find((r) => r.id === id);
            if (!ws) {
              return Promise.resolve();
            }
            return get().refreshOneWorkspaceTree(asWorkspaceID(id), ws.path, { silent: true });
          }),
        );
      } finally {
        set({ refreshingAllWorkspaces: false });
      }
    },

    /**
     * [expandAllWorkspaceTreesInFileNav - 展开文件导航中所有工作区的文件树]
     * @reads workspaceSlice.recentWorkspaces, workspaceSlice.workspaceTreeExpandedInFileNav, workspaceSlice.workspaceTrees
     * @writes workspaceSlice.workspaceTreeExpandedInFileNav, workspaceSlice.workspaceTrees (通过 loadWorkspaceTree)
     * @see shared/ipc.ts → workspace.listTreeForWorkspace (通过 loadWorkspaceTree)
     * @see mock-bridge.ts → workspace.listTreeForWorkspace (通过 loadWorkspaceTree)
     * @see preview-bridge/index.ts → workspace.listTreeForWorkspace (通过 loadWorkspaceTree)
     */
    expandAllWorkspaceTreesInFileNav: async () => {
      const state = get();
      await batchExpandAll(
        state.recentWorkspaces,
        state.workspaceTreeExpandedInFileNav,
        (next) => get().setWorkspaceTreeExpandedInFileNav(next),
        (entry) => get().loadWorkspaceTree(asWorkspaceID(entry.id), entry.path),
        (id) => !!state.workspaceTrees[id],
      );
    },

    /**
     * [collapseAllWorkspaceTreesInFileNav - 折叠文件导航中所有工作区的文件树]
     * @reads — 无
     * @writes workspaceSlice.workspaceTreeExpandedInFileNav
     * @see — 无桥接调用
     */
    collapseAllWorkspaceTreesInFileNav: () => {
      get().setWorkspaceTreeExpandedInFileNav({});
    },
  };
}
