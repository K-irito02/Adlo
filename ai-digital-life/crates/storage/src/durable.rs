use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DurableSessionState {
    pub session_id: String,
    pub run_id: String,
    pub status: DurableStatus,
    pub checkpoint_message_id: Option<String>,
    pub last_heartbeat: i64,
    pub retry_count: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DurableStatus {
    Running,
    Paused,
    Completed,
    Failed,
    Recovering,
}

#[derive(Clone)]
pub struct DurableSessionManager {
    pub(crate) db: crate::Database,
    max_retries: u32,
    heartbeat_timeout_ms: u64,
}

impl std::fmt::Debug for DurableSessionManager {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DurableSessionManager")
            .field("max_retries", &self.max_retries)
            .field("heartbeat_timeout_ms", &self.heartbeat_timeout_ms)
            .finish()
    }
}

impl DurableSessionManager {
    pub fn new(db: crate::Database) -> Self {
        Self { db, max_retries: 3, heartbeat_timeout_ms: 30_000 }
    }

    pub async fn register_session(
        &self,
        session_id: &str,
        run_id: &str,
    ) -> Result<(), adl_errors::AppError> {
        let now = adl_kernel::now_ms();
        self.db
            .execute(
                "INSERT OR REPLACE INTO durable_session_state
                 (session_id, run_id, status, last_heartbeat, retry_count, created_at, updated_at)
                 VALUES (?1, ?2, 'running', ?3, 0, ?3, ?3)",
                &[&session_id, &run_id, &now],
            )
            .map_err(|e| {
                adl_errors::AppError::Storage(format!(
                    "Failed to register durable session '{session_id}': {e}"
                ))
            })?;
        Ok(())
    }

    pub async fn heartbeat(&self, session_id: &str) {
        let now = adl_kernel::now_ms();
        if let Err(e) = self.db.execute(
            "UPDATE durable_session_state SET last_heartbeat = ?1, updated_at = ?1 WHERE session_id = ?2",
            &[&now, &session_id],
        ) {
            tracing::warn!(
                session_id = %session_id,
                error = %e,
                "Failed to update heartbeat"
            );
        }
    }

    pub async fn checkpoint(&self, session_id: &str, message_id: &str) {
        let now = adl_kernel::now_ms();
        if let Err(e) = self.db.execute(
            "UPDATE durable_session_state SET checkpoint_message_id = ?1, updated_at = ?2 WHERE session_id = ?3",
            &[&message_id, &now, &session_id],
        ) {
            tracing::warn!(
                session_id = %session_id,
                message_id = %message_id,
                error = %e,
                "Failed to update checkpoint"
            );
        }
    }

    pub async fn complete(&self, session_id: &str) {
        let now = adl_kernel::now_ms();
        if let Err(e) = self.db.execute(
            "UPDATE durable_session_state SET status = 'completed', updated_at = ?1 WHERE session_id = ?2",
            &[&now, &session_id],
        ) {
            tracing::warn!(
                session_id = %session_id,
                error = %e,
                "Failed to mark session as completed"
            );
        }
    }

    pub async fn fail(&self, session_id: &str) {
        let now = adl_kernel::now_ms();
        if let Err(e) = self.db.execute(
            "UPDATE durable_session_state SET status = 'failed', updated_at = ?1 WHERE session_id = ?2",
            &[&now, &session_id],
        ) {
            tracing::warn!(
                session_id = %session_id,
                error = %e,
                "Failed to mark session as failed"
            );
        }
    }

    pub async fn find_crashed_sessions(&self) -> Vec<DurableSessionState> {
        let now = adl_kernel::now_ms();
        let timeout = now - self.heartbeat_timeout_ms as i64;
        let conn = match self.db.conn() {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!(
                    error = %e,
                    "Failed to get DB connection for crashed session scan"
                );
                return vec![];
            },
        };
        let mut stmt = match conn.prepare(
            "SELECT session_id, run_id, status, checkpoint_message_id, last_heartbeat, retry_count
             FROM durable_session_state
             WHERE status = 'running' AND last_heartbeat < ?1 AND retry_count < ?2",
        ) {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!(
                    error = %e,
                    "Failed to prepare crashed session query"
                );
                return vec![];
            },
        };
        let rows = stmt.query_map(params![timeout, self.max_retries], |row| {
            let _status: String = row.get(2)?;
            debug_assert_eq!(_status, "running", "SQL WHERE clause guarantees status='running'");
            Ok(DurableSessionState {
                session_id: row.get(0)?,
                run_id: row.get(1)?,
                status: DurableStatus::Running,
                checkpoint_message_id: row.get(3)?,
                last_heartbeat: row.get(4)?,
                retry_count: row.get(5)?,
            })
        });
        match rows {
            Ok(r) => r.filter_map(|r| r.ok()).collect(),
            Err(e) => {
                tracing::warn!(
                    error = %e,
                    "Failed to iterate crashed session rows"
                );
                vec![]
            },
        }
    }

    pub async fn start_recovery(&self, session_id: &str) -> bool {
        let now = adl_kernel::now_ms();
        let conn = match self.db.conn() {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!(
                    session_id = %session_id,
                    error = %e,
                    "Failed to get DB connection for session recovery"
                );
                return false;
            },
        };
        let current_retries: Option<u32> = conn
            .query_row(
                "SELECT retry_count FROM durable_session_state WHERE session_id = ?1",
                params![session_id],
                |row| row.get(0),
            )
            .ok();
        match current_retries {
            Some(retries) if retries < self.max_retries => {
                if let Err(e) = self.db.execute(
                    "UPDATE durable_session_state SET status = 'recovering', retry_count = retry_count + 1, updated_at = ?1 WHERE session_id = ?2",
                    &[&now, &session_id],
                ) {
                    tracing::warn!(
                        session_id = %session_id,
                        error = %e,
                        "Failed to set session status to recovering"
                    );
                    return false;
                }
                true
            },
            Some(_) => {
                if let Err(e) = self.db.execute(
                    "UPDATE durable_session_state SET status = 'failed', updated_at = ?1 WHERE session_id = ?2",
                    &[&now, &session_id],
                ) {
                    tracing::warn!(
                        session_id = %session_id,
                        error = %e,
                        "Failed to mark session as failed after max retries"
                    );
                }
                false
            },
            None => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_manager() -> DurableSessionManager {
        static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let unique = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path =
            std::env::temp_dir().join(format!("test_durable_{}_{}.db", std::process::id(), unique));
        let _ = std::fs::remove_file(&path);
        let db = crate::Database::open(&path).expect("test db should open");
        db.init_schema().expect("test schema should initialize");
        DurableSessionManager::new(db)
    }

    #[tokio::test]
    async fn register_and_complete_session() {
        let manager = create_test_manager();
        manager.register_session("sess1", "run1").await.unwrap();
        manager.complete("sess1").await;
        let conn = manager.db.conn().expect("test db should provide connection");
        let status: String = conn
            .query_row(
                "SELECT status FROM durable_session_state WHERE session_id = ?1",
                params!["sess1"],
                |row| row.get(0),
            )
            .expect("status query should succeed");
        assert_eq!(status, "completed", "session status should be completed");
        let crashed = manager.find_crashed_sessions().await;
        assert!(crashed.is_empty(), "completed sessions should not be crashed");
    }

    #[tokio::test]
    async fn heartbeat_updates_timestamp() {
        let manager = create_test_manager();
        manager.register_session("sess1", "run1").await.unwrap();
        let before = adl_kernel::now_ms();
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        manager.heartbeat("sess1").await;
        let conn = manager.db.conn().expect("test db should provide connection");
        let last_heartbeat: i64 = conn
            .query_row(
                "SELECT last_heartbeat FROM durable_session_state WHERE session_id = ?1",
                params!["sess1"],
                |row| row.get(0),
            )
            .expect("heartbeat query should succeed");
        assert!(last_heartbeat > before, "heartbeat should update timestamp");
    }

    #[tokio::test]
    async fn find_crashed_sessions() {
        let manager = create_test_manager();
        manager.register_session("crashed", "run1").await.unwrap();
        let old_time = adl_kernel::now_ms() - 60_000;
        let _ = manager.db.execute(
            "UPDATE durable_session_state SET last_heartbeat = ?1 WHERE session_id = ?2",
            &[&old_time, &"crashed"],
        );
        let crashed = manager.find_crashed_sessions().await;
        assert_eq!(crashed.len(), 1);
        assert_eq!(crashed[0].session_id, "crashed");
    }

    #[tokio::test]
    async fn start_recovery_increments_retry() {
        let manager = create_test_manager();
        manager.register_session("sess1", "run1").await.unwrap();
        assert!(manager.start_recovery("sess1").await);
        assert!(manager.start_recovery("sess1").await);
        assert!(manager.start_recovery("sess1").await);
        assert!(!manager.start_recovery("sess1").await);
    }

    #[tokio::test]
    async fn register_session_returnss_ok() {
        let manager = create_test_manager();
        let result = manager.register_session("sess1", "run1").await;
        assert!(result.is_ok(), "register_session should return Ok for valid input");
    }

    #[tokio::test]
    async fn heartbeat_on_nonexistent_session_does_not_panic() {
        let manager = create_test_manager();
        manager.heartbeat("nonexistent").await;
    }

    #[tokio::test]
    async fn register_session_is_idempotent() {
        let manager = create_test_manager();
        manager.register_session("sess1", "run1").await.unwrap();
        manager.register_session("sess1", "run2").await.unwrap();
        let conn = manager.db.conn().expect("test db should provide connection");
        let run_id: String = conn
            .query_row(
                "SELECT run_id FROM durable_session_state WHERE session_id = ?1",
                params!["sess1"],
                |row| row.get(0),
            )
            .expect("query should succeed");
        assert_eq!(run_id, "run2", "re-register should update run_id");
    }

    #[tokio::test]
    async fn complete_on_nonexistent_session_does_not_panic() {
        let manager = create_test_manager();
        manager.complete("nonexistent").await;
    }

    #[tokio::test]
    async fn fail_on_nonexistent_session_does_not_panic() {
        let manager = create_test_manager();
        manager.fail("nonexistent").await;
    }

    #[tokio::test]
    async fn checkpoint_on_nonexistent_session_does_not_panic() {
        let manager = create_test_manager();
        manager.checkpoint("nonexistent", "msg1").await;
    }

    #[tokio::test]
    async fn start_recovery_on_nonexistent_returns_false() {
        let manager = create_test_manager();
        assert!(!manager.start_recovery("nonexistent").await);
    }

    #[tokio::test]
    async fn find_crashed_sessions_empty_on_fresh_db() {
        let manager = create_test_manager();
        let crashed = manager.find_crashed_sessions().await;
        assert!(crashed.is_empty(), "fresh DB should have no crashed sessions");
    }
}
