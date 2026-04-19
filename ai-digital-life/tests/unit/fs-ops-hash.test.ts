import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkspaceFsService } from "@ai-digital-life/fs-ops";
import { WorkspaceError } from "@ai-digital-life/kernel";

describe("WorkspaceFsService sha256 and atomicWrite guard", () => {
  let root: string;
  const svc = new WorkspaceFsService();

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "adl-fs-"));
    await fs.writeFile(path.join(root, "a.txt"), "v1", "utf8");
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("sha256File matches full-file digest", async () => {
    const h = await svc.sha256File(root, "a.txt");
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it("atomicWrite rejects when expectSha256Before mismatches", async () => {
    const wrong = "0".repeat(64);
    await expect(svc.atomicWrite(root, "a.txt", "v2", { expectSha256Before: wrong })).rejects.toThrow(WorkspaceError);
  });

  it("atomicWrite succeeds when expectSha256Before matches", async () => {
    const before = await svc.sha256File(root, "a.txt");
    await svc.atomicWrite(root, "a.txt", "v2", { expectSha256Before: before });
    expect(await fs.readFile(path.join(root, "a.txt"), "utf8")).toBe("v2");
  });
});
