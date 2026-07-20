use adl_errors::AppError;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{OptionalExtension, params};
use std::path::Path;
use tracing::info;

#[derive(Clone)]
pub struct Database {
    pool: Pool<SqliteConnectionManager>,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, AppError> {
        std::fs::create_dir_all(path.parent().unwrap_or(Path::new(".")))?;

        // Use with_init to apply PRAGMAs on EVERY new pooled connection.
        // PRAGMA foreign_keys is per-connection (not per-database), so
        // without with_init, only the initial connection would have it.
        let manager = SqliteConnectionManager::file(path)
            .with_init(|c| c.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;"));

        let pool = Pool::builder()
            .max_size(8)
            .connection_timeout(std::time::Duration::from_secs(5))
            .build(manager)
            .map_err(|e| AppError::Storage(format!("Failed to create connection pool: {e}")))?;

        info!(
            ?path,
            "database pool opened (max_size=8, timeout=5s, foreign_keys=ON per-connection)"
        );
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
        self.conn()?.execute(sql, params).map_err(|e| AppError::Storage(e.to_string()))
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
            .query_row("SELECT value FROM app_state WHERE key = ?1", params![key], |row| row.get(0))
            .optional()
            .map_err(|e| AppError::Storage(e.to_string()))
    }

    pub fn transaction<F, T>(&self, f: F) -> Result<T, AppError>
    where
        F: FnOnce(&rusqlite::Connection) -> Result<T, AppError>,
    {
        let conn = self.conn()?;
        conn.execute_batch("BEGIN TRANSACTION").map_err(|e| AppError::Storage(e.to_string()))?;
        match f(&conn) {
            Ok(result) => {
                conn.execute_batch("COMMIT").map_err(|e| AppError::Storage(e.to_string()))?;
                Ok(result)
            },
            Err(e) => {
                let _ = conn.execute_batch("ROLLBACK");
                Err(e)
            },
        }
    }
}

#[cfg(test)]
mod pool_pragma_tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static PP_SEQ: AtomicU64 = AtomicU64::new(0);

    fn open_test_db() -> Database {
        let id = PP_SEQ.fetch_add(1, Ordering::SeqCst);
        let path = std::env::temp_dir().join(format!("adl-pool-pragma-{id}.db"));
        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_file(format!("{}-wal", path.display()));
        let _ = std::fs::remove_file(format!("{}-shm", path.display()));
        let db = Database::open(&path).expect("test db should open");
        db.init_schema().expect("schema should init");
        db
    }

    /// Verifies that PRAGMA foreign_keys=ON is enforced on ALL pool
    /// connections, not just the initial one.
    ///
    /// Test design: hold conn1 (which creates the schema) while acquiring
    /// conn2. This forces r2d2 to create a NEW connection (because conn1
    /// is still borrowed). If `with_init` is NOT configured, conn2 will
    /// NOT have PRAGMA foreign_keys=ON, and the FK violation will succeed
    /// (test fails). If `with_init` IS configured, conn2 will have the
    /// PRAGMA, and the FK violation will fail (test passes).
    #[test]
    fn foreign_keys_enforced_on_all_pool_connections() {
        let db = open_test_db();

        // Hold conn1 to force r2d2 to create a NEW connection for conn2
        let conn1 = db.conn().expect("conn1 should be acquired");
        conn1
            .execute_batch(
                "CREATE TABLE parent (id INTEGER PRIMARY KEY);
                 CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));",
            )
            .expect("schema should be created");

        // Acquire conn2 — this is a NEW connection (conn1 is still held)
        // If with_init is NOT configured, this connection will NOT have
        // PRAGMA foreign_keys=ON
        let conn2 = db.conn().expect("conn2 should be acquired");
        let result = conn2.execute("INSERT INTO child (id, parent_id) VALUES (1, 999)", []);

        // This should FAIL (return Err) because foreign_keys=ON
        assert!(
            result.is_err(),
            "foreign key constraint should be enforced on all pool connections"
        );
    }

    /// Verifies that the pool has a connection_timeout configured.
    /// We can't easily test the actual timeout (would require 8+ concurrent
    /// requests + 5s wait), so we verify the pool can be created and used
    /// successfully (smoke test that the configuration doesn't break).
    #[test]
    fn pool_with_connection_timeout_works() {
        let db = open_test_db();
        let conn = db.conn().expect("conn should be acquired");
        // Verify basic operation works
        let _: i64 =
            conn.query_row("SELECT 1", [], |row| row.get(0)).expect("basic query should work");
    }
}
