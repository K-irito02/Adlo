//! Task-center / checkpoint domain HTTP endpoints. Each test drives
//! `app_router` over a fresh `ServerState` via `tower::ServiceExt::oneshot` —
//! no sockets, no subprocesses.

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
    let dir = std::env::temp_dir().join(format!("adl-task-api-{}", uuid::Uuid::new_v4()));
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
    let bytes = axum::body::to_bytes(resp.into_body(), 4 * 1024 * 1024).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

/// POST /task/snapshot returns a well-formed (empty) TaskCenterSnapshot on a
/// fresh state (covers `TaskBridge.getSnapshot`).
#[tokio::test]
async fn task_snapshot_returns_defaults() {
    let state = state().await;
    let (status, body) = send(state, Method::POST, "/task/snapshot", Some(json!({}))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert!(body["data"]["tasks"].as_array().unwrap().is_empty(), "body: {body}");
    assert!(body["data"]["pendingApprovals"].as_array().unwrap().is_empty(), "body: {body}");
    assert!(body["data"]["policy"]["mode"].is_string(), "policy present: {body}");
    assert!(body["data"]["currentSession"].is_null(), "no workspace: {body}");
    assert!(body["data"]["latestCheckpoint"].is_null(), "no checkpoints: {body}");
}

/// POST /task/checkpoint-preview for an unknown checkpoint → data null (covers
/// `TaskBridge.getCheckpointPreview`).
#[tokio::test]
async fn task_checkpoint_preview_unknown_returns_null() {
    let state = state().await;
    let (status, body) = send(
        state,
        Method::POST,
        "/task/checkpoint-preview",
        Some(json!({ "checkpointId": "cp-nope" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert!(body["data"].is_null(), "unknown checkpoint -> null: {body}");
}

/// POST /task/restore-checkpoint for an unknown checkpoint → 404 (covers
/// `TaskBridge.restoreCheckpoint`).
#[tokio::test]
async fn task_restore_checkpoint_unknown_returns_404() {
    let state = state().await;
    let (status, body) = send(
        state,
        Method::POST,
        "/task/restore-checkpoint",
        Some(json!({ "checkpointId": "cp-nope" })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND");
}

/// The approval endpoints are removed — unknown approval routes are not part
/// of the router surface (404).
#[tokio::test]
async fn task_approval_routes_are_removed() {
    let state = state().await;
    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/task/pending-approvals",
        Some(json!({})),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "pending-approvals removed: {body}");
    let (status, body) = send(
        state,
        Method::POST,
        "/task/decide-approval",
        Some(json!({ "approvalId": "x", "decision": "approved" })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "decide-approval removed: {body}");
}
