use adl_errors::AppError;
use adl_storage::Database;
use tracing::info;

pub struct Migration {
    pub version: i64,
    pub description: &'static str,
    pub sql: &'static str,
}

pub const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        description: "Initial schema",
        sql: "", // schema_version + recent_workspaces + app_state created by Database::init_schema
    },
    Migration {
        version: 2,
        description: "Add dedicated columns to sessions table for efficient querying",
        sql: r#"
            -- Add dedicated columns to sessions table for efficient querying
            ALTER TABLE sessions ADD COLUMN title TEXT;
            ALTER TABLE sessions ADD COLUMN is_pinned INTEGER DEFAULT 0;
            ALTER TABLE sessions ADD COLUMN pinned_order INTEGER DEFAULT 0;
            ALTER TABLE sessions ADD COLUMN unpinned_order INTEGER DEFAULT 0;
            ALTER TABLE sessions ADD COLUMN archived_at INTEGER;
            ALTER TABLE sessions ADD COLUMN created_at INTEGER;
            ALTER TABLE sessions ADD COLUMN last_read_at INTEGER;
            
            -- Extract data from existing JSON into dedicated columns
            UPDATE sessions SET
                title = json_extract(json, '$.title'),
                is_pinned = CASE WHEN json_extract(json, '$.isPinned') = 1 THEN 1 ELSE 0 END,
                pinned_order = COALESCE(json_extract(json, '$.pinnedOrder'), 0),
                unpinned_order = COALESCE(json_extract(json, '$.unpinnedOrder'), 0),
                archived_at = json_extract(json, '$.archivedAt'),
                created_at = json_extract(json, '$.createdAt'),
                last_read_at = json_extract(json, '$.lastReadAt');
            
            -- Add indexes for efficient session queries
            CREATE INDEX idx_sessions_pinned ON sessions(workspace_id, is_pinned, pinned_order);
            CREATE INDEX idx_sessions_unpinned ON sessions(workspace_id, is_pinned, unpinned_order DESC);
            CREATE INDEX idx_sessions_archived ON sessions(workspace_id, archived_at);
        "#,
    },
    Migration {
        version: 3,
        description: "Add durable_session_state table",
        sql: r#"
            CREATE TABLE IF NOT EXISTS durable_session_state (
                session_id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'running',
                checkpoint_message_id TEXT,
                last_heartbeat INTEGER NOT NULL,
                retry_count INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
        "#,
    },
    Migration {
        version: 4,
        description: "Add git_vis_cache table for visualization data caching",
        sql: r#"
            CREATE TABLE IF NOT EXISTS git_vis_cache (
                root_path TEXT NOT NULL,
                year INTEGER NOT NULL CHECK(year >= 1900 AND year <= 3000),
                chart_type TEXT NOT NULL,
                data TEXT NOT NULL,
                cached_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (root_path, year, chart_type)
            );
        "#,
    },
    Migration {
        version: 5,
        description: "Key git_vis_cache by exact date ranges",
        sql: r#"
            DROP TABLE IF EXISTS git_vis_cache;
            CREATE TABLE git_vis_cache (
                root_path TEXT NOT NULL,
                since TEXT NOT NULL DEFAULT '',
                until TEXT NOT NULL DEFAULT '',
                chart_type TEXT NOT NULL,
                data TEXT NOT NULL,
                cached_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (root_path, since, until, chart_type)
            );
        "#,
    },
    Migration {
        version: 6,
        description: "Create OpenCode-aligned message/part/event_log tables",
        sql: r#"
            CREATE TABLE IF NOT EXISTS message (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                parent_id TEXT,
                agent TEXT,
                model TEXT,
                summary TEXT,
                time_created INTEGER NOT NULL,
                time_completed INTEGER,
                data TEXT NOT NULL DEFAULT '{}'
            );
            CREATE INDEX IF NOT EXISTS idx_message_session_time
                ON message(session_id, time_created, id);

            CREATE TABLE IF NOT EXISTS part (
                id TEXT PRIMARY KEY,
                message_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                type TEXT NOT NULL,
                ordinal INTEGER NOT NULL,
                time_created INTEGER NOT NULL,
                data TEXT NOT NULL DEFAULT '{}'
            );
            CREATE INDEX IF NOT EXISTS idx_part_message_id
                ON part(message_id, id);
            CREATE INDEX IF NOT EXISTS idx_part_session
                ON part(session_id);

            CREATE TABLE IF NOT EXISTS event_log (
                seq INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                type TEXT NOT NULL,
                payload TEXT NOT NULL DEFAULT '{}',
                time_created INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_event_log_session
                ON event_log(session_id, seq);
        "#,
    },
    Migration {
        version: 7,
        description: "Add download_history table",
        sql: r#"
            CREATE TABLE IF NOT EXISTS download_history (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                file_name TEXT NOT NULL,
                file_path TEXT NOT NULL,
                total_bytes INTEGER,
                bytes_received INTEGER NOT NULL DEFAULT 0,
                mime_type TEXT,
                status TEXT NOT NULL DEFAULT 'in_progress',
                interrupt_reason TEXT,
                created_at INTEGER NOT NULL,
                completed_at INTEGER,
                source_tab_id TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_download_history_created ON download_history(created_at);
            CREATE INDEX IF NOT EXISTS idx_download_history_status ON download_history(status);
        "#,
    },
    Migration {
        version: 8,
        description: "Add resume support columns to download_history",
        sql: r#"
            ALTER TABLE download_history ADD COLUMN auto_resume_count INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE download_history ADD COLUMN etag TEXT;
            ALTER TABLE download_history ADD COLUMN last_modified TEXT;
        "#,
    },
    Migration {
        version: 9,
        description: "add terminal_output table for session persistence",
        sql: "CREATE TABLE IF NOT EXISTS terminal_output (
            session_id TEXT PRIMARY KEY,
            output     BLOB NOT NULL,
            updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );",
    },
];

pub fn current_version(db: &Database) -> Result<i64, AppError> {
    let conn = db.conn()?;
    let version: i64 = conn
        .query_row("SELECT COALESCE(MAX(version), 0) FROM schema_version", [], |r| r.get(0))
        .map_err(|e| AppError::Migration(e.to_string()))?;
    Ok(version)
}

pub fn run_pending(db: &Database) -> Result<(), AppError> {
    let current = current_version(db)?;
    for m in MIGRATIONS.iter().filter(|m| m.version > current) {
        if !m.sql.is_empty() {
            db.conn()?
                .execute_batch(m.sql)
                .map_err(|e| AppError::Migration(format!("v{}: {e}", m.version)))?;
        }
        db.execute(
            "INSERT INTO schema_version (version) VALUES (?1)",
            &[&m.version as &dyn rusqlite::types::ToSql],
        )?;
        info!(version = m.version, desc = m.description, "migration applied");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn current_version_returns_zero_when_no_migrations() {
        let path =
            std::env::temp_dir().join(format!("adl-migration-test-{}.db", uuid::Uuid::new_v4()));
        let _ = std::fs::remove_file(&path);
        let db = adl_storage::Database::open(&path).unwrap();
        db.init_schema().unwrap();
        let version = current_version(&db).unwrap();
        assert_eq!(version, 0);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn current_version_returns_max_applied_version() {
        let path =
            std::env::temp_dir().join(format!("adl-migration-test-{}.db", uuid::Uuid::new_v4()));
        let _ = std::fs::remove_file(&path);
        let db = adl_storage::Database::open(&path).unwrap();
        db.init_schema().unwrap();
        db.execute(
            "INSERT INTO schema_version (version) VALUES (?1)",
            &[&1 as &dyn rusqlite::types::ToSql],
        )
        .unwrap();
        db.execute(
            "INSERT INTO schema_version (version) VALUES (?1)",
            &[&2 as &dyn rusqlite::types::ToSql],
        )
        .unwrap();
        let version = current_version(&db).unwrap();
        assert_eq!(version, 2);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn run_pending_applies_pending_migrations() {
        let path =
            std::env::temp_dir().join(format!("adl-migration-test-{}.db", uuid::Uuid::new_v4()));
        let _ = std::fs::remove_file(&path);
        let db = adl_storage::Database::open(&path).unwrap();
        db.init_schema().unwrap();
        let result = run_pending(&db);
        assert!(result.is_ok());
        let version = current_version(&db).unwrap();
        assert_eq!(version, 9);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn run_pending_is_idempotent() {
        let path =
            std::env::temp_dir().join(format!("adl-migration-test-{}.db", uuid::Uuid::new_v4()));
        let _ = std::fs::remove_file(&path);
        let db = adl_storage::Database::open(&path).unwrap();
        db.init_schema().unwrap();
        run_pending(&db).unwrap();
        run_pending(&db).unwrap();
        let version = current_version(&db).unwrap();
        assert_eq!(version, 9);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn migration_records_have_correct_structure() {
        assert_eq!(MIGRATIONS.len(), 9);
        let m1 = &MIGRATIONS[0];
        assert_eq!(m1.version, 1);
        assert_eq!(m1.description, "Initial schema");
        let m2 = &MIGRATIONS[1];
        assert_eq!(m2.version, 2);
        assert_eq!(
            m2.description,
            "Add dedicated columns to sessions table for efficient querying"
        );
        let m3 = &MIGRATIONS[2];
        assert_eq!(m3.version, 3);
        assert_eq!(m3.description, "Add durable_session_state table");
        assert!(m3.sql.contains("durable_session_state"));
        let m4 = &MIGRATIONS[3];
        assert_eq!(m4.version, 4);
        assert_eq!(m4.description, "Add git_vis_cache table for visualization data caching");
        assert!(m4.sql.contains("git_vis_cache"));
        let m5 = &MIGRATIONS[4];
        assert_eq!(m5.version, 5);
        assert_eq!(m5.description, "Key git_vis_cache by exact date ranges");
        assert!(m5.sql.contains("since"));
        assert!(m5.sql.contains("until"));
        let m6 = &MIGRATIONS[5];
        assert_eq!(m6.version, 6);
        assert_eq!(m6.description, "Create OpenCode-aligned message/part/event_log tables");
        assert!(m6.sql.contains("CREATE TABLE IF NOT EXISTS message"));
        assert!(m6.sql.contains("CREATE TABLE IF NOT EXISTS part"));
        assert!(m6.sql.contains("CREATE TABLE IF NOT EXISTS event_log"));
        let m7 = &MIGRATIONS[6];
        assert_eq!(m7.version, 7);
        assert_eq!(m7.description, "Add download_history table");
        assert!(m7.sql.contains("CREATE TABLE IF NOT EXISTS download_history"));
    }

    #[test]
    fn v7_creates_download_history_table() {
        let path =
            std::env::temp_dir().join(format!("adl-migration-v7-{}.db", uuid::Uuid::new_v4()));
        let _ = std::fs::remove_file(&path);
        let db = adl_storage::Database::open(&path).unwrap();
        db.init_schema().unwrap();
        run_pending(&db).unwrap();
        let version = current_version(&db).unwrap();
        assert_eq!(version, 9);

        let conn = db.conn().unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='download_history'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1, "v7 should create download_history table");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn run_pending_v7_is_idempotent() {
        let path =
            std::env::temp_dir().join(format!("adl-migration-v7-idem-{}.db", uuid::Uuid::new_v4()));
        let _ = std::fs::remove_file(&path);
        let db = adl_storage::Database::open(&path).unwrap();
        db.init_schema().unwrap();
        run_pending(&db).unwrap();
        run_pending(&db).unwrap();
        let version = current_version(&db).unwrap();
        assert_eq!(version, 9);
        let _ = std::fs::remove_file(&path);
    }
}
