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
    openWorkspace: async (workspacePath: string) => {
      const tStart = performance.now();
      console.log(
        '[ADL-DEBUG] openWorkspace: enter path=',
        workspacePath,
        't0=',
        tStart.toFixed(1),
      );
      const requestSeq = getNextWorkspaceRequestSeq();
      clearWorkspaceCaches(getWorkspaceCachePrefix(get().appInfo));
      getNextFileRequestSeq();
      getNextChangePreviewRequestSeq();
      getNextSessionRequestSeq();
      clearError(get, SCOPE);
      const result = await window.digitalLife.workspace.open(workspacePath);
      console.log(
        '[ADL-DEBUG] openWorkspace: workspace.open IPC resolved path=',
        workspacePath,
        'elapsedMs=',
        (performance.now() - tStart).toFixed(1),
        'ok=',
        result.ok,
      );
      if (requestSeq !== workspaceRequestSeq) {
        return { ok: false, error: 'Request superseded' };
      }
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return { ok: false, error: result.error.message };
      }
      await get().bootstrap();
      console.log(
        '[ADL-DEBUG] openWorkspace: bootstrap completed path=',
        workspacePath,
        'totalElapsedMs=',
        (performance.now() - tStart).toFixed(1),
      );

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
