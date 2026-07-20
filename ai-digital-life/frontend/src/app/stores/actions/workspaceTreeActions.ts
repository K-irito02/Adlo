import type { StoreApi } from 'zustand';
import type { StoreState } from '../StoreState';
import type { WorkspaceTreeNode } from '@ai-digital-life/kernel';
import type { WorkspaceID } from '../../../shared/branded';
import { asWorkspaceID } from '../../../shared/branded';
import { createLazyLoader, batchExpandAll, expandSingle } from '../shared';

/**
 * Workspace tree-loading and navigation-expansion actions.
 * Extracted from workspaceActions.ts to keep file sizes manageable.
 */
export function createWorkspaceTreeActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
) {
  return {
    /**
     * [loadWorkspaceTree - 懒加载指定工作区的文件树]
     * @reads workspaceSlice.workspaceTrees, workspaceSlice.workspaceTreeLoading
     * @writes workspaceSlice.workspaceTrees, workspaceSlice.workspaceTreeLoading, workspaceSlice.workspaceTreeErrors
     * @see shared/ipc.ts → workspace.listTreeForWorkspace
     * @see mock-bridge.ts → workspace.listTreeForWorkspace
     * @see preview-bridge/index.ts → workspace.listTreeForWorkspace
     */
    loadWorkspaceTree: createLazyLoader<WorkspaceTreeNode[]>(
      (path) => window.digitalLife.workspace.listTreeForWorkspace(path),
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
    )(set, get),

    /**
     * [toggleWorkspaceTreeInFileNav - 切换工作区在文件导航中的展开状态]
     * @reads workspaceSlice.workspaceTreeExpandedInFileNav
     * @writes workspaceSlice.workspaceTreeExpandedInFileNav
     * @see — 无桥接调用
     */
    toggleWorkspaceTreeInFileNav: (workspaceId: WorkspaceID) => {
      const current = get().workspaceTreeExpandedInFileNav;
      set({
        workspaceTreeExpandedInFileNav: {
          ...current,
          [workspaceId]: !current[workspaceId],
        },
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
        (next) => set({ workspaceTreeExpandedInFileNav: next }),
        !!state.workspaceTrees[workspaceId],
        () => get().loadWorkspaceTree(workspaceId, workspacePath),
      );
    },

    /**
     * [refreshOneWorkspaceTree - 刷新单个工作区的文件树]
     * @reads workspaceSlice.workspaceTreeLoading, workspaceSlice.workspaceTreeErrors, workspaceSlice.workspaceTrees
     * @writes workspaceSlice.workspaceTreeLoading, workspaceSlice.workspaceTreeErrors, workspaceSlice.workspaceTrees
     * @see shared/ipc.ts → workspace.listTreeForWorkspace
     * @see mock-bridge.ts → workspace.listTreeForWorkspace
     * @see preview-bridge/index.ts → workspace.listTreeForWorkspace
     */
    refreshOneWorkspaceTree: async (workspaceId: WorkspaceID, workspacePath: string) => {
      set({
        workspaceTreeLoading: { ...get().workspaceTreeLoading, [workspaceId]: true },
        workspaceTreeErrors: { ...get().workspaceTreeErrors, [workspaceId]: undefined },
      });
      const result = await window.digitalLife.workspace.listTreeForWorkspace(workspacePath);
      const loading = { ...get().workspaceTreeLoading, [workspaceId]: false };
      if (!result.ok) {
        set({
          workspaceTreeLoading: loading,
          workspaceTreeErrors: {
            ...get().workspaceTreeErrors,
            [workspaceId]: result.error.message,
          },
        });
        return;
      }
      set({
        workspaceTrees: { ...get().workspaceTrees, [workspaceId]: result.data },
        workspaceTreeLoading: loading,
      });
    },

    /**
     * [refreshAllWorkspaceTrees - 刷新所有已展开工作区的文件树]
     * @reads workspaceSlice.workspaceTreeExpandedInFileNav, workspaceSlice.recentWorkspaces
     * @writes workspaceSlice.workspaceTreeLoading, workspaceSlice.workspaceTreeErrors, workspaceSlice.workspaceTrees (通过 refreshOneWorkspaceTree)
     * @see shared/ipc.ts → workspace.listTreeForWorkspace (通过 refreshOneWorkspaceTree)
     * @see mock-bridge.ts → workspace.listTreeForWorkspace (通过 refreshOneWorkspaceTree)
     * @see preview-bridge/index.ts → workspace.listTreeForWorkspace (通过 refreshOneWorkspaceTree)
     */
    refreshAllWorkspaceTrees: async () => {
      const state = get();
      const expandedIds = Object.entries(state.workspaceTreeExpandedInFileNav)
        .filter(([, expanded]) => expanded)
        .map(([id]) => id);
      await Promise.allSettled(
        expandedIds.map((id) => {
          const ws = state.recentWorkspaces.find((r) => r.id === id);
          if (!ws) {
            return Promise.resolve();
          }
          return get().refreshOneWorkspaceTree(asWorkspaceID(id), ws.path);
        }),
      );
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
        (next) => set({ workspaceTreeExpandedInFileNav: next }),
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
      set({ workspaceTreeExpandedInFileNav: {} });
    },
  };
}
