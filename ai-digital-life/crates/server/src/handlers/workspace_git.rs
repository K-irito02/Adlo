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
    WorkspaceGitBranchSwitchInput, WorkspaceMeta, WorkspaceStatus, now_ms,
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
    let branch_for_closure = branch_name.clone();
    let git_result = tokio::task::spawn_blocking(move || {
        adl_workspace::switch_git_branch(
            PathBuf::from(root_path).as_path(),
            &branch_for_closure,
            allow_stash,
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

/// POST `/workspace/git/unstage` — unstage a file (covers `WorkspaceBridge.gitUnstageFile`).
pub async fn git_unstage_file(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    ipc::to_response(run_git_file_op(&state, body, adl_workspace::unstage_file).await)
}

/// POST `/workspace/git/discard` — discard a file's changes (covers
/// `WorkspaceBridge.gitDiscardFile`).
pub async fn git_discard_file(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    ipc::to_response(run_git_file_op(&state, body, adl_workspace::discard_file_changes).await)
}
