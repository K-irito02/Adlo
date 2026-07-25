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

    // Cache: only for year-range queries (since=YYYY-01-01, until=YYYY-12-31)
    // Historical years (year < currentYear) return cached data; current year always re-fetches
    if let (Some(s), Some(_u)) = (&since, &until) {
        if let Some(year) = git_vis_cache::extract_year(s) {
            if git_vis_cache::is_historical_year(year) {
                let state = app.state::<crate::state::AppState>();
                if let Some(cached) = git_vis_cache::read_cached_chart::<GitVisCommitStats>(
                    &state.db,
                    &root_path,
                    year,
                    git_vis_cache::CHART_TYPE_DAILY_COMMITS,
                )? {
                    return Ok(ipc(Ok(cached)));
                }
            }
        }
    }

    // Cache miss or current year: execute git log
    let data = adl_workspace::capture_commit_stats(root, since.as_deref(), until.as_deref()).await?;

    // Cache historical year results for future use
    if let (Some(s), Some(_u)) = (&since, &until) {
        if let Some(year) = git_vis_cache::extract_year(s) {
            if git_vis_cache::is_historical_year(year) {
                let state = app.state::<crate::state::AppState>();
                let _ = git_vis_cache::cache_chart_data(
                    &state.db,
                    &root_path,
                    year,
                    git_vis_cache::CHART_TYPE_DAILY_COMMITS,
                    &data,
                );
            }
        }
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
