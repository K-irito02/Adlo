use crate::commands::ipc;
use crate::state::AppState;
use adl_errors::AppError;
use adl_kernel::{
    now_ms, GitBranchSummary, GitSnapshot, IpcResult, WorkspaceGitBranchChangeResult,
    WorkspaceGitBranchCreateInput, WorkspaceGitBranchSwitchInput, WorkspaceMeta, WorkspaceStatus,
};
use std::path::PathBuf;

fn persist_workspace_meta(state: &AppState, meta: &WorkspaceMeta) -> Result<(), AppError> {
    state.db.save_entity(
        adl_storage::EntityTable::Workspaces,
        &meta.id,
        Some(&meta.id),
        None,
        Some("ready"),
        meta,
    )?;
    state
        .db
        .put_state("current_workspace", &serde_json::to_string(meta)?)?;
    *state
        .current_workspace
        .lock()
        .expect("workspace mutex poisoned") = Some(meta.clone());
    Ok(())
}

fn update_workspace_after_git_change(
    state: &AppState,
    workspace: &WorkspaceMeta,
    git_snapshot: GitSnapshot,
) -> Result<WorkspaceMeta, AppError> {
    let now = now_ms();
    let updated_workspace = WorkspaceMeta {
        git_snapshot: Some(git_snapshot),
        status: WorkspaceStatus::Ready,
        updated_at: now,
        last_opened_at: now,
        ..workspace.clone()
    };
    persist_workspace_meta(state, &updated_workspace)?;
    Ok(updated_workspace)
}

#[tauri::command]
pub fn workspace_get_git_status(
    state: tauri::State<'_, AppState>,
    workspace_path: Option<String>,
) -> IpcResult<GitSnapshot> {
    let path = match workspace_path {
        Some(p) => PathBuf::from(p),
        None => {
            return ipc(crate::commands::workspace::with_workspace(&state, |workspace| {
                Ok(adl_workspace::capture_git_snapshot(
                    PathBuf::from(&workspace.root_path).as_path(),
                ))
            }));
        }
    };
    let snapshot = adl_workspace::capture_git_snapshot(path.as_path());
    ipc(Ok(snapshot))
}

#[tauri::command]
pub fn workspace_list_git_branches(
    state: tauri::State<'_, AppState>,
) -> IpcResult<Vec<GitBranchSummary>> {
    ipc(crate::commands::workspace::with_workspace(&state, |workspace| {
        adl_workspace::list_git_branches(PathBuf::from(&workspace.root_path).as_path())
    }))
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
        let (git_snapshot, stashed_changes, previous_branch) = adl_workspace::switch_git_branch(
            PathBuf::from(&workspace.root_path).as_path(),
            branch_name,
            input.allow_stash,
        )?;
        let current_branch = git_snapshot
            .branch
            .clone()
            .unwrap_or_else(|| branch_name.to_string());
        let updated_workspace =
            update_workspace_after_git_change(&state, &workspace, git_snapshot.clone())?;
        Ok(WorkspaceGitBranchChangeResult {
            workspace: updated_workspace,
            git_snapshot,
            previous_branch,
            current_branch,
            stashed_changes,
        })
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
        let current_branch = git_snapshot
            .branch
            .clone()
            .unwrap_or_else(|| branch_name.to_string());
        let updated_workspace =
            update_workspace_after_git_change(&state, &workspace, git_snapshot.clone())?;
        Ok(WorkspaceGitBranchChangeResult {
            workspace: updated_workspace,
            git_snapshot,
            previous_branch,
            current_branch,
            stashed_changes,
        })
    })
}