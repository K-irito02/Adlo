import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import {
  APP_STATE_SCHEMA_VERSION,
  ERROR_CODES,
  type AppStateV1,
  type RepoMapEntry,
  type RetrievalFileTypeCount,
  type RetrievalSnapshot,
  defaultAppState,
  StateStoreError
} from "@ai-digital-life/kernel";
import type { Logger } from "@ai-digital-life/logger";

export class StateRepository {
  private readonly legacyStateFilePath: string;
  private readonly databaseFilePath: string;
  private readonly logger: Logger;
  private database?: Database.Database;

  constructor(stateDir: string, logger: Logger) {
    this.legacyStateFilePath = path.join(stateDir, "app-state.v1.json");
    this.databaseFilePath = path.join(stateDir, "app-state.db");
    this.logger = logger;
  }

  async initialize(): Promise<void> {
    await fs.mkdir(path.dirname(this.databaseFilePath), { recursive: true });
    this.database = new Database(this.databaseFilePath);
    this.database.pragma("foreign_keys = ON");
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("synchronous = NORMAL");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS recent_workspaces (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        root_path TEXT NOT NULL,
        name TEXT NOT NULL,
        last_opened_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS recent_workspaces_last_opened_idx
      ON recent_workspaces(last_opened_at DESC);

      CREATE TABLE IF NOT EXISTS retrieval_state (
        workspace_id TEXT PRIMARY KEY,
        root_path TEXT NOT NULL,
        status TEXT NOT NULL,
        scanned_files INTEGER NOT NULL,
        indexed_text_files INTEGER NOT NULL,
        started_at INTEGER,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER,
        last_error TEXT,
        top_extensions_json TEXT NOT NULL,
        repo_map_json TEXT NOT NULL
      );
    `);
    this.database
      .prepare(
        "INSERT OR IGNORE INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)"
      )
      .run(1, "initial_state_and_retrieval_tables", Date.now());

    await this.migrateLegacyFileIfNeeded();
  }

  async load(): Promise<AppStateV1> {
    const database = this.getDatabase();
    try {
      const currentWorkspacePath = database
        .prepare("SELECT value_json FROM app_state WHERE key = ?")
        .get("currentWorkspacePath") as { value_json: string } | undefined;
      const windowState = database
        .prepare("SELECT value_json FROM app_state WHERE key = ?")
        .get("windowState") as { value_json: string } | undefined;
      const recentRows = database
        .prepare(
          `SELECT id, path, root_path, name, last_opened_at
           FROM recent_workspaces
           ORDER BY last_opened_at DESC`
        )
        .all() as Array<{
        id: string;
        path: string;
        root_path: string;
        name: string;
        last_opened_at: number;
      }>;

      return {
        schemaVersion: APP_STATE_SCHEMA_VERSION,
        currentWorkspacePath: currentWorkspacePath ? JSON.parse(currentWorkspacePath.value_json) : undefined,
        windowState: windowState ? JSON.parse(windowState.value_json) : defaultAppState().windowState,
        recentWorkspaces: recentRows.map((row) => ({
          id: row.id,
          path: row.path,
          rootPath: row.root_path,
          name: row.name,
          lastOpenedAt: row.last_opened_at,
          available: true
        }))
      };
    } catch (error) {
      this.logger.warn("SQLite state could not be loaded. Falling back to defaults.");
      return defaultAppState();
    }
  }

  async save(nextState: AppStateV1): Promise<void> {
    const database = this.getDatabase();
    try {
      const normalizedState: AppStateV1 = {
        ...defaultAppState(),
        ...nextState,
        schemaVersion: APP_STATE_SCHEMA_VERSION
      };
      const saveTransaction = database.transaction((state: AppStateV1) => {
        database
          .prepare("INSERT OR REPLACE INTO app_state(key, value_json) VALUES (?, ?)")
          .run("currentWorkspacePath", JSON.stringify(state.currentWorkspacePath ?? null));
        database
          .prepare("INSERT OR REPLACE INTO app_state(key, value_json) VALUES (?, ?)")
          .run("windowState", JSON.stringify(state.windowState));
        database.prepare("DELETE FROM recent_workspaces").run();

        const insertRecent = database.prepare(
          `INSERT INTO recent_workspaces(id, path, root_path, name, last_opened_at)
           VALUES (?, ?, ?, ?, ?)`
        );
        for (const workspace of state.recentWorkspaces) {
          insertRecent.run(
            workspace.id,
            workspace.path,
            workspace.rootPath,
            workspace.name,
            workspace.lastOpenedAt
          );
        }
      });
      saveTransaction(normalizedState);
    } catch (error) {
      throw new StateStoreError(ERROR_CODES.stateWriteFailed, "Failed to persist application state.", {
        cause: error instanceof Error ? error : undefined
      });
    }
  }

  async saveRetrievalSnapshot(snapshot: RetrievalSnapshot): Promise<void> {
    const database = this.getDatabase();

    try {
      database
        .prepare(
          `INSERT OR REPLACE INTO retrieval_state(
            workspace_id,
            root_path,
            status,
            scanned_files,
            indexed_text_files,
            started_at,
            updated_at,
            completed_at,
            last_error,
            top_extensions_json,
            repo_map_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          snapshot.workspaceId,
          snapshot.rootPath,
          snapshot.status,
          snapshot.scannedFiles,
          snapshot.indexedTextFiles,
          snapshot.startedAt ?? null,
          snapshot.updatedAt,
          snapshot.completedAt ?? null,
          snapshot.lastError ?? null,
          JSON.stringify(snapshot.topExtensions),
          JSON.stringify(snapshot.repoMap)
        );
    } catch (error) {
      throw new StateStoreError(ERROR_CODES.stateWriteFailed, "Failed to persist retrieval state.", {
        cause: error instanceof Error ? error : undefined
      });
    }
  }

  async getRetrievalSnapshot(workspaceId: string): Promise<RetrievalSnapshot | undefined> {
    const database = this.getDatabase();
    const row = database
      .prepare(
        `SELECT workspace_id, root_path, status, scanned_files, indexed_text_files,
                started_at, updated_at, completed_at, last_error, top_extensions_json, repo_map_json
         FROM retrieval_state
         WHERE workspace_id = ?`
      )
      .get(workspaceId) as
      | {
          workspace_id: string;
          root_path: string;
          status: RetrievalSnapshot["status"];
          scanned_files: number;
          indexed_text_files: number;
          started_at: number | null;
          updated_at: number;
          completed_at: number | null;
          last_error: string | null;
          top_extensions_json: string;
          repo_map_json: string;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      workspaceId: row.workspace_id,
      rootPath: row.root_path,
      status: row.status,
      scannedFiles: row.scanned_files,
      indexedTextFiles: row.indexed_text_files,
      startedAt: row.started_at ?? undefined,
      updatedAt: row.updated_at,
      completedAt: row.completed_at ?? undefined,
      lastError: row.last_error ?? undefined,
      topExtensions: JSON.parse(row.top_extensions_json) as RetrievalFileTypeCount[],
      repoMap: JSON.parse(row.repo_map_json) as RepoMapEntry[]
    };
  }

  close(): void {
    this.database?.close();
    this.database = undefined;
  }

  private getDatabase(): Database.Database {
    if (!this.database) {
      throw new StateStoreError(ERROR_CODES.stateReadFailed, "State database has not been initialized.");
    }

    return this.database;
  }

  private async migrateLegacyFileIfNeeded(): Promise<void> {
    try {
      await fs.access(this.legacyStateFilePath);
    } catch {
      return;
    }

    const database = this.getDatabase();
    const existingRecentCount = database
      .prepare("SELECT COUNT(*) AS count FROM recent_workspaces")
      .get() as { count: number };

    if (existingRecentCount.count > 0) {
      return;
    }

    try {
      const raw = await fs.readFile(this.legacyStateFilePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<AppStateV1>;
      const migrated: AppStateV1 = {
        ...defaultAppState(),
        ...parsed,
        schemaVersion: APP_STATE_SCHEMA_VERSION,
        recentWorkspaces: Array.isArray(parsed.recentWorkspaces) ? parsed.recentWorkspaces : []
      };
      await this.save(migrated);
      await fs.rename(this.legacyStateFilePath, `${this.legacyStateFilePath}.migrated`);
      this.logger.info("Migrated legacy file-backed app state into SQLite.");
    } catch (error) {
      this.logger.warn("Legacy app state could not be migrated into SQLite.");
    }
  }
}
