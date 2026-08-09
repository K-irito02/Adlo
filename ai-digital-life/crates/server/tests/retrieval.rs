//! Retrieval domain HTTP endpoints (migrated from
//! `src-tauri/src/commands/retrieval.rs`). Each test drives `app_router` over a
//! fresh `ServerState` via `tower::ServiceExt::oneshot` — no sockets. A real
//! temp workspace dir is opened through the workspace domain so the
//! retrieval-snapshot paths are exercised end-to-end.

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
    let dir = std::env::temp_dir().join(format!("adl-retrieval-api-{}", uuid::Uuid::new_v4()));
    init_server_state(&dir).await.unwrap()
}

fn app(state: ad_server::ServerState) -> axum::Router {
    app_router(state.clone()).with_state(state)
}

async fn send(
    state: ad_server::ServerState,
    method: &str,
    uri: &str,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let m = match method {
        "GET" => Method::GET,
        _ => Method::POST,
    };
    let mut builder = Request::builder().method(m).uri(uri);
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

fn make_workspace_dir() -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("adl-retrieval-ws-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("hello.txt"), "hello world").unwrap();
    dir
}

/// Open a temp workspace through the workspace domain, returning the workspace
/// id from the response. Used to seed the active-workspace + snapshot row.
async fn open_temp_workspace(state: ad_server::ServerState) -> String {
    let dir = make_workspace_dir();
    let (status, body) = send(
        state,
        "POST",
        "/workspace/open",
        Some(json!({ "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "open failed: {body}");
    body["data"]["id"].as_str().unwrap().to_string()
}

/// GET /retrieval/status with no active workspace returns `data: null` (covers
/// `RetrievalBridge.getStatus`).
#[tokio::test]
async fn get_status_without_active_workspace_returns_null() {
    let state = state().await;
    let (status, body) = send(state, "GET", "/retrieval/status", None).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert!(body["data"].is_null(), "no workspace -> null: {body}");
}

/// GET /retrieval/status after opening a workspace returns the snapshot row
/// saved by `workspace_open`.
#[tokio::test]
async fn get_status_after_open_returns_snapshot() {
    let state = state().await;
    let wid = open_temp_workspace(state.clone()).await;

    let (status, body) = send(state, "GET", "/retrieval/status", None).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert_eq!(body["data"]["workspaceId"], wid, "body: {body}");
    assert!(!body["data"]["repoMap"].as_array().unwrap().is_empty(), "repoMap populated: {body}");
    assert_eq!(body["data"]["status"], "completed", "body: {body}");
}

/// POST /retrieval/rebuild rebuilds the snapshot for the active workspace and
/// returns `true` (covers `RetrievalBridge.rebuildIndex`).
#[tokio::test]
async fn rebuild_index_rebuilds_snapshot() {
    let state = state().await;
    let wid = open_temp_workspace(state.clone()).await;

    let (status, body) = send(state.clone(), "POST", "/retrieval/rebuild", None).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert_eq!(body["data"], true, "rebuild returns true: {body}");

    let (_, body) = send(state, "GET", "/retrieval/status", None).await;
    assert_eq!(body["data"]["workspaceId"], wid, "body: {body}");
    assert_eq!(body["data"]["status"], "completed", "body: {body}");
}

/// POST /retrieval/rebuild without an active workspace returns 404 (the Tauri
/// original resolves `current_workspace` before anything else).
#[tokio::test]
async fn rebuild_index_without_active_workspace_returns_404() {
    let state = state().await;
    let (status, body) = send(state, "POST", "/retrieval/rebuild", None).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["ok"], false, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND", "body: {body}");
}
