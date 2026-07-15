use adl_errors::AppError;
use adl_types::{now_ms, ConversationSessionRecord};
use rusqlite::{params, OptionalExtension};
use serde::{de::DeserializeOwned, Serialize};

use crate::connection::Database;
use crate::entity_table::{
    get_delete_by_id_sql, get_insert_sql, get_select_all_sql, get_select_by_id_sql, EntityTable,
};

impl Database {
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
        conn.execute(sql, params![id, workspace_id, session_id, status, now_ms(), json])
            .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(())
    }

    /// Bulk-saves a slice of `ConversationSessionRecord` using a single
    /// borrowed connection (typically inside a `transaction` closure).
    ///
    /// Each row is written with `INSERT OR REPLACE` (via `save_entity_on_conn`)
    /// so the batch is idempotent. The caller is responsible for wrapping the
    /// call in `state.db.transaction(|conn| ...)` to guarantee atomicity.
    ///
    /// Used by `conversation_archive_all_in_workspace` and
    /// `conversation_reorder_sessions` to replace the previous pattern of
    /// N independent `save_session` calls (each acquiring its own connection
    /// and starting its own implicit transaction).
    pub fn save_sessions_batch_on_conn(
        &self,
        conn: &rusqlite::Connection,
        sessions: &[ConversationSessionRecord],
    ) -> Result<(), AppError> {
        for session in sessions {
            self.save_entity_on_conn(
                conn,
                EntityTable::Sessions,
                &session.id,
                Some(&session.workspace_id),
                Some(&session.id),
                Some(&session.status),
                session,
            )?;
        }
        Ok(())
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
        json.map(|value| serde_json::from_str(&value).map_err(AppError::from)).transpose()
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

    /// Lists entities whose JSON payload contains `"runId": <run_id>`.
    ///
    /// Used by `load_run_detail` to fetch `AgentPlanStep` rows for a single
    /// run without scanning the whole `agent_steps` table. The `runId` field
    /// is the camelCase serialization of `AgentPlanStep.run_id` (serde
    /// `rename_all = "camelCase"`).
    ///
    /// Order is `updated_at ASC` so callers see steps in chronological order
    /// (matches the previous `steps.sort_by_key(|s| s.created_at)` behavior;
    /// `updated_at` ASC is a close proxy and avoids an extra in-memory sort).
    ///
    /// Other entities that happen to carry a `runId` field (e.g.
    /// `RunActivityEvents` serialized form) can also be queried this way.
    pub fn list_entities_by_run<T: DeserializeOwned>(
        &self,
        table: EntityTable,
        run_id: &str,
    ) -> Result<Vec<T>, AppError> {
        let sql = format!(
            "SELECT json FROM {} WHERE json_extract(json, '$.runId') = ?1 \
             ORDER BY updated_at ASC",
            table.table_name()
        );
        let conn = self.conn()?;
        let mut stmt = conn.prepare(&sql).map_err(|e| AppError::Storage(e.to_string()))?;
        let rows: Vec<String> = stmt
            .query_map(params![run_id], |row| row.get::<_, String>(0))
            .map_err(|e| AppError::Storage(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::Storage(e.to_string()))?;
        rows.into_iter().map(|json| serde_json::from_str(&json).map_err(AppError::from)).collect()
    }

    /// Counts consecutive failed runs for a session, scanning the most recent
    /// runs in `updated_at DESC` order. Stops at the first non-`"failed"` row.
    ///
    /// Caps the scan at 20 rows for safety (a doom loop > 20 is irrelevant —
    /// the guard triggers at 3). Returns `0` if the session has no runs or the
    /// most recent run is not failed.
    ///
    /// Backs `DoomLoopState` for the patch generator's permission check.
    pub fn count_consecutive_failed_runs_by_session(
        &self,
        session_id: &str,
    ) -> Result<u32, AppError> {
        let sql = "SELECT status FROM agent_runs \
                   WHERE session_id = ?1 \
                   ORDER BY updated_at DESC \
                   LIMIT 20";
        let conn = self.conn()?;
        let mut stmt = conn.prepare(sql).map_err(|e| AppError::Storage(e.to_string()))?;
        let statuses: Vec<String> = stmt
            .query_map(params![session_id], |row| row.get::<_, String>(0))
            .map_err(|e| AppError::Storage(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::Storage(e.to_string()))?;
        let failed = "failed";
        let count = statuses.iter().take_while(|s| s.as_str() == failed).count() as u32;
        Ok(count)
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
            if limit > 1000 {
                return Err(AppError::InvalidInput(format!(
                    "query limit {limit} exceeds safety cap"
                )));
            }
            sql.push_str(&format!(" LIMIT {limit}"));
        }

        let conn = self.conn()?;
        let mut stmt = conn.prepare(&sql).map_err(|e| AppError::Storage(e.to_string()))?;
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
        rows.into_iter().map(|json| serde_json::from_str(&json).map_err(AppError::from)).collect()
    }

    pub fn delete_entity(&self, table: EntityTable, id: &str) -> Result<bool, AppError> {
        let sql = get_delete_by_id_sql(table);
        let changed =
            self.conn()?.execute(sql, params![id]).map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(changed > 0)
    }

    pub fn delete_entities_by_session(
        &self,
        table: EntityTable,
        session_id: &str,
    ) -> Result<usize, AppError> {
        let sql = format!("DELETE FROM {} WHERE session_id = ?1", table.table_name());
        let changed = self
            .conn()?
            .execute(&sql, params![session_id])
            .map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(changed)
    }

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
}

#[cfg(test)]
mod doom_loop_count_tests {
    use super::*;
    use crate::connection::Database;
    use adl_types::{AgentId, AgentRunRecord, AgentRunStatus, ConversationScenario};
    use std::sync::atomic::{AtomicU64, Ordering};

    static SEQ: AtomicU64 = AtomicU64::new(0);

    fn unique_id(prefix: &str) -> String {
        format!("{prefix}-{}", SEQ.fetch_add(1, Ordering::SeqCst))
    }

    /// Opens a temp-file database with schema initialized.
    ///
    /// Uses `Database::open` + `init_schema` (the existing test pattern) rather
    /// than `Database::from_connection`, which is not part of the public API.
    /// Each call uses a unique file name via `SEQ` so parallel test runs don't
    /// collide.
    fn open_test_db() -> Database {
        let id = SEQ.fetch_add(1, Ordering::SeqCst);
        let path = std::env::temp_dir().join(format!("adl-doom-loop-{id}.db"));
        let _ = std::fs::remove_file(&path);
        let db = Database::open(&path).expect("test db should open");
        db.init_schema().expect("schema should init");
        db
    }

    fn save_run(db: &Database, session_id: &str, status: AgentRunStatus, ts: i64) {
        let run = AgentRunRecord {
            id: unique_id("run"),
            workspace_id: "ws-test".into(),
            session_id: session_id.into(),
            prompt: "test".into(),
            scenario: ConversationScenario::Chat,
            status,
            summary: None,
            patch_set_id: None,
            created_at: ts,
            updated_at: ts,
            completed_at: Some(ts),
            agent_id: AgentId::Build,
        };
        let status_str = run.status.as_status_str();
        db.save_entity(
            EntityTable::AgentRuns,
            &run.id,
            Some(&run.workspace_id),
            Some(&run.session_id),
            Some(status_str),
            &run,
        )
        .expect("save_entity should succeed");
    }

    #[test]
    fn returns_zero_when_no_runs() {
        let db = open_test_db();
        let count = db.count_consecutive_failed_runs_by_session("sess-empty").unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn counts_consecutive_failed_at_head() {
        let db = open_test_db();
        let sid = "sess-fail-3";
        save_run(&db, sid, AgentRunStatus::Succeeded, 100);
        save_run(&db, sid, AgentRunStatus::Failed, 200);
        save_run(&db, sid, AgentRunStatus::Failed, 300);
        save_run(&db, sid, AgentRunStatus::Failed, 400);
        let count = db.count_consecutive_failed_runs_by_session(sid).unwrap();
        assert_eq!(count, 3);
    }

    #[test]
    fn stops_at_first_non_failed() {
        let db = open_test_db();
        let sid = "sess-mixed";
        save_run(&db, sid, AgentRunStatus::Failed, 100);
        save_run(&db, sid, AgentRunStatus::Succeeded, 200);
        save_run(&db, sid, AgentRunStatus::Failed, 300);
        let count = db.count_consecutive_failed_runs_by_session(sid).unwrap();
        assert_eq!(count, 1);
    }
}

#[cfg(test)]
mod list_by_run_tests {
    use super::*;
    use crate::connection::Database;
    use adl_types::AgentPlanStep;
    use std::sync::atomic::{AtomicU64, Ordering};

    static RUN_SEQ: AtomicU64 = AtomicU64::new(0);

    fn unique_id(prefix: &str) -> String {
        format!("{prefix}-{}", RUN_SEQ.fetch_add(1, Ordering::SeqCst))
    }

    /// Opens a temp-file database with schema initialized.
    ///
    /// Uses `Database::open` + `init_schema` (the existing test pattern) rather
    /// than `Database::from_connection`, which is not part of the public API.
    /// Each call uses a unique file name via `RUN_SEQ` so parallel test runs
    /// don't collide.
    fn open_test_db() -> Database {
        let id = RUN_SEQ.fetch_add(1, Ordering::SeqCst);
        let path = std::env::temp_dir().join(format!("adl-list-by-run-{id}.db"));
        let _ = std::fs::remove_file(&path);
        let db = Database::open(&path).expect("test db should open");
        db.init_schema().expect("schema should init");
        db
    }

    fn save_step(db: &Database, run_id: &str, session_id: &str, ts: i64, status: &str) {
        let step = AgentPlanStep {
            id: unique_id("step"),
            run_id: run_id.to_string(),
            title: format!("step-{ts}"),
            detail: None,
            status: status.to_string(),
            created_at: ts,
            updated_at: ts,
        };
        let json = serde_json::to_string(&step).expect("serialize step");
        // Bypass `save_entity` (which stamps the SQL `updated_at` column with
        // `now_ms()`) so the column equals `ts` and `ORDER BY updated_at ASC`
        // is deterministic in tests. Uses the same column layout as
        // `INSERT_SQL_TEMPLATE` in `entity_table.rs`.
        let conn = db.conn().expect("get conn");
        conn.execute(
            "INSERT OR REPLACE INTO agent_steps \
             (id, workspace_id, session_id, status, updated_at, json) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![&step.id, "ws-test", session_id, status, ts, json],
        )
        .expect("insert step");
    }

    #[test]
    fn returns_only_steps_matching_run_id() {
        let db = open_test_db();
        save_step(&db, "run-A", "sess-1", 100, "pending");
        save_step(&db, "run-A", "sess-1", 200, "pending");
        save_step(&db, "run-B", "sess-1", 150, "pending");
        let steps: Vec<AgentPlanStep> =
            db.list_entities_by_run(EntityTable::AgentSteps, "run-A").unwrap();
        assert_eq!(steps.len(), 2, "expected 2 steps for run-A, got {}", steps.len());
        assert!(steps.iter().all(|s| s.run_id == "run-A"));
    }

    #[test]
    fn returns_empty_for_unknown_run_id() {
        let db = open_test_db();
        save_step(&db, "run-A", "sess-1", 100, "pending");
        let steps: Vec<AgentPlanStep> =
            db.list_entities_by_run(EntityTable::AgentSteps, "run-missing").unwrap();
        assert!(steps.is_empty());
    }

    #[test]
    fn orders_by_updated_at_ascending() {
        let db = open_test_db();
        save_step(&db, "run-X", "sess-1", 300, "pending");
        save_step(&db, "run-X", "sess-1", 100, "pending");
        save_step(&db, "run-X", "sess-1", 200, "pending");
        let steps: Vec<AgentPlanStep> =
            db.list_entities_by_run(EntityTable::AgentSteps, "run-X").unwrap();
        let timestamps: Vec<i64> = steps.iter().map(|s| s.updated_at).collect();
        assert_eq!(timestamps, vec![100, 200, 300]);
    }
}

#[cfg(test)]
mod sessions_batch_tests {
    use super::*;
    use crate::connection::Database;
    use adl_types::{now_ms, ConversationSessionRecord};
    use std::sync::atomic::{AtomicU64, Ordering};

    static SB_SEQ: AtomicU64 = AtomicU64::new(0);

    fn unique_id(prefix: &str) -> String {
        format!("{prefix}-{}", SB_SEQ.fetch_add(1, Ordering::SeqCst))
    }

    /// Opens a temp-file database with schema initialized.
    ///
    /// Uses `Database::open` + `init_schema` (the existing test pattern) rather
    /// than `Database::from_connection`, which is not part of the public API.
    /// Each call uses a unique file name via `SB_SEQ` so parallel test runs
    /// don't collide.
    fn open_test_db() -> Database {
        let id = SB_SEQ.fetch_add(1, Ordering::SeqCst);
        let path = std::env::temp_dir().join(format!("adl-sessions-batch-{id}.db"));
        let _ = std::fs::remove_file(&path);
        let db = Database::open(&path).expect("test db should open");
        db.init_schema().expect("schema should init");
        db
    }

    fn make_session(workspace_id: &str, status: &str) -> ConversationSessionRecord {
        let ts = now_ms();
        ConversationSessionRecord {
            id: unique_id("sess"),
            workspace_id: workspace_id.to_string(),
            title: "title".into(),
            status: status.to_string(),
            is_pinned: false,
            pinned_order: 0,
            unpinned_order: 0,
            manual_unread: false,
            last_read_at: None,
            archived_at: None,
            title_updated_at: None,
            created_at: ts,
            updated_at: ts,
            last_message_at: ts,
            parent_id: None,
        }
    }

    #[test]
    fn batch_writes_all_sessions_atomically() {
        let db = open_test_db();
        let sessions = vec![
            make_session("ws-1", "active"),
            make_session("ws-1", "active"),
            make_session("ws-1", "active"),
        ];
        let ids: Vec<String> = sessions.iter().map(|s| s.id.clone()).collect();

        db.transaction(|conn| db.save_sessions_batch_on_conn(conn, &sessions)).unwrap();

        for id in &ids {
            let loaded: Option<ConversationSessionRecord> =
                db.load_entity(EntityTable::Sessions, id).unwrap();
            assert!(loaded.is_some(), "session {id} should exist after batch save");
        }
    }

    #[test]
    fn batch_rolls_back_on_failure() {
        let db = open_test_db();
        let sessions = vec![make_session("ws-2", "active"), make_session("ws-2", "active")];
        db.transaction(|conn| db.save_sessions_batch_on_conn(conn, &sessions)).unwrap();
        let all: Vec<ConversationSessionRecord> =
            db.list_entities_by_workspace(EntityTable::Sessions, "ws-2").unwrap();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn batch_replaces_existing_session() {
        let db = open_test_db();
        let mut session = make_session("ws-3", "active");
        db.save_entity(
            EntityTable::Sessions,
            &session.id,
            Some(&session.workspace_id),
            Some(&session.id),
            Some(&session.status),
            &session,
        )
        .unwrap();

        session.status = "archived".into();
        session.updated_at = now_ms();
        db.transaction(|conn| db.save_sessions_batch_on_conn(conn, std::slice::from_ref(&session)))
            .unwrap();

        let loaded: ConversationSessionRecord =
            db.load_entity(EntityTable::Sessions, &session.id).unwrap().unwrap();
        assert_eq!(loaded.status, "archived");
    }
}
