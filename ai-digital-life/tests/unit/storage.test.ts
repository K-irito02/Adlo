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
    expect(loaded.recentWorkspaces[0]).toMatchObject({
      isPinned: false,
      pinnedOrder: 0,
      removedFromSidebar: false
    });
    await expect(fs.access(path.join(tempDir, "app-state.v1.json.migrated"))).resolves.toBeUndefined();
    repository.close();
  });

  it("persists workspace pinning and sidebar removal metadata", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "adl-state-workspace-nav-"));
    tempDirs.push(tempDir);
    const repository = new StateRepository(tempDir, createFakeLogger() as never);
    await repository.initialize();

    await repository.save({
      ...defaultAppState(),
      recentWorkspaces: [
        {
          id: "ws-1",
          path: "E:\\repo-1",
          rootPath: "E:\\repo-1",
          name: "repo-1",
          lastOpenedAt: 1,
          isPinned: false,
          pinnedOrder: 0,
          unpinnedOrder: 0,
          removedFromSidebar: false,
          available: true
        },
        {
          id: "ws-2",
          path: "E:\\repo-2",
          rootPath: "E:\\repo-2",
          name: "repo-2",
          lastOpenedAt: 2,
          isPinned: false,
          pinnedOrder: 0,
          unpinnedOrder: 1,
          removedFromSidebar: false,
          available: true
        }
      ]
    });

    await repository.pinRecentWorkspace("ws-2");
    await repository.removeRecentWorkspaceFromSidebar("ws-1");

    await expect(repository.listRecentWorkspaceEntries({ includeRemoved: true })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "ws-2", isPinned: true, pinnedOrder: 0 }),
        expect.objectContaining({ id: "ws-1", removedFromSidebar: true })
      ])
    );
    repository.close();
  });

  it("persists conversation navigation metadata and read state", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "adl-state-conversation-nav-"));
    tempDirs.push(tempDir);
    const repository = new StateRepository(tempDir, createFakeLogger() as never);
    await repository.initialize();

    const now = Date.now();
    await repository.upsertConversationSession({
      id: "conversation-1",
      workspaceId: "workspace-1",
      title: "Session 1",
      status: "active",
      isPinned: false,
      pinnedOrder: 0,
      unpinnedOrder: 0,
      manualUnread: false,
      lastReadAt: now,
      archivedAt: undefined,
      titleUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now
    });

    await repository.markConversationSessionUnread("conversation-1");
    await repository.pinConversationSession("conversation-1");
    await repository.archiveConversationSession("conversation-1", now + 10);

    const detail = await repository.getConversationDetail("conversation-1");
    expect(detail?.session).toMatchObject({
      isPinned: true,
      manualUnread: true,
      status: "archived",
      archivedAt: now + 10
    });

    await repository.markConversationSessionRead("conversation-1", now + 20);
    await expect(repository.getConversationSession("conversation-1")).resolves.toMatchObject({
      manualUnread: false,
      lastReadAt: now + 20
    });
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

  it("inserts model_call_audit records", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "adl-model-audit-"));
    tempDirs.push(tempDir);
    const repository = new StateRepository(tempDir, createFakeLogger() as never);
    await repository.initialize();

    await expect(
      repository.insertModelCallAudit({
        id: createId("mcaudit"),
        requestId: "req-1",
        workspaceId: "ws-1",
        sessionId: "sess-1",
        runId: "run-1",
        providerId: "deepseek",
        modelId: "deepseek-chat",
        scenario: "chat",
        routeMeta: { reason: "test", chain: ["deepseek:deepseek-chat"] },
        promptTokens: 10,
        completionTokens: 20,
        latencyMs: 100,
        error: undefined,
        streamed: true,
        createdAt: Date.now()
      })
    ).resolves.toBeUndefined();

    repository.close();
  });
});
