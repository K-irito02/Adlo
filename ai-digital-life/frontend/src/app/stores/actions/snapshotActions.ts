import type { StoreState } from '../StoreState';
import type { StoreApi } from 'zustand';
import { clearError, captureError } from '../shared';

export function createSnapshotActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
) {
  return {
    createSnapshot: async (params: {
      workspaceId: string;
      workspaceRoot: string;
      messageId: string;
      sessionId: string;
    }) => {
      clearError(get);
      const result = await window.digitalLife.snapshot.createSnapshot(params);
      if (!result.ok) {
        captureError(get, result.error);
        return null;
      }
      return result.data;
    },

    listSnapshots: async (workspaceId: string, workspaceRoot: string) => {
      clearError(get);
      const result = await window.digitalLife.snapshot.listSnapshots(workspaceId, workspaceRoot);
      if (!result.ok) {
        captureError(get, result.error);
        return [];
      }
      return result.data;
    },

    revertToSnapshot: async (workspaceId: string, workspaceRoot: string, snapshotId: string) => {
      clearError(get);
      const result = await window.digitalLife.snapshot.revertToSnapshot(
        workspaceId,
        workspaceRoot,
        snapshotId,
      );
      if (!result.ok) {
        captureError(get, result.error);
        return null;
      }
      return result.data;
    },
  };
}
