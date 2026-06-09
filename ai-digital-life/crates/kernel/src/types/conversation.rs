use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::agent::{AgentRunDetail, PatchSet};
use super::TimestampMs;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "kebab-case")]
pub enum SessionStatus {
    Active,
    Paused,
    Completed,
    Archived,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub last_user_intent: Option<String>,
    pub last_index_version: Option<String>,
    pub last_checkpoint_id: Option<String>,
    pub last_task_id: Option<String>,
    pub notes: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct SessionMeta {
    pub id: String,
    pub workspace_id: String,
    pub status: SessionStatus,
    pub approval_mode: String,
    pub current_task_id: Option<String>,
    pub summary: SessionSummary,
    pub created_at: TimestampMs,
    pub updated_at: TimestampMs,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "kebab-case")]
pub enum TaskStatus {
    Pending,
    WaitingApproval,
    Approved,
    Running,
    Completed,
    Failed,
    Rejected,
    RolledBack,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct TaskOperation {
    pub kind: String,
    pub target: Option<String>,
    pub params: serde_json::Value,
    pub risk_level: RiskLevel,
    pub reversible: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct TaskRecord {
    pub id: String,
    pub workspace_id: String,
    pub session_id: String,
    pub r#type: String,
    pub description: String,
    pub status: TaskStatus,
    pub priority: String,
    pub operations: Vec<TaskOperation>,
    pub approval_id: Option<String>,
    pub checkpoint_id: Option<String>,
    pub result_json: Option<String>,
    pub error_json: Option<String>,
    pub created_at: TimestampMs,
    pub updated_at: TimestampMs,
    pub started_at: Option<TimestampMs>,
    pub completed_at: Option<TimestampMs>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct TaskSummary {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: TaskStatus,
    pub risk_level: RiskLevel,
    pub updated_at: TimestampMs,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct ApprovalRequestSummary {
    pub id: String,
    pub task_id: String,
    pub title: String,
    pub description: String,
    pub risk_level: RiskLevel,
    pub impact: Vec<String>,
    pub reversible: bool,
    pub created_at: TimestampMs,
    pub expires_at: Option<TimestampMs>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "lowercase")]
pub enum ApprovalDecision {
    Approved,
    Rejected,
    Timeout,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct ApprovalRecord {
    pub id: String,
    pub task_id: String,
    pub workspace_id: String,
    pub run_id: Option<String>,
    pub risk_level: RiskLevel,
    pub request: ApprovalRequestSummary,
    pub decision: Option<ApprovalDecision>,
    pub reason: Option<String>,
    pub approved_by: Option<String>,
    pub created_at: TimestampMs,
    pub decided_at: Option<TimestampMs>,
    pub expires_at: Option<TimestampMs>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct AuditRecord {
    pub id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub action: String,
    pub detail: String,
    pub created_at: TimestampMs,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct AuditEntry {
    pub id: String,
    pub timestamp: TimestampMs,
    pub operation_type: String,
    pub summary: String,
    pub risk_level: RiskLevel,
    pub decision: Option<String>,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct CheckpointRecord {
    pub id: String,
    pub session_id: String,
    pub workspace_id: String,
    pub r#type: String,
    pub description: String,
    pub manifest: serde_json::Value,
    pub created_at: TimestampMs,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct CheckpointPayloadAsset {
    pub path: String,
    pub kind: String,
    pub status: String,
    pub size: Option<u64>,
    pub snapshot_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct CheckpointPayloadPreview {
    pub checkpoint_id: String,
    pub manifest_path: String,
    pub root_path: Option<String>,
    pub asset_count: usize,
    pub assets: Vec<CheckpointPayloadAsset>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct ApprovalPolicySummary {
    pub mode: String,
    pub summary: String,
    pub high_risk_rules: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct TaskCenterSnapshot {
    pub tasks: Vec<TaskSummary>,
    pub pending_approvals: Vec<ApprovalRequestSummary>,
    pub policy: ApprovalPolicySummary,
    pub current_session: Option<SessionMeta>,
    pub latest_checkpoint: Option<CheckpointRecord>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "lowercase")]
pub enum ConversationRole {
    System,
    User,
    Assistant,
    Tool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "kebab-case")]
pub enum ConversationScenario {
    Chat,
    Plan,
    CodeEdit,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum ConversationBlock {
    Markdown {
        id: String,
        text: String,
    },
    Plan {
        id: String,
        title: String,
        items: Vec<PlanConversationItem>,
    },
    ToolCall {
        id: String,
        tool_name: String,
        summary: String,
        status: String,
    },
    Approval {
        id: String,
        title: String,
        risk_level: RiskLevel,
        summary: String,
    },
    PatchSummary {
        id: String,
        patch_set_id: String,
        summary: String,
        file_count: usize,
        hunk_count: usize,
    },
    ValidationResult {
        id: String,
        summary: String,
        status: String,
        diagnostics: Vec<DiagnosticSummary>,
    },
    FinalSummary {
        id: String,
        summary: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct PlanConversationItem {
    pub id: String,
    pub title: String,
    pub detail: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct ConversationSessionRecord {
    pub id: String,
    pub workspace_id: String,
    pub title: String,
    pub status: String,
    pub is_pinned: bool,
    pub pinned_order: i32,
    pub unpinned_order: i32,
    pub manual_unread: bool,
    pub last_read_at: Option<TimestampMs>,
    pub archived_at: Option<TimestampMs>,
    pub title_updated_at: Option<TimestampMs>,
    pub created_at: TimestampMs,
    pub updated_at: TimestampMs,
    pub last_message_at: TimestampMs,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct ConversationMessageRecord {
    pub id: String,
    pub session_id: String,
    pub role: ConversationRole,
    pub content: String,
    pub blocks: Vec<ConversationBlock>,
    pub run_id: Option<String>,
    pub created_at: TimestampMs,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct ConversationDetail {
    pub session: ConversationSessionRecord,
    pub messages: Vec<ConversationMessageRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct ConversationSendResult {
    pub session: ConversationSessionRecord,
    pub user_message: ConversationMessageRecord,
    pub assistant_message: ConversationMessageRecord,
    pub run_detail: AgentRunDetail,
    pub patch_set: Option<PatchSet>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
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
