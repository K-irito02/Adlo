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

    pub fn conn(&self) -> Result<std::sync::MutexGuard<'_, Connection>, AppError> {
        self.conn.lock().map_err(|_| AppError::Internal("database mutex poisoned".to_string()))
    }

    pub fn execute(
        &self,
        sql: &str,
        params: &[&dyn rusqlite::types::ToSql],
    ) -> Result<usize, AppError> {
        self.conn()?
            .execute(sql, params)
            .map_err(|e| AppError::Storage(e.to_string()))
    }

    pub fn init_schema(&self) -> Result<(), AppError> {
        let conn = self.conn()?;
        conn.execute_batch(include_str!("../sql/init_schema.sql"))
            .map_err(|e| AppError::Storage(e.to_string()))?;
        let _ = conn.execute("ALTER TABLE recent_workspaces ADD COLUMN json TEXT", []);
        conn.execute_batch(include_str!("../sql/init_indexes.sql"))
            .map_err(|e| AppError::Storage(e.to_string()))?;
        info!("schema initialized");
        Ok(())
    }

    pub fn put_state(&self, key: &str, value: &str) -> Result<(), AppError> {
        self.conn()?
            .execute(
                "INSERT OR REPLACE INTO app_state (key, value) VALUES (?1, ?2)",
                params![key, value],
            )
            .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(())
    }

    pub fn get_state(&self, key: &str) -> Result<Option<String>, AppError> {
        self.conn()?
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
        let sql = table.insert_sql();
        self.conn()?
            .execute(
                sql,
                params![id, workspace_id, session_id, status, now_ms(), json],
            )
            .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(())
    }

    pub fn save_session_optimized(
        &self,
        id: &str,
        workspace_id: &str,
        value: &serde_json::Value,
    ) -> Result<(), AppError> {
        let title = value.get("title").and_then(|v| v.as_str()).unwrap_or("");
        let is_pinned = value.get("isPinned").and_then(|v| v.as_bool()).unwrap_or(false) as i32;
        let pinned_order = value.get("pinnedOrder").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        let unpinned_order = value.get("unpinnedOrder").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        let archived_at = value.get("archivedAt").and_then(|v| v.as_i64());
        let created_at = value.get("createdAt").and_then(|v| v.as_i64());
        let last_read_at = value.get("lastReadAt").and_then(|v| v.as_i64());
        let json = serde_json::to_string(value)?;

        self.conn()?
            .execute(
                "INSERT OR REPLACE INTO sessions
                 (id, workspace_id, session_id, status, updated_at, json,
                  title, is_pinned, pinned_order, unpinned_order, archived_at, created_at, last_read_at)
                 VALUES (?1, ?2, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    id,
                    workspace_id,
                    "active",
                    now_ms(),
                    json,
                    title,
                    is_pinned,
                    pinned_order,
                    unpinned_order,
                    archived_at,
                    created_at,
                    last_read_at
                ],
            )
            .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(())
    }

    pub fn list_sessions_by_pinned_order(
        &self,
        workspace_id: &str,
        include_archived: bool,
    ) -> Result<Vec<String>, AppError> {
        let conn = self.conn()?;
        let mut sql = String::from(
            "SELECT id FROM sessions WHERE workspace_id = ?1"
        );
        if !include_archived {
            sql.push_str(" AND archived_at IS NULL");
        }
        sql.push_str(" ORDER BY is_pinned DESC, pinned_order ASC, unpinned_order DESC");

        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| AppError::Storage(e.to_string()))?;
        let ids: Vec<String> = stmt
            .query_map(params![workspace_id], |row| row.get(0))
            .map_err(|e| AppError::Storage(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(ids)
    }

    pub fn load_entity<T: DeserializeOwned>(
        &self,
        table: EntityTable,
        id: &str,
    ) -> Result<Option<T>, AppError> {
        let table_name = table.as_str();
        let sql = format!("SELECT json FROM {table_name} WHERE id = ?1");
        let json: Option<String> = self
            .conn()?
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

        let conn = self.conn()?;
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
            .conn()?
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
        let conn = self.conn()?;
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
        let conn = self.conn()?;
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

    pub fn insert_sql(self) -> &'static str {
        match self {
            Self::Workspaces => "INSERT OR REPLACE INTO workspaces (id, workspace_id, session_id, status, updated_at, json)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            Self::Sessions => "INSERT OR REPLACE INTO sessions (id, workspace_id, session_id, status, updated_at, json)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            Self::RetrievalSnapshots => "INSERT OR REPLACE INTO retrieval_snapshots (id, workspace_id, session_id, status, updated_at, json)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            Self::Tasks => "INSERT OR REPLACE INTO tasks (id, workspace_id, session_id, status, updated_at, json)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            Self::Approvals => "INSERT OR REPLACE INTO approvals (id, workspace_id, session_id, status, updated_at, json)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            Self::AuditRecords => "INSERT OR REPLACE INTO audit_records (id, workspace_id, session_id, status, updated_at, json)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            Self::Checkpoints => "INSERT OR REPLACE INTO checkpoints (id, workspace_id, session_id, status, updated_at, json)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            Self::ConversationMessages => "INSERT OR REPLACE INTO conversation_messages (id, workspace_id, session_id, status, updated_at, json)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            Self::AgentRuns => "INSERT OR REPLACE INTO agent_runs (id, workspace_id, session_id, status, updated_at, json)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            Self::AgentSteps => "INSERT OR REPLACE INTO agent_steps (id, workspace_id, session_id, status, updated_at, json)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            Self::ToolInvocations => "INSERT OR REPLACE INTO tool_invocations (id, workspace_id, session_id, status, updated_at, json)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            Self::PatchSets => "INSERT OR REPLACE INTO patch_sets (id, workspace_id, session_id, status, updated_at, json)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            Self::FilePatches => "INSERT OR REPLACE INTO file_patches (id, workspace_id, session_id, status, updated_at, json)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            Self::PatchHunks => "INSERT OR REPLACE INTO patch_hunks (id, workspace_id, session_id, status, updated_at, json)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            Self::CommandRequests => "INSERT OR REPLACE INTO command_requests (id, workspace_id, session_id, status, updated_at, json)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            Self::CommandExecutions => "INSERT OR REPLACE INTO command_executions (id, workspace_id, session_id, status, updated_at, json)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            Self::ValidationResults => "INSERT OR REPLACE INTO validation_results (id, workspace_id, session_id, status, updated_at, json)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            Self::ModelPreferences => "INSERT OR REPLACE INTO model_preferences (id, workspace_id, session_id, status, updated_at, json)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            Self::ModelCallAudit => "INSERT OR REPLACE INTO model_call_audit (id, workspace_id, session_id, status, updated_at, json)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            Self::RunActivityEvents => "INSERT OR REPLACE INTO run_activity_events (id, workspace_id, session_id, status, updated_at, json)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
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
