use serde::{Deserialize, Serialize};

use super::TimestampMs;
use super::command::CommandExecutionResult;
use super::conversation::{ConversationScenario, DiagnosticSummary};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AgentRunStatus {
    Draft,
    Planning,
    Ready,
    Executing,
    WaitingApproval,
    Applying,
    Verifying,
    Succeeded,
    Failed,
    RolledBack,
    Aborted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunRecord {
    pub id: String,
    pub workspace_id: String,
    pub session_id: String,
    pub prompt: String,
    pub scenario: ConversationScenario,
    pub status: AgentRunStatus,
    pub summary: Option<String>,
    pub patch_set_id: Option<String>,
    pub created_at: TimestampMs,
    pub updated_at: TimestampMs,
    pub completed_at: Option<TimestampMs>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPlanStep {
    pub id: String,
    pub run_id: String,
    pub title: String,
    pub detail: Option<String>,
    pub status: String,
    pub created_at: TimestampMs,
    pub updated_at: TimestampMs,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunDetail {
    pub run: AgentRunRecord,
    pub steps: Vec<AgentPlanStep>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PatchHunkDecision {
    Pending,
    Accepted,
    Rejected,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PatchSetStatus {
    Draft,
    Ready,
    Applying,
    Applied,
    Failed,
    RolledBack,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchHunk {
    pub id: String,
    pub file_patch_id: String,
    pub patch_set_id: String,
    pub relative_path: String,
    pub old_start: usize,
    pub old_lines: usize,
    pub new_start: usize,
    pub new_lines: usize,
    pub preview: String,
    pub before_text: String,
    pub after_text: String,
    pub decision: PatchHunkDecision,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePatch {
    pub id: String,
    pub patch_set_id: String,
    pub relative_path: String,
    pub language: Option<String>,
    pub before_content: String,
    pub after_content: String,
    pub before_hash: String,
    pub hunks: Vec<PatchHunk>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchSet {
    pub id: String,
    pub workspace_id: String,
    pub session_id: String,
    pub run_id: Option<String>,
    pub title: String,
    pub summary: String,
    pub status: PatchSetStatus,
    pub checkpoint_id: Option<String>,
    pub file_patches: Vec<FilePatch>,
    pub created_at: TimestampMs,
    pub updated_at: TimestampMs,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResult {
    pub id: String,
    pub workspace_id: String,
    pub run_id: Option<String>,
    pub patch_set_id: Option<String>,
    pub status: String,
    pub summary: String,
    pub diagnostics: Vec<DiagnosticSummary>,
    pub created_at: TimestampMs,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchApplicationResult {
    pub patch_set: PatchSet,
    pub repair_patch_set: Option<PatchSet>,
    pub validation: Option<ValidationResult>,
    pub command_result: Option<CommandExecutionResult>,
    pub rolled_back: bool,
}
