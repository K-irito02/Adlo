import type { PatchBridge } from "../shared/ipc";
import type { PatchSet } from "@ai-digital-life/kernel";
import {
  activePatchSet,
  activeRun,
  activeWorkspaceScopeId,
  documents,
  setActivePatchSet,
} from "./mock-shared";

export const mockPatch: PatchBridge = {
  getPatchSet: async () => ({ ok: true, data: activePatchSet }),
  setHunkDecision: async ({ hunkId, decision }) => {
    if (activePatchSet) {
      const updated: PatchSet = {
        ...activePatchSet,
        updatedAt: Date.now(),
        filePatches: activePatchSet.filePatches.map((filePatch) => ({
          ...filePatch,
          hunks: filePatch.hunks.map((hunk) => (hunk.id === hunkId ? { ...hunk, decision } : hunk))
        }))
      };
      setActivePatchSet(updated);
    }
    return { ok: true, data: activePatchSet as PatchSet };
  },
  applyPatchSet: async () => {
    if (activePatchSet) {
      const filePatch = activePatchSet.filePatches[0];
      documents.set(filePatch.relativePath, filePatch.afterContent);
      const updated: PatchSet = {
        ...activePatchSet,
        status: "applied",
        updatedAt: Date.now()
      };
      setActivePatchSet(updated);
    }
    return {
      ok: true,
      data: {
        patchSet: activePatchSet as PatchSet,
        validation: {
          id: `validation-${Date.now()}`,
          workspaceId: "workspace-mock-1",
          runId: activeRun?.run.id,
          patchSetId: activePatchSet?.id,
          status: "passed",
          summary: "Validation command completed successfully.",
          diagnostics: [],
          createdAt: Date.now()
        },
        commandResult: {
          request: {
            id: `command-${Date.now()}`,
            workspaceId: activeWorkspaceScopeId(),
            runId: activeRun?.run.id,
            profile: "test",
            command: "npm",
            args: ["run", "test"],
            shell: false,
            riskLevel: "low",
            createdAt: Date.now()
          },
          exitCode: 0,
          stdout: "tests passed",
          stderr: "",
          summary: "tests passed",
          success: true,
          startedAt: Date.now() - 500,
          completedAt: Date.now()
        },
        rolledBack: false
      }
    };
  },
  rollbackPatchSet: async () => {
    if (activePatchSet) {
      const filePatch = activePatchSet.filePatches[0];
      documents.set(filePatch.relativePath, filePatch.beforeContent);
      const updated: PatchSet = {
        ...activePatchSet,
        status: "rolled-back",
        updatedAt: Date.now()
      };
      setActivePatchSet(updated);
    }
    return { ok: true, data: activePatchSet as PatchSet };
  }
};