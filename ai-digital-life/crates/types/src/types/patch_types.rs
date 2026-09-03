use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::TimestampMs;
use super::conversation::{ConversationScenario, DiagnosticSummary, RiskLevel};

// ─── Agent types ──────────────────────────────────────────────────────────────

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum AgentId {
    #[default]
    Build,
    Plan,
    General,
    Explore,
    Compaction,
    Title,
    Summary,
    Custom,
}

impl AgentId {
    pub fn as_str(&self) -> &'static str {
        match self {
            AgentId::Build => "build",
            AgentId::Plan => "plan",
            AgentId::General => "general",
            AgentId::Explore => "explore",
            AgentId::Compaction => "compaction",
            AgentId::Title => "title",
            AgentId::Summary => "summary",
            AgentId::Custom => "custom",
        }
    }
}

impl std::fmt::Display for AgentId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
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

impl AgentRunStatus {
    pub fn as_status_str(&self) -> &'static str {
        match self {
            Self::Draft => "draft",
            Self::Planning => "planning",
            Self::Ready => "ready",
            Self::Executing => "executing",
            Self::WaitingApproval => "waiting-approval",
            Self::Applying => "applying",
            Self::Verifying => "verifying",
            Self::Succeeded => "succeeded",
            Self::Failed => "failed",
            Self::RolledBack => "rolled-back",
            Self::Aborted => "aborted",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
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
    #[serde(default)]
    pub agent_id: AgentId,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunDetail {
    pub run: AgentRunRecord,
    pub steps: Vec<AgentPlanStep>,
}

// ─── Command types ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum CommandProfile {
    Build,
    Test,
    Lint,
    Install,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct CommandProfileSummary {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
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

// ─── Patch types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum PatchHunkDecision {
    Pending,
    Accepted,
    Rejected,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
pub enum PatchSetStatus {
    Draft,
    Ready,
    Applying,
    Applied,
    Failed,
    RolledBack,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PatchApplicationResult {
    pub patch_set: PatchSet,
    pub repair_patch_set: Option<PatchSet>,
    pub validation: Option<ValidationResult>,
    pub command_result: Option<CommandExecutionResult>,
    pub rolled_back: bool,
}
