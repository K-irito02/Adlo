use crate::commands::ipc;
use adl_errors::AppError;
use adl_types::{
    GitVisBranchGraph, GitVisCodeEvolution, GitVisCommitStats, GitVisContributorModules,
    GitVisFileSunburst, IpcResult,
};
use std::path::Path;

#[tauri::command]
pub async fn workspace_git_vis_commit_stats(
    _app: tauri::AppHandle,
    root_path: String,
    since: Option<String>,
    until: Option<String>,
) -> Result<IpcResult<GitVisCommitStats>, AppError> {
    let root = Path::new(&root_path);
    let data = adl_workspace::capture_commit_stats(root, since.as_deref(), until.as_deref()).await?;
    Ok(ipc(Ok(data)))
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
    let data =
        adl_workspace::capture_contributor_modules(root, since.as_deref(), until.as_deref()).await?;
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
