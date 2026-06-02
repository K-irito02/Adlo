use adl_errors::AppError;
use adl_kernel::now_ms;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{params, OptionalExtension};
use serde::{de::DeserializeOwned, Serialize};
use std::path::Path;
use std::sync::OnceLock;
use tracing::info;

/// Child tables whose rows are scoped to a `workspace_id` foreign key column.
/// Listed in deletion order (children before parent) for the workspace purge
/// cascade. Although SQLite ignores FK order without `ON DELETE CASCADE`,
/// keeping the order explicit makes the operation predictable.
///
/// Note: The `Workspaces` table itself is **not** included. Its identity
/// column is `id` (not `workspace_id`), so [`delete_entities_by_workspace`]
/// — which queries `WHERE workspace_id = ?1` — cannot address it. Instead,
/// [`purge_workspace`] deletes the workspaces row in a separate step via
/// [`delete_workspace_on_conn`] (`WHERE id = ?1`).
const WORKSPACE_SCOPED_TABLES: &[EntityTable] = &[
    EntityTable::RetrievalSnapshots,
    EntityTable::Tasks,
    EntityTable::Approvals,
    EntityTable::AuditRecords,
    EntityTable::Checkpoints,
    EntityTable::ConversationMessages,
    EntityTable::AgentRuns,
    EntityTable::AgentSteps,
    EntityTable::ToolInvocations,
    EntityTable::PatchSets,
    EntityTable::FilePatches,
    EntityTable::PatchHunks,
    EntityTable::CommandRequests,
    EntityTable::CommandExecutions,
    EntityTable::ValidationResults,
    EntityTable::ModelPreferences,
    EntityTable::ModelCallAudit,
    EntityTable::RunActivityEvents,
];

/// Detailed report of a workspace purge, returned to the caller for
/// observability and testing.
#[derive(Debug, Default, Clone, serde::Serialize, serde::Deserialize)]
pub struct WorkspacePurgeReport {
    pub workspace_id: String,
    pub total_rows_deleted: usize,
    pub per_table: std::collections::BTreeMap<String, usize>,
    pub workspaces_row_deleted: bool,
    pub recent_workspaces_row_deleted: bool,
}

macro_rules! define_entity_table {
    ($( $(#[$attr:meta])* $variant:ident => $table_name:expr ),+ $(,)?) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq)]
        pub enum EntityTable {
            $( $(#[$attr])* $variant, )+
        }

        pub(crate) const TABLE_NAMES: &[&str] = &[$($table_name),+];
        pub(crate) const ENTITY_TABLE_COUNT: usize = TABLE_NAMES.len();

        impl EntityTable {
            pub(crate) fn table_name(self) -> &'static str {
                match self {
                    $( Self::$variant => $table_name, )+
                }
            }

            pub fn index(self) -> usize {
                self as usize
            }

            pub fn as_str(self) -> &'static str {
                self.table_name()
            }

            pub fn insert_sql(self) -> &'static str {
                get_insert_sql(self)
            }
        }
    };
}

#[derive(Clone)]
pub struct Database {
    pool: Pool<SqliteConnectionManager>,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, AppError> {
        std::fs::create_dir_all(path.parent().unwrap_or(Path::new(".")))?;

        let manager = SqliteConnectionManager::file(path);
        let pool = Pool::builder()
            .max_size(8)
            .build(manager)
            .map_err(|e| AppError::Storage(format!("Failed to create connection pool: {e}")))?;

        let conn = pool
            .get()
            .map_err(|e| AppError::Storage(format!("Failed to get initial connection: {e}")))?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| AppError::Storage(e.to_string()))?;

        info!(?path, "database pool opened (max_size=8)");
        Ok(Self { pool })
    }

    pub fn conn(&self) -> Result<r2d2::PooledConnection<SqliteConnectionManager>, AppError> {
        self.pool.get().map_err(|e| AppError::Storage(e.to_string()))
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
        let conn = self.conn()?;
        self.save_entity_on_conn(&conn, table, id, workspace_id, session_id, status, value)
    }

    pub fn save_entity_on_conn<T: Serialize>(
        &self,
        conn: &rusqlite::Connection,
        table: EntityTable,
        id: &str,
        workspace_id: Option<&str>,
        session_id: Option<&str>,
        status: Option<&str>,
        value: &T,
    ) -> Result<(), AppError> {
        let json = serde_json::to_string(value)?;
        let sql = get_insert_sql(table);
        conn.execute(
            sql,
            params![id, workspace_id, session_id, status, now_ms(), json],
        )
        .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(())
    }

    pub fn transaction<F, T>(&self, f: F) -> Result<T, AppError>
    where
        F: FnOnce(&rusqlite::Connection) -> Result<T, AppError>,
    {
        let conn = self.conn()?;
        conn.execute_batch("BEGIN TRANSACTION")
            .map_err(|e| AppError::Storage(e.to_string()))?;
        match f(&conn) {
            Ok(result) => {
                conn.execute_batch("COMMIT")
                    .map_err(|e| AppError::Storage(e.to_string()))?;
                Ok(result)
            }
            Err(e) => {
                let _ = conn.execute_batch("ROLLBACK");
                Err(e)
            }
        }
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
            assert!(limit <= 1000, "query limit {limit} exceeds safety cap");
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

    pub fn delete_entities_by_session(&self, table: EntityTable, session_id: &str) -> Result<usize, AppError> {
        let sql = format!("DELETE FROM {} WHERE session_id = ?1", table.table_name());
        let changed = self
            .conn()?
            .execute(&sql, params![session_id])
            .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(changed)
    }

    /// Delete all rows in `table` whose `workspace_id` column equals `workspace_id`.
    ///
    /// Returns the number of rows affected. Safe to call multiple times (idempotent).
    pub fn delete_entities_by_workspace(
        &self,
        table: EntityTable,
        workspace_id: &str,
    ) -> Result<usize, AppError> {
        let sql = format!("DELETE FROM {} WHERE workspace_id = ?1", table.table_name());
        let changed = self
            .conn()?
            .execute(&sql, params![workspace_id])
            .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(changed)
    }

    /// Delete all rows in `table` whose `workspace_id` column equals `workspace_id`,
    /// using the provided open connection (caller manages the transaction).
    pub fn delete_entities_by_workspace_on_conn(
        &self,
        conn: &rusqlite::Connection,
        table: EntityTable,
        workspace_id: &str,
    ) -> Result<usize, AppError> {
        let sql = format!("DELETE FROM {} WHERE workspace_id = ?1", table.table_name());
        let changed = conn
            .execute(&sql, params![workspace_id])
            .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(changed)
    }

    /// Delete a workspace row from the `workspaces` table by id, using the
    /// provided open connection (caller manages the transaction).
    pub fn delete_workspace_on_conn(
        &self,
        conn: &rusqlite::Connection,
        workspace_id: &str,
    ) -> Result<usize, AppError> {
        let changed = conn
            .execute("DELETE FROM workspaces WHERE id = ?1", params![workspace_id])
            .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(changed)
    }

    /// Delete the `recent_workspaces` row whose `root_path` equals `root_path`,
    /// using the provided open connection (caller manages the transaction).
    pub fn delete_recent_workspace_on_conn(
        &self,
        conn: &rusqlite::Connection,
        root_path: &str,
    ) -> Result<usize, AppError> {
        let changed = conn
            .execute(
                "DELETE FROM recent_workspaces WHERE root_path = ?1",
                params![root_path],
            )
            .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(changed)
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

    /// Purge all data associated with a workspace in a single transaction.
    ///
    /// Cascades deletion across all `WORKSPACE_SCOPED_TABLES` (child tables
    /// with a `workspace_id` column), then the `workspaces` row itself, and
    /// optionally the `recent_workspaces` row matching the workspace's root
    /// path. The whole operation is atomic: either all rows are deleted, or
    /// none (rollback on any error).
    ///
    /// The `workspaces` table is handled separately after the child cascade
    /// because its identity column is `id` (not `workspace_id`).
    ///
    /// `root_path` is the absolute path of the workspace on disk; if known,
    /// pass it via `WorkspaceMeta::root_path` to also drop the
    /// `recent_workspaces` row. If `None`, the workspaces row is deleted but
    /// the `recent_workspaces` entry is left for the caller to clean up
    /// (e.g., it may already be soft-deleted via the sidebar JSON).
    pub fn purge_workspace(
        &self,
        workspace_id: &str,
        root_path: Option<&str>,
    ) -> Result<WorkspacePurgeReport, AppError> {
        let mut report = WorkspacePurgeReport {
            workspace_id: workspace_id.to_string(),
            ..Default::default()
        };

        self.transaction(|conn| {
            for table in WORKSPACE_SCOPED_TABLES {
                let n = self.delete_entities_by_workspace_on_conn(conn, *table, workspace_id)?;
                if n > 0 {
                    report.per_table.insert(table.as_str().to_string(), n);
                    report.total_rows_deleted += n;
                }
            }

            let n = self.delete_workspace_on_conn(conn, workspace_id)?;
            report.workspaces_row_deleted = n > 0;
            if n > 0 {
                report.total_rows_deleted += n;
            }

            if let Some(root) = root_path {
                let n = self.delete_recent_workspace_on_conn(conn, root)?;
                report.recent_workspaces_row_deleted = n > 0;
                if n > 0 {
                    report.total_rows_deleted += n;
                }
            }

            Ok(report)
        })
    }
}

const INSERT_SQL_TEMPLATE: &str =
    "INSERT OR REPLACE INTO {table} (id, workspace_id, session_id, status, updated_at, json)\n\
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)";

define_entity_table! {
    Workspaces => "workspaces",
    Sessions => "sessions",
    RetrievalSnapshots => "retrieval_snapshots",
    Tasks => "tasks",
    Approvals => "approvals",
    AuditRecords => "audit_records",
    Checkpoints => "checkpoints",
    ConversationMessages => "conversation_messages",
    AgentRuns => "agent_runs",
    AgentSteps => "agent_steps",
    ToolInvocations => "tool_invocations",
    PatchSets => "patch_sets",
    FilePatches => "file_patches",
    PatchHunks => "patch_hunks",
    CommandRequests => "command_requests",
    CommandExecutions => "command_executions",
    ValidationResults => "validation_results",
    ModelPreferences => "model_preferences",
    ModelCallAudit => "model_call_audit",
    RunActivityEvents => "run_activity_events",
}

fn get_insert_sql(table: EntityTable) -> &'static str {
    static INSERT_SQLS: [OnceLock<String>; ENTITY_TABLE_COUNT] = [const { OnceLock::new() }; ENTITY_TABLE_COUNT];
    let idx = table.index();
    INSERT_SQLS[idx].get_or_init(|| {
        INSERT_SQL_TEMPLATE.replace("{table}", table.table_name())
    })
}

fn get_select_all_sql(table: EntityTable) -> &'static str {
    static SELECT_ALL_SQLS: [OnceLock<String>; ENTITY_TABLE_COUNT] = [const { OnceLock::new() }; ENTITY_TABLE_COUNT];
    let idx = table.index();
    SELECT_ALL_SQLS[idx].get_or_init(|| format!("SELECT json FROM {}", table.table_name()))
}

fn get_select_by_id_sql(table: EntityTable) -> &'static str {
    static SELECT_BY_ID_SQLS: [OnceLock<String>; ENTITY_TABLE_COUNT] = [const { OnceLock::new() }; ENTITY_TABLE_COUNT];
    let idx = table.index();
    SELECT_BY_ID_SQLS[idx].get_or_init(|| {
        format!("SELECT json FROM {} WHERE id = ?1", table.table_name())
    })
}

fn get_delete_by_id_sql(table: EntityTable) -> &'static str {
    static DELETE_BY_ID_SQLS: [OnceLock<String>; ENTITY_TABLE_COUNT] = [const { OnceLock::new() }; ENTITY_TABLE_COUNT];
    let idx = table.index();
    DELETE_BY_ID_SQLS[idx].get_or_init(|| {
        format!("DELETE FROM {} WHERE id = ?1", table.table_name())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env::temp_dir;

    fn temp_db(name: &str) -> Database {
        let path = temp_dir().join(format!("adl-storage-{name}.db"));
        let _ = std::fs::remove_file(&path);
        let db = Database::open(&path).unwrap();
        db.init_schema().unwrap();
        db
    }

    fn seed_workspace(db: &Database, id: &str, root: &str) {
        let json = serde_json::json!({"id": id, "root_path": root});
        let json_str = json.to_string();
        db.execute(
            "INSERT INTO workspaces (id, workspace_id, session_id, status, updated_at, json) VALUES (?1, ?2, NULL, NULL, ?3, ?4)",
            &[&id as &dyn rusqlite::types::ToSql, &id, &0i64, &json_str],
        )
        .unwrap();
        db.execute(
            "INSERT INTO recent_workspaces (root_path, name, last_opened, json) VALUES (?1, ?2, ?3, ?4)",
            &[&root as &dyn rusqlite::types::ToSql, &"ws-name", &"2026-06-02", &json_str],
        )
        .unwrap();
    }

    fn seed_workspace_child(db: &Database, table: &str, id: &str, ws_id: &str) {
        let sql = format!(
            "INSERT INTO {table} (id, workspace_id, session_id, status, updated_at, json) VALUES (?1, ?2, NULL, NULL, ?3, ?4)"
        );
        let json = format!("{{\"id\":\"{id}\",\"workspace_id\":\"{ws_id}\"}}");
        db.execute(
            &sql,
            &[&id as &dyn rusqlite::types::ToSql, &ws_id, &0i64, &json],
        )
        .unwrap();
    }

    fn count_rows(db: &Database, table: &str, ws_id: &str) -> i64 {
        let sql = format!("SELECT COUNT(*) FROM {table} WHERE workspace_id = ?1");
        db.conn()
            .unwrap()
            .query_row(&sql, rusqlite::params![ws_id], |r| r.get(0))
            .unwrap()
    }

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

    #[test]
    fn purge_workspace_cascades_all_child_tables() {
        let db = temp_db("purge-cascade");

        // Two workspaces: A (target), B (control)
        seed_workspace(&db, "ws-a", "/tmp/ws-a");
        seed_workspace(&db, "ws-b", "/tmp/ws-b");

        // Seed A with 1 row in each child table
        let child_tables = [
            "retrieval_snapshots", "tasks", "approvals", "audit_records",
            "checkpoints", "conversation_messages", "agent_runs", "agent_steps",
            "tool_invocations", "patch_sets", "file_patches", "patch_hunks",
            "command_requests", "command_executions", "validation_results",
            "model_preferences", "model_call_audit", "run_activity_events",
        ];
        for t in child_tables {
            seed_workspace_child(&db, t, &format!("a-{t}-1"), "ws-a");
        }

        // Seed B with 1 row in tasks (must NOT be deleted)
        seed_workspace_child(&db, "tasks", "b-task-1", "ws-b");

        // Sanity: A has 18 child rows, B has 1
        assert_eq!(count_rows(&db, "tasks", "ws-a"), 1);
        assert_eq!(count_rows(&db, "tasks", "ws-b"), 1);

        let report = db.purge_workspace("ws-a", Some("/tmp/ws-a")).unwrap();
        assert!(report.workspaces_row_deleted);
        assert!(report.recent_workspaces_row_deleted);
        assert_eq!(report.per_table.len(), 18, "all 18 child tables should be touched");
        assert_eq!(report.total_rows_deleted, 18 + 1 + 1);

        // A is gone everywhere
        assert_eq!(count_rows(&db, "tasks", "ws-a"), 0);
        assert_eq!(count_rows(&db, "agent_runs", "ws-a"), 0);
        // B is untouched
        assert_eq!(count_rows(&db, "tasks", "ws-b"), 1);

        let _ = std::fs::remove_file(temp_dir().join("adl-storage-purge-cascade.db"));
    }

    #[test]
    fn purge_workspace_is_idempotent() {
        let db = temp_db("purge-idempotent");
        seed_workspace(&db, "ws-x", "/tmp/ws-x");
        seed_workspace_child(&db, "tasks", "x-task-1", "ws-x");

        let r1 = db.purge_workspace("ws-x", Some("/tmp/ws-x")).unwrap();
        assert!(r1.workspaces_row_deleted);
        assert!(r1.per_table.contains_key("tasks"));

        let r2 = db.purge_workspace("ws-x", Some("/tmp/ws-x")).unwrap();
        assert!(!r2.workspaces_row_deleted);
        assert!(!r2.recent_workspaces_row_deleted);
        assert_eq!(r2.total_rows_deleted, 0);

        let _ = std::fs::remove_file(temp_dir().join("adl-storage-purge-idempotent.db"));
    }

    #[test]
    fn purge_workspace_without_root_path_keeps_recent_workspaces() {
        let db = temp_db("purge-no-root");
        seed_workspace(&db, "ws-y", "/tmp/ws-y");
        seed_workspace_child(&db, "tasks", "y-task-1", "ws-y");

        let r = db.purge_workspace("ws-y", None).unwrap();
        assert!(r.workspaces_row_deleted);
        assert!(!r.recent_workspaces_row_deleted);
        // recent_workspaces row must still exist
        let count: i64 = db
            .conn()
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM recent_workspaces WHERE root_path = ?1",
                rusqlite::params!["/tmp/ws-y"],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);

        let _ = std::fs::remove_file(temp_dir().join("adl-storage-purge-no-root.db"));
    }

    #[test]
    fn purge_workspace_with_no_data_is_a_no_op() {
        let db = temp_db("purge-empty");
        seed_workspace(&db, "ws-z", "/tmp/ws-z");

        let r = db.purge_workspace("ws-z", Some("/tmp/ws-z")).unwrap();
        assert!(r.workspaces_row_deleted);
        assert!(r.recent_workspaces_row_deleted);
        // No child rows seeded, so per_table is empty; total = workspaces row + recent_workspaces row.
        assert_eq!(r.per_table.len(), 0);
        assert_eq!(r.total_rows_deleted, 2);

        let _ = std::fs::remove_file(temp_dir().join("adl-storage-purge-empty.db"));
    }
}
