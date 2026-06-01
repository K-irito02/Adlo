import type { StoreState } from "../StoreState";
import { mapPatchToEditorTab } from "../../utils/editorTabs";
import type { StoreApi } from "zustand";
import { postMutationRefresh, clearError, captureError } from "../shared";

export function createPatchActions(set: StoreApi<StoreState>["setState"], get: () => StoreState) {
  return {
    setHunkDecision: async (patchSetId: string, hunkId: string, decision: "pending" | "accepted" | "rejected") => {
      clearError(get);
      const result = await window.digitalLife.patch.setHunkDecision({
        patchSetId,
        hunkId,
        decision,
      });
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      set({ activePatchSet: result.data });
    },

    applyPatchSet: async (patchSetId: string) => {
      clearError(get);
      const result = await window.digitalLife.patch.applyPatchSet(patchSetId);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      set({
        activePatchSet: result.data.repairPatchSet ?? result.data.patchSet,
        latestPatchApplication: result.data,
        latestCommandRun: result.data.commandResult
          ? {
              status: "completed",
              taskId: result.data.commandResult.request.id,
              request: result.data.commandResult.request,
              result: result.data.commandResult,
            }
          : undefined,
        openTabs: (result.data.repairPatchSet ?? result.data.patchSet).filePatches.map(
          mapPatchToEditorTab
        ),
      });
      const detail = get().activeSessionId
        ? await window.digitalLife.conversation.getSession(get().activeSessionId!)
        : undefined;
      if (detail?.ok && detail.data && get().activeSessionId) {
        set((state: StoreState) => ({
          sessionDetails: {
            ...state.sessionDetails,
            [get().activeSessionId!]: detail.data!,
          },
        }));
      }
      const filePath = (result.data.repairPatchSet ?? result.data.patchSet).filePatches[0]?.relativePath;
      if (filePath) await get().openFile(filePath);
      const runId = result.data.patchSet.runId;
      if (runId) {
        const run = await window.digitalLife.agent.getRun(runId);
        if (run.ok) set({ activeRun: run.data });
      }
      await postMutationRefresh(get);
    },

    rollbackPatchSet: async (patchSetId: string) => {
      clearError(get);
      const result = await window.digitalLife.patch.rollbackPatchSet(patchSetId);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      set({
        activePatchSet: result.data,
        openTabs: result.data.filePatches.map(mapPatchToEditorTab),
      });
      const filePath = result.data.filePatches[0]?.relativePath;
      if (filePath) await get().openFile(filePath);
      const runId = result.data.runId;
      if (runId) {
        const run = await window.digitalLife.agent.getRun(runId);
        if (run.ok) set({ activeRun: run.data });
      }
      await get().refreshTaskCenter();
      await get().fetchAuditEntries(40);
      await get().fetchGitStatus();
    },

    acceptAllHunks: async () => {
      const patchSet = get().activePatchSet;
      if (!patchSet) return;
      for (const filePatch of patchSet.filePatches) {
        for (const hunk of filePatch.hunks) {
          if (hunk.decision !== "accepted")
            await get().setHunkDecision(patchSet.id, hunk.id, "accepted");
        }
      }
    },

    rejectAllHunks: async () => {
      const patchSet = get().activePatchSet;
      if (!patchSet) return;
      for (const filePatch of patchSet.filePatches) {
        for (const hunk of filePatch.hunks) {
          if (hunk.decision !== "rejected")
            await get().setHunkDecision(patchSet.id, hunk.id, "rejected");
        }
      }
    },
  };
}
