use adl_errors::AppError;
use adl_kernel::now_ms;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{de::DeserializeOwned, Serialize};
use std::path::Path;
use std::sync::{Arc, Mutex};
use tracing::info;

pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, AppError> {
        std::fs::create_dir_all(path.parent().unwrap_or(Path::new(".")))?;
        let conn = Connection::open(path)
            .map_err(|e| AppError::Storage(format!("Failed to open database: {e}")))?;

        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| AppError::Storage(e.to_string()))?;

        info!(?path, "database opened");
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().expect("database mutex poisoned")
    }

    pub fn execute(
        &self,
        sql: &str,
        params: &[&dyn rusqlite::types::ToSql],
    ) -> Result<usize, AppError> {
        self.conn()
            .execute(sql, params)
            .map_err(|e| AppError::Storage(e.to_string()))
    }

    pub fn init_schema(&self) -> Result<(), AppError> {
        let conn = self.conn();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS recent_workspaces (
                root_path TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                last_opened TEXT NOT NULL,
                json TEXT
            );
            CREATE TABLE IF NOT EXISTS app_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS workspaces (
                id TEXT PRIMARY KEY,
                workspace_id TEXT,
                session_id TEXT,
                status TEXT,
                updated_at INTEGER NOT NULL,
                json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                workspace_id TEXT,
                session_id TEXT,
                status TEXT,
                updated_at INTEGER NOT NULL,
                json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS retrieval_snapshots (
                id TEXT PRIMARY KEY,
                workspace_id TEXT,
                session_id TEXT,
                status TEXT,
                updated_at INTEGER NOT NULL,
                json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                workspace_id TEXT,
                session_id TEXT,
                status TEXT,
                updated_at INTEGER NOT NULL,
                json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS approvals (
                id TEXT PRIMARY KEY,
                workspace_id TEXT,
                session_id TEXT,
                status TEXT,
                updated_at INTEGER NOT NULL,
                json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS audit_records (
                id TEXT PRIMARY KEY,
                workspace_id TEXT,
                session_id TEXT,
                status TEXT,
                updated_at INTEGER NOT NULL,
                json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS checkpoints (
                id TEXT PRIMARY KEY,
                workspace_id TEXT,
                session_id TEXT,
                status TEXT,
                updated_at INTEGER NOT NULL,
                json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS conversation_messages (
                id TEXT PRIMARY KEY,
                workspace_id TEXT,
                session_id TEXT,
                status TEXT,
                updated_at INTEGER NOT NULL,
                json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS agent_runs (
                id TEXT PRIMARY KEY,
                workspace_id TEXT,
                session_id TEXT,
                status TEXT,
                updated_at INTEGER NOT NULL,
                json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS agent_steps (
                id TEXT PRIMARY KEY,
                workspace_id TEXT,
                session_id TEXT,
                status TEXT,
                updated_at INTEGER NOT NULL,
                json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tool_invocations (
                id TEXT PRIMARY KEY,
                workspace_id TEXT,
                session_id TEXT,
                status TEXT,
                updated_at INTEGER NOT NULL,
                json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS patch_sets (
                id TEXT PRIMARY KEY,
                workspace_id TEXT,
                session_id TEXT,
                status TEXT,
                updated_at INTEGER NOT NULL,
                json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS file_patches (
                id TEXT PRIMARY KEY,
                workspace_id TEXT,
                session_id TEXT,
                status TEXT,
                updated_at INTEGER NOT NULL,
                json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS patch_hunks (
                id TEXT PRIMARY KEY,
                workspace_id TEXT,
                session_id TEXT,
                status TEXT,
                updated_at INTEGER NOT NULL,
                json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS command_requests (
                id TEXT PRIMARY KEY,
                workspace_id TEXT,
                session_id TEXT,
                status TEXT,
                updated_at INTEGER NOT NULL,
                json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS command_executions (
                id TEXT PRIMARY KEY,
                workspace_id TEXT,
                session_id TEXT,
                status TEXT,
                updated_at INTEGER NOT NULL,
                json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS validation_results (
                id TEXT PRIMARY KEY,
                workspace_id TEXT,
                session_id TEXT,
                status TEXT,
                updated_at INTEGER NOT NULL,
                json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS model_preferences (
                id TEXT PRIMARY KEY,
                workspace_id TEXT,
                session_id TEXT,
                status TEXT,
                updated_at INTEGER NOT NULL,
                json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS model_call_audit (
                id TEXT PRIMARY KEY,
                workspace_id TEXT,
                session_id TEXT,
                status TEXT,
                updated_at INTEGER NOT NULL,
                json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS run_activity_events (
                id TEXT PRIMARY KEY,
                workspace_id TEXT,
                session_id TEXT,
                status TEXT,
                updated_at INTEGER NOT NULL,
                json TEXT NOT NULL
            );",
        )
        .map_err(|e| AppError::Storage(e.to_string()))?;
        let _ = conn.execute("ALTER TABLE recent_workspaces ADD COLUMN json TEXT", []);
        conn.execute_batch(
            "CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id, updated_at);
             CREATE INDEX IF NOT EXISTS idx_messages_session ON conversation_messages(session_id, updated_at);
             CREATE INDEX IF NOT EXISTS idx_agent_runs_session ON agent_runs(session_id, updated_at);
             CREATE INDEX IF NOT EXISTS idx_patch_sets_run ON patch_sets(session_id, updated_at);
             CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id, updated_at);
             CREATE INDEX IF NOT EXISTS idx_approvals_workspace ON approvals(workspace_id, updated_at);
             CREATE INDEX IF NOT EXISTS idx_audit_workspace ON audit_records(workspace_id, updated_at);
             CREATE INDEX IF NOT EXISTS idx_run_activity_run ON run_activity_events(status, updated_at);",
        )
        .map_err(|e| AppError::Storage(e.to_string()))?;
        info!("schema initialized");
        Ok(())
    }

    pub fn put_state(&self, key: &str, value: &str) -> Result<(), AppError> {
        self.conn()
            .execute(
                "INSERT OR REPLACE INTO app_state (key, value) VALUES (?1, ?2)",
                params![key, value],
            )
            .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(())
    }

    pub fn get_state(&self, key: &str) -> Result<Option<String>, AppError> {
        self.conn()
            .query_row(
                "SELECT value FROM app_state WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| AppError::Storage(e.to_string()))
    }

    pub fn save_entity<T: Serialize>(
        &self,
        table: EntityTable,
        id: &str,
        workspace_id: Option<&str>,
        session_id: Option<&str>,
        status: Option<&str>,
        value: &T,
    ) -> Result<(), AppError> {
        let json = serde_json::to_string(value)?;
        let table_name = table.as_str();
        let sql = format!(
            "INSERT OR REPLACE INTO {table_name}
             (id, workspace_id, session_id, status, updated_at, json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
        );
        self.conn()
            .execute(
                &sql,
                params![id, workspace_id, session_id, status, now_ms(), json],
            )
            .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(())
    }

    pub fn load_entity<T: DeserializeOwned>(
        &self,
        table: EntityTable,
        id: &str,
    ) -> Result<Option<T>, AppError> {
        let table_name = table.as_str();
        let sql = format!("SELECT json FROM {table_name} WHERE id = ?1");
        let json: Option<String> = self
            .conn()
            .query_row(&sql, params![id], |row| row.get(0))
            .optional()
            .map_err(|e| AppError::Storage(e.to_string()))?;
        json.map(|value| serde_json::from_str(&value).map_err(AppError::from))
            .transpose()
    }

    pub fn list_entities<T: DeserializeOwned>(
        &self,
        table: EntityTable,
    ) -> Result<Vec<T>, AppError> {
        self.list_entities_filtered(table, None, None)
    }

    pub fn list_entities_by_workspace<T: DeserializeOwned>(
        &self,
        table: EntityTable,
        workspace_id: &str,
    ) -> Result<Vec<T>, AppError> {
        self.list_entities_filtered(table, Some(("workspace_id", workspace_id)), None)
    }

    pub fn list_entities_by_session<T: DeserializeOwned>(
        &self,
        table: EntityTable,
        session_id: &str,
    ) -> Result<Vec<T>, AppError> {
        self.list_entities_filtered(table, Some(("session_id", session_id)), None)
    }

    pub fn list_entities_by_status<T: DeserializeOwned>(
        &self,
        table: EntityTable,
        status: &str,
    ) -> Result<Vec<T>, AppError> {
        self.list_entities_filtered(table, Some(("status", status)), None)
    }

    fn list_entities_filtered<T: DeserializeOwned>(
        &self,
        table: EntityTable,
        filter: Option<(&'static str, &str)>,
        limit: Option<usize>,
    ) -> Result<Vec<T>, AppError> {
        let table_name = table.as_str();
        let mut sql = format!("SELECT json FROM {table_name}");
        if let Some((field, _)) = filter {
            sql.push_str(" WHERE ");
            sql.push_str(field);
            sql.push_str(" = ?1");
        }
        sql.push_str(" ORDER BY updated_at DESC");
        if let Some(limit) = limit {
            sql.push_str(&format!(" LIMIT {limit}"));
        }

        let conn = self.conn();
        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| AppError::Storage(e.to_string()))?;
        let rows = if let Some((_, value)) = filter {
            stmt.query_map(params![value], |row| row.get::<_, String>(0))
                .map_err(|e| AppError::Storage(e.to_string()))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| AppError::Storage(e.to_string()))?
        } else {
            stmt.query_map([], |row| row.get::<_, String>(0))
                .map_err(|e| AppError::Storage(e.to_string()))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| AppError::Storage(e.to_string()))?
        };
        rows.into_iter()
            .map(|json| serde_json::from_str(&json).map_err(AppError::from))
            .collect()
    }

    pub fn delete_entity(&self, table: EntityTable, id: &str) -> Result<bool, AppError> {
        let table_name = table.as_str();
        let sql = format!("DELETE FROM {table_name} WHERE id = ?1");
        let changed = self
            .conn()
            .execute(&sql, params![id])
            .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(changed > 0)
    }

    /// Best-effort pruning for `run_activity_events`.
    ///
    /// Notes:
    /// - Uses `updated_at` (insert time) as the retention clock.
    /// - `status` column stores `run_id` for this table.
    pub fn prune_run_activity_events(
        &self,
        retention_ms: Option<i64>,
        max_total_rows: Option<i64>,
    ) -> Result<(), AppError> {
        let conn = self.conn();
        if let Some(retention_ms) = retention_ms {
            if retention_ms > 0 {
                let cutoff = now_ms().saturating_sub(retention_ms);
                conn.execute(
                    "DELETE FROM run_activity_events WHERE updated_at < ?1",
                    params![cutoff],
                )
                .map_err(|e| AppError::Storage(e.to_string()))?;
            }
        }

        if let Some(max_total_rows) = max_total_rows {
            if max_total_rows > 0 {
                let count: i64 = conn
                    .query_row("SELECT COUNT(*) FROM run_activity_events", [], |r| r.get(0))
                    .map_err(|e| AppError::Storage(e.to_string()))?;
                let overflow = count - max_total_rows;
                if overflow > 0 {
                    conn.execute(
                        "DELETE FROM run_activity_events
                         WHERE id IN (
                           SELECT id FROM run_activity_events
                           ORDER BY updated_at ASC
                           LIMIT ?1
                         )",
                        params![overflow],
                    )
                    .map_err(|e| AppError::Storage(e.to_string()))?;
                }
            }
        }
        Ok(())
    }

    /// Keep only the newest `keep_last` rows for a given run_id.
    pub fn prune_run_activity_events_for_run(
        &self,
        run_id: &str,
        keep_last: i64,
    ) -> Result<(), AppError> {
        if keep_last <= 0 {
            return Ok(());
        }
        let conn = self.conn();
        conn.execute(
            "DELETE FROM run_activity_events
             WHERE id IN (
               SELECT id FROM run_activity_events
               WHERE status = ?1
               ORDER BY updated_at DESC
               LIMIT -1 OFFSET ?2
             )",
            params![run_id, keep_last],
        )
        .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(())
    }
}

impl Clone for Database {
    fn clone(&self) -> Self {
        Self {
            conn: Arc::clone(&self.conn),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub enum EntityTable {
    Workspaces,
    Sessions,
    RetrievalSnapshots,
    Tasks,
    Approvals,
    AuditRecords,
    Checkpoints,
    ConversationMessages,
    AgentRuns,
    AgentSteps,
    ToolInvocations,
    PatchSets,
    FilePatches,
    PatchHunks,
    CommandRequests,
    CommandExecutions,
    ValidationResults,
    ModelPreferences,
    ModelCallAudit,
    RunActivityEvents,
}

impl EntityTable {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Workspaces => "workspaces",
            Self::Sessions => "sessions",
            Self::RetrievalSnapshots => "retrieval_snapshots",
            Self::Tasks => "tasks",
            Self::Approvals => "approvals",
            Self::AuditRecords => "audit_records",
            Self::Checkpoints => "checkpoints",
            Self::ConversationMessages => "conversation_messages",
            Self::AgentRuns => "agent_runs",
            Self::AgentSteps => "agent_steps",
            Self::ToolInvocations => "tool_invocations",
            Self::PatchSets => "patch_sets",
            Self::FilePatches => "file_patches",
            Self::PatchHunks => "patch_hunks",
            Self::CommandRequests => "command_requests",
            Self::CommandExecutions => "command_executions",
            Self::ValidationResults => "validation_results",
            Self::ModelPreferences => "model_preferences",
            Self::ModelCallAudit => "model_call_audit",
            Self::RunActivityEvents => "run_activity_events",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env::temp_dir;

    #[test]
    fn open_and_init_schema() {
        let path = temp_dir().join("adl-storage-test.db");
        let _ = std::fs::remove_file(&path);
        let db = Database::open(&path).unwrap();
        db.init_schema().unwrap();
        db.execute(
            "INSERT OR REPLACE INTO app_state (key, value) VALUES (?1, ?2)",
            &[&"test_key" as &dyn rusqlite::types::ToSql, &"test_value"],
        )
        .unwrap();
        let _ = std::fs::remove_file(&path);
    }
}
