import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { APP_STATE_SCHEMA_VERSION, createId, defaultAppState } from "@ai-digital-life/kernel";
import { StateRepository } from "@ai-digital-life/storage";

const tempDirs: string[] = [];

function createFakeLogger() {
  return {
    info() {},
    warn() {},
    error() {}
  };
}

describe("state repository", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(async (dirPath) => {
        await fs.rm(dirPath, { recursive: true, force: true });
      })
    );
  });

  it("saves and reloads app state", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "adl-state-"));
    tempDirs.push(tempDir);
    const repository = new StateRepository(tempDir, createFakeLogger() as never);
    await repository.initialize();

    const nextState = {
      ...defaultAppState(),
      currentWorkspacePath: "E:\\repo"
    };

    await repository.save(nextState);
    await expect(repository.load()).resolves.toMatchObject(nextState);
    repository.close();
  });

  it("falls back to defaults when the state file is invalid", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "adl-state-invalid-"));
    tempDirs.push(tempDir);
    await fs.writeFile(path.join(tempDir, "app-state.v1.json"), "{not-json", "utf8");

    const repository = new StateRepository(tempDir, createFakeLogger() as never);
    await repository.initialize();

    const loaded = await repository.load();
    expect(loaded.schemaVersion).toBe(APP_STATE_SCHEMA_VERSION);
    expect(loaded.recentWorkspaces).toEqual([]);
    repository.close();
  });

  it("migrates legacy file state into SQLite on first initialize", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "adl-state-migrate-"));
    tempDirs.push(tempDir);
    const legacyState = {
      ...defaultAppState(),
      currentWorkspacePath: "E:\\repo",
      recentWorkspaces: [
        {
          id: "repo-1",
          path: "E:\\repo",
          rootPath: "E:\\repo",
          name: "repo",
          lastOpenedAt: 123,
          available: true
        }
      ]
    };
    await fs.writeFile(path.join(tempDir, "app-state.v1.json"), JSON.stringify(legacyState), "utf8");

    const repository = new StateRepository(tempDir, createFakeLogger() as never);
    await repository.initialize();

    const loaded = await repository.load();
    expect(loaded.currentWorkspacePath).toBe("E:\\repo");
    expect(loaded.recentWorkspaces).toHaveLength(1);
    await expect(fs.access(path.join(tempDir, "app-state.v1.json.migrated"))).resolves.toBeUndefined();
    repository.close();
  });

  it("writes checkpoint payload manifests and captured files", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "adl-checkpoint-"));
    tempDirs.push(tempDir);
    const workspaceDir = path.join(tempDir, "workspace");
    await fs.mkdir(path.join(workspaceDir, "src"), { recursive: true });
    await fs.writeFile(path.join(workspaceDir, "src", "index.ts"), "export const demo = 1;\n", "utf8");

    const repository = new StateRepository(tempDir, createFakeLogger() as never);
    await repository.initialize();

    const preview = await repository.writeCheckpointPayload({
      checkpointId: "checkpoint-demo",
      rootPath: workspaceDir,
      affectedPaths: ["src/index.ts", "missing.txt"]
    });

    expect(preview.assetCount).toBe(2);
    expect(preview.assets.find((asset) => asset.path === "src/index.ts")).toMatchObject({
      status: "captured"
    });
    expect(preview.assets.find((asset) => asset.path === "missing.txt")).toMatchObject({
      status: "missing"
    });

    const loaded = await repository.getCheckpointPayload("checkpoint-demo");
    expect(loaded?.assetCount).toBe(2);
    await fs.writeFile(path.join(workspaceDir, "src", "index.ts"), "export const demo = 2;\n", "utf8");
    await repository.restoreCheckpointPayload("checkpoint-demo");
    await expect(fs.readFile(path.join(workspaceDir, "src", "index.ts"), "utf8")).resolves.toContain("demo = 1");
    repository.close();
  });

  it("lists persisted agent runs and patch sets by workspace", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "adl-state-phase2-"));
    tempDirs.push(tempDir);
    const repository = new StateRepository(tempDir, createFakeLogger() as never);
    await repository.initialize();

    const workspaceId = "workspace-1";
    const sessionId = "session-1";
    const runId = createId("run");
    const patchSetId = createId("patch");
    const filePatchId = createId("file");
    const hunkId = createId("hunk");
    const now = Date.now();

    await repository.upsertAgentRun({
      id: runId,
      workspaceId,
      sessionId,
      prompt: "update @src/index.ts",
      scenario: "code-edit",
      status: "verifying",
      patchSetId,
      createdAt: now,
      updatedAt: now
    });
    await repository.upsertPatchSet({
      id: patchSetId,
      workspaceId,
      sessionId,
      runId,
      title: "Update src/index.ts",
      summary: "test patch",
      status: "applying",
      createdAt: now,
      updatedAt: now,
      filePatches: [
        {
          id: filePatchId,
          patchSetId,
          relativePath: "src/index.ts",
          beforeContent: "export const a = 1;\n",
          afterContent: "export const a = 2;\n",
          hunks: [
            {
              id: hunkId,
              filePatchId,
              patchSetId,
              relativePath: "src/index.ts",
              oldStart: 1,
              oldLines: 1,
              newStart: 1,
              newLines: 1,
              preview: "-export const a = 1;\n+export const a = 2;",
              beforeText: "export const a = 1;\n",
              afterText: "export const a = 2;\n",
              decision: "accepted"
            }
          ]
        }
      ]
    });

    await expect(repository.listAgentRunsByWorkspace(workspaceId)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: runId,
          status: "verifying"
        })
      ])
    );
    await expect(repository.listPatchSetsByWorkspace(workspaceId)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: patchSetId,
          status: "applying"
        })
      ])
    );
    repository.close();
  });
});
