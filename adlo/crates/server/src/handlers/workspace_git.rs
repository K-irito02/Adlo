//! Workspace-git domain HTTP handlers — migrated from
//! `src-tauri/src/commands/workspace_git.rs`. Git subprocess work runs in
//! `spawn_blocking` (sync ops) or is already async (`capture_git_snapshot_async`).
//! Branch changes persist the updated workspace meta (DB row + `current_workspace`
//! state + in-memory slot) exactly as the Tauri original.

use crate::ServerState;
use crate::ipc;
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::{
    GitBranchSummary, GitSnapshot, WorkspaceGitBranchChangeResult, WorkspaceGitBranchCreateInput,
    WorkspaceGitBranchSwitchInput, WorkspaceMeta, WorkspaceStatus, WorkspaceWorktreeEnsureInput,
    WorkspaceWorktreeRemoveInput, now_ms,
};
use axum::extract::State;
use axum::response::IntoResponse;
use std::path::{Path, PathBuf};

use crate::handlers::workspace::current_workspace;

/// Resolve the git root: an explicit `workspacePath` wins, otherwise the active
/// workspace's root path.
fn git_root(state: &ServerState, workspace_path: Option<String>) -> Result<PathBuf, AppError> {
    match workspace_path {
        Some(p) => Ok(PathBuf::from(p)),
        None => Ok(PathBuf::from(current_workspace(state)?.root_path)),
    }
}

/// POST `/workspace/git/status` — git status snapshot for a path or the active
/// workspace (covers `WorkspaceBridge.getGitStatus`).
pub async fn get_git_status(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let body_val: serde_json::Value = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let workspace_path = body_val.get("workspacePath").and_then(|v| v.as_str()).map(String::from);
    let root = match git_root(&state, workspace_path) {
        Ok(r) => r,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let t_start = std::time::Instant::now();
    let snapshot = adl_workspace::capture_git_snapshot_async(root.as_path()).await;
    tracing::debug!(
        elapsed_ms = t_start.elapsed().as_millis(),
        root = %root.display(),
        "workspace_get_git_status: done"
    );
    match serde_json::to_value(&snapshot) {
        Ok(v) => ipc::to_response(Ok(v)),
        Err(e) => ipc::to_response(Err(AppError::from(e))),
    }
}

/// 多工作区安全：需要显式工作区路径的写操作统一走这里（空白串也算缺失）。
fn require_workspace_path(value: Option<String>) -> Result<String, AppError> {
    value
        .filter(|path| !path.trim().is_empty())
        .ok_or_else(|| AppError::InvalidInput("workspacePath is required".into()))
}

/// POST `/workspace/git/init` — initialize a **local** git repository at the
/// explicitly supplied workspace path (covers `WorkspaceBridge.initGitRepo`).
///
/// `workspacePath` is mandatory: unlike status/branches, falling back to the
/// active workspace could initialize the wrong workspace in a multi-workspace
/// session. Only `.git` is created; no network, no existing file changes.
pub async fn init_git_repo(body: axum::body::Bytes) -> impl IntoResponse {
    let body_val: serde_json::Value = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let workspace_path = body_val.get("workspacePath").and_then(|v| v.as_str()).map(String::from);
    let workspace_path = match require_workspace_path(workspace_path) {
        Ok(path) => path,
        Err(error) => return ipc::to_response(Err(error)),
    };
    let result = tokio::task::spawn_blocking(move || -> Result<serde_json::Value, AppError> {
        let snapshot = adl_workspace::init_git_repo(Path::new(&workspace_path))?;
        Ok(serde_json::to_value(&snapshot)?)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")));
    ipc::to_response(result.and_then(|r| r))
}

/// POST `/workspace/git/branches` — list git branches (covers
/// `WorkspaceBridge.listGitBranches`).
pub async fn list_git_branches(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let body_val: serde_json::Value = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let workspace_path = body_val.get("workspacePath").and_then(|v| v.as_str()).map(String::from);
    let root = match git_root(&state, workspace_path) {
        Ok(r) => r,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let result = tokio::task::spawn_blocking(move || -> Result<serde_json::Value, AppError> {
        let branches: Vec<GitBranchSummary> = adl_workspace::list_git_branches(root.as_path())?;
        Ok(serde_json::to_value(&branches)?)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")));
    ipc::to_response(result.and_then(|r| r))
}

#[derive(serde::Deserialize)]
struct SwitchBody {
    input: WorkspaceGitBranchSwitchInput,
}

/// POST `/workspace/git/switch` — switch the active workspace to a branch
/// (covers `WorkspaceBridge.switchGitBranch`).
pub async fn switch_git_branch(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: SwitchBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let workspace = match current_workspace(&state) {
        Ok(ws) => ws,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let branch_name = input.input.branch_name.trim().to_string();
    if branch_name.is_empty() {
        return ipc::to_response(Err(AppError::InvalidInput("branch name is required".into())));
    }
    let root_path = workspace.root_path.clone();
    let allow_stash = input.input.allow_stash;
    let mode = input.input.mode;
    let branch_for_closure = branch_name.clone();
    let git_result = tokio::task::spawn_blocking(move || {
        adl_workspace::switch_git_branch(
            PathBuf::from(root_path).as_path(),
            &branch_for_closure,
            allow_stash,
            mode,
        )
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")));

    match git_result {
        Ok(Ok((git_snapshot, stashed_changes, previous_branch, has_restored))) => {
            let result = build_branch_change_result(
                &state,
                workspace,
                git_snapshot,
                previous_branch,
                stashed_changes,
                &branch_name,
                has_restored,
            )
            .await;
            ipc::to_response(result)
        },
        Ok(Err(e)) => ipc::to_response(Err(e)),
        Err(e) => ipc::to_response(Err(e)),
    }
}

#[derive(serde::Deserialize)]
struct CreateBody {
    input: WorkspaceGitBranchCreateInput,
}

/// POST `/workspace/git/create` — create + switch to a new branch (covers
/// `WorkspaceBridge.createGitBranch`).
pub async fn create_git_branch(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: CreateBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let workspace = match current_workspace(&state) {
        Ok(ws) => ws,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let branch_name = input.input.branch_name.trim().to_string();
    if branch_name.is_empty() {
        return ipc::to_response(Err(AppError::InvalidInput("branch name is required".into())));
    }
    let root_path = workspace.root_path.clone();
    let base_branch = input.input.base_branch;
    let allow_stash = input.input.allow_stash;
    let branch_for_closure = branch_name.clone();
    let git_result = tokio::task::spawn_blocking(move || {
        adl_workspace::create_git_branch(
            PathBuf::from(root_path).as_path(),
            &branch_for_closure,
            base_branch.as_deref(),
            allow_stash,
        )
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")));

    match git_result {
        Ok(Ok((git_snapshot, stashed_changes, previous_branch))) => {
            let result = build_branch_change_result(
                &state,
                workspace,
                git_snapshot,
                previous_branch,
                stashed_changes,
                &branch_name,
                false,
            )
            .await;
            ipc::to_response(result)
        },
        Ok(Err(e)) => ipc::to_response(Err(e)),
        Err(e) => ipc::to_response(Err(e)),
    }
}

async fn build_branch_change_result(
    state: &ServerState,
    workspace: WorkspaceMeta,
    git_snapshot: GitSnapshot,
    previous_branch: Option<String>,
    stashed_changes: bool,
    branch_name: &str,
    has_restored: bool,
) -> Result<serde_json::Value, AppError> {
    let current_branch = git_snapshot.branch.clone().unwrap_or_else(|| branch_name.to_string());
    let now = now_ms();
    let updated_workspace = WorkspaceMeta {
        git_snapshot: Some(git_snapshot.clone()),
        status: WorkspaceStatus::Ready,
        updated_at: now,
        last_opened_at: now,
        ..workspace
    };
    // Blocking persist (DB row + current_workspace state) via a cloned db.
    let db = state.db.clone();
    let meta_for_db = updated_workspace.clone();
    tokio::task::spawn_blocking(move || -> Result<(), AppError> {
        db.save_entity(
            EntityTable::Workspaces,
            &meta_for_db.id,
            Some(&meta_for_db.id),
            None,
            Some("ready"),
            &meta_for_db,
        )?;
        db.put_state("current_workspace", &serde_json::to_string(&meta_for_db)?)?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    // In-memory active-workspace slot.
    state
        .current_workspace
        .write()
        .map(|mut ws| *ws = Some(updated_workspace.clone()))
        .map_err(|_| AppError::Internal("workspace mutex poisoned".into()))?;
    let result = WorkspaceGitBranchChangeResult {
        workspace: updated_workspace,
        git_snapshot,
        previous_branch,
        current_branch,
        stashed_changes,
        has_restored,
    };
    Ok(serde_json::to_value(&result)?)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitFileBody {
    relative_path: String,
    workspace_path: Option<String>,
}

async fn run_git_file_op(
    state: &ServerState,
    body: axum::body::Bytes,
    op: fn(&Path, &str) -> Result<(), AppError>,
) -> Result<serde_json::Value, AppError> {
    let input: GitFileBody =
        ipc::json_body(body).await.map_err(|(_, msg)| AppError::InvalidInput(msg))?;
    let root = git_root(state, input.workspace_path)?;
    let relative_path = input.relative_path;
    tokio::task::spawn_blocking(move || {
        let path = root;
        op(path.as_path(), &relative_path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(serde_json::json!(null))
}

/// POST `/workspace/git/stage` — stage a file (covers `WorkspaceBridge.gitStageFile`).
pub async fn git_stage_file(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    ipc::to_response(run_git_file_op(&state, body, adl_workspace::stage_file).await)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitRepoBody {
    workspace_path: Option<String>,
}

async fn run_git_repo_op(
    state: &ServerState,
    body: axum::body::Bytes,
    op: fn(&Path) -> Result<(), AppError>,
) -> Result<serde_json::Value, AppError> {
    let input: GitRepoBody =
        ipc::json_body(body).await.map_err(|(_, msg)| AppError::InvalidInput(msg))?;
    // 多工作区安全：全量/远程操作（含不可恢复的 discard-all）必须显式指定目标，
    // 禁止回退到活动工作区（与 init_git_repo 同一规则）。
    let workspace_path = require_workspace_path(input.workspace_path)?;
    let root = git_root(state, Some(workspace_path))?;
    tokio::task::spawn_blocking(move || op(root.as_path()))
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(serde_json::json!(null))
}

/// POST `/workspace/git/stage-all` — stage every change (`git add -A`).
pub async fn git_stage_all(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    ipc::to_response(run_git_repo_op(&state, body, adl_workspace::stage_all).await)
}

/// POST `/workspace/git/unstage-all` — unstage every change.
pub async fn git_unstage_all(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    ipc::to_response(run_git_repo_op(&state, body, adl_workspace::unstage_all).await)
}

/// POST `/workspace/git/discard-all` — restore tracked files and clean untracked ones.
pub async fn git_discard_all(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    ipc::to_response(run_git_repo_op(&state, body, adl_workspace::discard_all).await)
}

/// POST `/workspace/git/push` — push the current branch (sets upstream when missing).
pub async fn git_push(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    ipc::to_response(run_git_repo_op(&state, body, adl_workspace::push).await)
}

/// POST `/workspace/git/pull` — `git pull --ff-only` for the current branch.
pub async fn git_pull(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    ipc::to_response(run_git_repo_op(&state, body, adl_workspace::pull_ff_only).await)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitCommitBody {
    workspace_path: Option<String>,
    message: String,
}

/// POST `/workspace/git/commit` — commit the staged changes with the given message.
pub async fn git_commit(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: GitCommitBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let workspace_path = match require_workspace_path(input.workspace_path) {
        Ok(path) => path,
        Err(error) => return ipc::to_response(Err(error)),
    };
    let root = match git_root(&state, Some(workspace_path)) {
        Ok(root) => root,
        Err(error) => return ipc::to_response(Err(error)),
    };
    let result =
        tokio::task::spawn_blocking(move || adl_workspace::commit(root.as_path(), &input.message))
            .await
            .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")));
    ipc::to_response(result.and_then(|inner| inner.map(|_| serde_json::json!(null))))
}

/// POST `/workspace/git/unstage` — unstage a file (covers `WorkspaceBridge.gitUnstageFile`).
pub async fn git_unstage_file(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    ipc::to_response(run_git_file_op(&state, body, adl_workspace::unstage_file).await)
}

/// POST `/workspace/git/worktrees` — list linked worktrees of a repository
/// (covers `WorkspaceBridge.listWorktrees`).
pub async fn list_worktrees(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let body_val: serde_json::Value = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let workspace_path = body_val.get("workspacePath").and_then(|v| v.as_str()).map(String::from);
    let root = match git_root(&state, workspace_path) {
        Ok(r) => r,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let result = tokio::task::spawn_blocking(move || -> Result<serde_json::Value, AppError> {
        let worktrees: Vec<adl_types::WorktreeInfo> =
            adl_workspace::list_worktrees(root.as_path())?;
        Ok(serde_json::to_value(&worktrees)?)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")));
    ipc::to_response(result.and_then(|r| r))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorktreeEnsureBody {
    workspace_path: Option<String>,
    input: WorkspaceWorktreeEnsureInput,
}

/// POST `/workspace/git/worktree-ensure` — ensure a sibling worktree for a
/// branch and apply the switch mode (covers `WorkspaceBridge.ensureWorktree`).
/// Returns the worktree path; focusing (openWorkspace) stays client-side so
/// file/changes panels refresh through the normal bootstrap.
pub async fn ensure_worktree(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: WorktreeEnsureBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let root = match git_root(&state, input.workspace_path) {
        Ok(r) => r,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let branch_name = input.input.branch_name.trim().to_string();
    if branch_name.is_empty() {
        return ipc::to_response(Err(AppError::InvalidInput("branch name is required".into())));
    }
    let mode = input.input.mode;
    let allow_stash = input.input.allow_stash;
    let result = tokio::task::spawn_blocking(move || -> Result<serde_json::Value, AppError> {
        let (path, created) =
            adl_workspace::ensure_branch_worktree(root.as_path(), &branch_name, mode, allow_stash)?;
        let git_snapshot = adl_workspace::capture_git_snapshot(&path);
        let result = WorkspaceWorktreeEnsureResultCompat {
            path: path.to_string_lossy().to_string(),
            created,
            branch: branch_name,
            git_snapshot,
        };
        Ok(serde_json::to_value(&result)?)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")));
    ipc::to_response(result.and_then(|r| r))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorktreeRemoveBody {
    workspace_path: Option<String>,
    input: WorkspaceWorktreeRemoveInput,
}

/// POST `/workspace/git/worktree-remove` — remove a branch's sibling worktree.
pub async fn remove_worktree(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: WorktreeRemoveBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let root = match git_root(&state, input.workspace_path) {
        Ok(r) => r,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let branch_name = input.input.branch_name.trim().to_string();
    let force = input.input.force;
    let result = tokio::task::spawn_blocking(move || -> Result<serde_json::Value, AppError> {
        adl_workspace::remove_worktree(root.as_path(), &branch_name, force)?;
        Ok(serde_json::json!(null))
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")));
    ipc::to_response(result.and_then(|r| r))
}

/// POST `/workspace/git/worktree-prune` — prune stale worktree metadata.
pub async fn prune_worktrees(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let body_val: serde_json::Value = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let workspace_path = body_val.get("workspacePath").and_then(|v| v.as_str()).map(String::from);
    let root = match git_root(&state, workspace_path) {
        Ok(r) => r,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let result = tokio::task::spawn_blocking(move || -> Result<serde_json::Value, AppError> {
        adl_workspace::prune_worktrees(root.as_path())?;
        Ok(serde_json::json!(null))
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")));
    ipc::to_response(result.and_then(|r| r))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceWorktreeEnsureResultCompat {
    path: String,
    created: bool,
    branch: String,
    git_snapshot: GitSnapshot,
}

/// POST `/workspace/git/discard` — discard a file's changes (covers
/// `WorkspaceBridge.gitDiscardFile`).
pub async fn git_discard_file(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    ipc::to_response(run_git_file_op(&state, body, adl_workspace::discard_file_changes).await)
}
