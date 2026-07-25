use crate::commands::git_vis_cache;
use crate::commands::ipc;
use adl_errors::AppError;
use adl_types::{
    GitVisBranchGraph, GitVisCodeEvolution, GitVisCommitStats, GitVisContributorModules,
    GitVisFileSunburst, IpcResult,
};
use std::path::Path;
use tauri::Manager;

#[tauri::command]
pub async fn workspace_git_vis_commit_stats(
    app: tauri::AppHandle,
    root_path: String,
    since: Option<String>,
    until: Option<String>,
) -> Result<IpcResult<GitVisCommitStats>, AppError> {
    let root = Path::new(&root_path);
    let is_full = since.is_none() && until.is_none();

    if is_full {
        let state = app.state::<crate::state::AppState>();
        if let Some(cached) =
            git_vis_cache::read_cached_chart::<GitVisCommitStats>(&state.db, &root_path, 0, "commit_stats")?
        {
            return Ok(ipc(Ok(cached)));
        }
    }

    let data =
        adl_workspace::capture_commit_stats(root, since.as_deref(), until.as_deref()).await?;

    if is_full {
        let state = app.state::<crate::state::AppState>();
        let _ = git_vis_cache::cache_chart_data(&state.db, &root_path, 0, "commit_stats", &data);
    }

    Ok(ipc(Ok(data)))
}

#[tauri::command]
pub async fn workspace_git_vis_first_commit_year(
    _app: tauri::AppHandle,
    root_path: String,
) -> Result<IpcResult<Option<i32>>, AppError> {
    let root = Path::new(&root_path);
    let year = git_vis_cache::get_first_commit_year(root).await?;
    Ok(ipc(Ok(year)))
}

#[tauri::command]
pub async fn workspace_git_vis_code_evolution(
    _app: tauri::AppHandle,
    root_path: String,
    since: Option<String>,
    until: Option<String>,
) -> Result<IpcResult<GitVisCodeEvolution>, AppError> {
    let root = Path::new(&root_path);
    let data =
        adl_workspace::capture_code_evolution(root, since.as_deref(), until.as_deref()).await?;
    Ok(ipc(Ok(data)))
}

#[tauri::command]
pub async fn workspace_git_vis_contributor_modules(
    _app: tauri::AppHandle,
    root_path: String,
    since: Option<String>,
    until: Option<String>,
) -> Result<IpcResult<GitVisContributorModules>, AppError> {
    let root = Path::new(&root_path);
    let data = adl_workspace::capture_contributor_modules(root, since.as_deref(), until.as_deref())
        .await?;
    Ok(ipc(Ok(data)))
}

#[tauri::command]
pub async fn workspace_git_vis_branch_graph(
    _app: tauri::AppHandle,
    root_path: String,
) -> Result<IpcResult<GitVisBranchGraph>, AppError> {
    let root = Path::new(&root_path);
    let data = adl_workspace::capture_branch_graph(root).await?;
    Ok(ipc(Ok(data)))
}

#[tauri::command]
pub async fn workspace_git_vis_file_sunburst(
    _app: tauri::AppHandle,
    root_path: String,
) -> Result<IpcResult<GitVisFileSunburst>, AppError> {
    let root = Path::new(&root_path);
    let data = adl_workspace::capture_file_sunburst(root).await?;
    Ok(ipc(Ok(data)))
}
