//! Workspace-git-visualization domain HTTP endpoints (migrated from
//! `src-tauri/src/commands/workspace_git_vis.rs` + `git_vis_cache.rs`). The
//! chart computations run git subprocesses; deterministic coverage uses the
//! non-git error paths, plus a real temp git repo for the positive
//! `first-commit-year` path (the repo itself is git-based, so git is present).
//! Each test drives `app_router` over a fresh `ServerState` via
//! `tower::ServiceExt::oneshot`.

// Integration-test crate: unwraps in helpers (not `#[test]` fns) fall outside
// clippy's `allow-unwrap-in-tests`, so permit them at the crate level.
#![allow(clippy::unwrap_used)]

use adl_server::engine::init_server_state;
use adl_server::router::app_router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use serde_json::{Value, json};
use std::path::Path;
use tower::ServiceExt;

async fn state() -> adl_server::ServerState {
    let dir = std::env::temp_dir().join(format!("adl-git-vis-api-{}", uuid::Uuid::new_v4()));
    init_server_state(&dir).await.unwrap()
}

fn app(state: adl_server::ServerState) -> axum::Router {
    app_router(state.clone()).with_state(state)
}

async fn send(
    state: adl_server::ServerState,
    uri: &str,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let mut builder = Request::builder().method(Method::POST).uri(uri);
    if body.is_some() {
        builder = builder.header("content-type", "application/json");
    }
    let body_bytes = body.map(|v| Body::from(v.to_string())).unwrap_or_else(Body::empty);
    let req = builder.body(body_bytes).unwrap();
    let resp = app(state).oneshot(req).await.unwrap();
    let status = resp.status();
    let bytes = axum::body::to_bytes(resp.into_body(), 64 * 1024).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

fn temp_dir(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("adl-git-vis-{}-{}", name, uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn run_git(dir: &Path, args: &[&str]) {
    let status = std::process::Command::new("git").args(args).current_dir(dir).status().unwrap();
    assert!(status.success(), "git {} failed", args.join(" "));
}

fn init_git_repo(dir: &Path) {
    std::fs::create_dir_all(dir).unwrap();
    run_git(dir, &["init"]);
    run_git(dir, &["config", "user.email", "test@example.com"]);
    run_git(dir, &["config", "user.name", "Test User"]);
    std::fs::write(dir.join("readme.md"), "# test\n").unwrap();
    run_git(dir, &["add", "."]);
    run_git(dir, &["commit", "-m", "init"]);
}

fn root_path_body(dir: &Path) -> Value {
    json!({ "rootPath": dir.display().to_string() })
}

/// POST /workspace/git-vis/commit-stats on a non-git dir returns an error
/// (covers `GitVisBridge.commitStats`).
#[tokio::test]
async fn commit_stats_non_git_dir_returns_error() {
    let state = state().await;
    let dir = temp_dir("commit-stats");
    let (status, body) =
        send(state, "/workspace/git-vis/commit-stats", Some(root_path_body(&dir))).await;
    assert!(status.is_client_error(), "non-git dir -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
}

/// POST /workspace/git-vis/first-commit-year on a non-git dir returns `null`
/// (the git probe degrades to None, never errors).
#[tokio::test]
async fn first_commit_year_non_git_dir_returns_null() {
    let state = state().await;
    let dir = temp_dir("first-year");
    let (status, body) =
        send(state, "/workspace/git-vis/first-commit-year", Some(root_path_body(&dir))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert!(body["data"].is_null(), "no commits -> null: {body}");
}

/// POST /workspace/git-vis/first-commit-year on a real repo returns the commit
/// year (positive path; requires git).
#[tokio::test]
async fn first_commit_year_in_git_repo_returns_year() {
    let state = state().await;
    let dir = temp_dir("first-year-repo");
    init_git_repo(&dir);
    let (status, body) =
        send(state, "/workspace/git-vis/first-commit-year", Some(root_path_body(&dir))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert!(body["data"].as_i64().is_some(), "commit year returned: {body}");
    assert!(body["data"].as_i64().unwrap() >= 1970, "sane year: {body}");
}

/// POST /workspace/git-vis/code-evolution on a non-git dir returns an error.
#[tokio::test]
async fn code_evolution_non_git_dir_returns_error() {
    let state = state().await;
    let dir = temp_dir("code-evolution");
    let (status, body) =
        send(state, "/workspace/git-vis/code-evolution", Some(root_path_body(&dir))).await;
    assert!(status.is_client_error(), "non-git dir -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
}

/// POST /workspace/git-vis/contributor-modules on a non-git dir returns an
/// error.
#[tokio::test]
async fn contributor_modules_non_git_dir_returns_error() {
    let state = state().await;
    let dir = temp_dir("contributor");
    let (status, body) =
        send(state, "/workspace/git-vis/contributor-modules", Some(root_path_body(&dir))).await;
    assert!(status.is_client_error(), "non-git dir -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
}

/// POST /workspace/git-vis/branch-graph on a non-git dir returns an error.
#[tokio::test]
async fn branch_graph_non_git_dir_returns_error() {
    let state = state().await;
    let dir = temp_dir("branch-graph");
    let (status, body) =
        send(state, "/workspace/git-vis/branch-graph", Some(root_path_body(&dir))).await;
    assert!(status.is_client_error(), "non-git dir -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
}

/// POST /workspace/git-vis/file-hotspots on a non-git dir returns an error.
#[tokio::test]
async fn file_hotspots_non_git_dir_returns_error() {
    let state = state().await;
    let dir = temp_dir("hotspots");
    let (status, body) =
        send(state, "/workspace/git-vis/file-hotspots", Some(root_path_body(&dir))).await;
    assert!(status.is_client_error(), "non-git dir -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
}
