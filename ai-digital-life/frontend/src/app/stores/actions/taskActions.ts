import type { StoreState } from '../StoreState';
import type { StoreApi } from 'zustand';
import { postMutationRefresh, clearError, captureError } from '../shared';

export function createTaskActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  return {
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
