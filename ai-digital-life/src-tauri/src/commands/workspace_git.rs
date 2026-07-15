use crate::commands::ipc;
use crate::state::AppState;
use adl_errors::AppError;
use adl_types::{
    now_ms, GitBranchSummary, GitSnapshot, IpcResult, WorkspaceGitBranchChangeResult,
    WorkspaceGitBranchCreateInput, WorkspaceGitBranchSwitchInput, WorkspaceMeta, WorkspaceStatus,
};
use std::path::{Path, PathBuf};
use tauri::Manager;

pub(crate) fn persist_workspace_meta(
    state: &AppState,
    meta: &WorkspaceMeta,
) -> Result<(), AppError> {
    state.db.save_entity(
        adl_storage::EntityTable::Workspaces,
        &meta.id,
        Some(&meta.id),
        None,
        Some("ready"),
        meta,
    )?;
    state.db.put_state("current_workspace", &serde_json::to_string(meta)?)?;
    *state
        .current_workspace
        .write()
        .map_err(|_| AppError::Internal("workspace mutex poisoned".into()))? = Some(meta.clone());
    Ok(())
}

fn update_workspace_after_git_change(
    state: &AppState,
    workspace: WorkspaceMeta,
    git_snapshot: &GitSnapshot,
) -> Result<WorkspaceMeta, AppError> {
    let now = now_ms();
    let updated_workspace = WorkspaceMeta {
        git_snapshot: Some(git_snapshot.clone()),
        status: WorkspaceStatus::Ready,
        updated_at: now,
        last_opened_at: now,
        ..workspace
    };
    persist_workspace_meta(state, &updated_workspace)?;
    Ok(updated_workspace)
}

#[tauri::command]
pub async fn workspace_get_git_status(
    app: tauri::AppHandle,
    workspace_path: Option<String>,
) -> Result<IpcResult<GitSnapshot>, AppError> {
    let state = app.state::<AppState>();
    let path_buf = match workspace_path {
        Some(p) => PathBuf::from(p),
        None => {
            let ws = crate::commands::workspace::current_workspace(&state)?;
            PathBuf::from(&ws.root_path)
        },
    };
    let snapshot = adl_workspace::capture_git_snapshot_async(&path_buf).await;
    Ok(ipc(Ok(snapshot)))
}

#[tauri::command]
pub async fn workspace_list_git_branches(
    app: tauri::AppHandle,
    workspace_path: Option<String>,
) -> Result<IpcResult<Vec<GitBranchSummary>>, AppError> {
    let state = app.state::<AppState>();
    let path = match workspace_path {
        Some(p) => PathBuf::from(p),
        None => {
            let ws = crate::commands::workspace::current_workspace(&state)?;
            PathBuf::from(&ws.root_path)
        },
    };
    let branches =
        tokio::task::spawn_blocking(move || adl_workspace::list_git_branches(path.as_path()))
            .await
            .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(branches)))
}

#[tauri::command]
pub async fn workspace_switch_git_branch(
    app: tauri::AppHandle,
    input: WorkspaceGitBranchSwitchInput,
) -> Result<IpcResult<WorkspaceGitBranchChangeResult>, AppError> {
    let state = app.state::<AppState>();
    let workspace = crate::commands::workspace::current_workspace(&state)?;
    let branch_name = input.branch_name.trim().to_string();
    if branch_name.is_empty() {
        return Ok(ipc(Err(AppError::InvalidInput("branch name is required".into()))));
    }
    let root_path = workspace.root_path.clone();
    let allow_stash = input.allow_stash;
    let branch_name_for_closure = branch_name.clone();
    let (git_snapshot, stashed_changes, previous_branch, has_restored) =
        tokio::task::spawn_blocking(move || {
            adl_workspace::switch_git_branch(
                PathBuf::from(root_path).as_path(),
                &branch_name_for_closure,
                allow_stash,
            )
        })
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    let result = build_branch_change_result(
        &state,
        workspace,
        git_snapshot,
        previous_branch,
        stashed_changes,
        &branch_name,
        has_restored,
    )?;
    Ok(ipc(Ok(result)))
}

#[tauri::command]
pub async fn workspace_create_git_branch(
    app: tauri::AppHandle,
    input: WorkspaceGitBranchCreateInput,
) -> Result<IpcResult<WorkspaceGitBranchChangeResult>, AppError> {
    let state = app.state::<AppState>();
    let workspace = crate::commands::workspace::current_workspace(&state)?;
    let branch_name = input.branch_name.trim().to_string();
    if branch_name.is_empty() {
        return Ok(ipc(Err(AppError::InvalidInput("branch name is required".into()))));
    }
    let root_path = workspace.root_path.clone();
    let base_branch = input.base_branch;
    let allow_stash = input.allow_stash;
    let branch_name_for_closure = branch_name.clone();
    let (git_snapshot, stashed_changes, previous_branch) = tokio::task::spawn_blocking(move || {
        adl_workspace::create_git_branch(
            PathBuf::from(root_path).as_path(),
            &branch_name_for_closure,
            base_branch.as_deref(),
            allow_stash,
        )
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    let result = build_branch_change_result(
        &state,
        workspace,
        git_snapshot,
        previous_branch,
        stashed_changes,
        &branch_name,
        false,
    )?;
    Ok(ipc(Ok(result)))
}

async fn run_git_file_op(
    state: &AppState,
    workspace_path: Option<String>,
    relative_path: String,
    op: fn(&Path, &str) -> Result<(), AppError>,
) -> Result<(), AppError> {
    let root_path = match workspace_path {
        Some(p) => p,
        None => {
            let ws = crate::commands::workspace::current_workspace(state)?;
            ws.root_path
        },
    };
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(root_path);
        op(path.as_path(), &relative_path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?
}

#[tauri::command]
pub async fn workspace_git_stage_file(
    app: tauri::AppHandle,
    relative_path: String,
    workspace_path: Option<String>,
) -> Result<IpcResult<()>, AppError> {
    let state = app.state::<AppState>();
    run_git_file_op(&state, workspace_path, relative_path, |root, path| {
        adl_workspace::stage_file(root, path)
    })
    .await?;
    Ok(ipc(Ok(())))
}

#[tauri::command]
pub async fn workspace_git_unstage_file(
    app: tauri::AppHandle,
    relative_path: String,
    workspace_path: Option<String>,
) -> Result<IpcResult<()>, AppError> {
    let state = app.state::<AppState>();
    run_git_file_op(&state, workspace_path, relative_path, |root, path| {
        adl_workspace::unstage_file(root, path)
    })
    .await?;
    Ok(ipc(Ok(())))
}

#[tauri::command]
pub async fn workspace_git_discard_file(
    app: tauri::AppHandle,
    relative_path: String,
    workspace_path: Option<String>,
) -> Result<IpcResult<()>, AppError> {
    let state = app.state::<AppState>();
    run_git_file_op(&state, workspace_path, relative_path, |root, path| {
        adl_workspace::discard_file_changes(root, path)
    })
    .await?;
    Ok(ipc(Ok(())))
}

fn build_branch_change_result(
    state: &AppState,
    workspace: WorkspaceMeta,
    git_snapshot: GitSnapshot,
    previous_branch: Option<String>,
    stashed_changes: bool,
    branch_name: &str,
    has_restored: bool,
) -> Result<WorkspaceGitBranchChangeResult, AppError> {
    let current_branch = git_snapshot.branch.clone().unwrap_or_else(|| branch_name.to_string());
    let updated_workspace = update_workspace_after_git_change(state, workspace, &git_snapshot)?;
    Ok(WorkspaceGitBranchChangeResult {
        workspace: updated_workspace,
        git_snapshot,
        previous_branch,
        current_branch,
        stashed_changes,
        has_restored,
    })
}
