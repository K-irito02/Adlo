//! Workspace-git domain HTTP endpoints (migrated from
//! `src-tauri/src/commands/workspace_git.rs`). Deterministic coverage: the
//! non-git paths fail fast (no repo → error), and a real temp git repo
//! exercises the positive status/branch paths. `git` is required only for the
//! two positive-repo tests (the repo itself is git-based, so git is present).
//! Each test drives `app_router` over a fresh `ServerState` via
//! `tower::ServiceExt::oneshot`.

// Integration-test crate: unwraps in helpers (not `#[test]` fns) fall outside
// clippy's `allow-unwrap-in-tests`, so permit them at the crate level.
#![allow(clippy::unwrap_used)]

use ad_server::engine::init_server_state;
use ad_server::router::app_router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use serde_json::{Value, json};
use std::path::Path;
use tower::ServiceExt;

async fn state() -> ad_server::ServerState {
    let dir = std::env::temp_dir().join(format!("adl-ws-git-api-{}", uuid::Uuid::new_v4()));
    init_server_state(&dir).await.unwrap()
}

fn app(state: ad_server::ServerState) -> axum::Router {
    app_router(state.clone()).with_state(state)
}

async fn send(
    state: ad_server::ServerState,
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
    let dir = std::env::temp_dir().join(format!("adl-ws-git-{}-{}", name, uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn run_git(dir: &Path, args: &[&str]) {
    let status = std::process::Command::new("git").args(args).current_dir(dir).status().unwrap();
    assert!(status.success(), "git {} failed", args.join(" "));
}

/// Initialise a real git repo with one commit (requires git in PATH).
fn init_git_repo(dir: &Path) {
    std::fs::create_dir_all(dir).unwrap();
    run_git(dir, &["init"]);
    run_git(dir, &["config", "user.email", "test@example.com"]);
    run_git(dir, &["config", "user.name", "Test User"]);
    std::fs::write(dir.join("readme.md"), "# test\n").unwrap();
    run_git(dir, &["add", "."]);
    run_git(dir, &["commit", "-m", "init"]);
}

/// Open a temp workspace via POST /workspace/open (used by the branch ops that
/// require an active workspace).
async fn open_workspace(state: ad_server::ServerState, name: &str) -> String {
    let dir = temp_dir(name);
    let (status, body) =
        send(state, "/workspace/open", Some(json!({ "workspacePath": dir.to_string_lossy() })))
            .await;
    assert_eq!(status, StatusCode::OK, "open failed: {body}");
    body["data"]["id"].as_str().unwrap().to_string()
}

/// POST /workspace/git/status on a non-git dir returns an `isRepo:false`
/// snapshot (never errors) (covers `WorkspaceBridge.getGitStatus`).
#[tokio::test]
async fn get_git_status_non_git_dir_returns_is_repo_false() {
    let state = state().await;
    let dir = temp_dir("status");
    let (status, body) = send(
        state,
        "/workspace/git/status",
        Some(json!({ "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert_eq!(body["data"]["isRepo"], false, "body: {body}");
    assert!(body["data"]["branch"].is_null(), "no branch: {body}");
}

/// POST /workspace/git/status without an active workspace and no explicit path
/// returns 404 NOT_FOUND.
#[tokio::test]
async fn get_git_status_without_active_workspace_returns_404() {
    let state = state().await;
    let (status, body) = send(state, "/workspace/git/status", Some(json!({}))).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["ok"], false, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND", "body: {body}");
}

/// POST /workspace/git/status on a real git repo reports the repo + current
/// branch.
#[tokio::test]
async fn get_git_status_in_git_repo_reports_branch() {
    let state = state().await;
    let dir = temp_dir("repo-status");
    init_git_repo(&dir);
    let (status, body) = send(
        state,
        "/workspace/git/status",
        Some(json!({ "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["data"]["isRepo"], true, "body: {body}");
    assert!(body["data"]["branch"].is_string(), "branch resolved: {body}");
}

/// POST /workspace/git/branches on a non-git dir returns an error (the branch
/// listing requires a repo) (covers `WorkspaceBridge.listGitBranches`).
#[tokio::test]
async fn list_branches_non_git_dir_returns_error() {
    let state = state().await;
    let dir = temp_dir("branches");
    let (status, body) = send(
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
    let state = state().await;
    let dir = temp_dir("repo-branches");
    init_git_repo(&dir);
    let (status, body) = send(
        state,
        "/workspace/git/branches",
        Some(json!({ "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    let branches = body["data"].as_array().unwrap();
    assert!(!branches.is_empty(), "at least one branch: {body}");
    assert!(branches.iter().any(|b| b["isCurrent"] == true), "a current branch: {body}");
}

/// POST /workspace/git/switch with an empty branch name returns 400
/// INVALID_INPUT (requires an active workspace, checked first like the Tauri
/// original).
#[tokio::test]
async fn switch_branch_empty_name_returns_400() {
    let state = state().await;
    let _wid = open_workspace(state.clone(), "switch-empty").await;
    let (status, body) = send(
        state,
        "/workspace/git/switch",
        Some(json!({ "input": { "branchName": "", "allowStash": false } })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT", "body: {body}");
}

/// POST /workspace/git/switch on a non-git workspace returns the git error
/// (covers `WorkspaceBridge.switchGitBranch`).
#[tokio::test]
async fn switch_branch_non_git_workspace_returns_error() {
    let state = state().await;
    let _wid = open_workspace(state.clone(), "switch-nongit").await;
    let (status, body) = send(
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
    let state = state().await;
    let _wid = open_workspace(state.clone(), "create-empty").await;
    let (status, body) = send(
        state,
        "/workspace/git/create",
        Some(json!({ "input": { "branchName": "  ", "allowStash": false } })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT", "body: {body}");
}

/// POST /workspace/git/create on a non-git workspace returns the git error
/// (covers `WorkspaceBridge.createGitBranch`).
#[tokio::test]
async fn create_branch_non_git_workspace_returns_error() {
    let state = state().await;
    let _wid = open_workspace(state.clone(), "create-nongit").await;
    let (status, body) = send(
        state,
        "/workspace/git/create",
        Some(json!({ "input": { "branchName": "feature", "allowStash": false } })),
    )
    .await;
    assert!(status.is_client_error(), "non-git workspace -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
}

/// POST /workspace/git/stage on a non-git dir returns an error (covers
/// `WorkspaceBridge.gitStageFile`).
#[tokio::test]
async fn stage_file_non_git_dir_returns_error() {
    let state = state().await;
    let dir = temp_dir("stage");
    let (status, body) = send(
        state,
        "/workspace/git/stage",
        Some(json!({ "relativePath": "a.txt", "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert!(status.is_client_error(), "non-git dir -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
}

/// POST /workspace/git/unstage on a non-git dir returns an error (covers
/// `WorkspaceBridge.gitUnstageFile`).
#[tokio::test]
async fn unstage_file_non_git_dir_returns_error() {
    let state = state().await;
    let dir = temp_dir("unstage");
    let (status, body) = send(
        state,
        "/workspace/git/unstage",
        Some(json!({ "relativePath": "a.txt", "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert!(status.is_client_error(), "non-git dir -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
}

/// POST /workspace/git/discard on a non-git dir returns an error (covers
/// `WorkspaceBridge.gitDiscardFile`).
#[tokio::test]
async fn discard_file_non_git_dir_returns_error() {
    let state = state().await;
    let dir = temp_dir("discard");
    let (status, body) = send(
        state,
        "/workspace/git/discard",
        Some(json!({ "relativePath": "a.txt", "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert!(status.is_client_error(), "non-git dir -> error: {status} {body}");
    assert_eq!(body["ok"], false, "body: {body}");
}
