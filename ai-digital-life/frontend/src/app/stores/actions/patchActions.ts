import type { StoreState } from '../StoreState';
import { mapPatchToEditorTab } from '@utils/editorTabs';
import type { StoreApi } from 'zustand';
import { postMutationRefresh, clearError, captureError } from '../shared';

export function createPatchActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  return {
    /**
     * [setHunkDecision - 设置补丁块的接受/拒绝/待定决策]
     * @writes patchSlice.activePatchSet
     * @see shared/ipc.ts → patch.setHunkDecision
     * @see mock-bridge.ts → patch.setHunkDecision
     * @see preview-bridge/index.ts → patch.setHunkDecision
     */
    setHunkDecision: async (
      patchSetId: string,
      hunkId: string,
      decision: 'pending' | 'accepted' | 'rejected'
    ) => {
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

    /**
     * [applyPatchSet - 应用补丁集，将变更写入文件系统]
     * @reads sessionSlice.activeSessionId
     * @writes patchSlice.activePatchSet, patchSlice.latestPatchApplication, commandSlice.latestCommandRun, editorSlice.openTabs, sessionSlice.sessionDetails
     * @see shared/ipc.ts → patch.applyPatchSet, conversation.getSession, agent.getRun
     * @see mock-bridge.ts → patch.applyPatchSet, conversation.getSession, agent.getRun
     * @see preview-bridge/index.ts → patch.applyPatchSet, conversation.getSession, agent.getRun
     */
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
              status: 'completed',
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
      const filePath = (result.data.repairPatchSet ?? result.data.patchSet).filePatches[0]
        ?.relativePath;
      if (filePath) {
        await get().openFile(filePath);
      }
      const runId = result.data.patchSet.runId;
      if (runId) {
        const run = await window.digitalLife.agent.getRun(runId);
        if (run.ok) {
          set({ activeRun: run.data });
        }
      }
      await postMutationRefresh(get);
    },

    /**
     * [rollbackPatchSet - 回滚补丁集，撤销文件变更]
     * @writes patchSlice.activePatchSet, editorSlice.openTabs
     * @see shared/ipc.ts → patch.rollbackPatchSet, agent.getRun
     * @see mock-bridge.ts → patch.rollbackPatchSet, agent.getRun
     * @see preview-bridge/index.ts → patch.rollbackPatchSet, agent.getRun
     */
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
      if (filePath) {
        await get().openFile(filePath);
      }
      const runId = result.data.runId;
      if (runId) {
        const run = await window.digitalLife.agent.getRun(runId);
        if (run.ok) {
          set({ activeRun: run.data });
        }
      }
      await get().refreshTaskCenter();
      await get().fetchAuditEntries(40);
      await get().fetchGitStatus();
    },

    /**
     * [acceptAllHunks - 接受当前补丁集中的所有块]
     * @reads patchSlice.activePatchSet
     * @writes patchSlice.activePatchSet (通过 setHunkDecision)
     * @see shared/ipc.ts → patch.setHunkDecision (通过 setHunkDecision)
     * @see mock-bridge.ts → patch.setHunkDecision (通过 setHunkDecision)
     * @see preview-bridge/index.ts → patch.setHunkDecision (通过 setHunkDecision)
     */
    acceptAllHunks: async () => {
      const patchSet = get().activePatchSet;
      if (!patchSet) {
        return;
      }
      for (const filePatch of patchSet.filePatches) {
        for (const hunk of filePatch.hunks) {
          if (hunk.decision !== 'accepted') {
            await get().setHunkDecision(patchSet.id, hunk.id, 'accepted');
          }
        }
      }
    },

    /**
     * [rejectAllHunks - 拒绝当前补丁集中的所有块]
     * @reads patchSlice.activePatchSet
     * @writes patchSlice.activePatchSet (通过 setHunkDecision)
     * @see shared/ipc.ts → patch.setHunkDecision (通过 setHunkDecision)
     * @see mock-bridge.ts → patch.setHunkDecision (通过 setHunkDecision)
     * @see preview-bridge/index.ts → patch.setHunkDecision (通过 setHunkDecision)
     */
    rejectAllHunks: async () => {
      const patchSet = get().activePatchSet;
      if (!patchSet) {
        return;
      }
      for (const filePatch of patchSet.filePatches) {
        for (const hunk of filePatch.hunks) {
          if (hunk.decision !== 'rejected') {
            await get().setHunkDecision(patchSet.id, hunk.id, 'rejected');
          }
        }
      }
    },
  };
}
