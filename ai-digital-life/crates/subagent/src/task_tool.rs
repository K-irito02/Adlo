use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Input parameters for the task tool.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc/generated/")]
#[serde(rename_all = "camelCase")]
pub struct TaskToolInput {
    pub description: String,
    pub prompt: String,
    pub subagent_type: String,
    pub task_id: Option<String>,
    pub background: bool,
}

/// Output returned by the task tool.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc/generated/")]
#[serde(rename_all = "camelCase")]
pub struct TaskToolOutput {
    pub task_id: String,
    pub state: String,
    pub summary: String,
    pub result: Option<String>,
    pub error: Option<String>,
}
