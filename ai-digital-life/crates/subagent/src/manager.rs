use adl_kernel::types::agent::AgentId;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Unique identifier for a sub-agent task.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SubagentId(String);

impl SubagentId {
    pub fn new() -> Self {
        Self(format!("sub_{}", adl_kernel::create_id("sub")))
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Self {
        Self(s.to_string())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Default for SubagentId {
    fn default() -> Self {
        Self::new()
    }
}

/// Status of a sub-agent task.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SubagentStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Aborted,
}

impl SubagentStatus {
    pub fn is_active(&self) -> bool {
        matches!(self, SubagentStatus::Pending | SubagentStatus::Running)
    }

    pub fn is_terminal(&self) -> bool {
        !self.is_active()
    }
}

/// Handle to a running or completed sub-agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubagentHandle {
    pub id: SubagentId,
    pub subagent_type: AgentId,
    pub status: SubagentStatus,
    pub child_session_id: String,
}

/// Manages sub-agent lifecycle: spawn, track, complete.
#[derive(Debug, Clone)]
pub struct SubagentManager {
    tasks: Arc<Mutex<HashMap<SubagentId, super::SubagentTask>>>,
}

impl SubagentManager {
    pub fn new() -> Self {
        Self { tasks: Arc::new(Mutex::new(HashMap::new())) }
    }

    pub async fn register(&self, task: super::SubagentTask) {
        let id = task.id.clone();
        self.tasks.lock().await.insert(id, task);
    }

    pub async fn get(&self, id: &SubagentId) -> Option<super::SubagentTask> {
        self.tasks.lock().await.get(id).cloned()
    }

    pub async fn update_status(
        &self,
        id: &SubagentId,
        status: SubagentStatus,
    ) -> Result<(), adl_errors::AppError> {
        let mut tasks = self.tasks.lock().await;
        let task = tasks.get_mut(id).ok_or_else(|| {
            adl_errors::AppError::NotFound(format!("Subagent '{}' not found", id.as_str()))
        })?;
        task.status = status;
        if status.is_terminal() {
            task.completed_at = Some(adl_kernel::now_ms());
        }
        Ok(())
    }

    pub async fn list_active(&self) -> Vec<super::SubagentTask> {
        self.tasks.lock().await.values().filter(|t| t.status.is_active()).cloned().collect()
    }
}

impl Default for SubagentManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_task(id: &str) -> super::super::SubagentTask {
        super::super::SubagentTask {
            id: SubagentId::from_str(id),
            parent_session_id: "sess_parent".to_string(),
            child_session_id: "sess_child".to_string(),
            subagent_type: "coder".to_string(),
            prompt: "test prompt".to_string(),
            background: false,
            status: SubagentStatus::Pending,
            created_at: 0,
            completed_at: None,
        }
    }

    #[tokio::test]
    async fn update_status_returns_error_for_unknown_id() {
        let manager = SubagentManager::new();
        let unknown_id = SubagentId::from_str("sub_nonexistent");
        let result = manager.update_status(&unknown_id, SubagentStatus::Completed).await;
        assert!(result.is_err(), "should return error for unknown ID");
        let err = result.err().map(|e| e.to_string());
        assert!(err.is_some_and(|msg| msg.contains("sub_nonexistent")));
    }

    #[tokio::test]
    async fn update_status_succeeds_for_registered_task() {
        let manager = SubagentManager::new();
        let task = make_test_task("sub_abc");
        manager.register(task).await;

        let id = SubagentId::from_str("sub_abc");
        let result = manager.update_status(&id, SubagentStatus::Running).await;
        assert!(result.is_ok(), "should succeed for registered task");

        let updated = manager.get(&id).await;
        assert!(updated.is_some());
        assert_eq!(updated.map(|t| t.status), Some(SubagentStatus::Running));
    }

    #[tokio::test]
    async fn update_status_sets_completed_at_for_terminal_status() {
        let manager = SubagentManager::new();
        let task = make_test_task("sub_def");
        manager.register(task).await;

        let id = SubagentId::from_str("sub_def");
        let result = manager.update_status(&id, SubagentStatus::Completed).await;
        assert!(result.is_ok());

        let updated = manager.get(&id).await;
        assert!(updated.is_some_and(|t| t.completed_at.is_some()));
    }
}
