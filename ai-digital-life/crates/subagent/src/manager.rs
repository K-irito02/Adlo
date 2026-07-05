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

    pub async fn update_status(&self, id: &SubagentId, status: SubagentStatus) {
        if let Some(task) = self.tasks.lock().await.get_mut(id) {
            task.status = status;
            if status.is_terminal() {
                task.completed_at = Some(adl_kernel::now_ms());
            }
        }
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
