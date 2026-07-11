import type { StoreState } from '../StoreState';
import type { StoreApi } from 'zustand';
import { postMutationRefresh, clearError, captureError } from '../shared';

export function createTaskActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  return {
    /**
     * [decideApproval - 对任务中心的审批项做出批准/拒绝决策]
     * @writes taskSlice.taskCenter, commandSlice.latestCommandRun
     * @see shared/ipc.ts → task.decideApproval
     * @see mock-bridge.ts → task.decideApproval
     * @see preview-bridge/index.ts → task.decideApproval
     */
    decideApproval: async (approvalId: string, decision: 'approved' | 'rejected') => {
      clearError(get);
      const result = await window.digitalLife.task.decideApproval({
        approvalId,
        decision,
      });
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      set({
        taskCenter: result.data,
        latestCommandRun: undefined,
      });
      await postMutationRefresh(get);
    },

    /**
     * [restoreCheckpoint - 从检查点恢复工作区状态]
     * @writes taskSlice.taskCenter
     * @see shared/ipc.ts → task.restoreCheckpoint
     * @see mock-bridge.ts → task.restoreCheckpoint
     * @see preview-bridge/index.ts → task.restoreCheckpoint
     */
    restoreCheckpoint: async (checkpointId: string) => {
      clearError(get);
      const result = await window.digitalLife.task.restoreCheckpoint(checkpointId);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      set({ taskCenter: result.data });
      await get().fetchAuditEntries(40);
      await get().bootstrap();
    },
  };
}
