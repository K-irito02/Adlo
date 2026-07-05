pub mod manager;
pub mod output;
pub mod permission;
pub mod task_tool;

pub use manager::{SubagentHandle, SubagentId, SubagentManager, SubagentStatus};
pub use permission::derive_subagent_permission;
pub use task_tool::{TaskToolInput, TaskToolOutput};

use serde::{Deserialize, Serialize};

/// A sub-agent task spawned by the task tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubagentTask {
    pub id: SubagentId,
    pub parent_session_id: String,
    pub child_session_id: String,
    pub subagent_type: String,
    pub prompt: String,
    pub background: bool,
    pub status: SubagentStatus,
    pub created_at: i64,
    pub completed_at: Option<i64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn subagent_id_display() {
        let id = SubagentId::new();
        assert!(id.as_str().starts_with("sub_"));
    }

    #[test]
    fn subagent_status_transitions() {
        let status = SubagentStatus::Pending;
        assert!(status.is_active());
        let status = SubagentStatus::Running;
        assert!(status.is_active());
        let status = SubagentStatus::Completed;
        assert!(!status.is_active());
    }
}
