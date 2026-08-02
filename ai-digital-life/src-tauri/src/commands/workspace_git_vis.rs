use crate::commands::git_vis_cache;
use crate::commands::ipc;
use adl_errors::AppError;
use adl_types::{
    GitVisBranchGraph, GitVisCodeEvolution, GitVisCommitStats, GitVisContributorModules,
    GitVisFileHotspots, GitVisFileSunburst, IpcResult,
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
    let state = app.state::<crate::state::AppState>();
    let s = since.clone();
    let u = until.clone();
    let data = git_vis_cache::with_cached(
        &state.db,
        &root_path,
        since.as_deref(),
        until.as_deref(),
        git_vis_cache::CHART_TYPE_DAILY_COMMITS,
        || async { adl_workspace::capture_commit_stats(root, s.as_deref(), u.as_deref()).await },
    )
    .await?;
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
    app: tauri::AppHandle,
    root_path: String,
    since: Option<String>,
    until: Option<String>,
) -> Result<IpcResult<GitVisCodeEvolution>, AppError> {
    let root = Path::new(&root_path);
    let state = app.state::<crate::state::AppState>();
    let s = since.clone();
    let u = until.clone();
    let data = git_vis_cache::with_cached(
        &state.db,
        &root_path,
        since.as_deref(),
        until.as_deref(),
        git_vis_cache::CHART_TYPE_CODE_EVOLUTION,
        || async { adl_workspace::capture_code_evolution(root, s.as_deref(), u.as_deref()).await },
    )
    .await?;
    Ok(ipc(Ok(data)))
}

#[tauri::command]
pub async fn workspace_git_vis_contributor_modules(
    app: tauri::AppHandle,
    root_path: String,
    since: Option<String>,
    until: Option<String>,
) -> Result<IpcResult<GitVisContributorModules>, AppError> {
    let root = Path::new(&root_path);
    let state = app.state::<crate::state::AppState>();
    let s = since.clone();
    let u = until.clone();
    let data = git_vis_cache::with_cached(
        &state.db,
        &root_path,
        since.as_deref(),
        until.as_deref(),
        git_vis_cache::CHART_TYPE_CONTRIBUTOR_MODULES,
        || async {
            adl_workspace::capture_contributor_modules(root, s.as_deref(), u.as_deref()).await
        },
    )
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

#[tauri::command]
pub async fn workspace_git_vis_file_hotspots(
    app: tauri::AppHandle,
    root_path: String,
    since: Option<String>,
    until: Option<String>,
) -> Result<IpcResult<GitVisFileHotspots>, AppError> {
    let root = Path::new(&root_path);
    let state = app.state::<crate::state::AppState>();
    let s = since.clone();
    let u = until.clone();
    let data = git_vis_cache::with_cached(
        &state.db,
        &root_path,
        since.as_deref(),
        until.as_deref(),
        git_vis_cache::CHART_TYPE_FILE_HOTSPOTS,
        || async { adl_workspace::capture_file_hotspots(root, s.as_deref(), u.as_deref()).await },
    )
    .await?;
    Ok(ipc(Ok(data)))
}
