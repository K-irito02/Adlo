use serde::{Deserialize, Serialize};

use super::conversation::{ApprovalRequestSummary, RiskLevel};
use super::TimestampMs;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CommandProfile {
    Build,
    Test,
    Lint,
    Install,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandProfileSummary {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandRequest {
    pub id: String,
    pub workspace_id: String,
    pub run_id: Option<String>,
    pub profile: CommandProfile,
    pub command: String,
    pub args: Vec<String>,
    pub shell: bool,
    pub risk_level: RiskLevel,
    pub created_at: TimestampMs,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandExecutionResult {
    pub request: CommandRequest,
    pub exit_code: Option<i32>,
    pub signal: Option<String>,
    pub stdout: String,
    pub stderr: String,
    pub summary: String,
    pub success: bool,
    pub started_at: TimestampMs,
    pub completed_at: TimestampMs,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandRunResult {
    pub status: String,
    pub task_id: String,
    pub request: CommandRequest,
    pub result: Option<CommandExecutionResult>,
    pub approval_request: Option<ApprovalRequestSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "mode")]
pub enum CommandRunStreamStart {
    #[serde(rename_all = "camelCase")]
    Started { execution_id: String, task_id: String, request: CommandRequest },
    #[serde(rename_all = "camelCase")]
    WaitingApproval {
        task_id: String,
        request: CommandRequest,
        approval_request: ApprovalRequestSummary,
    },
}
