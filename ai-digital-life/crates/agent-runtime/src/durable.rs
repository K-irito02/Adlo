use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

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

#[derive(Debug, Clone)]
pub struct DurableSessionManager {
    pub sessions: Arc<Mutex<HashMap<String, DurableSessionState>>>,
    max_retries: u32,
    heartbeat_timeout_ms: u64,
}

impl DurableSessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            max_retries: 3,
            heartbeat_timeout_ms: 30_000,
        }
    }

    pub async fn register_session(&self, session_id: &str, run_id: &str) {
        let state = DurableSessionState {
            session_id: session_id.to_string(),
            run_id: run_id.to_string(),
            status: DurableStatus::Running,
            checkpoint_message_id: None,
            last_heartbeat: adl_kernel::now_ms(),
            retry_count: 0,
        };
        self.sessions.lock().await.insert(session_id.to_string(), state);
    }

    pub async fn heartbeat(&self, session_id: &str) {
        if let Some(state) = self.sessions.lock().await.get_mut(session_id) {
            state.last_heartbeat = adl_kernel::now_ms();
        }
    }

    pub async fn checkpoint(&self, session_id: &str, message_id: &str) {
        if let Some(state) = self.sessions.lock().await.get_mut(session_id) {
            state.checkpoint_message_id = Some(message_id.to_string());
        }
    }

    pub async fn complete(&self, session_id: &str) {
        if let Some(state) = self.sessions.lock().await.get_mut(session_id) {
            state.status = DurableStatus::Completed;
        }
    }

    pub async fn fail(&self, session_id: &str) {
        if let Some(state) = self.sessions.lock().await.get_mut(session_id) {
            state.status = DurableStatus::Failed;
        }
    }

    pub async fn find_crashed_sessions(&self) -> Vec<DurableSessionState> {
        let now = adl_kernel::now_ms();
        let sessions = self.sessions.lock().await;
        sessions
            .values()
            .filter(|s| {
                s.status == DurableStatus::Running
                    && now.saturating_sub(s.last_heartbeat) > self.heartbeat_timeout_ms as i64
                    && s.retry_count < self.max_retries
            })
            .cloned()
            .collect()
    }

    pub async fn start_recovery(&self, session_id: &str) -> bool {
        let mut sessions = self.sessions.lock().await;
        if let Some(state) = sessions.get_mut(session_id) {
            if state.retry_count >= self.max_retries {
                state.status = DurableStatus::Failed;
                return false;
            }
            state.status = DurableStatus::Recovering;
            state.retry_count += 1;
            return true;
        }
        false
    }
}

impl Default for DurableSessionManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn register_and_complete_session() {
        let manager = DurableSessionManager::new();
        manager.register_session("sess1", "run1").await;
        manager.complete("sess1").await;
        let sessions = manager.sessions.lock().await;
        let state = sessions.get("sess1").unwrap();
        assert_eq!(state.status, DurableStatus::Completed);
    }

    #[tokio::test]
    async fn heartbeat_updates_timestamp() {
        let manager = DurableSessionManager::new();
        manager.register_session("sess1", "run1").await;
        let before = {
            let sessions = manager.sessions.lock().await;
            sessions.get("sess1").unwrap().last_heartbeat
        };
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        manager.heartbeat("sess1").await;
        let after = {
            let sessions = manager.sessions.lock().await;
            sessions.get("sess1").unwrap().last_heartbeat
        };
        assert!(after > before);
    }

    #[tokio::test]
    async fn find_crashed_sessions() {
        let manager = DurableSessionManager::new();
        manager.register_session("crashed", "run1").await;
        {
            let mut sessions = manager.sessions.lock().await;
            let state = sessions.get_mut("crashed").unwrap();
            state.last_heartbeat = adl_kernel::now_ms() - 60_000;
        }
        let crashed = manager.find_crashed_sessions().await;
        assert_eq!(crashed.len(), 1);
        assert_eq!(crashed[0].session_id, "crashed");
    }

    #[tokio::test]
    async fn start_recovery_increments_retry() {
        let manager = DurableSessionManager::new();
        manager.register_session("sess1", "run1").await;
        assert!(manager.start_recovery("sess1").await);
        assert!(manager.start_recovery("sess1").await);
        assert!(manager.start_recovery("sess1").await);
        assert!(!manager.start_recovery("sess1").await);
    }
}
