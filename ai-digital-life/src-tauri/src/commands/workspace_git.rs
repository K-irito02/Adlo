use crate::commands::ipc;
use crate::state::AppState;
use tauri::Manager;
use adl_errors::AppError;
use adl_kernel::{
    now_ms, GitBranchSummary, GitSnapshot, IpcResult, WorkspaceGitBranchChangeResult,
    WorkspaceGitBranchCreateInput, WorkspaceGitBranchSwitchInput, WorkspaceMeta, WorkspaceStatus,
};
use std::path::{Path, PathBuf};

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
pub fn workspace_list_git_branches(
    state: tauri::State<'_, AppState>,
    workspace_path: Option<String>,
) -> IpcResult<Vec<GitBranchSummary>> {
    let path = match workspace_path {
        Some(p) => PathBuf::from(p),
        None => {
            return ipc(crate::commands::workspace::with_workspace(&state, |workspace| {
                adl_workspace::list_git_branches(PathBuf::from(&workspace.root_path).as_path())
            }));
        },
    };
    ipc(adl_workspace::list_git_branches(path.as_path()))
}

#[tauri::command]
pub fn workspace_switch_git_branch(
    state: tauri::State<'_, AppState>,
    input: WorkspaceGitBranchSwitchInput,
) -> IpcResult<WorkspaceGitBranchChangeResult> {
    crate::commands::ipc_try(|| {
        let workspace = crate::commands::workspace::current_workspace(&state)?;
        let branch_name = input.branch_name.trim();
        if branch_name.is_empty() {
            return Err(AppError::InvalidInput("branch name is required".into()));
        }
        let (git_snapshot, stashed_changes, previous_branch, has_restored) =
            adl_workspace::switch_git_branch(
                PathBuf::from(&workspace.root_path).as_path(),
                branch_name,
                input.allow_stash,
            )?;
        build_branch_change_result(
            &state,
            workspace,
            git_snapshot,
            previous_branch,
            stashed_changes,
            branch_name,
            has_restored,
        )
    })
}

#[tauri::command]
pub fn workspace_create_git_branch(
    state: tauri::State<'_, AppState>,
    input: WorkspaceGitBranchCreateInput,
) -> IpcResult<WorkspaceGitBranchChangeResult> {
    crate::commands::ipc_try(|| {
        let workspace = crate::commands::workspace::current_workspace(&state)?;
        let branch_name = input.branch_name.trim();
        if branch_name.is_empty() {
            return Err(AppError::InvalidInput("branch name is required".into()));
        }
        let (git_snapshot, stashed_changes, previous_branch) = adl_workspace::create_git_branch(
            PathBuf::from(&workspace.root_path).as_path(),
            branch_name,
            input.base_branch.as_deref(),
            input.allow_stash,
        )?;
        build_branch_change_result(
            &state,
            workspace,
            git_snapshot,
            previous_branch,
            stashed_changes,
            branch_name,
            false,
        )
    })
}

fn run_git_file_op(
    state: &AppState,
    workspace_path: Option<String>,
    relative_path: &str,
    op: impl FnOnce(&Path, &str) -> Result<(), AppError>,
) -> IpcResult<()> {
    let path = match workspace_path {
        Some(p) => PathBuf::from(p),
        None => {
            return ipc(crate::commands::workspace::with_workspace(state, |workspace| {
                op(PathBuf::from(&workspace.root_path).as_path(), relative_path)
            }));
        },
    };
    ipc(op(path.as_path(), relative_path))
}

#[tauri::command]
pub fn workspace_git_stage_file(
    state: tauri::State<'_, AppState>,
    relative_path: String,
    workspace_path: Option<String>,
) -> IpcResult<()> {
    run_git_file_op(&state, workspace_path, &relative_path, |root, path| {
        adl_workspace::stage_file(root, path)
    })
}

#[tauri::command]
pub fn workspace_git_unstage_file(
    state: tauri::State<'_, AppState>,
    relative_path: String,
    workspace_path: Option<String>,
) -> IpcResult<()> {
    run_git_file_op(&state, workspace_path, &relative_path, |root, path| {
        adl_workspace::unstage_file(root, path)
    })
}

#[tauri::command]
pub fn workspace_git_discard_file(
    state: tauri::State<'_, AppState>,
    relative_path: String,
    workspace_path: Option<String>,
) -> IpcResult<()> {
    run_git_file_op(&state, workspace_path, &relative_path, |root, path| {
        adl_workspace::discard_file_changes(root, path)
    })
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
