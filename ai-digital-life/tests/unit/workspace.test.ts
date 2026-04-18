import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultAppState } from "@ai-digital-life/kernel";
import { StateRepository } from "@ai-digital-life/storage";
import {
  WorkspaceService,
  captureGitSnapshot,
  detectWorkspaceRoot,
  detectWorkspaceType,
  upsertRecentWorkspace,
  validateWorkspacePath
} from "@ai-digital-life/workspace";

const tempDirs: string[] = [];

function createFakeLogger() {
  return {
    info() {},
    warn() {},
    error() {}
  };
}

describe("workspace", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(async (dirPath) => {
        await fs.rm(dirPath, { recursive: true, force: true });
      })
    );
  });

  it("detects the nearest project root", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "adl-root-"));
    tempDirs.push(tempDir);
    const projectRoot = path.join(tempDir, "project");
    const nestedPath = path.join(projectRoot, "src", "feature");
    await fs.mkdir(nestedPath, { recursive: true });
    await fs.writeFile(path.join(projectRoot, "package.json"), "{}", "utf8");

    expect(detectWorkspaceRoot(nestedPath)).toBe(projectRoot);
  });

  it("rejects invalid workspace paths", () => {
    expect(() => validateWorkspacePath("   ")).toThrowError("Workspace path cannot be empty.");
  });

  it("deduplicates recent workspaces", () => {
    const recent = upsertRecentWorkspace(
      [
        {
          id: "1",
          path: "E:\\repo-1",
          rootPath: "E:\\repo-1",
          name: "repo-1",
          lastOpenedAt: 1,
          available: true
        }
      ],
      {
        id: "1",
        path: "E:\\repo-1",
        rootPath: "E:\\repo-1",
        name: "repo-1",
        lastOpenedAt: 2,
        available: true
      },
      8
    );

    expect(recent).toHaveLength(1);
    expect(recent[0].lastOpenedAt).toBe(2);
  });

  it("detects workspace type and non-git snapshots", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "adl-type-"));
    tempDirs.push(tempDir);
    await fs.writeFile(path.join(tempDir, "package.json"), "{}", "utf8");

    expect(detectWorkspaceType(tempDir)).toBe("node");
    expect(captureGitSnapshot(tempDir)).toMatchObject({
      isRepo: false,
      conflicts: []
    });
  });

  it("opens a workspace and persists the recent list", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "adl-workspace-"));
    tempDirs.push(tempDir);
    const repoDir = path.join(tempDir, "repo");
    await fs.mkdir(path.join(repoDir, "src"), { recursive: true });
    await fs.writeFile(path.join(repoDir, "package.json"), "{}", "utf8");

    const stateRepository = new StateRepository(tempDir, createFakeLogger() as never);
    await stateRepository.initialize();
    const service = new WorkspaceService({
      stateRepository,
      logger: createFakeLogger() as never,
      maxRecentWorkspaces: 8,
      initialState: defaultAppState()
    });

    const meta = await service.open(path.join(repoDir, "src"));
    expect(meta.rootPath).toBe(repoDir);
    await expect(service.listRecent()).resolves.toHaveLength(1);
    stateRepository.close();
  });
});
