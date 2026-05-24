use adl_errors::AppError;
use adl_kernel::now_ms;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{de::DeserializeOwned, Serialize};
use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};
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
        let sql = get_insert_sql(table);
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
        let sql = get_select_by_id_sql(table);
        let json: Option<String> = self
            .conn()?
            .query_row(sql, params![id], |row| row.get(0))
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
        let base_sql = get_select_all_sql(table);
        let mut sql = base_sql.to_string();
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
        let sql = get_delete_by_id_sql(table);
        let changed = self
            .conn()?
            .execute(sql, params![id])
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

const INSERT_SQL_TEMPLATE: &str =
    "INSERT OR REPLACE INTO {table} (id, workspace_id, session_id, status, updated_at, json)\n\
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)";

const TABLE_NAMES: [&str; 20] = [
    "workspaces",
    "sessions",
    "retrieval_snapshots",
    "tasks",
    "approvals",
    "audit_records",
    "checkpoints",
    "conversation_messages",
    "agent_runs",
    "agent_steps",
    "tool_invocations",
    "patch_sets",
    "file_patches",
    "patch_hunks",
    "command_requests",
    "command_executions",
    "validation_results",
    "model_preferences",
    "model_call_audit",
    "run_activity_events",
];

fn get_insert_sql(table: EntityTable) -> &'static str {
    static INSERT_SQLS: [OnceLock<String>; 20] = [const { OnceLock::new() }; 20];
    let idx = table.index();
    INSERT_SQLS[idx].get_or_init(|| {
        INSERT_SQL_TEMPLATE.replace("{table}", TABLE_NAMES[idx])
    })
}

fn get_select_all_sql(table: EntityTable) -> &'static str {
    static SELECT_ALL_SQLS: [OnceLock<String>; 20] = [const { OnceLock::new() }; 20];
    let idx = table.index();
    SELECT_ALL_SQLS[idx].get_or_init(|| format!("SELECT json FROM {}", TABLE_NAMES[idx]))
}

fn get_select_by_id_sql(table: EntityTable) -> &'static str {
    static SELECT_BY_ID_SQLS: [OnceLock<String>; 20] = [const { OnceLock::new() }; 20];
    let idx = table.index();
    SELECT_BY_ID_SQLS[idx].get_or_init(|| {
        format!("SELECT json FROM {} WHERE id = ?1", TABLE_NAMES[idx])
    })
}

fn get_delete_by_id_sql(table: EntityTable) -> &'static str {
    static DELETE_BY_ID_SQLS: [OnceLock<String>; 20] = [const { OnceLock::new() }; 20];
    let idx = table.index();
    DELETE_BY_ID_SQLS[idx].get_or_init(|| {
        format!("DELETE FROM {} WHERE id = ?1", TABLE_NAMES[idx])
    })
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
    pub fn index(&self) -> usize {
        match self {
            Self::Workspaces => 0,
            Self::Sessions => 1,
            Self::RetrievalSnapshots => 2,
            Self::Tasks => 3,
            Self::Approvals => 4,
            Self::AuditRecords => 5,
            Self::Checkpoints => 6,
            Self::ConversationMessages => 7,
            Self::AgentRuns => 8,
            Self::AgentSteps => 9,
            Self::ToolInvocations => 10,
            Self::PatchSets => 11,
            Self::FilePatches => 12,
            Self::PatchHunks => 13,
            Self::CommandRequests => 14,
            Self::CommandExecutions => 15,
            Self::ValidationResults => 16,
            Self::ModelPreferences => 17,
            Self::ModelCallAudit => 18,
            Self::RunActivityEvents => 19,
        }
    }

    pub fn as_str(self) -> &'static str {
        TABLE_NAMES[self.index()]
    }

    pub fn insert_sql(self) -> &'static str {
        get_insert_sql(self)
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
