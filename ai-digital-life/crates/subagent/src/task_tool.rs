use serde::{Deserialize, Serialize};

/// Input parameters for the task tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskToolInput {
    pub description: String,
    pub prompt: String,
    pub subagent_type: String,
    pub task_id: Option<String>,
    pub background: bool,
}

/// Output returned by the task tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskToolOutput {
    pub task_id: String,
    pub state: String,
    pub summary: String,
    pub result: Option<String>,
    pub error: Option<String>,
}
