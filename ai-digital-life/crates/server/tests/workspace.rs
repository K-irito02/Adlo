//! Workspace domain HTTP endpoints (migrated from `src-tauri/src/commands/
//! workspace.rs`). Each test drives `app_router` over a fresh `ServerState` via
//! `tower::ServiceExt::oneshot` — no sockets, no subprocesses.

// Integration-test crate: unwraps in helpers (not `#[test]` fns) fall outside
// clippy's `allow-unwrap-in-tests`, so permit them at the crate level.
#![allow(clippy::unwrap_used)]

use adl_server::engine::init_server_state;
use adl_server::router::app_router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use serde_json::{Value, json};
use std::path::PathBuf;
use tower::ServiceExt;

async fn state() -> adl_server::ServerState {
    let dir = std::env::temp_dir().join(format!("adl-ws-api-{}", uuid::Uuid::new_v4()));
    init_server_state(&dir).await.unwrap()
}

fn app(state: adl_server::ServerState) -> axum::Router {
    app_router(state.clone()).with_state(state)
}

async fn send(
    state: adl_server::ServerState,
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

/// Create a fresh temp workspace root with a deterministic marker (so
/// `detect_root` resolves the dir itself, not an ancestor) plus a sample file.
fn make_workspace() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("adl-ws-src-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("package.json"), "{}").unwrap();
    std::fs::write(dir.join("notes.txt"), "hello adl-server\nsecond line").unwrap();
    dir
}

/// GET /workspace/current reflects the active workspace after open and after clear.
#[tokio::test]
async fn get_current_returns_active_workspace() {
    let state = state().await;
    let ws = make_workspace();

    // No active workspace yet → data null.
    let (status, body) = send(state.clone(), Method::GET, "/workspace/current", None).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert!(body["data"].is_null(), "body: {body}");

    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/workspace/open",
        Some(json!({ "workspacePath": ws.to_string_lossy() })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "open body: {body}");
    let id = body["data"]["id"].as_str().expect("workspace id").to_string();

    let (status, body) = send(state.clone(), Method::GET, "/workspace/current", None).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["data"]["id"], id, "body: {body}");
    assert_eq!(body["data"]["rootPath"], ws.to_string_lossy().to_string(), "body: {body}");

    let (status, body) = send(state.clone(), Method::POST, "/workspace/clear-current", None).await;
    assert_eq!(status, StatusCode::OK, "clear body: {body}");

    let (status, body) = send(state, Method::GET, "/workspace/current", None).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert!(body["data"].is_null(), "body: {body}");
    let _ = std::fs::remove_dir_all(ws);
}

/// POST /workspace/open opens a path, returns its metadata, persists it as the
/// active workspace and makes the file tree resolvable.
#[tokio::test]
async fn open_workspace_returns_meta_and_activates() {
    let state = state().await;
    let ws = make_workspace();
    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/workspace/open",
        Some(json!({ "workspacePath": ws.to_string_lossy() })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    let id = body["data"]["id"].as_str().expect("workspace id").to_string();
    assert!(!id.is_empty());

    // Active workspace: tree resolves without an explicit workspacePath.
    let (status, tree) = send(state, Method::POST, "/workspace/tree", Some(json!({}))).await;
    assert_eq!(status, StatusCode::OK, "tree body: {tree}");
    let nodes = tree["data"].as_array().expect("tree array");
    assert!(
        nodes.iter().any(|n| n["path"] == "notes.txt" || n["name"] == "notes.txt"),
        "tree should contain notes.txt: {nodes:?}"
    );
    let _ = std::fs::remove_dir_all(ws);
}

/// POST /workspace/open on a non-existent path → non-2xx with an error code.
#[tokio::test]
async fn open_workspace_nonexistent_returns_error() {
    let state = state().await;
    let (status, body) = send(
        state,
        Method::POST,
        "/workspace/open",
        Some(json!({ "workspacePath": "Z:/definitely/not/a/real/path/adl-ws-missing" })),
    )
    .await;
    assert!(!status.is_success(), "expected error status, got {status}: {body}");
    assert_eq!(body["ok"], false);
    assert!(body["error"]["code"].as_str().is_some(), "error code expected in body: {body}");
}

/// POST /workspace/clear-current clears the active workspace; a subsequent tree
/// listing without an explicit workspacePath then fails with NOT_FOUND.
#[tokio::test]
async fn clear_current_clears_active_workspace() {
    let state = state().await;
    let ws = make_workspace();
    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/workspace/open",
        Some(json!({ "workspacePath": ws.to_string_lossy() })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "open body: {body}");

    let (status, body) = send(state.clone(), Method::POST, "/workspace/clear-current", None).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["data"], true);

    let (status, body) = send(state, Method::POST, "/workspace/tree", Some(json!({}))).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND");
    let _ = std::fs::remove_dir_all(ws);
}

/// File operations: create / read / rename / duplicate / move / delete.
#[tokio::test]
async fn file_crud_round_trip() {
    let state = state().await;
    let ws = make_workspace();
    let (_, body) = send(
        state.clone(),
        Method::POST,
        "/workspace/open",
        Some(json!({ "workspacePath": ws.to_string_lossy() })),
    )
    .await;
    assert_eq!(body["ok"], true);

    // create
    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/workspace/file",
        Some(json!({ "relativePath": "docs/a.md", "content": "# hi" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "create body: {body}");
    assert_eq!(body["data"]["path"], "docs/a.md");

    // read
    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/workspace/read",
        Some(json!({ "relativePath": "docs/a.md" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "read body: {body}");
    assert_eq!(body["data"]["content"], "# hi");

    // rename
    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/workspace/rename",
        Some(json!({ "relativePath": "docs/a.md", "newName": "b.md" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "rename body: {body}");
    assert_eq!(body["data"], true);

    // duplicate
    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/workspace/duplicate",
        Some(json!({ "relativePath": "docs/b.md", "newPath": "docs/c.md" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "duplicate body: {body}");
    assert_eq!(body["data"], true);

    // move
    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/workspace/move",
        Some(json!({ "relativePath": "docs/c.md", "newPath": "docs/sub/d.md" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "move body: {body}");
    assert_eq!(body["data"], true);
    assert!(ws.join("docs/sub/d.md").exists(), "moved file should exist on disk");

    // delete
    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/workspace/delete",
        Some(json!({ "relativePath": "docs/sub/d.md" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "delete body: {body}");
    assert_eq!(body["data"], true);
    assert!(!ws.join("docs/sub/d.md").exists(), "deleted file should be gone");
    let _ = std::fs::remove_dir_all(ws);
}

/// Search + outline + tree operate over the active workspace.
#[tokio::test]
async fn search_outline_and_folder() {
    let state = state().await;
    let ws = make_workspace();
    let (_, body) = send(
        state.clone(),
        Method::POST,
        "/workspace/open",
        Some(json!({ "workspacePath": ws.to_string_lossy() })),
    )
    .await;
    assert_eq!(body["ok"], true, "open body: {body}");

    let (status, body) =
        send(state.clone(), Method::POST, "/workspace/search", Some(json!({ "query": "hello" })))
            .await;
    assert_eq!(status, StatusCode::OK, "search body: {body}");
    let hits = body["data"].as_array().expect("search hits");
    assert!(hits.iter().any(|h| h["path"] == "notes.txt"), "hits: {hits:?}");

    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/workspace/outline",
        Some(json!({ "relativePath": "notes.txt" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "outline body: {body}");
    assert!(body["data"].is_array());

    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/workspace/folder",
        Some(json!({ "relativePath": "empty-dir" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "folder body: {body}");
    assert_eq!(body["data"], true);
    assert!(ws.join("empty-dir").exists());
    let _ = std::fs::remove_dir_all(ws);
}

/// readFileForWorkspace: explicit workspacePath works without an active workspace.
#[tokio::test]
async fn read_file_with_explicit_workspace_path() {
    let state = state().await;
    let ws = make_workspace();
    let (status, body) = send(
        state,
        Method::POST,
        "/workspace/read",
        Some(json!({ "workspacePath": ws.to_string_lossy(), "relativePath": "notes.txt" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["data"]["content"], "hello adl-server\nsecond line");
    let _ = std::fs::remove_dir_all(ws);
}

/// Absolute-path resolution and editor dirty-path bookkeeping.
#[tokio::test]
async fn absolute_path_and_editor_dirty_paths() {
    let state = state().await;
    let ws = make_workspace();
    let (_, body) = send(
        state.clone(),
        Method::POST,
        "/workspace/open",
        Some(json!({ "workspacePath": ws.to_string_lossy() })),
    )
    .await;
    assert_eq!(body["ok"], true);

    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/workspace/absolute-path",
        Some(json!({ "relativePath": "notes.txt" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "abs body: {body}");
    let abs = body["data"].as_str().expect("absolute path");
    assert!(abs.ends_with("notes.txt"), "absolute path should end with notes.txt: {abs}");

    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/workspace/editor-dirty-paths",
        Some(json!({ "relativePaths": ["notes.txt"] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "dirty body: {body}");
    assert_eq!(body["data"], true);
    let _ = std::fs::remove_dir_all(ws);
}

/// Change preview on a non-git workspace returns WORKSPACE_ERROR (faithful to
/// the real `read_change_preview`); emit-file-changed returns OK.
#[tokio::test]
async fn change_preview_and_emit_file_changed() {
    let state = state().await;
    let ws = make_workspace();
    let (_, body) = send(
        state.clone(),
        Method::POST,
        "/workspace/open",
        Some(json!({ "workspacePath": ws.to_string_lossy() })),
    )
    .await;
    assert_eq!(body["ok"], true);

    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/workspace/change-preview",
        Some(json!({ "relativePath": "notes.txt" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "preview body: {body}");
    assert_eq!(body["error"]["code"], "WORKSPACE_ERROR");

    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/workspace/emit-file-changed",
        Some(json!({ "path": "notes.txt", "lastModifiedAt": 1700000000000_i64 })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "emit body: {body}");
    assert_eq!(body["data"], true);
    let _ = std::fs::remove_dir_all(ws);
}
