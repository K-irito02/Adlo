mod connection;
mod crud;
pub mod durable;
mod entity_table;
mod purge;
pub mod repository;
mod session;
pub mod session_repo_impl;

pub use connection::Database;
pub use entity_table::EntityTable;
pub use purge::WorkspacePurgeReport;

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
        db.execute(&sql, &[&id as &dyn rusqlite::types::ToSql, &ws_id, &0i64, &json]).unwrap();
    }

    fn count_rows(db: &Database, table: &str, ws_id: &str) -> i64 {
        let sql = format!("SELECT COUNT(*) FROM {table} WHERE workspace_id = ?1");
        db.conn().unwrap().query_row(&sql, rusqlite::params![ws_id], |r| r.get(0)).unwrap()
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
