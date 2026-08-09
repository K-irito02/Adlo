//! Snapshot domain HTTP endpoints (migrated from `src-tauri/src/commands/
//! snapshot.rs`). Each test drives `app_router` over a fresh `ServerState` via
//! `tower::ServiceExt::oneshot` — no sockets, no subprocesses. Snapshot dirs
//! land under the real app-data `snapshot/<project-hash>` (same as the desktop
//! app) and are removed after each test.

// Integration-test crate: unwraps in helpers (not `#[test]` fns) fall outside
// clippy's `allow-unwrap-in-tests`, so permit them at the crate level.
#![allow(clippy::unwrap_used)]

use ad_server::engine::init_server_state;
use ad_server::router::app_router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use serde_json::{Value, json};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use tower::ServiceExt;

async fn state() -> ad_server::ServerState {
    let dir = std::env::temp_dir().join(format!("adl-snap-api-{}", uuid::Uuid::new_v4()));
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

/// The project hash the handler derives for a workspace root (mirrors
/// `simple_hash` in src-tauri snapshot.rs) so tests can clean up after
/// themselves.
fn project_hash(root: &str) -> String {
    let mut hasher = DefaultHasher::new();
    root.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

/// Clean up the snapshot dir the handler writes for this workspace root.
fn cleanup_snapshot_dir(root: &str) {
    if let Some(data_dir) = dirs::data_dir() {
        let path = data_dir.join("ai-digital-life").join("snapshot").join(project_hash(root));
        let _ = std::fs::remove_dir_all(path);
    }
}

/// Create a temp workspace root with one file and return (dir, workspaceId).
fn make_workspace() -> (PathBuf, String) {
    let dir = std::env::temp_dir().join(format!("adl-snap-ws-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("file.txt"), "original content").unwrap();
    let id = format!("snap-ws-{}", uuid::Uuid::new_v4());
    (dir, id)
}

/// POST /snapshot/create stores a message-level snapshot and returns a
/// SnapshotRecord with the frontend's snake_case shape.
#[tokio::test]
async fn create_snapshot_returns_record() {
    let state = state().await;
    let (ws, wid) = make_workspace();
    let (status, body) = send(
        state,
        Method::POST,
        "/snapshot/create",
        Some(json!({
            "workspaceId": wid,
            "workspaceRoot": ws.to_string_lossy(),
            "messageId": "msg-1",
            "sessionId": "sess-1"
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "create body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    let rec = &body["data"];
    assert!(rec["id"].as_str().is_some(), "id present: {rec}");
    assert_eq!(rec["workspace_id"], wid, "snake_case workspace_id: {rec}");
    assert_eq!(rec["message_id"], "msg-1");
    assert_eq!(rec["session_id"], "sess-1");
    assert!(rec["file_count"].as_u64().unwrap_or(0) >= 1, "files snapshotted: {rec}");
    assert!(rec["git_commit"].is_null() || rec["git_commit"].is_string());
    cleanup_snapshot_dir(&ws.to_string_lossy());
    let _ = std::fs::remove_dir_all(ws);
}

/// POST /snapshot/list returns snapshots created for the workspace.
#[tokio::test]
async fn list_snapshots_returns_created() {
    let state = state().await;
    let (ws, wid) = make_workspace();
    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/snapshot/create",
        Some(json!({
            "workspaceId": wid,
            "workspaceRoot": ws.to_string_lossy(),
            "messageId": "msg-1",
            "sessionId": "sess-1"
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "create body: {body}");
    let id = body["data"]["id"].as_str().unwrap().to_string();

    let (status, body) = send(
        state,
        Method::POST,
        "/snapshot/list",
        Some(json!({ "workspaceId": wid, "workspaceRoot": ws.to_string_lossy() })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "list body: {body}");
    let snapshots = body["data"].as_array().expect("snapshots array");
    assert!(snapshots.iter().any(|s| s["id"] == id), "snapshots: {snapshots:?}");
    cleanup_snapshot_dir(&ws.to_string_lossy());
    let _ = std::fs::remove_dir_all(ws);
}

/// POST /snapshot/revert restores a file modified after the snapshot was taken.
#[tokio::test]
async fn revert_to_snapshot_restores_files() {
    let state = state().await;
    let (ws, wid) = make_workspace();
    let root = ws.to_string_lossy().to_string();
    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/snapshot/create",
        Some(json!({
            "workspaceId": wid,
            "workspaceRoot": root,
            "messageId": "msg-1",
            "sessionId": "sess-1"
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "create body: {body}");
    let id = body["data"]["id"].as_str().unwrap().to_string();

    // Mutate the file, then revert.
    std::fs::write(ws.join("file.txt"), "modified after snapshot").unwrap();
    let (status, body) = send(
        state,
        Method::POST,
        "/snapshot/revert",
        Some(json!({
            "workspaceId": wid,
            "workspaceRoot": root,
            "snapshotId": id
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "revert body: {body}");
    assert_eq!(body["ok"], true, "revert body: {body}");
    assert_eq!(body["data"]["success"], true, "revert body: {body}");
    assert_eq!(body["data"]["snapshot_id"], id);
    assert_eq!(body["data"]["message_id"], "msg-1");
    assert!(body["data"]["files_restored"].as_u64().unwrap_or(0) >= 1);
    let restored = std::fs::read_to_string(ws.join("file.txt")).unwrap();
    assert_eq!(restored, "original content", "file content should be restored");
    cleanup_snapshot_dir(&root);
    let _ = std::fs::remove_dir_all(ws);
}

/// POST /snapshot/revert for an unknown snapshot id → NOT_FOUND.
#[tokio::test]
async fn revert_unknown_snapshot_returns_404() {
    let state = state().await;
    let (ws, wid) = make_workspace();
    let root = ws.to_string_lossy().to_string();
    let (status, body) = send(
        state,
        Method::POST,
        "/snapshot/revert",
        Some(json!({
            "workspaceId": wid,
            "workspaceRoot": root,
            "snapshotId": "no-such-snapshot"
        })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND");
    cleanup_snapshot_dir(&root);
    let _ = std::fs::remove_dir_all(ws);
}

/// POST /snapshot/prune returns a count (0 when nothing exceeds the retention
/// policy) without error.
#[tokio::test]
async fn prune_snapshots_returns_count() {
    let state = state().await;
    let (ws, wid) = make_workspace();
    let root = ws.to_string_lossy().to_string();
    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/snapshot/create",
        Some(json!({
            "workspaceId": wid,
            "workspaceRoot": root,
            "messageId": "msg-1",
            "sessionId": "sess-1"
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "create body: {body}");

    let (status, body) = send(
        state,
        Method::POST,
        "/snapshot/prune",
        Some(json!({ "workspaceId": wid, "workspaceRoot": root })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "prune body: {body}");
    assert!(body["data"].is_number(), "prune count: {body}");
    cleanup_snapshot_dir(&root);
    let _ = std::fs::remove_dir_all(ws);
}
