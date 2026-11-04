import type { AgentRunDetail, PatchSet } from "@adlo/kernel";
import { activeWorkspaceScopeId, documents } from "./mock-shared-workspace";

export let activePatchSet: PatchSet | undefined;
export let activeRun: AgentRunDetail | undefined;

export function setActivePatchSet(patchSet: PatchSet | undefined): void {
  activePatchSet = patchSet;
}

export function setActiveRun(run: AgentRunDetail | undefined): void {
  activeRun = run;
}

export function createPatchSet(sessionId: string, relativePath: string, prompt: string): PatchSet {
  const beforeContent = documents.get(relativePath) ?? "";
  const afterContent = `// Adlo: ${prompt.trim()}\n${beforeContent}`;
  const workspaceId = activeWorkspaceScopeId();
  const patchSet: PatchSet = {
    id: `patchset-${Date.now()}`,
    workspaceId,
    sessionId,
    runId: activeRun?.run.id,
    title: `Update ${relativePath}`,
    summary: `建议在 ${relativePath} 顶部加入任务说明注释。`,
    status: "ready",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    filePatches: [
      {
        id: `filepatch-${Date.now()}`,
        patchSetId: `patchset-${Date.now()}`,
        relativePath,
        beforeContent,
        afterContent,
        hunks: [
          {
            id: `hunk-${Date.now()}`,
            filePatchId: `filepatch-${Date.now()}`,
            patchSetId: `patchset-${Date.now()}`,
            relativePath,
            oldStart: 1,
            oldLines: beforeContent.split(/\r?\n/).length,
            newStart: 1,
            newLines: afterContent.split(/\r?\n/).length,
            preview: `Add task note to ${relativePath}`,
            beforeText: beforeContent,
            afterText: afterContent,
            decision: "accepted"
          }
        ]
      }
    ]
  };

  patchSet.filePatches[0].patchSetId = patchSet.id;
  patchSet.filePatches[0].hunks[0].patchSetId = patchSet.id;
  patchSet.filePatches[0].hunks[0].filePatchId = patchSet.filePatches[0].id;
  return patchSet;
}