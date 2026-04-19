import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChangeEngine, exportUnifiedDiffFromPatchSet, parseUnifiedDiffIntoPatchSet } from "@ai-digital-life/change-engine";
import { WorkspaceFsService } from "@ai-digital-life/fs-ops";
import { createId } from "@ai-digital-life/kernel";

describe("change-engine unified diff", () => {
  let root: string;
  const fsOps = new WorkspaceFsService();
  const engine = new ChangeEngine(fsOps);

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "adl-ce-"));
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "src/hello.txt"), "alpha\nbeta\n", "utf8");
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("exports unified diff and round-trips into an equivalent afterContent", async () => {
    const workspaceId = "ws-1";
    const sessionId = "sess-1";
    const relativePath = "src/hello.txt";
    const beforeContent = await fsOps.readFile(root, relativePath);
    const afterContent = "alpha\nbeta\ngamma\n";
    const patchSet = engine.createSingleHunkPatchSet({
      workspaceId,
      sessionId,
      runId: createId("run"),
      relativePath,
      beforeContent,
      afterContent,
      title: "Add gamma",
      summary: "append line"
    });

    const unified = exportUnifiedDiffFromPatchSet(patchSet);
    expect(unified).toMatch(/hello\.txt/);
    expect(unified).toContain("@@");

    const imported = await parseUnifiedDiffIntoPatchSet(unified, {
      workspaceId,
      sessionId,
      rootPath: root,
      readFile: (r, rel) => fsOps.readFile(r, rel),
      title: "imported",
      summary: "from diff"
    });

    expect(imported.filePatches).toHaveLength(1);
    expect(imported.filePatches[0].afterContent).toBe(afterContent);
  });
});
