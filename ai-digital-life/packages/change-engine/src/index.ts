import type { PatchHunkDecision, PatchSet } from "@ai-digital-life/kernel";
import { createId } from "@ai-digital-life/kernel";
import { WorkspaceFsService } from "@ai-digital-life/fs-ops";

export class ChangeEngine {
  constructor(private readonly fsOps: WorkspaceFsService) {}

  updateHunkDecision(patchSet: PatchSet, hunkId: string, decision: PatchHunkDecision): PatchSet {
    return {
      ...patchSet,
      updatedAt: Date.now(),
      filePatches: patchSet.filePatches.map((filePatch) => ({
        ...filePatch,
        hunks: filePatch.hunks.map((hunk) => (hunk.id === hunkId ? { ...hunk, decision } : hunk))
      }))
    };
  }

  async applyPatchSet(rootPath: string, patchSet: PatchSet): Promise<PatchSet> {
    for (const filePatch of patchSet.filePatches) {
      const hasAcceptedHunk = filePatch.hunks.some((hunk) => hunk.decision === "accepted");
      if (!hasAcceptedHunk) {
        continue;
      }
      await this.fsOps.atomicWrite(rootPath, filePatch.relativePath, filePatch.afterContent);
    }

    return {
      ...patchSet,
      status: "applied",
      updatedAt: Date.now()
    };
  }

  async rollbackPatchSet(rootPath: string, patchSet: PatchSet): Promise<PatchSet> {
    for (const filePatch of patchSet.filePatches) {
      await this.fsOps.atomicWrite(rootPath, filePatch.relativePath, filePatch.beforeContent);
    }

    return {
      ...patchSet,
      status: "rolled-back",
      updatedAt: Date.now()
    };
  }

  createSingleHunkPatchSet(input: {
    workspaceId: string;
    sessionId: string;
    runId?: string;
    relativePath: string;
    beforeContent: string;
    afterContent: string;
    title: string;
    summary: string;
  }): PatchSet {
    const patchSetId = createId("patchset");
    const filePatchId = createId("filepatch");
    const now = Date.now();

    return {
      id: patchSetId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      runId: input.runId,
      title: input.title,
      summary: input.summary,
      status: "ready",
      createdAt: now,
      updatedAt: now,
      filePatches: [
        {
          id: filePatchId,
          patchSetId,
          relativePath: input.relativePath,
          beforeContent: input.beforeContent,
          afterContent: input.afterContent,
          hunks: [
            {
              id: createId("hunk"),
              patchSetId,
              filePatchId,
              relativePath: input.relativePath,
              oldStart: 1,
              oldLines: input.beforeContent.split(/\r?\n/).length,
              newStart: 1,
              newLines: input.afterContent.split(/\r?\n/).length,
              preview: input.summary,
              beforeText: input.beforeContent,
              afterText: input.afterContent,
              decision: "accepted"
            }
          ]
        }
      ]
    };
  }
}
