//! Command domain HTTP endpoints (migrated from `src-tauri/src/commands/
//! command.rs` — custom slash-commands, distinct from commands_config). Each
//! test drives `app_router` over a fresh `ServerState` via
//! `tower::ServiceExt::oneshot` — no sockets, no subprocesses beyond the
//! single `cargo --version` execution used to prove the low-risk path.

// Integration-test crate: unwraps in helpers (not `#[test]` fns) fall outside
// clippy's `allow-unwrap-in-tests`, so permit them at the crate level.
#![allow(clippy::unwrap_used)]

use ad_server::engine::init_server_state;
use ad_server::router::app_router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use serde_json::{Value, json};
use tower::ServiceExt;

async fn state() -> ad_server::ServerState {
    let dir = std::env::temp_dir().join(format!("adl-cmd-api-{}", uuid::Uuid::new_v4()));
    init_server_state(&dir).await.unwrap()
}

fn app(state: ad_server::ServerState) -> axum::Router {
    app_router(state.clone()).with_state(state)
}

async fn send(
    state: ad_server::ServerState,
    method: Method,
    uri: &str,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let mut builder = Request::builder().method(method).uri(uri);
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

/// Open a temp workspace so `current_workspace` resolves.
async fn open_workspace(state: ad_server::ServerState) {
    let dir = std::env::temp_dir().join(format!("adl-cmd-ws-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("package.json"), "{}").unwrap();
    let (status, body) = send(
        state,
        Method::POST,
        "/workspace/open",
        Some(json!({ "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "open body: {body}");
}

/// POST /command/run with a low-risk, shell-less command executes it and
/// returns a completed CommandRunResult.
#[tokio::test]
async fn command_run_low_risk_executes() {
    let state = state().await;
    open_workspace(state.clone()).await;

    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/command/run",
        Some(json!({ "command": "cargo", "args": ["--version"], "shell": false })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "run body: {body}");
    assert_eq!(body["ok"], true, "run body: {body}");
    assert_eq!(body["data"]["status"], "completed", "body: {body}");
    assert!(body["data"]["result"]["success"].as_bool().unwrap_or(false), "body: {body}");
    assert_eq!(body["data"]["result"]["exitCode"], 0, "body: {body}");
    assert!(body["data"]["taskId"].as_str().is_some(), "taskId present: {body}");
    assert!(body["data"]["approvalRequest"].is_null(), "no approval for low risk: {body}");
}

/// POST /command/run with a medium-risk command returns
/// status:"waiting-approval" (persists the request, task + approval, audit)
/// without executing anything.
#[tokio::test]
async fn command_run_medium_risk_waits_for_approval() {
    let state = state().await;
    open_workspace(state.clone()).await;

    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/command/run",
        Some(json!({ "command": "npm", "args": ["install"], "shell": false })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "run body: {body}");
    assert_eq!(body["ok"], true, "run body: {body}");
    assert_eq!(body["data"]["status"], "waiting-approval", "body: {body}");
    let task_id = body["data"]["taskId"].as_str().expect("task id").to_string();
    assert!(!task_id.is_empty());
    assert!(body["data"]["result"].is_null(), "command must NOT execute: {body}");
    let approval = body["data"]["approvalRequest"].as_object().expect("approval request");
    assert!(approval.contains_key("id"), "approval request id: {approval:?}");
    assert!(approval.contains_key("taskId"), "approval request taskId: {approval:?}");

    // The request is persisted and addressable by listRecent.
    let (status, recent) =
        send(state, Method::POST, "/command/recent", Some(json!({ "limit": 10 }))).await;
    assert_eq!(status, StatusCode::OK, "recent body: {recent}");
    assert!(
        recent["data"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["command"] == "npm" && r["args"][0] == "install"),
        "request should be persisted: {recent}"
    );
}

/// POST /command/run without an active workspace → NOT_FOUND.
#[tokio::test]
async fn command_run_without_workspace_returns_404() {
    let state = state().await;
    let (status, body) = send(
        state,
        Method::POST,
        "/command/run",
        Some(json!({ "command": "cargo", "args": ["--version"], "shell": false })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND");
}

/// POST /command/recent returns previously saved command requests.
#[tokio::test]
async fn command_list_recent_returns_saved_requests() {
    let state = state().await;
    open_workspace(state.clone()).await;

    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/command/run",
        Some(json!({ "command": "cargo", "args": ["--version"], "shell": false })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "run body: {body}");
    let request_id = body["data"]["request"]["id"].as_str().unwrap().to_string();

    let (status, body) =
        send(state, Method::POST, "/command/recent", Some(json!({ "limit": 20 }))).await;
    assert_eq!(status, StatusCode::OK, "recent body: {body}");
    let requests = body["data"].as_array().unwrap();
    assert!(requests.iter().any(|r| r["id"] == request_id), "recent: {requests:?}");
}

/// POST /command/run with a malformed body → 400.
#[tokio::test]
async fn command_run_invalid_body_returns_400() {
    let state = state().await;
    let (status, body) = send(state, Method::POST, "/command/run", Some(json!({}))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT");
}
