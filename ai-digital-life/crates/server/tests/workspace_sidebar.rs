//! Workspace-sidebar domain HTTP endpoints (migrated from
//! `src-tauri/src/commands/workspace_sidebar.rs`). The recent-list lives in DB
//! `state` keyed `recent_workspaces_sidebar_v1`. This batch also completes the
//! Batch-1 deferred `workspace_open` → sidebar upsert: opening a workspace
//! now updates the sidebar recent list. Each test drives `app_router` over a
//! fresh `ServerState` via `tower::ServiceExt::oneshot`.

// Integration-test crate: unwraps in helpers (not `#[test]` fns) fall outside
// clippy's `allow-unwrap-in-tests`, so permit them at the crate level.
#![allow(clippy::unwrap_used)]

use ad_server::engine::init_server_state;
use ad_server::router::app_router;
use adl_types::WorkspaceMeta;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use serde_json::{Value, json};
use tower::ServiceExt;

async fn state() -> ad_server::ServerState {
    let dir = std::env::temp_dir().join(format!("adl-sidebar-api-{}", uuid::Uuid::new_v4()));
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

fn make_workspace_dir(name: &str) -> std::path::PathBuf {
    let dir =
        std::env::temp_dir().join(format!("adl-sidebar-ws-{}-{}", name, uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("hello.txt"), "hello world").unwrap();
    dir
}

/// Open a temp workspace via POST /workspace/open and return its id.
async fn open_workspace(state: ad_server::ServerState, name: &str) -> String {
    let dir = make_workspace_dir(name);
    let (status, body) =
        send(state, "/workspace/open", Some(json!({ "workspacePath": dir.to_string_lossy() })))
            .await;
    assert_eq!(status, StatusCode::OK, "open failed: {body}");
    body["data"]["id"].as_str().unwrap().to_string()
}

/// Seed a workspace row directly in the DB (no sidebar upsert) so restore can
/// re-add a previously-purged workspace.
async fn seed_workspace_row(state: ad_server::ServerState, id: &str) {
    let now = adl_types::now_ms();
    let meta = WorkspaceMeta {
        id: id.to_string(),
        path: format!("E:/seed/{id}"),
        root_path: format!("E:/seed/{id}"),
        name: format!("seed-{id}"),
        r#type: adl_types::WorkspaceType::Unknown,
        status: adl_types::WorkspaceStatus::Ready,
        git_snapshot: None,
        created_at: now,
        updated_at: now,
        last_opened_at: now,
    };
    state
        .db
        .save_entity(
            adl_storage::EntityTable::Workspaces,
            &meta.id,
            Some(&meta.id),
            None,
            Some("ready"),
            &meta,
        )
        .unwrap();
}

/// POST /sidebar/list on a fresh state returns an empty recent list (covers
/// `WorkspaceBridge.listRecent`).
#[tokio::test]
async fn list_recent_empty_on_fresh_state() {
    let state = state().await;
    let (status, body) = send(state, "/sidebar/list", None).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert!(body["data"].as_array().unwrap().is_empty(), "fresh recent list: {body}");
}

/// Opening a workspace upserts it into the sidebar recent list (completes the
/// Batch-1 deferred `workspace_open` → `upsert_sidebar_after_open` wiring).
#[tokio::test]
async fn open_workspace_then_list_recent_includes_it() {
    let state = state().await;
    let wid = open_workspace(state.clone(), "a").await;

    let (status, body) = send(state, "/sidebar/list", None).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    let entries = body["data"].as_array().unwrap();
    assert!(
        entries.iter().any(|e| e["id"] == wid),
        "recent list contains opened workspace: {body}"
    );
    let entry = entries.iter().find(|e| e["id"] == wid).unwrap();
    assert_eq!(entry["removedFromSidebar"], false, "body: {body}");
    assert_eq!(entry["isPinned"], false, "body: {body}");
}

/// POST /sidebar/pin on an unknown workspace returns 404 NOT_FOUND.
#[tokio::test]
async fn pin_unknown_workspace_returns_404() {
    let state = state().await;
    let (status, body) = send(state, "/sidebar/pin", Some(json!({ "workspaceId": "nope" }))).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["ok"], false, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND", "body: {body}");
}

/// POST /sidebar/pin / unpin toggle the pinned flag and return the updated list
/// (covers `WorkspaceBridge.pin` / `unpin`).
#[tokio::test]
async fn pin_unpin_round_trip() {
    let state = state().await;
    let wid = open_workspace(state.clone(), "pin").await;

    let (status, body) =
        send(state.clone(), "/sidebar/pin", Some(json!({ "workspaceId": wid }))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    let entry = body["data"].as_array().unwrap().iter().find(|e| e["id"] == wid).unwrap();
    assert_eq!(entry["isPinned"], true, "body: {body}");
    assert_eq!(entry["pinnedOrder"], 0, "first pinned: {body}");

    let (status, body) = send(state, "/sidebar/unpin", Some(json!({ "workspaceId": wid }))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    let entry = body["data"].as_array().unwrap().iter().find(|e| e["id"] == wid).unwrap();
    assert_eq!(entry["isPinned"], false, "body: {body}");
}

/// POST /sidebar/reorder applies pinned/unpinned orderings (covers
/// `WorkspaceBridge.reorder`).
#[tokio::test]
async fn reorder_applies_pinning_order() {
    let state = state().await;
    let wid_a = open_workspace(state.clone(), "ra").await;
    let wid_b = open_workspace(state.clone(), "rb").await;

    let (status, body) = send(
        state.clone(),
        "/sidebar/reorder",
        Some(json!({ "pinnedIds": [wid_a], "unpinnedIds": [wid_b] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    let entries = body["data"].as_array().unwrap();
    let a = entries.iter().find(|e| e["id"] == wid_a).unwrap();
    let b = entries.iter().find(|e| e["id"] == wid_b).unwrap();
    assert_eq!(a["isPinned"], true, "body: {body}");
    assert_eq!(b["isPinned"], false, "body: {body}");
}

/// POST /sidebar/remove marks the workspace removed and purges its data
/// (covers `WorkspaceBridge.removeFromSidebar`).
#[tokio::test]
async fn remove_marks_removed_and_purges() {
    let state = state().await;
    let wid = open_workspace(state.clone(), "rem").await;

    let (status, body) =
        send(state.clone(), "/sidebar/remove", Some(json!({ "workspaceId": wid }))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    let entries = body["data"].as_array().unwrap();
    assert!(
        !entries.iter().any(|e| e["id"] == wid),
        "removed workspace absent from presentable list: {body}"
    );

    // The workspace row is purged too.
    let remaining: Vec<WorkspaceMeta> =
        state.db.list_entities(adl_storage::EntityTable::Workspaces).unwrap();
    assert!(!remaining.iter().any(|w| w.id == wid), "workspace row purged");
}

/// POST /sidebar/restore on an unknown workspace returns 404 NOT_FOUND.
#[tokio::test]
async fn restore_unknown_workspace_returns_404() {
    let state = state().await;
    let (status, body) =
        send(state, "/sidebar/restore", Some(json!({ "workspaceId": "nope" }))).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND", "body: {body}");
}

/// POST /sidebar/restore re-adds a workspace row that exists in the DB but was
/// removed from the sidebar (covers `WorkspaceBridge.restoreToSidebar`).
#[tokio::test]
async fn restore_re_adds_existing_workspace() {
    let state = state().await;
    let wid = open_workspace(state.clone(), "rest").await;
    let (_, _) = send(state.clone(), "/sidebar/remove", Some(json!({ "workspaceId": wid }))).await;

    // The purge removed the row; re-create it directly to simulate a re-added
    // workspace (as a later open would).
    seed_workspace_row(state.clone(), &wid).await;

    let (status, body) = send(state, "/sidebar/restore", Some(json!({ "workspaceId": wid }))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    let entries = body["data"].as_array().unwrap();
    assert!(
        entries.iter().any(|e| e["id"] == wid && e["removedFromSidebar"] == false),
        "restored workspace presentable: {body}"
    );
}

/// POST /sidebar/hide / show toggle right-panel visibility (covers
/// `WorkspaceBridge.hideFromRightPanels` / `showInRightPanels`).
#[tokio::test]
async fn hide_show_right_panels_round_trip() {
    let state = state().await;
    let wid = open_workspace(state.clone(), "hide").await;

    let (status, body) =
        send(state.clone(), "/sidebar/hide", Some(json!({ "workspaceId": wid }))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    let entry = body["data"].as_array().unwrap().iter().find(|e| e["id"] == wid).unwrap();
    assert_eq!(entry["hiddenFromRightPanels"], true, "body: {body}");

    let (status, body) = send(state, "/sidebar/show", Some(json!({ "workspaceId": wid }))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    let entry = body["data"].as_array().unwrap().iter().find(|e| e["id"] == wid).unwrap();
    assert_eq!(entry["hiddenFromRightPanels"], false, "body: {body}");
}
