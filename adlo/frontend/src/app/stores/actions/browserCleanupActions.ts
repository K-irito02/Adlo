import type { StoreApi } from 'zustand';
import type { StoreState } from '../StoreState';
import type { WorkspaceID } from '../../../shared/branded';
import { clearError, captureError, dropPendingEditorText } from '../shared';
import { persist } from '../persisted/persist';
import { workspaceZh } from '../../i18n/zh-CN/workspace';
import { workspaceEn } from '../../i18n/en-US/workspace';
import { resolveAppLanguage } from '../../i18n/resolveLanguage';
import { applyWorkspaceRemoved } from '../persisted/pruneWiring';
import { stripWorkspaceFromBrowserState } from './browserCleanupHelpers';
const SCOPE = 'browser';

export function createBrowserCleanupActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
) {
  return {
    /**
     * [cleanupRemovedWorkspaceTree - 清理已移除工作区的状态缓存]
     * @reads workspaceSlice.workspaceTrees, workspaceSlice.workspaceTreeLoading, workspaceSlice.workspaceTreeErrors, workspaceSlice.recentWorkspaces, browserSlice.browserTabs, browserSlice.browserBookmarkFolders, browserSlice.browserActiveTabId, gitVisSlice.gitVisData/gitVisLoading/gitVisErrors/gitVisTimeRange/gitVisStale, uiSlice.activeWorkspaceTab（另有 applyWorkspaceRemoved 读取全部按工作区隔离的登记条目）
     * @writes workspaceSlice.workspaceTrees, workspaceSlice.workspaceTreeLoading, workspaceSlice.workspaceTreeErrors, browserSlice.browserTabs, browserSlice.browserTabsById, browserSlice.browserBookmarkFolders, browserSlice.browserActiveTabId, gitVisSlice.gitVisData/gitVisLoading/gitVisErrors/gitVisTimeRange/gitVisStale, uiSlice.activeWorkspaceTab（另有 applyWorkspaceRemoved 写回全部按工作区隔离的登记条目）
     * @see — 无桥接调用 (本地内存清理)
     */
    cleanupRemovedWorkspaceTree: (workspaceId: WorkspaceID) => {
      const state = get();
      const { [workspaceId]: _omit, ...restTrees } = state.workspaceTrees;
      const { [workspaceId]: _omitLoading, ...restLoading } = state.workspaceTreeLoading;
      const { [workspaceId]: _omitErrors, ...restErrors } = state.workspaceTreeErrors;

      const cleaned = stripWorkspaceFromBrowserState(
        workspaceId,
        state.browserTabs,
        state.browserBookmarkFolders,
        state.browserActiveTabId,
      );

      // 全局作用域的浏览器数组（登记表 scope 为 global，不在剪枝覆盖内），此处保留原有清理；
      // 按工作区隔离的条目（workspaceTreeExpandedInFileNav / browserWorkspaceBookmarks 等
      // 全部 10 条甲类 byWorkspaceId 登记）归末尾的 applyWorkspaceRemoved 统一处理，
      // 此处不得重复写（不得两套并存）。
      persist('adl:browser.tabs', cleaned.browserTabs);
      persist('adl:browser.bookmarkFolders', cleaned.browserBookmarkFolders);
      persist('adl:browser.activeTabId', cleaned.browserActiveTabId);

      // 彻底移出工作区：同时清理 Git 可视化该工作区的数据缓存，
      // 并重置 activeWorkspaceTab（若仍指向被移出的工作区），避免残留 tab。
      const activeWorkspaceTab =
        state.activeWorkspaceTab === workspaceId
          ? (state.recentWorkspaces.find((w) => w.id !== workspaceId)?.id ?? '')
          : state.activeWorkspaceTab;
      get().clearWorkspaceGitVisData(workspaceId as string);
      if (activeWorkspaceTab !== state.activeWorkspaceTab) {
        get().setActiveWorkspaceTab(activeWorkspaceTab);
      }

      set({
        workspaceTrees: restTrees,
        workspaceTreeLoading: restLoading,
        workspaceTreeErrors: restErrors,
        browserTabs: cleaned.browserTabs,
        browserTabsById: cleaned.browserTabsById,
        browserBookmarkFolders: cleaned.browserBookmarkFolders,
        browserActiveTabId: cleaned.browserActiveTabId,
      });

      // 唯一的工作区移除入口末尾：统一剔除该工作区在全部按工作区隔离条目中的记录
      //（文件 / 变更 / 浏览器书签 / 终端 / 检索，内存 + 落盘）。顺序关键：本函数前面的
      // set() 不碰任何按工作区隔离的登记字段，applyWorkspaceRemoved 才能从快照中看到
      // 待删的工作区并完成"内存 + 落盘"（若在此之前先写 stripped 值，它会误判为无事可做
      // 而跳过 persist，导致磁盘残留）。
      applyWorkspaceRemoved(workspaceId as string);
    },

    /**
     * [removeWorkspaceFromSidebar - 从侧边栏移除工作区]
     * @reads workspaceSlice.appInfo
     * @writes workspaceSlice.recentWorkspaces, workspaceSlice.workspaceTrees, browserSlice.browserTabs (通过 cleanupRemovedWorkspaceTree)
     * @see shared/ipc.ts → workspace.removeFromSidebar
     * @see mock-bridge.ts → workspace.removeFromSidebar
     * @see preview-bridge/index.ts → workspace.removeFromSidebar
     */
    removeWorkspaceFromSidebar: async (workspaceId: WorkspaceID) => {
      clearError(get, SCOPE);
      // P4 F3：移除前先落盘（当前工作区才有活视图；非当前目标的残留草稿随后丢弃），
      // 再删该工作区的暂存，避免泄漏与复活。
      const flush = await get().saveDirtyEditors();
      // P4 N4：落盘失败的草稿随移除丢弃，给一条说明（工作区已不在，无处重试）。
      if (flush.failed > 0) {
        const locale = resolveAppLanguage(get().appInfo?.config?.language);
        const dict = locale === 'en-US' ? workspaceEn : workspaceZh;
        get().showToast(dict.workspaceUnsavedDiscardedOnRemove, 'warning');
      }
      dropPendingEditorText(workspaceId as string);
      const result = await window.digitalLife.workspace.removeFromSidebar(workspaceId as string);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      set({ recentWorkspaces: result.data });
      get().cleanupRemovedWorkspaceTree(workspaceId);
      const appInfo = get().appInfo;
      if (appInfo?.currentWorkspace?.id === workspaceId) {
        await get().clearWorkspaceContext();
      }
    },
  };
}
