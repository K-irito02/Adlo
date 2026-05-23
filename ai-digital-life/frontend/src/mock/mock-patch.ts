import type { PatchBridge } from "../shared/ipc";
import type { PatchSet } from "@ai-digital-life/kernel";
import {
  activePatchSet,
  activeRun,
  activeWorkspaceScopeId,
  documents,
  messagesBySession,
  sessions,
  setActivePatchSet,
} from "./shared";

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
      const targetSessionId = activePatchSet.sessionId;
      const sessionMessages = messagesBySession.get(targetSessionId) ?? [];
      sessionMessages.push({
        id: `message-validation-${Date.now()}`,
        sessionId: targetSessionId,
        role: "assistant",
        content: "Patch applied and validation completed.",
        blocks: [
          {
            id: `block-tool-${Date.now()}`,
            type: "tool-call",
            toolName: "terminal.run",
            summary: "npm run test",
            status: "completed"
          },
          {
            id: `block-validation-${Date.now()}`,
            type: "validation-result",
            summary: "Validation command completed successfully.",
            status: "passed",
            diagnostics: []
          },
          {
            id: `block-final-${Date.now()}`,
            type: "final-summary",
            summary: "补丁已应用并完成验证。"
          }
        ],
        runId: activeRun?.run.id,
        createdAt: Date.now()
      });
      const firstSessionId = sessions[0]?.id ?? targetSessionId;
      messagesBySession.set(firstSessionId, sessionMessages);
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