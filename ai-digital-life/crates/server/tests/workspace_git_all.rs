//! Workspace-git and workspace-git-vis domain HTTP endpoints. Combines tests
//! from the original `workspace_git.rs` and `workspace_git_vis.rs` files.
//! Deterministic coverage: the non-git paths fail fast (no repo → error), and
//! a real temp git repo exercises the positive status/branch paths. `git` is
//! required only for the two positive-repo tests (the repo itself is git-based,
//! so git is present). Each test drives `app_router` over a fresh
//! `ServerState` via `tower::ServiceExt::oneshot`.

#![allow(clippy::unwrap_used)]

mod common;

use common::{init_git_repo, send_post, state, temp_dir};
use serde_json::json;

async fn open_workspace(state: adl_server::ServerState, prefix: &str) -> String {
    common::open_workspace_via_api(state, prefix).await
}

// ---------------------------------------------------------------------------
// Workspace-git tests (originally workspace_git.rs)
// ---------------------------------------------------------------------------

/// POST /workspace/git/status on a non-git dir returns an `isRepo:false`
/// snapshot (never errors) (covers `WorkspaceBridge.getGitStatus`).
#[tokio::test]
async fn get_git_status_non_git_dir_returns_is_repo_false() {
    let state = state("ws-git-api").await;
    let dir = temp_dir("status");
    let (status, body) = send_post(
        state,
        "/workspace/git/status",
        Some(json!({ "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert_eq!(body["data"]["isRepo"], false, "body: {body}");
    assert!(body["data"]["branch"].is_null(), "no branch: {body}");
}

/// POST /workspace/git/status without an active workspace and no explicit path
/// returns 404 NOT_FOUND.
#[tokio::test]
async fn get_git_status_without_active_workspace_returns_404() {
    let state = state("ws-git-api").await;
    let (status, body) = send_post(state, "/workspace/git/status", Some(json!({}))).await;
    assert_eq!(status, axum::http::StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["ok"], false, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND", "body: {body}");
}

/// POST /workspace/git/status on a real git repo reports the repo + current
/// branch.
#[tokio::test]
async fn get_git_status_in_git_repo_reports_branch() {
    let state = state("ws-git-api").await;
    let dir = temp_dir("repo-status");
    init_git_repo(&dir);
    let (status, body) = send_post(
        state,
        "/workspace/git/status",
        Some(json!({ "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert_eq!(body["data"]["isRepo"], true, "body: {body}");
    assert!(body["data"]["branch"].is_string(), "branch resolved: {body}");
}

/// POST /workspace/git/branches on a non-git dir returns an error (the branch
/// listing requires a repo) (covers `WorkspaceBridge.listGitBranches`).
#[tokio::test]
async fn list_branches_non_git_dir_returns_error() {
    let state = state("ws-git-api").await;
    let dir = temp_dir("branches");
    let (status, body) = send_post(
        state,
        "/workspace/git/branches",
        Some(json!({ "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert!(status.is_client_error(), "non-git dir -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
}

/// POST /workspace/git/branches on a real repo returns the branch list with a
/// current branch.
#[tokio::test]
async fn list_branches_in_git_repo_returns_branches() {
    let state = state("ws-git-api").await;
    let dir = temp_dir("repo-branches");
    init_git_repo(&dir);
    let (status, body) = send_post(
        state,
        "/workspace/git/branches",
        Some(json!({ "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    let branches = body["data"].as_array().unwrap();
    assert!(!branches.is_empty(), "at least one branch: {body}");
    assert!(branches.iter().any(|b| b["isCurrent"] == true), "a current branch: {body}");
}

/// POST /workspace/git/switch with an empty branch name returns 400
/// INVALID_INPUT (requires an active workspace, checked first like the Tauri
/// original).
#[tokio::test]
async fn switch_branch_empty_name_returns_400() {
    let state = state("ws-git-api").await;
    let _wid = open_workspace(state.clone(), "switch-empty").await;
    let (status, body) = send_post(
        state,
        "/workspace/git/switch",
        Some(json!({ "input": { "branchName": "", "allowStash": false } })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT", "body: {body}");
}

/// POST /workspace/git/switch on a non-git workspace returns the git error
/// (covers `WorkspaceBridge.switchGitBranch`).
#[tokio::test]
async fn switch_branch_non_git_workspace_returns_error() {
    let state = state("ws-git-api").await;
    let _wid = open_workspace(state.clone(), "switch-nongit").await;
    let (status, body) = send_post(
        state,
        "/workspace/git/switch",
        Some(json!({ "input": { "branchName": "feature", "allowStash": false } })),
    )
    .await;
    assert!(status.is_client_error(), "non-git workspace -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
}

/// POST /workspace/git/create with an empty branch name returns 400
/// INVALID_INPUT.
#[tokio::test]
async fn create_branch_empty_name_returns_400() {
    let state = state("ws-git-api").await;
    let _wid = open_workspace(state.clone(), "create-empty").await;
    let (status, body) = send_post(
        state,
        "/workspace/git/create",
        Some(json!({ "input": { "branchName": "  ", "allowStash": false } })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT", "body: {body}");
}

/// POST /workspace/git/create on a non-git workspace returns the git error
/// (covers `WorkspaceBridge.createGitBranch`).
#[tokio::test]
async fn create_branch_non_git_workspace_returns_error() {
    let state = state("ws-git-api").await;
    let _wid = open_workspace(state.clone(), "create-nongit").await;
    let (status, body) = send_post(
        state,
        "/workspace/git/create",
        Some(json!({ "input": { "branchName": "feature", "allowStash": false } })),
    )
    .await;
    assert!(status.is_client_error(), "non-git workspace -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
}

/// POST /workspace/git/stage on a non-git dir runs the real git subprocess and
/// surfaces the git-level error (covers `WorkspaceBridge.gitStageFile`). The
/// camelCase body (`relativePath`/`workspacePath`) must deserialize — a 400
/// here must come from git, not from body parsing.
#[tokio::test]
async fn stage_file_non_git_dir_returns_error() {
    let state = state("ws-git-api").await;
    let dir = temp_dir("stage");
    let (status, body) = send_post(
        state,
        "/workspace/git/stage",
        Some(json!({ "relativePath": "a.txt", "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert!(status.is_client_error(), "non-git dir -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
    // The git subprocess actually ran and failed (not a body-parse 400).
    assert_eq!(body["error"]["code"], "WORKSPACE_ERROR", "git-level error: {body}");
    assert!(
        body["error"]["message"].as_str().unwrap().to_lowercase().contains("not a git repository"),
        "message mentions the failed git op: {body}"
    );
}

/// POST /workspace/git/unstage on a non-git dir runs the real git subprocess and
/// surfaces the git-level error (covers `WorkspaceBridge.gitUnstageFile`).
#[tokio::test]
async fn unstage_file_non_git_dir_returns_error() {
    let state = state("ws-git-api").await;
    let dir = temp_dir("unstage");
    let (status, body) = send_post(
        state,
        "/workspace/git/unstage",
        Some(json!({ "relativePath": "a.txt", "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert!(status.is_client_error(), "non-git dir -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
    assert_eq!(body["error"]["code"], "WORKSPACE_ERROR", "git-level error: {body}");
    assert!(
        body["error"]["message"].as_str().unwrap().to_lowercase().contains("not a git repository"),
        "message mentions the failed git op: {body}"
    );
}

/// POST /workspace/git/discard on a non-git dir runs the real git subprocess and
/// surfaces the git-level error (covers `WorkspaceBridge.gitDiscardFile`).
#[tokio::test]
async fn discard_file_non_git_dir_returns_error() {
    let state = state("ws-git-api").await;
    let dir = temp_dir("discard");
    let (status, body) = send_post(
        state,
        "/workspace/git/discard",
        Some(json!({ "relativePath": "a.txt", "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert!(status.is_client_error(), "non-git dir -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
    assert_eq!(body["error"]["code"], "WORKSPACE_ERROR", "git-level error: {body}");
    assert!(
        body["error"]["message"].as_str().unwrap().to_lowercase().contains("not a git repository"),
        "message mentions the failed git op: {body}"
    );
}

// ---------------------------------------------------------------------------
// Workspace-git-vis tests (originally workspace_git_vis.rs)
// ---------------------------------------------------------------------------

/// POST /workspace/git-vis/commit-stats on a non-git dir returns an error
/// (covers `GitVisBridge.commitStats`).
#[tokio::test]
async fn commit_stats_non_git_dir_returns_error() {
    let state = state("git-vis-api").await;
    let dir = temp_dir("commit-stats");
    let (status, body) = send_post(
        state,
        "/workspace/git-vis/commit-stats",
        Some(common::root_path_body(&dir)),
    )
    .await;
    assert!(status.is_client_error(), "non-git dir -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
}

/// POST /workspace/git-vis/first-commit-year on a non-git dir returns `null`
/// (the git probe degrades to None, never errors).
#[tokio::test]
async fn first_commit_year_non_git_dir_returns_null() {
    let state = state("git-vis-api").await;
    let dir = temp_dir("first-year");
    let (status, body) = send_post(
        state,
        "/workspace/git-vis/first-commit-year",
        Some(common::root_path_body(&dir)),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert!(body["data"].is_null(), "no commits -> null: {body}");
}

/// POST /workspace/git-vis/first-commit-year on a real repo returns the commit
/// year (positive path; requires git).
#[tokio::test]
async fn first_commit_year_in_git_repo_returns_year() {
    let state = state("git-vis-api").await;
    let dir = temp_dir("first-year-repo");
    init_git_repo(&dir);
    let (status, body) = send_post(
        state,
        "/workspace/git-vis/first-commit-year",
        Some(common::root_path_body(&dir)),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert!(body["data"].as_i64().is_some(), "commit year returned: {body}");
    assert!(body["data"].as_i64().unwrap() >= 1970, "sane year: {body}");
}

/// POST /workspace/git-vis/code-evolution on a non-git dir returns an error.
#[tokio::test]
async fn code_evolution_non_git_dir_returns_error() {
    let state = state("git-vis-api").await;
    let dir = temp_dir("code-evolution");
    let (status, body) = send_post(
        state,
        "/workspace/git-vis/code-evolution",
        Some(common::root_path_body(&dir)),
    )
    .await;
    assert!(status.is_client_error(), "non-git dir -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
}

/// POST /workspace/git-vis/contributor-modules on a non-git dir returns an
/// error.
#[tokio::test]
async fn contributor_modules_non_git_dir_returns_error() {
    let state = state("git-vis-api").await;
    let dir = temp_dir("contributor");
    let (status, body) = send_post(
        state,
        "/workspace/git-vis/contributor-modules",
        Some(common::root_path_body(&dir)),
    )
    .await;
    assert!(status.is_client_error(), "non-git dir -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
}

/// POST /workspace/git-vis/branch-graph on a non-git dir returns an error.
#[tokio::test]
async fn branch_graph_non_git_dir_returns_error() {
    let state = state("git-vis-api").await;
    let dir = temp_dir("branch-graph");
    let (status, body) = send_post(
        state,
        "/workspace/git-vis/branch-graph",
        Some(common::root_path_body(&dir)),
    )
    .await;
    assert!(status.is_client_error(), "non-git dir -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
}

/// POST /workspace/git-vis/file-hotspots on a non-git dir returns an error.
#[tokio::test]
async fn file_hotspots_non_git_dir_returns_error() {
    let state = state("git-vis-api").await;
    let dir = temp_dir("hotspots");
    let (status, body) = send_post(
        state,
        "/workspace/git-vis/file-hotspots",
        Some(common::root_path_body(&dir)),
    )
    .await;
    assert!(status.is_client_error(), "non-git dir -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
}
