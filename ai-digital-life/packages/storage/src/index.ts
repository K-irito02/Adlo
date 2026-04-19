import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import {
  type AgentPlanStep,
  type AgentRunDetail,
  type AgentRunRecord,
  type ApprovalRecord,
  APP_STATE_SCHEMA_VERSION,
  APPROVAL_POLICY_MODE,
  type AuditRecord,
  type CheckpointRecord,
  type CheckpointPayloadAsset,
  type CheckpointPayloadPreview,
  type CommandRequest,
  type ConversationDetail,
  type ConversationMessageRecord,
  type ConversationSessionRecord,
  ERROR_CODES,
  type AppStateV1,
  type FilePatch,
  type PatchHunk,
  type PatchHunkDecision,
  type PatchSet,
  type SessionMeta,
  type SessionSummary,
  type TaskRecord,
  type ToolInvocationRecord,
  type ValidationResult,
  type ModelCallAuditRecord,
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
  private readonly checkpointRootPath: string;
  private readonly logger: Logger;
  private database?: Database.Database;

  constructor(stateDir: string, logger: Logger) {
    this.legacyStateFilePath = path.join(stateDir, "app-state.v1.json");
    this.databaseFilePath = path.join(stateDir, "app-state.db");
    this.checkpointRootPath = path.join(stateDir, "checkpoints");
    this.logger = logger;
  }

  async initialize(): Promise<void> {
    await fs.mkdir(path.dirname(this.databaseFilePath), { recursive: true });
    await fs.mkdir(this.checkpointRootPath, { recursive: true });
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

      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        manifest_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conversation_sessions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_message_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conversation_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        blocks_json TEXT NOT NULL,
        run_id TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        prompt TEXT NOT NULL,
        scenario TEXT NOT NULL,
        status TEXT NOT NULL,
        summary TEXT,
        patch_set_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS agent_steps (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        title TEXT NOT NULL,
        detail TEXT,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tool_invocations (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        summary TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS patch_sets (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        run_id TEXT,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        status TEXT NOT NULL,
        checkpoint_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS file_patches (
        id TEXT PRIMARY KEY,
        patch_set_id TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        language TEXT,
        before_content TEXT NOT NULL,
        after_content TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS patch_hunks (
        id TEXT PRIMARY KEY,
        file_patch_id TEXT NOT NULL,
        patch_set_id TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        old_start INTEGER NOT NULL,
        old_lines INTEGER NOT NULL,
        new_start INTEGER NOT NULL,
        new_lines INTEGER NOT NULL,
        preview TEXT NOT NULL,
        before_text TEXT NOT NULL,
        after_text TEXT NOT NULL,
        decision TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS command_executions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        run_id TEXT,
        profile TEXT NOT NULL,
        command TEXT NOT NULL,
        args_json TEXT NOT NULL,
        shell INTEGER NOT NULL,
        risk_level TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS validation_results (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        run_id TEXT,
        patch_set_id TEXT,
        status TEXT NOT NULL,
        summary TEXT NOT NULL,
        diagnostics_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS provider_settings (
        provider_id TEXT PRIMARY KEY,
        metadata_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS model_call_audit (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        run_id TEXT,
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        scenario TEXT NOT NULL,
        route_meta_json TEXT NOT NULL,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        latency_ms INTEGER NOT NULL,
        error TEXT,
        streamed INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS model_call_audit_workspace_idx
      ON model_call_audit(workspace_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS context_summary_cache (
        cache_key TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        artifact_hash TEXT NOT NULL,
        summary_text TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS context_summary_cache_workspace_idx
      ON context_summary_cache(workspace_id, created_at DESC);
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
    this.database
      .prepare(
        "INSERT OR IGNORE INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)"
      )
      .run(3, "checkpoint_metadata_table", Date.now());
    this.database
      .prepare(
        "INSERT OR IGNORE INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)"
      )
      .run(4, "phase_two_conversation_agent_patch_tables", Date.now());
    this.database
      .prepare(
        "INSERT OR IGNORE INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)"
      )
      .run(5, "model_call_audit_table", Date.now());
    this.database
      .prepare(
        "INSERT OR IGNORE INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)"
      )
      .run(6, "context_summary_cache_table", Date.now());

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

  async listAgentRunsByWorkspace(workspaceId: string): Promise<AgentRunRecord[]> {
    const database = this.getDatabase();
    const rows = database
      .prepare(
        `SELECT id, workspace_id, session_id, prompt, scenario, status, summary, patch_set_id, created_at, updated_at, completed_at
         FROM agent_runs
         WHERE workspace_id = ?
         ORDER BY updated_at DESC`
      )
      .all(workspaceId) as Array<{
      id: string;
      workspace_id: string;
      session_id: string;
      prompt: string;
      scenario: AgentRunRecord["scenario"];
      status: AgentRunRecord["status"];
      summary: string | null;
      patch_set_id: string | null;
      created_at: number;
      updated_at: number;
      completed_at: number | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      sessionId: row.session_id,
      prompt: row.prompt,
      scenario: row.scenario,
      status: row.status,
      summary: row.summary ?? undefined,
      patchSetId: row.patch_set_id ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
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

  async getApproval(approvalId: string): Promise<ApprovalRecord | undefined> {
    const database = this.getDatabase();
    const row = database
      .prepare(
        `SELECT id, task_id, workspace_id, risk_level, decision, request_json, reason, approved_by, created_at, decided_at, expires_at
         FROM approvals
         WHERE id = ?`
      )
      .get(approvalId) as
      | {
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
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
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
    };
  }

  async decideApproval(input: {
    approvalId: string;
    decision: NonNullable<ApprovalRecord["decision"]>;
    reason?: string;
    approvedBy?: string;
  }): Promise<ApprovalRecord> {
    const existing = await this.getApproval(input.approvalId);
    if (!existing) {
      throw new StateStoreError(ERROR_CODES.notFound, "Approval record not found.");
    }

    const nextApproval: ApprovalRecord = {
      ...existing,
      decision: input.decision,
      reason: input.reason ?? existing.reason,
      approvedBy: input.approvedBy ?? existing.approvedBy,
      decidedAt: Date.now()
    };
    await this.upsertApproval(nextApproval);
    return nextApproval;
  }

  async upsertCheckpoint(checkpoint: CheckpointRecord): Promise<void> {
    const database = this.getDatabase();
    try {
      database
        .prepare(
          `INSERT OR REPLACE INTO checkpoints(
            id, session_id, workspace_id, type, description, manifest_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          checkpoint.id,
          checkpoint.sessionId,
          checkpoint.workspaceId,
          checkpoint.type,
          checkpoint.description,
          JSON.stringify(checkpoint.manifest),
          checkpoint.createdAt
        );
    } catch (error) {
      throw new StateStoreError(ERROR_CODES.stateWriteFailed, "Failed to persist checkpoint metadata.", {
        cause: error instanceof Error ? error : undefined
      });
    }
  }

  async getLatestCheckpoint(workspaceId: string): Promise<CheckpointRecord | undefined> {
    const database = this.getDatabase();
    const row = database
      .prepare(
        `SELECT id, session_id, workspace_id, type, description, manifest_json, created_at
         FROM checkpoints
         WHERE workspace_id = ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(workspaceId) as
      | {
          id: string;
          session_id: string;
          workspace_id: string;
          type: CheckpointRecord["type"];
          description: string;
          manifest_json: string;
          created_at: number;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      sessionId: row.session_id,
      workspaceId: row.workspace_id,
      type: row.type,
      description: row.description,
      manifest: JSON.parse(row.manifest_json),
      createdAt: row.created_at
    };
  }

  async writeCheckpointPayload(input: {
    checkpointId: string;
    rootPath: string;
    affectedPaths: string[];
  }): Promise<CheckpointPayloadPreview> {
    const checkpointDir = path.join(this.checkpointRootPath, input.checkpointId);
    const filesDir = path.join(checkpointDir, "files");
    await fs.mkdir(filesDir, { recursive: true });

    const assets: CheckpointPayloadAsset[] = [];

    for (const relativePath of Array.from(new Set(input.affectedPaths)).sort()) {
      const normalizedRelativePath = path.normalize(relativePath);
      const storedRelativePath = normalizedRelativePath.replaceAll("\\", "/");
      if (path.isAbsolute(normalizedRelativePath) || normalizedRelativePath.startsWith("..")) {
        continue;
      }

      const sourcePath = path.join(input.rootPath, normalizedRelativePath);
      try {
        const stats = await fs.stat(sourcePath);
        if (stats.isDirectory()) {
          assets.push({
            path: storedRelativePath,
            kind: "directory",
            status: "captured",
            size: 0
          });
          continue;
        }

        const targetPath = path.join(filesDir, normalizedRelativePath);
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.copyFile(sourcePath, targetPath);
        assets.push({
          path: storedRelativePath,
          kind: "file",
          status: "captured",
          size: stats.size,
          snapshotPath: targetPath
        });
      } catch {
        assets.push({
          path: storedRelativePath,
          kind: "file",
          status: "missing"
        });
      }
    }

    const manifestPath = path.join(checkpointDir, "manifest.json");
    const preview: CheckpointPayloadPreview = {
      checkpointId: input.checkpointId,
      manifestPath,
      rootPath: input.rootPath,
      assetCount: assets.length,
      assets
    };
    await fs.writeFile(`${manifestPath}`, `${JSON.stringify(preview, null, 2)}\n`, "utf8");
    return preview;
  }

  async getCheckpointPayload(checkpointId: string): Promise<CheckpointPayloadPreview | undefined> {
    const manifestPath = path.join(this.checkpointRootPath, checkpointId, "manifest.json");
    try {
      const raw = await fs.readFile(manifestPath, "utf8");
      return JSON.parse(raw) as CheckpointPayloadPreview;
    } catch {
      return undefined;
    }
  }

  async restoreCheckpointPayload(checkpointId: string): Promise<CheckpointPayloadPreview | undefined> {
    const preview = await this.getCheckpointPayload(checkpointId);
    if (!preview?.rootPath) {
      return preview;
    }

    const checkpointDir = path.join(this.checkpointRootPath, checkpointId, "files");
    for (const asset of preview.assets) {
      if (asset.kind !== "file" || asset.status !== "captured") {
        continue;
      }

      const normalizedRelativePath = path.normalize(asset.path);
      if (path.isAbsolute(normalizedRelativePath) || normalizedRelativePath.startsWith("..")) {
        continue;
      }

      const sourcePath = asset.snapshotPath ?? path.join(checkpointDir, normalizedRelativePath);
      const targetPath = path.join(preview.rootPath, normalizedRelativePath);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.copyFile(sourcePath, targetPath);
    }

    return preview;
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

  async upsertConversationSession(session: ConversationSessionRecord): Promise<void> {
    const database = this.getDatabase();
    database
      .prepare(
        `INSERT OR REPLACE INTO conversation_sessions(
          id, workspace_id, title, status, created_at, updated_at, last_message_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        session.id,
        session.workspaceId,
        session.title,
        session.status,
        session.createdAt,
        session.updatedAt,
        session.lastMessageAt
      );
  }

  async listConversationSessions(workspaceId: string): Promise<ConversationSessionRecord[]> {
    const database = this.getDatabase();
    const rows = database
      .prepare(
        `SELECT id, workspace_id, title, status, created_at, updated_at, last_message_at
         FROM conversation_sessions
         WHERE workspace_id = ?
         ORDER BY last_message_at DESC`
      )
      .all(workspaceId) as Array<{
      id: string;
      workspace_id: string;
      title: string;
      status: ConversationSessionRecord["status"];
      created_at: number;
      updated_at: number;
      last_message_at: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      title: row.title,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastMessageAt: row.last_message_at
    }));
  }

  async insertConversationMessage(message: ConversationMessageRecord): Promise<void> {
    const database = this.getDatabase();
    database
      .prepare(
        `INSERT INTO conversation_messages(
          id, session_id, role, content, blocks_json, run_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        message.id,
        message.sessionId,
        message.role,
        message.content,
        JSON.stringify(message.blocks),
        message.runId ?? null,
        message.createdAt
      );
    const session = database
      .prepare("SELECT workspace_id, title, status, created_at FROM conversation_sessions WHERE id = ?")
      .get(message.sessionId) as
      | {
          workspace_id: string;
          title: string;
          status: ConversationSessionRecord["status"];
          created_at: number;
        }
      | undefined;
    if (session) {
      await this.upsertConversationSession({
        id: message.sessionId,
        workspaceId: session.workspace_id,
        title: session.title,
        status: session.status,
        createdAt: session.created_at,
        updatedAt: message.createdAt,
        lastMessageAt: message.createdAt
      });
    }
  }

  async listRecentCommandRequests(workspaceId: string, limit = 30): Promise<CommandRequest[]> {
    const database = this.getDatabase();
    const rows = database
      .prepare(
        `SELECT id, workspace_id, run_id, profile, command, args_json, shell, risk_level, created_at
         FROM command_executions
         WHERE workspace_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(workspaceId, limit) as Array<{
      id: string;
      workspace_id: string;
      run_id: string | null;
      profile: CommandRequest["profile"];
      command: string;
      args_json: string;
      shell: number;
      risk_level: CommandRequest["riskLevel"];
      created_at: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      runId: row.run_id ?? undefined,
      profile: row.profile,
      command: row.command,
      args: JSON.parse(row.args_json) as string[],
      shell: Boolean(row.shell),
      riskLevel: row.risk_level,
      createdAt: row.created_at
    }));
  }

  async getLatestCommandRequest(workspaceId: string): Promise<CommandRequest | undefined> {
    const database = this.getDatabase();
    const row = database
      .prepare(
        `SELECT id, workspace_id, run_id, profile, command, args_json, shell, risk_level, created_at
         FROM command_executions
         WHERE workspace_id = ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(workspaceId) as
      | {
          id: string;
          workspace_id: string;
          run_id: string | null;
          profile: CommandRequest["profile"];
          command: string;
          args_json: string;
          shell: number;
          risk_level: CommandRequest["riskLevel"];
          created_at: number;
        }
      | undefined;
    if (!row) {
      return undefined;
    }
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      runId: row.run_id ?? undefined,
      profile: row.profile,
      command: row.command,
      args: JSON.parse(row.args_json) as string[],
      shell: Boolean(row.shell),
      riskLevel: row.risk_level,
      createdAt: row.created_at
    };
  }

  async getContextSummaryCache(cacheKey: string): Promise<string | undefined> {
    const database = this.getDatabase();
    const row = database
      .prepare("SELECT summary_text FROM context_summary_cache WHERE cache_key = ?")
      .get(cacheKey) as { summary_text: string } | undefined;
    return row?.summary_text;
  }

  async upsertContextSummaryCache(input: {
    cacheKey: string;
    workspaceId: string;
    sessionId: string;
    artifactHash: string;
    summaryText: string;
    createdAt: number;
  }): Promise<void> {
    const database = this.getDatabase();
    database
      .prepare(
        `INSERT OR REPLACE INTO context_summary_cache(
          cache_key, workspace_id, session_id, artifact_hash, summary_text, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.cacheKey,
        input.workspaceId,
        input.sessionId,
        input.artifactHash,
        input.summaryText,
        input.createdAt
      );
  }

  async invalidateContextSummaryForWorkspace(workspaceId: string): Promise<void> {
    const database = this.getDatabase();
    database.prepare("DELETE FROM context_summary_cache WHERE workspace_id = ?").run(workspaceId);
  }

  async clearConversationMessages(sessionId: string): Promise<void> {
    const database = this.getDatabase();
    database.prepare("DELETE FROM conversation_messages WHERE session_id = ?").run(sessionId);
  }

  async insertModelCallAudit(record: ModelCallAuditRecord): Promise<void> {
    const database = this.getDatabase();
    database
      .prepare(
        `INSERT INTO model_call_audit(
          id, request_id, workspace_id, session_id, run_id, provider_id, model_id, scenario,
          route_meta_json, prompt_tokens, completion_tokens, latency_ms, error, streamed, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.requestId,
        record.workspaceId,
        record.sessionId,
        record.runId ?? null,
        record.providerId,
        record.modelId,
        record.scenario,
        JSON.stringify(record.routeMeta),
        record.promptTokens ?? null,
        record.completionTokens ?? null,
        record.latencyMs,
        record.error ?? null,
        record.streamed ? 1 : 0,
        record.createdAt
      );
  }

  async listConversationMessages(sessionId: string): Promise<ConversationMessageRecord[]> {
    const database = this.getDatabase();
    const rows = database
      .prepare(
        `SELECT id, session_id, role, content, blocks_json, run_id, created_at
         FROM conversation_messages
         WHERE session_id = ?
         ORDER BY created_at ASC`
      )
      .all(sessionId) as Array<{
      id: string;
      session_id: string;
      role: ConversationMessageRecord["role"];
      content: string;
      blocks_json: string;
      run_id: string | null;
      created_at: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      content: row.content,
      blocks: JSON.parse(row.blocks_json),
      runId: row.run_id ?? undefined,
      createdAt: row.created_at
    }));
  }

  async getConversationDetail(sessionId: string): Promise<ConversationDetail | undefined> {
    const database = this.getDatabase();
    const row = database
      .prepare(
        `SELECT id, workspace_id, title, status, created_at, updated_at, last_message_at
         FROM conversation_sessions
         WHERE id = ?`
      )
      .get(sessionId) as
      | {
          id: string;
          workspace_id: string;
          title: string;
          status: ConversationSessionRecord["status"];
          created_at: number;
          updated_at: number;
          last_message_at: number;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      session: {
        id: row.id,
        workspaceId: row.workspace_id,
        title: row.title,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastMessageAt: row.last_message_at
      },
      messages: await this.listConversationMessages(sessionId)
    };
  }

  async upsertAgentRun(run: AgentRunRecord): Promise<void> {
    const database = this.getDatabase();
    database
      .prepare(
        `INSERT OR REPLACE INTO agent_runs(
          id, workspace_id, session_id, prompt, scenario, status, summary, patch_set_id, created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        run.id,
        run.workspaceId,
        run.sessionId,
        run.prompt,
        run.scenario,
        run.status,
        run.summary ?? null,
        run.patchSetId ?? null,
        run.createdAt,
        run.updatedAt,
        run.completedAt ?? null
      );
  }

  async replaceAgentSteps(runId: string, steps: AgentPlanStep[]): Promise<void> {
    const database = this.getDatabase();
    const transaction = database.transaction((nextSteps: AgentPlanStep[]) => {
      database.prepare("DELETE FROM agent_steps WHERE run_id = ?").run(runId);
      const insertStep = database.prepare(
        `INSERT INTO agent_steps(id, run_id, title, detail, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      for (const step of nextSteps) {
        insertStep.run(step.id, step.runId, step.title, step.detail ?? null, step.status, step.createdAt, step.updatedAt);
      }
    });
    transaction(steps);
  }

  async getAgentRunDetail(runId: string): Promise<AgentRunDetail | undefined> {
    const database = this.getDatabase();
    const row = database
      .prepare(
        `SELECT id, workspace_id, session_id, prompt, scenario, status, summary, patch_set_id, created_at, updated_at, completed_at
         FROM agent_runs
         WHERE id = ?`
      )
      .get(runId) as
      | {
          id: string;
          workspace_id: string;
          session_id: string;
          prompt: string;
          scenario: AgentRunRecord["scenario"];
          status: AgentRunRecord["status"];
          summary: string | null;
          patch_set_id: string | null;
          created_at: number;
          updated_at: number;
          completed_at: number | null;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    const steps = database
      .prepare(
        `SELECT id, run_id, title, detail, status, created_at, updated_at
         FROM agent_steps
         WHERE run_id = ?
         ORDER BY created_at ASC`
      )
      .all(runId) as Array<{
      id: string;
      run_id: string;
      title: string;
      detail: string | null;
      status: AgentPlanStep["status"];
      created_at: number;
      updated_at: number;
    }>;

    return {
      run: {
        id: row.id,
        workspaceId: row.workspace_id,
        sessionId: row.session_id,
        prompt: row.prompt,
        scenario: row.scenario,
        status: row.status,
        summary: row.summary ?? undefined,
        patchSetId: row.patch_set_id ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at ?? undefined
      },
      steps: steps.map((step) => ({
        id: step.id,
        runId: step.run_id,
        title: step.title,
        detail: step.detail ?? undefined,
        status: step.status,
        createdAt: step.created_at,
        updatedAt: step.updated_at
      }))
    };
  }

  async upsertToolInvocation(invocation: ToolInvocationRecord): Promise<void> {
    const database = this.getDatabase();
    database
      .prepare(
        `INSERT OR REPLACE INTO tool_invocations(
          id, run_id, tool_name, summary, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        invocation.id,
        invocation.runId,
        invocation.toolName,
        invocation.summary,
        invocation.status,
        invocation.createdAt,
        invocation.updatedAt
      );
  }

  async upsertPatchSet(patchSet: PatchSet): Promise<void> {
    const database = this.getDatabase();
    const transaction = database.transaction((nextPatchSet: PatchSet) => {
      database
        .prepare(
          `INSERT OR REPLACE INTO patch_sets(
            id, workspace_id, session_id, run_id, title, summary, status, checkpoint_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          nextPatchSet.id,
          nextPatchSet.workspaceId,
          nextPatchSet.sessionId,
          nextPatchSet.runId ?? null,
          nextPatchSet.title,
          nextPatchSet.summary,
          nextPatchSet.status,
          nextPatchSet.checkpointId ?? null,
          nextPatchSet.createdAt,
          nextPatchSet.updatedAt
        );
      database.prepare("DELETE FROM patch_hunks WHERE patch_set_id = ?").run(nextPatchSet.id);
      database.prepare("DELETE FROM file_patches WHERE patch_set_id = ?").run(nextPatchSet.id);

      const insertFilePatch = database.prepare(
        `INSERT INTO file_patches(
          id, patch_set_id, relative_path, language, before_content, after_content
        ) VALUES (?, ?, ?, ?, ?, ?)`
      );
      const insertHunk = database.prepare(
        `INSERT INTO patch_hunks(
          id, file_patch_id, patch_set_id, relative_path, old_start, old_lines, new_start, new_lines, preview, before_text, after_text, decision
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (const filePatch of nextPatchSet.filePatches) {
        insertFilePatch.run(
          filePatch.id,
          filePatch.patchSetId,
          filePatch.relativePath,
          filePatch.language ?? null,
          filePatch.beforeContent,
          filePatch.afterContent
        );
        for (const hunk of filePatch.hunks) {
          insertHunk.run(
            hunk.id,
            hunk.filePatchId,
            hunk.patchSetId,
            hunk.relativePath,
            hunk.oldStart,
            hunk.oldLines,
            hunk.newStart,
            hunk.newLines,
            hunk.preview,
            hunk.beforeText,
            hunk.afterText,
            hunk.decision
          );
        }
      }
    });

    transaction(patchSet);
  }

  async getPatchSet(patchSetId: string): Promise<PatchSet | undefined> {
    const database = this.getDatabase();
    const row = database
      .prepare(
        `SELECT id, workspace_id, session_id, run_id, title, summary, status, checkpoint_id, created_at, updated_at
         FROM patch_sets
         WHERE id = ?`
      )
      .get(patchSetId) as
      | {
          id: string;
          workspace_id: string;
          session_id: string;
          run_id: string | null;
          title: string;
          summary: string;
          status: PatchSet["status"];
          checkpoint_id: string | null;
          created_at: number;
          updated_at: number;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    const fileRows = database
      .prepare(
        `SELECT id, patch_set_id, relative_path, language, before_content, after_content
         FROM file_patches
         WHERE patch_set_id = ?
         ORDER BY relative_path ASC`
      )
      .all(patchSetId) as Array<{
      id: string;
      patch_set_id: string;
      relative_path: string;
      language: string | null;
      before_content: string;
      after_content: string;
    }>;

    const hunkRows = database
      .prepare(
        `SELECT id, file_patch_id, patch_set_id, relative_path, old_start, old_lines, new_start, new_lines, preview, before_text, after_text, decision
         FROM patch_hunks
         WHERE patch_set_id = ?
         ORDER BY relative_path ASC, new_start ASC`
      )
      .all(patchSetId) as Array<{
      id: string;
      file_patch_id: string;
      patch_set_id: string;
      relative_path: string;
      old_start: number;
      old_lines: number;
      new_start: number;
      new_lines: number;
      preview: string;
      before_text: string;
      after_text: string;
      decision: PatchHunkDecision;
    }>;

    const hunksByFilePatch = new Map<string, PatchHunk[]>();
    for (const hunkRow of hunkRows) {
      const patchHunk: PatchHunk = {
        id: hunkRow.id,
        filePatchId: hunkRow.file_patch_id,
        patchSetId: hunkRow.patch_set_id,
        relativePath: hunkRow.relative_path,
        oldStart: hunkRow.old_start,
        oldLines: hunkRow.old_lines,
        newStart: hunkRow.new_start,
        newLines: hunkRow.new_lines,
        preview: hunkRow.preview,
        beforeText: hunkRow.before_text,
        afterText: hunkRow.after_text,
        decision: hunkRow.decision
      };
      const bucket = hunksByFilePatch.get(patchHunk.filePatchId) ?? [];
      bucket.push(patchHunk);
      hunksByFilePatch.set(patchHunk.filePatchId, bucket);
    }

    const filePatches: FilePatch[] = fileRows.map((fileRow) => ({
      id: fileRow.id,
      patchSetId: fileRow.patch_set_id,
      relativePath: fileRow.relative_path,
      language: fileRow.language ?? undefined,
      beforeContent: fileRow.before_content,
      afterContent: fileRow.after_content,
      hunks: hunksByFilePatch.get(fileRow.id) ?? []
    }));

    return {
      id: row.id,
      workspaceId: row.workspace_id,
      sessionId: row.session_id,
      runId: row.run_id ?? undefined,
      title: row.title,
      summary: row.summary,
      status: row.status,
      checkpointId: row.checkpoint_id ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      filePatches
    };
  }

  async listPatchSetsByWorkspace(workspaceId: string): Promise<PatchSet[]> {
    const database = this.getDatabase();
    const rows = database
      .prepare(
        `SELECT id
         FROM patch_sets
         WHERE workspace_id = ?
         ORDER BY updated_at DESC`
      )
      .all(workspaceId) as Array<{ id: string }>;

    const patchSets = await Promise.all(rows.map((row) => this.getPatchSet(row.id)));
    return patchSets.filter((patchSet): patchSet is PatchSet => Boolean(patchSet));
  }

  async setPatchHunkDecision(input: {
    patchSetId: string;
    hunkId: string;
    decision: PatchHunkDecision;
  }): Promise<PatchSet> {
    const patchSet = await this.getPatchSet(input.patchSetId);
    if (!patchSet) {
      throw new StateStoreError(ERROR_CODES.notFound, "Patch set not found.");
    }

    const nextPatchSet: PatchSet = {
      ...patchSet,
      updatedAt: Date.now(),
      filePatches: patchSet.filePatches.map((filePatch) => ({
        ...filePatch,
        hunks: filePatch.hunks.map((hunk) => (hunk.id === input.hunkId ? { ...hunk, decision: input.decision } : hunk))
      }))
    };
    await this.upsertPatchSet(nextPatchSet);
    return nextPatchSet;
  }

  async insertCommandExecution(command: CommandRequest): Promise<void> {
    const database = this.getDatabase();
    database
      .prepare(
        `INSERT OR REPLACE INTO command_executions(
          id, workspace_id, run_id, profile, command, args_json, shell, risk_level, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        command.id,
        command.workspaceId,
        command.runId ?? null,
        command.profile,
        command.command,
        JSON.stringify(command.args),
        command.shell ? 1 : 0,
        command.riskLevel,
        command.createdAt
      );
  }

  async insertValidationResult(result: ValidationResult): Promise<void> {
    const database = this.getDatabase();
    database
      .prepare(
        `INSERT OR REPLACE INTO validation_results(
          id, workspace_id, run_id, patch_set_id, status, summary, diagnostics_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        result.id,
        result.workspaceId,
        result.runId ?? null,
        result.patchSetId ?? null,
        result.status,
        result.summary,
        JSON.stringify(result.diagnostics),
        result.createdAt
      );
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
