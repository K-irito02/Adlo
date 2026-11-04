use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::TimestampMs;

// ─── Shared patch-flow types ──────────────────────────────────────────────────
// Retained: command risk level and validation diagnostics serve the patch flow
// (CommandRequest / ValidationResult below) and host crates (change-engine).

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticSummary {
    pub id: String,
    pub source: String,
    pub severity: String,
    pub message: String,
    pub path: Option<String>,
    pub line: Option<usize>,
    pub column: Option<usize>,
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
