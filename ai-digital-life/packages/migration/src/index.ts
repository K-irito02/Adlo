import fs from "node:fs/promises";
import path from "node:path";

export interface Version {
  major: number;
  minor: number;
  patch: number;
}

export type MigrationStatus = "pending" | "running" | "completed" | "failed" | "rolled-back";

export interface BackupInfo {
  id: string;
  version: string;
  timestamp: number;
  path: string;
  size: number;
  type: "full" | "partial";
  components: string[];
}

export interface MigrationRecord {
  id: string;
  scriptId: string;
  fromVersion: string;
  toVersion: string;
  status: MigrationStatus;
  startedAt: number;
  completedAt?: number;
  error?: string;
  description?: string;
}

export interface MigrationScript {
  id: string;
  fromVersion: Version;
  toVersion: Version;
  description: string;
  preCheck?: () => Promise<boolean>;
  migrate: () => Promise<void>;
  postCheck?: () => Promise<boolean>;
  rollback: () => Promise<void>;
}

export function versionToString(version: Version): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

export function parseVersion(version: string): Version {
  const [major, minor, patch] = version.trim().split(".").map(Number);
  return {
    major: Number.isFinite(major) ? major : 0,
    minor: Number.isFinite(minor) ? minor : 0,
    patch: Number.isFinite(patch) ? patch : 0
  };
}

export function compareVersions(left: Version, right: Version): number {
  if (left.major !== right.major) {
    return left.major - right.major;
  }
  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }
  return left.patch - right.patch;
}

export class VersionDetector {
  constructor(private readonly versionFileDir: string, private readonly currentVersion: Version) {}

  async getStoredVersion(): Promise<Version | undefined> {
    try {
      const raw = await fs.readFile(path.join(this.versionFileDir, ".version"), "utf8");
      const [major, minor, patch] = raw.trim().split(".").map(Number);
      return { major, minor, patch };
    } catch {
      return undefined;
    }
  }

  async detectChange(): Promise<"none" | "upgrade"> {
    const storedVersion = await this.getStoredVersion();
    if (!storedVersion) {
      await this.saveCurrentVersion();
      return "none";
    }

    return compareVersions(storedVersion, this.currentVersion) === 0 ? "none" : "upgrade";
  }

  async saveCurrentVersion(): Promise<void> {
    await fs.mkdir(this.versionFileDir, { recursive: true });
    await fs.writeFile(path.join(this.versionFileDir, ".version"), versionToString(this.currentVersion), "utf8");
  }
}

export class BackupManager {
  constructor(private readonly backupDir: string, private readonly dataDir: string) {}

  async createBackup(version: string, components: string[]): Promise<BackupInfo> {
    const id = `backup_${Date.now()}`;
    const targetDir = path.join(this.backupDir, id);
    await fs.mkdir(targetDir, { recursive: true });

    for (const component of components) {
      const source = path.join(this.dataDir, component);
      const target = path.join(targetDir, component);
      await copyDirectory(source, target);
    }

    const info: BackupInfo = {
      id,
      version,
      timestamp: Date.now(),
      path: targetDir,
      size: await measureDirectory(targetDir),
      type: "partial",
      components
    };
    await fs.writeFile(path.join(targetDir, "backup.json"), `${JSON.stringify(info, null, 2)}\n`, "utf8");
    return info;
  }

  async listBackups(): Promise<BackupInfo[]> {
    try {
      const entries = await fs.readdir(this.backupDir, { withFileTypes: true });
      const backups = await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => {
            try {
              const raw = await fs.readFile(path.join(this.backupDir, entry.name, "backup.json"), "utf8");
              return JSON.parse(raw) as BackupInfo;
            } catch {
              return undefined;
            }
          })
      );
      return backups.filter((backup): backup is BackupInfo => Boolean(backup)).sort((left, right) => right.timestamp - left.timestamp);
    } catch {
      return [];
    }
  }

  async restoreBackup(backupId: string): Promise<boolean> {
    const backups = await this.listBackups();
    const backup = backups.find((item) => item.id === backupId);
    if (!backup) {
      return false;
    }

    for (const component of backup.components) {
      const source = path.join(backup.path, component);
      const target = path.join(this.dataDir, component);
      await fs.rm(target, { recursive: true, force: true });
      await copyDirectory(source, target);
    }

    return true;
  }
}

export class MigrationRegistry {
  private readonly scripts: MigrationScript[] = [];

  register(script: MigrationScript): void {
    this.scripts.push(script);
    this.scripts.sort((left, right) => compareVersions(left.toVersion, right.toVersion));
  }

  getScripts(fromVersion: Version, toVersion: Version): MigrationScript[] {
    return this.scripts.filter(
      (script) => compareVersions(script.fromVersion, fromVersion) >= 0 && compareVersions(script.toVersion, toVersion) <= 0
    );
  }
}

export class MigrationRunner {
  constructor(private readonly registry: MigrationRegistry) {}

  async run(fromVersion: Version, toVersion: Version): Promise<MigrationRecord[]> {
    const records: MigrationRecord[] = [];

    for (const script of this.registry.getScripts(fromVersion, toVersion)) {
      const record: MigrationRecord = {
        id: `migration_${Date.now()}_${script.id}`,
        scriptId: script.id,
        fromVersion: versionToString(script.fromVersion),
        toVersion: versionToString(script.toVersion),
        status: "running",
        startedAt: Date.now(),
        description: script.description
      };

      try {
        if (script.preCheck) {
          const canProceed = await script.preCheck();
          if (!canProceed) {
            throw new Error("Pre-check failed.");
          }
        }
        await script.migrate();
        if (script.postCheck) {
          const validated = await script.postCheck();
          if (!validated) {
            throw new Error("Post-check failed.");
          }
        }
        record.status = "completed";
        record.completedAt = Date.now();
      } catch (error) {
        record.status = "failed";
        record.error = error instanceof Error ? error.message : "Unknown migration error.";
        await script.rollback();
        record.status = "rolled-back";
        record.completedAt = Date.now();
      }

      records.push(record);
    }

    return records;
  }
}

export function registerDefaultMigrations(registry: MigrationRegistry, userDataPath: string): void {
  registry.register({
    id: "001-bootstrap-user-data-layout",
    fromVersion: { major: 0, minor: 0, patch: 0 },
    toVersion: { major: 0, minor: 1, patch: 0 },
    description: "Ensure config, state, logs, and checkpoint directories exist for Phase 0 runtime.",
    preCheck: async () => true,
    migrate: async () => {
      await fs.mkdir(path.join(userDataPath, "config"), { recursive: true });
      await fs.mkdir(path.join(userDataPath, "state"), { recursive: true });
      await fs.mkdir(path.join(userDataPath, "state", "checkpoints"), { recursive: true });
      await fs.mkdir(path.join(userDataPath, "logs"), { recursive: true });
      await fs.writeFile(path.join(userDataPath, "state", "migration-bootstrap.json"), `${JSON.stringify({ applied: true }, null, 2)}\n`, "utf8");
    },
    postCheck: async () => {
      try {
        await fs.access(path.join(userDataPath, "state", "migration-bootstrap.json"));
        return true;
      } catch {
        return false;
      }
    },
    rollback: async () => {
      await fs.rm(path.join(userDataPath, "state", "migration-bootstrap.json"), { force: true });
    }
  });
}

async function copyDirectory(source: string, target: string): Promise<void> {
  try {
    await fs.access(source);
  } catch {
    return;
  }

  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
    } else {
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}

async function measureDirectory(dirPath: string): Promise<number> {
  let size = 0;
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      size += await measureDirectory(fullPath);
    } else {
      size += (await fs.stat(fullPath)).size;
    }
  }

  return size;
}
