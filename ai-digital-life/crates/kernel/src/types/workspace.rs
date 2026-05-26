use serde::{Deserialize, Serialize};

use super::TimestampMs;

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
    pub hidden_from_right_panels: bool,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_line: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub depth: Option<usize>,
}
