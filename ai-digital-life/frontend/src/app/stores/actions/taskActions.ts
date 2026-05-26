import type { StoreState } from "../StoreState";
import type { StoreApi } from "zustand";

export function createTaskActions(set: StoreApi<StoreState>["setState"], get: () => StoreState) {
  return {
    decideApproval: async (approvalId: string, decision: "approved" | "rejected") => {
      const result = await window.digitalLife.task.decideApproval({
        approvalId,
        decision,
      });
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      set({
        taskCenter: result.data,
        latestCommandRun: undefined,
      });
      await get().fetchAuditEntries(40);
      await get().fetchCommandHistory();
      await get().fetchGitStatus();
    },

    restoreCheckpoint: async (checkpointId: string) => {
      const result = await window.digitalLife.task.restoreCheckpoint(
        checkpointId
      );
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      set({ taskCenter: result.data });
      await get().fetchAuditEntries(40);
      await get().bootstrap();
    },
  };
}
