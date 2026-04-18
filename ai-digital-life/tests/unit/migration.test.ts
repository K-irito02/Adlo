import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BackupManager,
  MigrationRegistry,
  MigrationRunner,
  registerDefaultMigrations,
  VersionDetector,
  versionToString
} from "@ai-digital-life/migration";

const tempDirs: string[] = [];

describe("migration helpers", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(async (dirPath) => {
        await fs.rm(dirPath, { recursive: true, force: true });
      })
    );
  });

  it("writes and reads the current version", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "adl-version-"));
    tempDirs.push(tempDir);
    const detector = new VersionDetector(tempDir, { major: 0, minor: 1, patch: 0 });

    expect(await detector.detectChange()).toBe("none");
    expect(await detector.getStoredVersion()).toEqual({ major: 0, minor: 1, patch: 0 });
    expect(versionToString({ major: 0, minor: 2, patch: 0 })).toBe("0.2.0");
  });

  it("creates backups for selected components", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "adl-backup-"));
    tempDirs.push(tempDir);
    const dataDir = path.join(tempDir, "data");
    const backupDir = path.join(tempDir, "backups");
    await fs.mkdir(path.join(dataDir, "state"), { recursive: true });
    await fs.writeFile(path.join(dataDir, "state", "app-state.db"), "demo", "utf8");

    const manager = new BackupManager(backupDir, dataDir);
    const info = await manager.createBackup("0.1.0", ["state"]);

    expect(info.components).toEqual(["state"]);
    await expect(fs.access(path.join(info.path, "state", "app-state.db"))).resolves.toBeUndefined();
  });

  it("skips missing components without failing backup creation", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "adl-backup-missing-"));
    tempDirs.push(tempDir);
    const dataDir = path.join(tempDir, "data");
    const backupDir = path.join(tempDir, "backups");
    await fs.mkdir(dataDir, { recursive: true });

    const manager = new BackupManager(backupDir, dataDir);
    const info = await manager.createBackup("0.1.0", ["state", "config"]);

    expect(info.components).toEqual(["state", "config"]);
    await expect(fs.access(path.join(info.path, "backup.json"))).resolves.toBeUndefined();
  });

  it("runs registered migrations in order", async () => {
    const registry = new MigrationRegistry();
    const migrate = vi.fn(async () => {});
    registry.register({
      id: "001",
      fromVersion: { major: 0, minor: 1, patch: 0 },
      toVersion: { major: 0, minor: 2, patch: 0 },
      description: "demo",
      migrate,
      rollback: async () => {}
    });

    const runner = new MigrationRunner(registry);
    const records = await runner.run({ major: 0, minor: 1, patch: 0 }, { major: 0, minor: 2, patch: 0 });

    expect(migrate).toHaveBeenCalledTimes(1);
    expect(records[0].status).toBe("completed");
  });

  it("registers and runs the default migration scripts", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "adl-migration-default-"));
    tempDirs.push(tempDir);
    const registry = new MigrationRegistry();
    registerDefaultMigrations(registry, tempDir);

    const runner = new MigrationRunner(registry);
    const records = await runner.run({ major: 0, minor: 0, patch: 0 }, { major: 0, minor: 1, patch: 0 });

    expect(records.length).toBeGreaterThan(0);
    expect(records[0].status).toBe("completed");
    await expect(fs.access(path.join(tempDir, "state", "migration-bootstrap.json"))).resolves.toBeUndefined();
  });
});
