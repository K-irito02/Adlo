use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const APP_NAME: &str = "AI Digital Life";
pub const DEFAULT_APPROVAL_MODE: &str = "manual";
pub const GLOBAL_WORKSPACE_ID: &str = "__global__";

pub type TimestampMs = i64;

pub fn now_ms() -> TimestampMs {
    chrono::Utc::now().timestamp_millis()
}

pub fn create_id(prefix: &str) -> String {
    format!("{prefix}_{}", Uuid::new_v4())
}

pub fn estimate_tokens(text: &str) -> usize {
    text.chars().count() / 4
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum IpcResult<T> {
    Ok { ok: bool, data: T },
    Err { ok: bool, error: IpcError },
}

impl<T> IpcResult<T> {
    pub fn ok(data: T) -> Self {
        Self::Ok { ok: true, data }
    }

    pub fn err(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self::Err {
            ok: false,
            error: IpcError {
                code: code.into(),
                message: message.into(),
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub app_name: String,
    pub version: String,
    pub config: ConfigSnapshot,
    pub current_workspace: Option<WorkspaceMeta>,
    pub recent_logs: Vec<LogEntrySummary>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    Light,
    Dark,
    System,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LanguageCode {
    ZhCn,
    EnUs,
}

impl LanguageCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ZhCn => "zh-CN",
            Self::EnUs => "en-US",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, Hash)]
#[serde(rename_all = "lowercase")]
pub enum ModelProviderId {
    Deepseek,
    Minimax,
}

impl ModelProviderId {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Deepseek => "deepseek",
            Self::Minimax => "minimax",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderPreference {
    pub enabled: bool,
    pub priority: i32,
    pub model_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelPreferences {
    pub providers: std::collections::BTreeMap<ModelProviderId, ModelProviderPreference>,
}

impl Default for ModelPreferences {
    fn default() -> Self {
        let mut providers = std::collections::BTreeMap::new();
        providers.insert(
            ModelProviderId::Deepseek,
            ModelProviderPreference {
                enabled: true,
                priority: 1,
                model_id: "deepseek-v4-pro".to_string(),
            },
        );
        providers.insert(
            ModelProviderId::Minimax,
            ModelProviderPreference {
                enabled: true,
                priority: 2,
                model_id: "MiniMax-M2.7".to_string(),
            },
        );
        Self { providers }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppPreferencePatch {
    pub language: Option<String>,
    pub theme_mode: Option<ThemeMode>,
    pub log_level: Option<String>,
    pub model_preferences:
        Option<std::collections::BTreeMap<ModelProviderId, ModelProviderPreferencePatch>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderPreferencePatch {
    pub enabled: Option<bool>,
    pub priority: Option<i32>,
    pub model_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigSnapshot {
    pub language: String,
    pub theme_mode: ThemeMode,
    pub resolved_theme: Theme,
    pub log_level: String,
    pub max_recent_workspaces: usize,
    pub model_preferences: ModelPreferences,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntrySummary {
    pub timestamp: TimestampMs,
    pub level: String,
    pub scope: String,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceType {
    Node,
    Python,
    Java,
    Go,
    Rust,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceStatus {
    Initializing,
    Ready,
    Indexing,
    Degraded,
    Error,
    Closed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSnapshot {
    pub is_repo: bool,
    pub branch: Option<String>,
    pub head: Option<String>,
    pub ahead: Option<i32>,
    pub behind: Option<i32>,
    pub staged: Vec<String>,
    pub unstaged: Vec<String>,
    pub untracked: Vec<String>,
    pub conflicts: Vec<String>,
    pub captured_at: TimestampMs,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchSummary {
    pub name: String,
    pub is_current: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGitBranchSwitchInput {
    pub branch_name: String,
    pub allow_stash: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGitBranchCreateInput {
    pub branch_name: String,
    pub base_branch: Option<String>,
    pub allow_stash: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGitBranchChangeResult {
    pub workspace: WorkspaceMeta,
    pub git_snapshot: GitSnapshot,
    pub previous_branch: Option<String>,
    pub current_branch: String,
    pub stashed_changes: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMeta {
    pub id: String,
    pub path: String,
    pub root_path: String,
    pub name: String,
    pub r#type: WorkspaceType,
    pub status: WorkspaceStatus,
    pub git_snapshot: Option<GitSnapshot>,
    pub created_at: TimestampMs,
    pub updated_at: TimestampMs,
    pub last_opened_at: TimestampMs,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentWorkspaceEntry {
    pub id: String,
    pub path: String,
    pub root_path: String,
    pub name: String,
    pub last_opened_at: TimestampMs,
    pub is_pinned: bool,
    pub pinned_order: i32,
    pub unpinned_order: i32,
    pub removed_from_sidebar: bool,
    pub available: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RetrievalStatusV1 {
    Idle,
    Running,
    Cancelled,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalFileTypeCount {
    pub extension: String,
    pub count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoMapEntry {
    pub path: String,
    pub r#type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalSnapshot {
    pub workspace_id: String,
    pub root_path: String,
    pub status: RetrievalStatusV1,
    pub scanned_files: usize,
    pub indexed_text_files: usize,
    pub started_at: Option<TimestampMs>,
    pub updated_at: TimestampMs,
    pub completed_at: Option<TimestampMs>,
    pub last_error: Option<String>,
    pub top_extensions: Vec<RetrievalFileTypeCount>,
    pub repo_map: Vec<RepoMapEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthSnapshot {
    pub timestamp: TimestampMs,
    pub components: Vec<HealthComponent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthComponent {
    pub name: String,
    pub status: HealthStatus,
    pub detail: String,
    pub updated_at: TimestampMs,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HealthStatus {
    Healthy,
    Degraded,
    Unavailable,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeDiagnosticsSnapshot {
    pub lifecycle: RuntimeLifecycleSnapshot,
    pub migration: MigrationDiagnostics,
    pub events: EventDiagnostics,
    pub recent_errors: Vec<RuntimeErrorSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeLifecycleSnapshot {
    pub current_started_at: TimestampMs,
    pub last_shutdown_at: Option<TimestampMs>,
    pub last_shutdown_was_clean: bool,
    pub recovered_from_crash: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationDiagnostics {
    pub change: String,
    pub from_version: Option<String>,
    pub to_version: String,
    pub backup_path: Option<String>,
    pub executed_scripts: Vec<MigrationScriptStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationScriptStatus {
    pub script_id: String,
    pub status: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventDiagnostics {
    pub emitted: usize,
    pub by_type: std::collections::BTreeMap<String, usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeErrorSummary {
    pub id: String,
    pub timestamp: TimestampMs,
    pub name: String,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SessionStatus {
    Active,
    Paused,
    Completed,
    Archived,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub last_user_intent: Option<String>,
    pub last_index_version: Option<String>,
    pub last_checkpoint_id: Option<String>,
    pub last_task_id: Option<String>,
    pub notes: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskOperation {
    pub kind: String,
    pub target: Option<String>,
    pub params: serde_json::Value,
    pub risk_level: RiskLevel,
    pub reversible: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ApprovalDecision {
    Approved,
    Rejected,
    Timeout,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditRecord {
    pub id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub action: String,
    pub detail: String,
    pub created_at: TimestampMs,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointPayloadAsset {
    pub path: String,
    pub kind: String,
    pub status: String,
    pub size: Option<u64>,
    pub snapshot_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointPayloadPreview {
    pub checkpoint_id: String,
    pub manifest_path: String,
    pub root_path: Option<String>,
    pub asset_count: usize,
    pub assets: Vec<CheckpointPayloadAsset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalPolicySummary {
    pub mode: String,
    pub summary: String,
    pub high_risk_rules: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskCenterSnapshot {
    pub tasks: Vec<TaskSummary>,
    pub pending_approvals: Vec<ApprovalRequestSummary>,
    pub policy: ApprovalPolicySummary,
    pub current_session: Option<SessionMeta>,
    pub latest_checkpoint: Option<CheckpointRecord>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConversationRole {
    System,
    User,
    Assistant,
    Tool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ConversationScenario {
    Chat,
    Plan,
    CodeEdit,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

impl DigitalLifeRunActivityEventV1 {
    pub fn seq(&self) -> i64 {
        match self {
            DigitalLifeRunActivityEventV1::RunStart { seq, .. } => *seq,
            DigitalLifeRunActivityEventV1::ContextAdded { seq, .. } => *seq,
            DigitalLifeRunActivityEventV1::FileRead { seq, .. } => *seq,
            DigitalLifeRunActivityEventV1::Search { seq, .. } => *seq,
            DigitalLifeRunActivityEventV1::Command { seq, .. } => *seq,
            DigitalLifeRunActivityEventV1::Patch { seq, .. } => *seq,
            DigitalLifeRunActivityEventV1::Approval { seq, .. } => *seq,
            DigitalLifeRunActivityEventV1::Model { seq, .. } => *seq,
            DigitalLifeRunActivityEventV1::Error { seq, .. } => *seq,
            DigitalLifeRunActivityEventV1::RunDone { seq, .. } => *seq,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanConversationItem {
    pub id: String,
    pub title: String,
    pub detail: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationDetail {
    pub session: ConversationSessionRecord,
    pub messages: Vec<ConversationMessageRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSendResult {
    pub session: ConversationSessionRecord,
    pub user_message: ConversationMessageRecord,
    pub assistant_message: ConversationMessageRecord,
    pub run_detail: AgentRunDetail,
    pub patch_set: Option<PatchSet>,
}

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
    Started {
        execution_id: String,
        task_id: String,
        request: CommandRequest,
    },
    #[serde(rename_all = "camelCase")]
    WaitingApproval {
        task_id: String,
        request: CommandRequest,
        approval_request: ApprovalRequestSummary,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSearchHit {
    pub path: String,
    pub line: usize,
    pub preview: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFileDocument {
    pub path: String,
    pub content: String,
    pub last_modified_at: TimestampMs,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceChangeKind {
    Added,
    Modified,
    Deleted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceChangeStatus {
    Staged,
    Modified,
    Untracked,
    Conflicted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceChangePreview {
    pub path: String,
    pub change_kind: WorkspaceChangeKind,
    pub status: WorkspaceChangeStatus,
    pub base_exists: bool,
    pub current_exists: bool,
    pub base_content: String,
    pub current_content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFileChangedEvent {
    pub path: String,
    pub last_modified_at: TimestampMs,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTreeNode {
    pub path: String,
    pub name: String,
    pub kind: String,
    pub children: Vec<WorkspaceTreeNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileOutlineItem {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub line: usize,
    /// 大纲项结束行号（如果可确定）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_line: Option<usize>,
    /// 大纲项在层级结构中的深度
    #[serde(skip_serializing_if = "Option::is_none")]
    pub depth: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelChatMessage {
    pub role: ConversationRole,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelTokenUsage {
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
    pub estimated: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelRouteDecision {
    pub reason: String,
    pub chain: Vec<String>,
    pub synthetic: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelResponse {
    pub provider_id: ModelProviderId,
    pub model_id: String,
    pub content: String,
    pub synthetic: bool,
    pub request_id: Option<String>,
    pub usage: Option<ModelTokenUsage>,
    pub route: Option<ModelRouteDecision>,
}

/// Main → Renderer: versioned agent run activity stream (debug/audit friendly; no chain-of-thought).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum DigitalLifeRunActivityEventV1 {
    #[serde(rename_all = "camelCase")]
    RunStart {
        v: i32,
        run_id: String,
        seq: i64,
        ts: TimestampMs,
        scenario: ConversationScenario,
    },
    #[serde(rename_all = "camelCase")]
    ContextAdded {
        v: i32,
        run_id: String,
        seq: i64,
        ts: TimestampMs,
        context_type: String,
        label: String,
        path: Option<String>,
        token_estimate: Option<usize>,
        truncated: Option<bool>,
    },
    #[serde(rename_all = "camelCase")]
    FileRead {
        v: i32,
        run_id: String,
        seq: i64,
        ts: TimestampMs,
        path: String,
        bytes: Option<usize>,
        token_estimate: Option<usize>,
        truncated: Option<bool>,
    },
    #[serde(rename_all = "camelCase")]
    Search {
        v: i32,
        run_id: String,
        seq: i64,
        ts: TimestampMs,
        query: String,
        hit_count: Option<usize>,
        sample_paths: Option<Vec<String>>,
    },
    #[serde(rename_all = "camelCase")]
    Command {
        v: i32,
        run_id: String,
        seq: i64,
        ts: TimestampMs,
        phase: String,
        command: String,
        args: Option<Vec<String>>,
        exit_code: Option<i32>,
    },
    #[serde(rename_all = "camelCase")]
    Patch {
        v: i32,
        run_id: String,
        seq: i64,
        ts: TimestampMs,
        phase: String,
        patch_set_id: String,
        file_count: Option<usize>,
        hunk_count: Option<usize>,
    },
    #[serde(rename_all = "camelCase")]
    Approval {
        v: i32,
        run_id: String,
        seq: i64,
        ts: TimestampMs,
        phase: String,
        approval_id: String,
        decision: Option<String>,
        reason: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    Model {
        v: i32,
        run_id: String,
        seq: i64,
        ts: TimestampMs,
        phase: String,
        provider_id: Option<ModelProviderId>,
        model_id: Option<String>,
        reason: Option<String>,
        usage: Option<ModelTokenUsage>,
        message: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    Error {
        v: i32,
        run_id: String,
        seq: i64,
        ts: TimestampMs,
        message: String,
    },
    #[serde(rename_all = "camelCase")]
    RunDone {
        v: i32,
        run_id: String,
        seq: i64,
        ts: TimestampMs,
        status: AgentRunStatus,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunActivityEventRecord {
    pub id: String,
    pub workspace_id: String,
    pub session_id: String,
    pub run_id: String,
    pub seq: i64,
    pub ts: TimestampMs,
    pub event: DigitalLifeRunActivityEventV1,
    pub created_at: TimestampMs,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderHealthStatus {
    pub provider_id: ModelProviderId,
    pub healthy: bool,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelGatewayHealthSnapshot {
    pub checked_at: TimestampMs,
    pub providers: Vec<ProviderHealthStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCallAuditRecord {
    pub id: String,
    pub request_id: String,
    pub workspace_id: String,
    pub session_id: String,
    pub run_id: Option<String>,
    pub provider_id: ModelProviderId,
    pub model_id: String,
    pub scenario: ConversationScenario,
    pub route_meta: ModelRouteDecision,
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub latency_ms: i64,
    pub error: Option<String>,
    pub streamed: bool,
    pub created_at: TimestampMs,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptRule {
    pub id: String,
    pub kind: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextEntry {
    pub id: String,
    pub r#type: String,
    pub label: String,
    pub content: String,
    pub token_estimate: usize,
    pub path: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_info_serializes() {
        let info = AppInfo {
            app_name: APP_NAME.into(),
            version: "0.1.0".into(),
            config: ConfigSnapshot {
                language: "zh-CN".into(),
                theme_mode: ThemeMode::System,
                resolved_theme: Theme::Dark,
                log_level: "info".into(),
                max_recent_workspaces: 10,
                model_preferences: ModelPreferences::default(),
            },
            current_workspace: None,
            recent_logs: vec![],
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"themeMode\":\"system\""));
        assert!(json.contains("\"appName\":\"AI Digital Life\""));
    }
}
