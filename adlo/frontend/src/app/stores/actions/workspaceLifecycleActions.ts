/**
 * Workspace Lifecycle Actions
 * Extracted from workspaceActions.ts — openWorkspace, clearWorkspaceContext, pickWorkspaceDirectory.
 */
import type { StoreState } from '../StoreState';
import type { StoreApi } from 'zustand';
import {
  getWorkspaceCachePrefix,
  getNextWorkspaceRequestSeq,
  getNextFileRequestSeq,
  getNextChangePreviewRequestSeq,
  getNextSessionRequestSeq,
  clearWorkspaceCaches,
  workspaceRequestSeq,
  clearError,
  captureError,
} from '../shared';
import { workspaceZh } from '../../i18n/zh-CN/workspace';
import { workspaceEn } from '../../i18n/en-US/workspace';
import { resolveAppLanguage } from '../../i18n/resolveLanguage';

const SCOPE = 'workspace';

export function createWorkspaceLifecycleActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
) {
  return {
    /**
     * [openWorkspace - 打开指定路径的工作区]
     * @reads workspaceSlice.appInfo
     * @writes (通过 bootstrap) 完整的应用状态
     * @see shared/ipc.ts → workspace.open
     * @see mock-bridge.ts → workspace.open
     * @see preview-bridge/index.ts → workspace.open
     */
    openWorkspace: async (workspacePath: string, options?: { create?: boolean }) => {
      // 切工作区前落盘脏缓冲（自动保存语义），避免脏内容留在旧工作区。
      // P4 N5：落盘失败即中止（与分支切换同口径），草稿按键保留可重试。
      const flush = await get().saveDirtyEditors();
      if (flush.failed > 0) {
        const locale = resolveAppLanguage(get().appInfo?.config?.language);
        const dict = locale === 'en-US' ? workspaceEn : workspaceZh;
        get().showToast(dict.workspaceSwitchAbortedOnSaveFail, 'error');
        return { ok: false, error: 'saveDirtyEditors failed' };
      }
      const requestSeq = getNextWorkspaceRequestSeq();
      clearWorkspaceCaches(getWorkspaceCachePrefix(get().appInfo));
      getNextFileRequestSeq();
      getNextChangePreviewRequestSeq();
      getNextSessionRequestSeq();
      clearError(get, SCOPE);
      const result = await window.digitalLife.workspace.open(workspacePath, options);
      if (requestSeq !== workspaceRequestSeq) {
        return { ok: false, error: 'Request superseded' };
      }
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return { ok: false, error: result.error.message };
      }
      // 工作区切换：旧搜索会话（含待发防抖/重算 timer）不得写入新上下文。
      get().cancelPendingSearch();
      await get().bootstrap();
      // 切换后对账（事项5）：worktree 替换式等场景下源工作区已不在，
      // 悬空选中文件在新上下文重读，缺失则清空为空（bootstrap 本身不碰选中态）。
      // 接受项（P4-R1-N5/F8）：此处固定多一次文件读（含大纲），换取切换后即时新鲜；
      // worktree 替换路径会再付一次（源移除后那次才是生效的），分支切换低频可接受。
      // 预览保留约定（P4-R1-N5/F9）：变更预览按所属工作区归属保留，不随文件选中联动；
      // 切后树与预览可能分属不同工作区，属多工作区模型的既定行为（导航弱选中可辨归属）。
      await get().reconcileSelectedFileAfterWorkspaceSwitch();

      return { ok: true };
    },

    /**
     * [clearWorkspaceContext - 清除当前工作区上下文]
     * @reads workspaceSlice.appInfo
     * @writes (通过 bootstrap) 完整的应用状态
     * @see shared/ipc.ts → workspace.clearCurrent
     * @see mock-bridge.ts → workspace.clearCurrent
     * @see preview-bridge/index.ts → workspace.clearCurrent
     */
    clearWorkspaceContext: async () => {
      // P4 F3：与 openWorkspace 对齐，先落盘脏缓冲再清上下文。
      await get().saveDirtyEditors();
      const requestSeq = getNextWorkspaceRequestSeq();
      clearWorkspaceCaches(getWorkspaceCachePrefix(get().appInfo));
      getNextFileRequestSeq();
      getNextChangePreviewRequestSeq();
      getNextSessionRequestSeq();
      clearError(get, SCOPE);
      const result = await window.digitalLife.workspace.clearCurrent();
      if (requestSeq !== workspaceRequestSeq) {
        return;
      }
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      get().cancelPendingSearch();
      await get().bootstrap();
    },

    /**
     * [pickWorkspaceDirectory - 弹出目录选择器选择工作区目录]
     * @reads — 无
     * @writes — 无
     * @see shared/ipc.ts → workspace.pickDirectory
     * @see mock-bridge.ts → workspace.pickDirectory
     * @see preview-bridge/index.ts → workspace.pickDirectory
     */
    pickWorkspaceDirectory: async () => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.workspace.pickDirectory();
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return undefined;
      }
      return result.data?.trim() || undefined;
    },
  };
}
