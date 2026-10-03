//! Merged reference + retrieval domain HTTP endpoints.

#![allow(clippy::unwrap_used)]

mod common;

use axum::http::Method;
use serde_json::{Value, json};
use std::path::Path;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

fn data_dir_body(state: &adl_server::ServerState) -> Value {
    json!({ "dataDir": state.data_dir.to_string_lossy() })
}

fn local_reference(name: &str, path: &Path) -> Value {
    json!({
        "name": name,
        "source": "local",
        "path": path.to_string_lossy(),
        "branch": null,
        "enabled": true
    })
}

// ---------------------------------------------------------------------------
// Reference tests
// ---------------------------------------------------------------------------

/// POST /reference/list on a fresh state → empty list (covers
/// `ReferenceBridge.listReferences`).
#[tokio::test]
async fn list_references_returns_empty() {
    let state = common::state("ref-api").await;
    let (status, body) =
        common::send_post(state.clone(), "/reference/list", Some(data_dir_body(&state))).await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert!(body["data"].as_array().unwrap().is_empty(), "fresh list: {body}");
}

/// POST /reference/add appends a valid local reference and persists it across a
/// fresh load (covers `ReferenceBridge.addReference`).
#[tokio::test]
async fn add_reference_persists_and_returns_list() {
    let state = common::state("ref-api").await;
    let dir = std::env::temp_dir().join(format!("adl-ref-src-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let reference = local_reference("example", &dir);

    let (status, body) = common::send_post(
        state.clone(),
        "/reference/add",
        Some(json!({ "reference": reference, "dataDir": state.data_dir.to_string_lossy() })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    let refs = body["data"].as_array().unwrap();
    assert_eq!(refs.len(), 1, "one reference: {body}");
    assert_eq!(refs[0]["name"], "example", "body: {body}");
    assert_eq!(refs[0]["source"], "local", "body: {body}");
    assert_eq!(refs[0]["enabled"], true, "body: {body}");

    // Persisted across a fresh load.
    let (_, body) =
        common::send_post(state.clone(), "/reference/list", Some(data_dir_body(&state))).await;
    let refs = body["data"].as_array().unwrap();
    assert_eq!(refs.len(), 1, "persisted: {body}");
    assert_eq!(refs[0]["name"], "example", "body: {body}");
}

/// POST /reference/remove deletes a reference and persists (covers
/// `ReferenceBridge.removeReference`).
#[tokio::test]
async fn remove_reference_removes_and_persists() {
    let state = common::state("ref-api").await;
    let dir = std::env::temp_dir().join(format!("adl-ref-src-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let reference = local_reference("example", &dir);

    let (_, body) = common::send_post(
        state.clone(),
        "/reference/add",
        Some(json!({ "reference": reference, "dataDir": state.data_dir.to_string_lossy() })),
    )
    .await;
    assert_eq!(body["data"].as_array().unwrap().len(), 1);

    let (status, body) = common::send_post(
        state.clone(),
        "/reference/remove",
        Some(json!({ "name": "example", "dataDir": state.data_dir.to_string_lossy() })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert!(body["data"].as_array().unwrap().is_empty(), "removed: {body}");

    let (_, body) =
        common::send_post(state.clone(), "/reference/list", Some(data_dir_body(&state))).await;
    assert!(body["data"].as_array().unwrap().is_empty(), "persisted: {body}");
}

// ---------------------------------------------------------------------------
// Retrieval tests
// ---------------------------------------------------------------------------

/// Open a temp workspace through the workspace domain, returning the workspace
/// id from the response. Used to seed the active-workspace + snapshot row.
async fn open_temp_workspace(state: adl_server::ServerState) -> String {
    let dir = common::make_workspace_dir("retrieval-ws");
    let (status, body) = common::send_request(
        state,
        Method::POST,
        "/workspace/open",
        Some(json!({ "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "open failed: {body}");
    body["data"]["id"].as_str().unwrap().to_string()
}

/// GET /retrieval/status with no active workspace returns `data: null` (covers
/// `RetrievalBridge.getStatus`).
#[tokio::test]
async fn get_status_without_active_workspace_returns_null() {
    let state = common::state("retrieval-api").await;
    let (status, body) = common::send_request(state, Method::GET, "/retrieval/status", None).await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert!(body["data"].is_null(), "no workspace -> null: {body}");
}

/// GET /retrieval/status after opening a workspace returns the snapshot row
/// saved by `workspace_open`.
#[tokio::test]
async fn get_status_after_open_returns_snapshot() {
    let state = common::state("retrieval-api").await;
    let wid = open_temp_workspace(state.clone()).await;

    let (status, body) = common::send_request(state, Method::GET, "/retrieval/status", None).await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert_eq!(body["data"]["workspaceId"], wid, "body: {body}");
    assert!(!body["data"]["repoMap"].as_array().unwrap().is_empty(), "repoMap populated: {body}");
    assert_eq!(body["data"]["status"], "completed", "body: {body}");
}

/// POST /retrieval/rebuild rebuilds the snapshot for the active workspace and
/// returns `true` (covers `RetrievalBridge.rebuildIndex`).
#[tokio::test]
async fn rebuild_index_rebuilds_snapshot() {
    let state = common::state("retrieval-api").await;
    let wid = open_temp_workspace(state.clone()).await;

    let (status, body) =
        common::send_request(state.clone(), Method::POST, "/retrieval/rebuild", None).await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert_eq!(body["data"], true, "rebuild returns true: {body}");

    let (_, body) = common::send_request(state, Method::GET, "/retrieval/status", None).await;
    assert_eq!(body["data"]["workspaceId"], wid, "body: {body}");
    assert_eq!(body["data"]["status"], "completed", "body: {body}");
}

/// POST /retrieval/rebuild without an active workspace returns 404 (the Tauri
/// original resolves `current_workspace` before anything else).
#[tokio::test]
async fn rebuild_index_without_active_workspace_returns_404() {
    let state = common::state("retrieval-api").await;
    let (status, body) =
        common::send_request(state, Method::POST, "/retrieval/rebuild", None).await;
    assert_eq!(status, axum::http::StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["ok"], false, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND", "body: {body}");
}
