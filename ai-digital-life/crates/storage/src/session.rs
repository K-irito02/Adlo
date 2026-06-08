use adl_errors::AppError;
use adl_kernel::now_ms;
use rusqlite::params;

use crate::connection::Database;

impl Database {
    pub fn save_session_optimized(
        &self,
        id: &str,
        workspace_id: &str,
        value: &serde_json::Value,
    ) -> Result<(), AppError> {
        let title = value.get("title").and_then(|v| v.as_str()).unwrap_or("");
        let is_pinned = value.get("isPinned").and_then(|v| v.as_bool()).unwrap_or(false) as i32;
        let pinned_order = value.get("pinnedOrder").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        let unpinned_order =
            value.get("unpinnedOrder").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
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
        let mut sql = String::from("SELECT id FROM sessions WHERE workspace_id = ?1");
        if !include_archived {
            sql.push_str(" AND archived_at IS NULL");
        }
        sql.push_str(" ORDER BY is_pinned DESC, pinned_order ASC, unpinned_order DESC");

        let mut stmt = conn.prepare(&sql).map_err(|e| AppError::Storage(e.to_string()))?;
        let ids: Vec<String> = stmt
            .query_map(params![workspace_id], |row| row.get(0))
            .map_err(|e| AppError::Storage(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(ids)
    }
}
