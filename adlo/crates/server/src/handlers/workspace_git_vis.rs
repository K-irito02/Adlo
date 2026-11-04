//! Workspace-git-visualization domain HTTP handlers — migrated from
//! `src-tauri/src/commands/workspace_git_vis.rs`. Chart computations run git
//! subprocesses via `adl_workspace::capture_*`; the cache wrapper lives in
//! [`crate::git_vis_cache`] (faithful port of the Tauri `git_vis_cache.rs`).
//!
//! Note on the recipe: `with_cached` is an async fn that interleaves tiny
//! `git_vis_cache` table reads/writes around an awaited fetcher, exactly as the
//! Tauri original — it is awaited directly rather than wrapped in
//! `spawn_blocking` (the per-query work is a single fast index lookup).

use crate::ServerState;
use crate::git_vis_cache::{
    CHART_TYPE_CODE_EVOLUTION, CHART_TYPE_CONTRIBUTOR_MODULES, CHART_TYPE_DAILY_COMMITS,
    CHART_TYPE_FILE_HOTSPOTS, get_first_commit_year, with_cached,
};
use crate::ipc;
use adl_errors::AppError;
use adl_types::{
    GitVisBranchGraph, GitVisCodeEvolution, GitVisCommitStats, GitVisContributorModules,
    GitVisFileHotspots,
};
use axum::extract::State;
use axum::response::IntoResponse;
use std::path::Path;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitVisBody {
    root_path: String,
    since: Option<String>,
    until: Option<String>,
}

async fn body_input(body: axum::body::Bytes) -> Result<GitVisBody, AppError> {
    ipc::json_body(body).await.map_err(|(_, msg)| AppError::InvalidInput(msg))
}

/// POST `/workspace/git-vis/commit-stats` — daily commit stats chart (covers
/// `GitVisBridge.commitStats`).
pub async fn commit_stats(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input = match body_input(body).await {
        Ok(v) => v,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let root = Path::new(&input.root_path);
    let s = input.since.clone();
    let u = input.until.clone();
    let db = state.db.clone();
    let result = with_cached(
        &db,
        &input.root_path,
        input.since.as_deref(),
        input.until.as_deref(),
        CHART_TYPE_DAILY_COMMITS,
        || async { adl_workspace::capture_commit_stats(root, s.as_deref(), u.as_deref()).await },
    )
    .await
    .and_then(|data: GitVisCommitStats| serde_json::to_value(&data).map_err(AppError::from));
    ipc::to_response(result)
}

/// POST `/workspace/git-vis/first-commit-year` — year of the first commit
/// (covers `GitVisBridge.firstCommitYear`).
pub async fn first_commit_year(
    State(_state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input = match body_input(body).await {
        Ok(v) => v,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let root = Path::new(&input.root_path);
    let result = get_first_commit_year(root)
        .await
        .and_then(|year| serde_json::to_value(year).map_err(AppError::from));
    ipc::to_response(result)
}

/// POST `/workspace/git-vis/code-evolution` — code evolution chart (covers
/// `GitVisBridge.codeEvolution`).
pub async fn code_evolution(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input = match body_input(body).await {
        Ok(v) => v,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let root = Path::new(&input.root_path);
    let s = input.since.clone();
    let u = input.until.clone();
    let db = state.db.clone();
    let result = with_cached(
        &db,
        &input.root_path,
        input.since.as_deref(),
        input.until.as_deref(),
        CHART_TYPE_CODE_EVOLUTION,
        || async { adl_workspace::capture_code_evolution(root, s.as_deref(), u.as_deref()).await },
    )
    .await
    .and_then(|data: GitVisCodeEvolution| serde_json::to_value(&data).map_err(AppError::from));
    ipc::to_response(result)
}

/// POST `/workspace/git-vis/contributor-modules` — contributor → module chart
/// (covers `GitVisBridge.contributorModules`).
pub async fn contributor_modules(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input = match body_input(body).await {
        Ok(v) => v,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let root = Path::new(&input.root_path);
    let s = input.since.clone();
    let u = input.until.clone();
    let db = state.db.clone();
    let result = with_cached(
        &db,
        &input.root_path,
        input.since.as_deref(),
        input.until.as_deref(),
        CHART_TYPE_CONTRIBUTOR_MODULES,
        || async {
            adl_workspace::capture_contributor_modules(root, s.as_deref(), u.as_deref()).await
        },
    )
    .await
    .and_then(|data: GitVisContributorModules| serde_json::to_value(&data).map_err(AppError::from));
    ipc::to_response(result)
}

/// POST `/workspace/git-vis/branch-graph` — branch topology graph (covers
/// `GitVisBridge.branchGraph`).
pub async fn branch_graph(
    State(_state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input = match body_input(body).await {
        Ok(v) => v,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let root = Path::new(&input.root_path);
    let result = adl_workspace::capture_branch_graph(root)
        .await
        .and_then(|data: GitVisBranchGraph| serde_json::to_value(&data).map_err(AppError::from));
    ipc::to_response(result)
}

/// POST `/workspace/git-vis/file-hotspots` — file hotspots chart (covers
/// `GitVisBridge.fileHotspots`).
pub async fn file_hotspots(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input = match body_input(body).await {
        Ok(v) => v,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let root = Path::new(&input.root_path);
    let s = input.since.clone();
    let u = input.until.clone();
    let db = state.db.clone();
    let result = with_cached(
        &db,
        &input.root_path,
        input.since.as_deref(),
        input.until.as_deref(),
        CHART_TYPE_FILE_HOTSPOTS,
        || async { adl_workspace::capture_file_hotspots(root, s.as_deref(), u.as_deref()).await },
    )
    .await
    .and_then(|data: GitVisFileHotspots| serde_json::to_value(&data).map_err(AppError::from));
    ipc::to_response(result)
}
