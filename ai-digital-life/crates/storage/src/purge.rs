use adl_errors::AppError;
use adl_types::now_ms;
use rusqlite::params;

use crate::connection::Database;
use crate::entity_table::EntityTable;

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

impl Database {
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
            .execute("DELETE FROM recent_workspaces WHERE root_path = ?1", params![root_path])
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
        let mut report =
            WorkspacePurgeReport { workspace_id: workspace_id.to_string(), ..Default::default() };

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

            if let Some(root) = root_path {
                let n = conn
                    .execute("DELETE FROM git_vis_cache WHERE root_path = ?1", params![root])
                    .map_err(|e| AppError::Storage(e.to_string()))?;
                if n > 0 {
                    report.per_table.insert("git_vis_cache".to_string(), n);
                    report.total_rows_deleted += n;
                }
            }

            Ok(report)
        })
    }
}
