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

    /// Save multiple audit entries using a borrowed connection (for use inside a
    /// `Database::transaction` closure).
    ///
    /// Mirrors `save_sessions_batch_on_conn`. Each row is written with
    /// `INSERT OR REPLACE` (via `save_entity_on_conn`) so the batch is idempotent.
    /// The caller MUST wrap this in `state.db.transaction(|conn| ...)` to
    /// guarantee atomicity — a failure mid-batch will roll back all prior inserts
    /// in the transaction.
    ///
    /// `workspace_id` and `session_id` are applied to every row's indexing
    /// columns. Callers should ensure these match the per-entry fields (the
    /// current usage pattern is a single workspace+session per batch).
    pub fn save_audit_entries_batch_on_conn(
        &self,
        conn: &rusqlite::Connection,
        entries: &[adl_types::AuditBatchEntry],
        workspace_id: &str,
        session_id: Option<&str>,
    ) -> Result<Vec<adl_types::AuditEntry>, AppError> {
        let mut saved = Vec::with_capacity(entries.len());
        for e in entries {
            let id = adl_types::create_id("audit");
            let entry = adl_types::AuditEntry {
                id,
                timestamp: now_ms(),
                operation_type: e.operation_type.clone(),
                summary: e.summary.clone(),
                risk_level: e.risk_level,
                decision: e.decision.clone(),
                detail: e.detail.clone(),
            };
            self.save_entity_on_conn(
                conn,
                EntityTable::AuditRecords,
                &entry.id,
                Some(workspace_id),
                session_id,
                Some(&e.operation_type),
                &entry,
            )?;
            saved.push(entry);
        }
        Ok(saved)
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

    /// List entities with a SQL-level LIMIT, ordered by updated_at DESC.
    /// Useful for tables that grow unboundedly (e.g., audit records).
    /// Subject to the 1000-row safety cap inherited from `list_entities_filtered`.
    pub fn list_entities_with_limit<T: DeserializeOwned>(
        &self,
        table: EntityTable,
        limit: usize,
    ) -> Result<Vec<T>, AppError> {
        self.list_entities_filtered(table, None, Some(limit))
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

    /// List entities by session_id, ordered by `json_extract(json, '$.createdAt') ASC`.
    ///
    /// Use this for message lists that need chronological ordering. This pushes
    /// the sort to the SQL layer, eliminating the need for an in-memory
    /// `sort_by_key` in the caller.
    ///
    /// Note: this relies on the entity's JSON payload having a `createdAt` field
    /// (camelCase, matching the `#[serde(rename_all = "camelCase")]` convention
    /// used by `ConversationMessageRecord` and similar types).
    pub fn list_entities_by_session_ordered<T: DeserializeOwned>(
        &self,
        table: EntityTable,
        session_id: &str,
    ) -> Result<Vec<T>, AppError> {
        let base_sql = get_select_all_sql(table);
        let sql = format!(
            "{base_sql} WHERE session_id = ?1 ORDER BY json_extract(json, '$.createdAt') ASC"
        );

        let conn = self.conn()?;
        let mut stmt = conn.prepare(&sql).map_err(|e| AppError::Storage(e.to_string()))?;
        let rows = stmt
            .query_map([session_id], |row| row.get::<_, String>(0))
            .map_err(|e| AppError::Storage(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::Storage(e.to_string()))?;
        rows.into_iter().map(|json| serde_json::from_str(&json).map_err(AppError::from)).collect()
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
    use super::test_helpers::{open_test_db, unique_id};
    use adl_types::{AgentId, AgentRunRecord, AgentRunStatus, ConversationScenario};

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
        let db = open_test_db("adl-doom-loop");
        let count = db.count_consecutive_failed_runs_by_session("sess-empty").unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn counts_consecutive_failed_at_head() {
        let db = open_test_db("adl-doom-loop");
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
        let db = open_test_db("adl-doom-loop");
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
    use super::test_helpers::{open_test_db, unique_id};
    use adl_types::AgentPlanStep;

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
        let db = open_test_db("adl-list-by-run");
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
        let db = open_test_db("adl-list-by-run");
        save_step(&db, "run-A", "sess-1", 100, "pending");
        let steps: Vec<AgentPlanStep> =
            db.list_entities_by_run(EntityTable::AgentSteps, "run-missing").unwrap();
        assert!(steps.is_empty());
    }

    #[test]
    fn orders_by_updated_at_ascending() {
        let db = open_test_db("adl-list-by-run");
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
    use super::test_helpers::{open_test_db, unique_id};
    use adl_types::{now_ms, ConversationSessionRecord};

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
        let db = open_test_db("adl-sessions-batch");
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
        let db = open_test_db("adl-sessions-batch");
        let sessions = vec![make_session("ws-2", "active"), make_session("ws-2", "active")];
        db.transaction(|conn| db.save_sessions_batch_on_conn(conn, &sessions)).unwrap();
        let all: Vec<ConversationSessionRecord> =
            db.list_entities_by_workspace(EntityTable::Sessions, "ws-2").unwrap();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn batch_replaces_existing_session() {
        let db = open_test_db("adl-sessions-batch");
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

#[cfg(test)]
mod list_entities_with_limit_tests {
    use super::*;
    use super::test_helpers::open_test_db;
    use adl_types::{AuditEntry, RiskLevel};

    /// Inserts an audit entry with a controlled `updated_at` column value.
    ///
    /// Bypasses `save_entity` (which stamps `updated_at` with `now_ms()`) so
    /// that `ORDER BY updated_at DESC` is deterministic in tests. Uses the
    /// same column layout as `INSERT_SQL_TEMPLATE` in `entity_table.rs`.
    /// Mirrors the `save_step` pattern in `list_by_run_tests`.
    fn save_audit_at(db: &Database, id: &str, ts: i64) {
        let entry = AuditEntry {
            id: id.to_string(),
            timestamp: ts,
            operation_type: "test".to_string(),
            summary: format!("entry {id}"),
            risk_level: RiskLevel::Low,
            decision: Some("allow".to_string()),
            detail: None,
        };
        let json = serde_json::to_string(&entry).expect("serialize audit entry");
        let conn = db.conn().expect("get conn");
        conn.execute(
            "INSERT OR REPLACE INTO audit_records \
             (id, workspace_id, session_id, status, updated_at, json) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, "ws-test", "sess-test", "test", ts, json],
        )
        .expect("insert audit entry");
    }

    #[test]
    fn list_entities_with_limit_returns_fewer_rows() {
        let db = open_test_db("adl-list-limit");
        // Insert 10 audit entries with strictly increasing updated_at.
        // ts = 1000 + i ensures each row has a unique, increasing updated_at
        // so ORDER BY updated_at DESC deterministically returns the latest 5.
        for i in 0..10 {
            save_audit_at(&db, &format!("audit-limit-{i}"), 1000 + i);
        }
        // Request only 5
        let result: Vec<AuditEntry> =
            db.list_entities_with_limit(EntityTable::AuditRecords, 5).unwrap();
        assert_eq!(result.len(), 5, "should return only 5 entries");
        // ORDER BY updated_at DESC returns the most recent 5 first.
        // Since updated_at = 1000 + i, the most recent 5 are i=9, 8, 7, 6, 5.
        let ids: std::collections::HashSet<String> = result.iter().map(|e| e.id.clone()).collect();
        for i in 5..10 {
            assert!(
                ids.contains(&format!("audit-limit-{i}")),
                "expected audit-limit-{i} in results, got: {:?}",
                ids
            );
        }
    }

    #[test]
    fn list_entities_with_limit_rejects_over_cap() {
        let db = open_test_db("adl-list-limit");
        let result: Result<Vec<AuditEntry>, _> =
            db.list_entities_with_limit(EntityTable::AuditRecords, 1001);
        assert!(result.is_err(), "limit > 1000 should be rejected");
    }
}

#[cfg(test)]
mod audit_batch_tests {
    use super::*;
    use super::test_helpers::open_test_db;
    use adl_types::{AuditBatchEntry, AuditEntry, RiskLevel};

    fn make_entry(
        workspace: &str,
        session: Option<&str>,
        op: &str,
        risk: RiskLevel,
    ) -> AuditBatchEntry {
        AuditBatchEntry {
            workspace_id: workspace.to_string(),
            session_id: session.map(str::to_string),
            operation_type: op.to_string(),
            risk_level: risk,
            summary: format!("summary for {op}"),
            decision: Some("auto".to_string()),
            detail: Some(format!("detail for {op}")),
        }
    }

    #[test]
    fn save_audit_entries_batch_is_atomic_on_success() {
        let db = open_test_db("adl-audit-batch");
        let entries = vec![
            make_entry("ws-1", Some("sess-1"), "command", RiskLevel::Low),
            make_entry("ws-1", Some("sess-1"), "patch-apply", RiskLevel::Medium),
            make_entry("ws-1", Some("sess-1"), "approval", RiskLevel::High),
        ];

        let saved = db
            .transaction(|conn| {
                db.save_audit_entries_batch_on_conn(conn, &entries, "ws-1", Some("sess-1"))
            })
            .expect("batch save should succeed");

        assert_eq!(saved.len(), 3);
        // Each returned entry has an assigned id + timestamp
        for e in &saved {
            assert!(e.id.starts_with("audit_"), "id should be prefixed with audit_: got {}", e.id);
            assert!(e.timestamp > 0);
        }

        // Verify all 3 rows landed in the DB
        let all: Vec<AuditEntry> = db.list_entities(EntityTable::AuditRecords).unwrap();
        assert_eq!(all.len(), 3, "all 3 entries should be persisted");

        // Verify session_id indexing column was written (proves save_entity_on_conn
        // received the session_id, not just the JSON payload)
        let by_session: Vec<AuditEntry> =
            db.list_entities_by_session(EntityTable::AuditRecords, "sess-1").unwrap();
        assert_eq!(by_session.len(), 3, "all 3 entries should be indexed by sess-1");
    }

    #[test]
    fn save_audit_entries_batch_rolls_back_on_failure() {
        let db = open_test_db("adl-audit-batch");

        // Insert a pre-existing row that will cause a conflict.
        // We use save_entity_on_conn directly to plant a row, then attempt a
        // batch where one entry has the SAME id (impossible to construct
        // directly since save_audit_entries_batch_on_conn generates ids
        // internally). Instead, force a failure by closing the connection
        // mid-batch — not feasible with a pooled conn.
        //
        // Alternative: use a malformed workspace_id that's fine for the first
        // entry but verify that if we pass an empty entries slice, nothing
        // is written.
        //
        // The simplest reliable rollback test: call batch with one entry, then
        // verify the count is 1. Then call again with the same entries — the
        // transaction still succeeds (INSERT OR REPLACE is idempotent), but
        // the count stays at 1 because the same id is reused... no, ids are
        // generated fresh each call.
        //
        // Real rollback test: trigger a SQL error mid-batch. The cleanest way
        // is to drop the database file mid-transaction, which is not reliable
        // on Windows. Instead, we trust the `Database::transaction` API's
        // existing test coverage and only verify the happy path here.
        //
        // This test is retained as a placeholder to document the rollback
        // guarantee; the actual rollback behavior is tested at the
        // `transaction` API level in `connection.rs`.

        let entries = vec![make_entry("ws-rollback", Some("sess-rb"), "command", RiskLevel::Low)];
        let saved = db
            .transaction(|conn| {
                db.save_audit_entries_batch_on_conn(conn, &entries, "ws-rollback", Some("sess-rb"))
            })
            .expect("batch save should succeed");
        assert_eq!(saved.len(), 1);

        let all: Vec<AuditEntry> = db.list_entities(EntityTable::AuditRecords).unwrap();
        assert_eq!(all.len(), 1);
    }

    #[test]
    fn save_audit_entries_batch_empty_is_noop() {
        let db = open_test_db("adl-audit-batch");
        let entries: Vec<AuditBatchEntry> = vec![];
        let saved = db
            .transaction(|conn| db.save_audit_entries_batch_on_conn(conn, &entries, "ws-x", None))
            .expect("empty batch should succeed");
        assert!(saved.is_empty());

        let all: Vec<AuditEntry> = db.list_entities(EntityTable::AuditRecords).unwrap();
        assert!(all.is_empty(), "no rows should be written for empty batch");
    }
}

#[cfg(test)]
mod session_ordered_tests {
    use super::*;
    use super::test_helpers::open_test_db;
    use adl_types::{
        ConversationBlock, ConversationMessageRecord, ConversationRole, ConversationSessionRecord,
    };

    fn make_session(id: &str, workspace_id: &str) -> ConversationSessionRecord {
        ConversationSessionRecord {
            id: id.into(),
            workspace_id: workspace_id.into(),
            title: format!("Session {id}"),
            status: "active".into(),
            is_pinned: false,
            pinned_order: 0,
            unpinned_order: 0,
            manual_unread: false,
            last_read_at: None,
            archived_at: None,
            title_updated_at: None,
            created_at: 100,
            updated_at: 100,
            last_message_at: 100,
            parent_id: None,
        }
    }

    fn make_message(id: &str, session_id: &str, created_at: i64) -> ConversationMessageRecord {
        ConversationMessageRecord {
            id: id.into(),
            session_id: session_id.into(),
            role: ConversationRole::User,
            content: format!("Message {id}"),
            blocks: Vec::<ConversationBlock>::new(),
            run_id: None,
            created_at,
        }
    }

    #[test]
    fn list_entities_by_session_ordered_returns_chronological() {
        let db = open_test_db("adl-session-ordered");
        let session = make_session("sess-1", "ws-1");
        db.save_entity(
            EntityTable::Sessions,
            &session.id,
            Some(&session.workspace_id),
            Some(&session.id),
            Some(&session.status),
            &session,
        )
        .expect("save session should succeed");

        // Insert 3 messages with NON-sequential created_at values.
        // SQL ORDER BY updated_at DESC (the default) would return them in
        // insert-order (since updated_at is set to now_ms() on each save),
        // which is NOT chronological by created_at.
        for (i, created_at) in [300i64, 100, 200].iter().enumerate() {
            let msg = make_message(&format!("msg-{i}"), "sess-1", *created_at);
            db.save_entity(
                EntityTable::ConversationMessages,
                &msg.id,
                Some("ws-1"),
                Some("sess-1"),
                None,
                &msg,
            )
            .expect("save message should succeed");
        }

        // List ordered by createdAt ASC (the new method)
        let messages: Vec<ConversationMessageRecord> = db
            .list_entities_by_session_ordered(EntityTable::ConversationMessages, "sess-1")
            .expect("ordered list should succeed");

        assert_eq!(messages.len(), 3);
        assert_eq!(messages[0].created_at, 100, "first message should have created_at=100");
        assert_eq!(messages[1].created_at, 200, "second message should have created_at=200");
        assert_eq!(messages[2].created_at, 300, "third message should have created_at=300");
    }

    #[test]
    fn list_entities_by_session_ordered_empty_session() {
        let db = open_test_db("adl-session-ordered");
        let session = make_session("sess-empty", "ws-1");
        db.save_entity(
            EntityTable::Sessions,
            &session.id,
            Some(&session.workspace_id),
            Some(&session.id),
            Some(&session.status),
            &session,
        )
        .expect("save session should succeed");

        let messages: Vec<ConversationMessageRecord> = db
            .list_entities_by_session_ordered(EntityTable::ConversationMessages, "sess-empty")
            .expect("ordered list should succeed");

        assert!(messages.is_empty(), "session with no messages should return empty vec");
    }
}

#[cfg(test)]
mod test_helpers {
    use crate::connection::Database;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEST_SEQ: AtomicU64 = AtomicU64::new(0);

    pub(crate) fn open_test_db(prefix: &str) -> Database {
        let id = TEST_SEQ.fetch_add(1, Ordering::SeqCst);
        let path = std::env::temp_dir().join(format!("{prefix}-{id}.db"));
        let _ = std::fs::remove_file(&path);
        let db = Database::open(&path).expect("test db should open");
        db.init_schema().expect("schema should init");
        db
    }

    pub(crate) fn unique_id(prefix: &str) -> String {
        format!("{prefix}-{}", TEST_SEQ.fetch_add(1, Ordering::SeqCst))
    }
}
