import type { FilePatch, PatchHunkDecision, PatchSet } from "@ai-digital-life/kernel";
import { createId } from "@ai-digital-life/kernel";
import { applyPatch, createPatch, parsePatch } from "diff";
import { WorkspaceFsService } from "@ai-digital-life/fs-ops";

export function exportUnifiedDiffFromPatchSet(patchSet: PatchSet): string {
  return patchSet.filePatches
    .map((filePatch) => createPatch(filePatch.relativePath, filePatch.beforeContent, filePatch.afterContent, "", "", { context: 3 }))
    .join("\n");
}

function stripDiffPath(header?: string): string | undefined {
  if (!header) {
    return undefined;
  }
  let name = header.replace(/^a\//, "").replace(/^b\//, "");
  if (name.startsWith('"') && name.endsWith('"')) {
    name = name.slice(1, -1);
  }
  return name.replace(/\\/g, "/");
}

/**
 * Imports a unified diff by applying each parsed file hunk against the current workspace file contents.
 * Fails fast when the patch cannot be applied cleanly.
 */
export async function parseUnifiedDiffIntoPatchSet(
  text: string,
  input: {
    workspaceId: string;
    sessionId: string;
    runId?: string;
    rootPath: string;
    readFile: (root: string, relativePath: string) => Promise<string>;
    title: string;
    summary: string;
  }
): Promise<PatchSet> {
  const parsed = parsePatch(text);
  if (parsed.length === 0) {
    throw new Error("No parseable hunks found in unified diff.");
  }

  const patchSetId = createId("patchset");
  const now = Date.now();
  const filePatches: FilePatch[] = [];

  for (const piece of parsed) {
    const relativePath =
      stripDiffPath(piece.newFileName) ?? stripDiffPath(piece.oldFileName) ?? stripDiffPath(piece.index);
    if (!relativePath || relativePath === "/dev/null") {
      continue;
    }

    const beforeContent = await input.readFile(input.rootPath, relativePath);
    const afterContent = applyPatch(beforeContent, piece);
    if (afterContent === false) {
      throw new Error(`Unable to apply unified diff to ${relativePath}.`);
    }

    const filePatchId = createId("filepatch");
    filePatches.push({
      id: filePatchId,
      patchSetId,
      relativePath,
      beforeContent,
      afterContent,
      hunks: [
        {
          id: createId("hunk"),
          patchSetId,
          filePatchId,
          relativePath,
          oldStart: 1,
          oldLines: beforeContent.split(/\r?\n/).length,
          newStart: 1,
          newLines: afterContent.split(/\r?\n/).length,
          preview: input.summary,
          beforeText: beforeContent,
          afterText: afterContent,
          decision: "pending" as PatchHunkDecision
        }
      ]
    });
  }

  if (filePatches.length === 0) {
    throw new Error("Unified diff did not reference any workspace files.");
  }

  return {
    id: patchSetId,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    runId: input.runId,
    title: input.title,
    summary: input.summary,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    filePatches
  };
}

export async function assertApplyPreconditions(input: {
  patchSet: PatchSet;
  rootPath: string;
  readFile: (root: string, relativePath: string) => Promise<string>;
  dirtyPaths?: Set<string>;
}): Promise<{ ok: true } | { ok: false; reason: string; relativePath?: string }> {
  for (const filePatch of input.patchSet.filePatches) {
    const hasAccepted = filePatch.hunks.some((hunk) => hunk.decision === "accepted");
    if (!hasAccepted) {
      continue;
    }
    if (input.dirtyPaths?.has(filePatch.relativePath)) {
      return { ok: false, reason: "dirty_editor", relativePath: filePatch.relativePath };
    }
    let disk: string;
    try {
      disk = await input.readFile(input.rootPath, filePatch.relativePath);
    } catch {
      return { ok: false, reason: "read_failed", relativePath: filePatch.relativePath };
    }
    if (disk !== filePatch.beforeContent) {
      return { ok: false, reason: "baseline_mismatch", relativePath: filePatch.relativePath };
    }
  }
  return { ok: true };
}

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

  async assertPatchApplies(patchSet: PatchSet, rootPath: string, dirtyPaths?: Set<string>) {
    return assertApplyPreconditions({
      patchSet,
      rootPath,
      readFile: (root, relativePath) => this.fsOps.readFile(root, relativePath),
      dirtyPaths
    });
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
