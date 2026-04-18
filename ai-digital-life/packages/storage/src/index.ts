import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import {
  type ApprovalRecord,
  APP_STATE_SCHEMA_VERSION,
  APPROVAL_POLICY_MODE,
  type AuditRecord,
  ERROR_CODES,
  type AppStateV1,
  type SessionMeta,
  type SessionSummary,
  type TaskRecord,
  type WorkspaceMeta,
  type RepoMapEntry,
  type RetrievalFileTypeCount,
  type RetrievalSnapshot,
  defaultAppState,
  createId,
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

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        root_path TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        git_snapshot_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_opened_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        status TEXT NOT NULL,
        approval_mode TEXT NOT NULL,
        current_task_id TEXT,
        summary_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        priority TEXT NOT NULL,
        description TEXT NOT NULL,
        operations_json TEXT NOT NULL,
        approval_id TEXT,
        checkpoint_id TEXT,
        result_json TEXT,
        error_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        risk_level TEXT NOT NULL,
        decision TEXT,
        request_json TEXT NOT NULL,
        reason TEXT,
        approved_by TEXT,
        created_at INTEGER NOT NULL,
        decided_at INTEGER,
        expires_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS audit_records (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        detail TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
    this.database
      .prepare(
        "INSERT OR IGNORE INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)"
      )
      .run(1, "initial_state_and_retrieval_tables", Date.now());
    this.database
      .prepare(
        "INSERT OR IGNORE INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)"
      )
      .run(2, "workspace_session_task_approval_tables", Date.now());

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

  async upsertWorkspace(workspace: WorkspaceMeta): Promise<void> {
    const database = this.getDatabase();

    try {
      database
        .prepare(
          `INSERT OR REPLACE INTO workspaces(
            id, path, root_path, name, type, status, git_snapshot_json, created_at, updated_at, last_opened_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          workspace.id,
          workspace.path,
          workspace.rootPath,
          workspace.name,
          workspace.type,
          workspace.status,
          workspace.gitSnapshot ? JSON.stringify(workspace.gitSnapshot) : null,
          workspace.createdAt,
          workspace.updatedAt,
          workspace.lastOpenedAt
        );
    } catch (error) {
      throw new StateStoreError(ERROR_CODES.stateWriteFailed, "Failed to persist workspace metadata.", {
        cause: error instanceof Error ? error : undefined
      });
    }
  }

  async getWorkspace(workspaceId: string): Promise<WorkspaceMeta | undefined> {
    const database = this.getDatabase();
    const row = database
      .prepare(
        `SELECT id, path, root_path, name, type, status, git_snapshot_json, created_at, updated_at, last_opened_at
         FROM workspaces
         WHERE id = ?`
      )
      .get(workspaceId) as
      | {
          id: string;
          path: string;
          root_path: string;
          name: string;
          type: WorkspaceMeta["type"];
          status: WorkspaceMeta["status"];
          git_snapshot_json: string | null;
          created_at: number;
          updated_at: number;
          last_opened_at: number;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      path: row.path,
      rootPath: row.root_path,
      name: row.name,
      type: row.type,
      status: row.status,
      gitSnapshot: row.git_snapshot_json ? JSON.parse(row.git_snapshot_json) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastOpenedAt: row.last_opened_at
    };
  }

  async upsertSession(session: SessionMeta): Promise<void> {
    const database = this.getDatabase();

    try {
      database
        .prepare(
          `INSERT OR REPLACE INTO sessions(
            id, workspace_id, status, approval_mode, current_task_id, summary_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          session.id,
          session.workspaceId,
          session.status,
          session.approvalMode,
          session.currentTaskId ?? null,
          JSON.stringify(session.summary),
          session.createdAt,
          session.updatedAt
        );
    } catch (error) {
      throw new StateStoreError(ERROR_CODES.stateWriteFailed, "Failed to persist session metadata.", {
        cause: error instanceof Error ? error : undefined
      });
    }
  }

  async getLatestSession(workspaceId: string): Promise<SessionMeta | undefined> {
    const database = this.getDatabase();
    const row = database
      .prepare(
        `SELECT id, workspace_id, status, approval_mode, current_task_id, summary_json, created_at, updated_at
         FROM sessions
         WHERE workspace_id = ?
         ORDER BY updated_at DESC
         LIMIT 1`
      )
      .get(workspaceId) as
      | {
          id: string;
          workspace_id: string;
          status: SessionMeta["status"];
          approval_mode: SessionMeta["approvalMode"];
          current_task_id: string | null;
          summary_json: string;
          created_at: number;
          updated_at: number;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      workspaceId: row.workspace_id,
      status: row.status,
      approvalMode: row.approval_mode,
      currentTaskId: row.current_task_id ?? undefined,
      summary: JSON.parse(row.summary_json) as SessionSummary,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async upsertTask(task: TaskRecord): Promise<void> {
    const database = this.getDatabase();

    try {
      database
        .prepare(
          `INSERT OR REPLACE INTO tasks(
            id, workspace_id, session_id, type, status, priority, description, operations_json,
            approval_id, checkpoint_id, result_json, error_json, created_at, updated_at, started_at, completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          task.id,
          task.workspaceId,
          task.sessionId,
          task.type,
          task.status,
          task.priority,
          task.description,
          JSON.stringify(task.operations),
          task.approvalId ?? null,
          task.checkpointId ?? null,
          task.resultJson ?? null,
          task.errorJson ?? null,
          task.createdAt,
          task.updatedAt,
          task.startedAt ?? null,
          task.completedAt ?? null
        );
    } catch (error) {
      throw new StateStoreError(ERROR_CODES.stateWriteFailed, "Failed to persist task record.", {
        cause: error instanceof Error ? error : undefined
      });
    }
  }

  async listTasksByWorkspace(workspaceId: string): Promise<TaskRecord[]> {
    const database = this.getDatabase();
    const rows = database
      .prepare(
        `SELECT id, workspace_id, session_id, type, status, priority, description, operations_json,
                approval_id, checkpoint_id, result_json, error_json, created_at, updated_at, started_at, completed_at
         FROM tasks
         WHERE workspace_id = ?
         ORDER BY updated_at DESC`
      )
      .all(workspaceId) as Array<{
        id: string;
        workspace_id: string;
        session_id: string;
        type: string;
        status: TaskRecord["status"];
        priority: TaskRecord["priority"];
        description: string;
        operations_json: string;
        approval_id: string | null;
        checkpoint_id: string | null;
        result_json: string | null;
        error_json: string | null;
        created_at: number;
        updated_at: number;
        started_at: number | null;
        completed_at: number | null;
      }>;

    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      sessionId: row.session_id,
      type: row.type,
      description: row.description,
      status: row.status,
      priority: row.priority,
      operations: JSON.parse(row.operations_json),
      approvalId: row.approval_id ?? undefined,
      checkpointId: row.checkpoint_id ?? undefined,
      resultJson: row.result_json ?? undefined,
      errorJson: row.error_json ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined
    }));
  }

  async upsertApproval(approval: ApprovalRecord): Promise<void> {
    const database = this.getDatabase();

    try {
      database
        .prepare(
          `INSERT OR REPLACE INTO approvals(
            id, task_id, workspace_id, risk_level, decision, request_json, reason, approved_by, created_at, decided_at, expires_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          approval.id,
          approval.taskId,
          approval.workspaceId,
          approval.riskLevel,
          approval.decision ?? null,
          JSON.stringify(approval.request),
          approval.reason ?? null,
          approval.approvedBy ?? null,
          approval.createdAt,
          approval.decidedAt ?? null,
          approval.expiresAt ?? null
        );
    } catch (error) {
      throw new StateStoreError(ERROR_CODES.stateWriteFailed, "Failed to persist approval record.", {
        cause: error instanceof Error ? error : undefined
      });
    }
  }

  async listPendingApprovals(workspaceId: string): Promise<ApprovalRecord[]> {
    const database = this.getDatabase();
    const rows = database
      .prepare(
        `SELECT id, task_id, workspace_id, risk_level, decision, request_json, reason, approved_by, created_at, decided_at, expires_at
         FROM approvals
         WHERE workspace_id = ? AND decision IS NULL
         ORDER BY created_at DESC`
      )
      .all(workspaceId) as Array<{
        id: string;
        task_id: string;
        workspace_id: string;
        risk_level: ApprovalRecord["riskLevel"];
        decision: ApprovalRecord["decision"] | null;
        request_json: string;
        reason: string | null;
        approved_by: string | null;
        created_at: number;
        decided_at: number | null;
        expires_at: number | null;
      }>;

    return rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      workspaceId: row.workspace_id,
      riskLevel: row.risk_level,
      request: JSON.parse(row.request_json),
      decision: row.decision ?? undefined,
      reason: row.reason ?? undefined,
      approvedBy: row.approved_by ?? undefined,
      createdAt: row.created_at,
      decidedAt: row.decided_at ?? undefined,
      expiresAt: row.expires_at ?? undefined
    }));
  }

  async appendAuditRecord(record: Omit<AuditRecord, "id"> & { id?: string }): Promise<AuditRecord> {
    const database = this.getDatabase();
    const nextRecord: AuditRecord = {
      id: record.id ?? createId("audit"),
      entityType: record.entityType,
      entityId: record.entityId,
      action: record.action,
      detail: record.detail,
      createdAt: record.createdAt
    };

    try {
      database
        .prepare(
          `INSERT INTO audit_records(id, entity_type, entity_id, action, detail, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          nextRecord.id,
          nextRecord.entityType,
          nextRecord.entityId,
          nextRecord.action,
          nextRecord.detail,
          nextRecord.createdAt
        );
      return nextRecord;
    } catch (error) {
      throw new StateStoreError(ERROR_CODES.stateWriteFailed, "Failed to append audit record.", {
        cause: error instanceof Error ? error : undefined
      });
    }
  }

  async ensureSessionForWorkspace(workspaceId: string): Promise<SessionMeta> {
    const existing = await this.getLatestSession(workspaceId);
    if (existing) {
      return existing;
    }

    const now = Date.now();
    const session: SessionMeta = {
      id: createId("session"),
      workspaceId,
      status: "active",
      approvalMode: APPROVAL_POLICY_MODE,
      summary: {},
      createdAt: now,
      updatedAt: now
    };
    await this.upsertSession(session);
    return session;
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
