//! Merged workspace + workspace-sidebar integration tests.
//!
//! Workspace domain HTTP endpoints (migrated from
//! `src-tauri/src/commands/workspace.rs` and `workspace_sidebar.rs`).
//! Each test drives `app_router` over a fresh `ServerState` via
//! `tower::ServiceExt::oneshot` — no sockets, no subprocesses.

// Integration-test crate: unwraps in helpers (not `#[test]` fns) fall outside
// clippy's `allow-unwrap-in-tests`, so permit them at the crate level.
#![allow(clippy::unwrap_used)]

mod common;

use adl_types::WorkspaceMeta;
use axum::http::Method;

// ---------------------------------------------------------------------------
// Sidebar-specific helper: seed a workspace row directly in the DB (no sidebar
// upsert) so restore can re-add a previously-purged workspace.
// ---------------------------------------------------------------------------

async fn seed_workspace_row(state: adl_server::ServerState, id: &str) {
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

// ===========================================================================
// Workspace core tests (workspace.rs)
// ===========================================================================

/// GET /workspace/current reflects the active workspace after open and after clear.
#[tokio::test]
async fn get_current_returns_active_workspace() {
    let state = common::state("ws-api").await;
    let ws = common::make_workspace("ws-src");

    // No active workspace yet → data null.
    let (status, body) =
        common::send_request(state.clone(), Method::GET, "/workspace/current", None).await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert!(body["data"].is_null(), "body: {body}");

    let (status, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/open",
        Some(serde_json::json!({ "workspacePath": ws.to_string_lossy() })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "open body: {body}");
    let id = body["data"]["id"].as_str().expect("workspace id").to_string();

    let (status, body) =
        common::send_request(state.clone(), Method::GET, "/workspace/current", None).await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert_eq!(body["data"]["id"], id, "body: {body}");
    assert_eq!(
        body["data"]["rootPath"],
        ws.to_string_lossy().to_string(),
        "body: {body}"
    );

    let (status, body) =
        common::send_request(state.clone(), Method::POST, "/workspace/clear-current", None).await;
    assert_eq!(status, axum::http::StatusCode::OK, "clear body: {body}");

    let (status, body) =
        common::send_request(state, Method::GET, "/workspace/current", None).await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert!(body["data"].is_null(), "body: {body}");
    let _ = std::fs::remove_dir_all(ws);
}

/// POST /workspace/open opens a path, returns its metadata, persists it as the
/// active workspace and makes the file tree resolvable.
#[tokio::test]
async fn open_workspace_returns_meta_and_activates() {
    let state = common::state("ws-api").await;
    let ws = common::make_workspace("ws-src");
    let (status, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/open",
        Some(serde_json::json!({ "workspacePath": ws.to_string_lossy() })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    let id = body["data"]["id"].as_str().expect("workspace id").to_string();
    assert!(!id.is_empty());

    // Active workspace: tree resolves without an explicit workspacePath.
    let (status, tree) = common::send_request(
        state,
        Method::POST,
        "/workspace/tree",
        Some(serde_json::json!({})),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "tree body: {tree}");
    let nodes = tree["data"].as_array().expect("tree array");
    assert!(
        nodes
            .iter()
            .any(|n| n["path"] == "notes.txt" || n["name"] == "notes.txt"),
        "tree should contain notes.txt: {nodes:?}"
    );
    let _ = std::fs::remove_dir_all(ws);
}

/// POST /workspace/open on a non-existent path → non-2xx with an error code.
#[tokio::test]
async fn open_workspace_nonexistent_returns_error() {
    let state = common::state("ws-api").await;
    let (status, body) = common::send_request(
        state,
        Method::POST,
        "/workspace/open",
        Some(serde_json::json!({ "workspacePath": "Z:/definitely/not/a/real/path/adl-ws-missing" })),
    )
    .await;
    assert!(
        !status.is_success(),
        "expected error status, got {status}: {body}"
    );
    assert_eq!(body["ok"], false);
    assert!(
        body["error"]["code"].as_str().is_some(),
        "error code expected in body: {body}"
    );
}

/// POST /workspace/clear-current clears the active workspace; a subsequent tree
/// listing without an explicit workspacePath then fails with NOT_FOUND.
#[tokio::test]
async fn clear_current_clears_active_workspace() {
    let state = common::state("ws-api").await;
    let ws = common::make_workspace("ws-src");
    let (status, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/open",
        Some(serde_json::json!({ "workspacePath": ws.to_string_lossy() })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "open body: {body}");

    let (status, body) =
        common::send_request(state.clone(), Method::POST, "/workspace/clear-current", None).await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert_eq!(body["data"], true);

    let (status, body) = common::send_request(
        state,
        Method::POST,
        "/workspace/tree",
        Some(serde_json::json!({})),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND");
    let _ = std::fs::remove_dir_all(ws);
}

/// File operations: create / read / rename / duplicate / move / delete.
#[tokio::test]
async fn file_crud_round_trip() {
    let state = common::state("ws-api").await;
    let ws = common::make_workspace("ws-src");
    let (_, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/open",
        Some(serde_json::json!({ "workspacePath": ws.to_string_lossy() })),
    )
    .await;
    assert_eq!(body["ok"], true);

    // create
    let (status, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/file",
        Some(serde_json::json!({ "relativePath": "docs/a.md", "content": "# hi" })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "create body: {body}");
    assert_eq!(body["data"]["path"], "docs/a.md");

    // read
    let (status, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/read",
        Some(serde_json::json!({ "relativePath": "docs/a.md" })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "read body: {body}");
    assert_eq!(body["data"]["content"], "# hi");

    // rename
    let (status, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/rename",
        Some(serde_json::json!({ "relativePath": "docs/a.md", "newName": "b.md" })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "rename body: {body}");
    assert_eq!(body["data"], true);

    // duplicate
    let (status, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/duplicate",
        Some(serde_json::json!({ "relativePath": "docs/b.md", "newPath": "docs/c.md" })),
    )
    .await;
    assert_eq!(
        status,
        axum::http::StatusCode::OK,
        "duplicate body: {body}"
    );
    assert_eq!(body["data"], true);

    // move
    let (status, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/move",
        Some(serde_json::json!({ "relativePath": "docs/c.md", "newPath": "docs/sub/d.md" })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "move body: {body}");
    assert_eq!(body["data"], true);
    assert!(
        ws.join("docs/sub/d.md").exists(),
        "moved file should exist on disk"
    );

    // delete
    let (status, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/delete",
        Some(serde_json::json!({ "relativePath": "docs/sub/d.md" })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "delete body: {body}");
    assert_eq!(body["data"], true);
    assert!(
        !ws.join("docs/sub/d.md").exists(),
        "deleted file should be gone"
    );
    let _ = std::fs::remove_dir_all(ws);
}

/// Search + outline + tree operate over the active workspace.
#[tokio::test]
async fn search_outline_and_folder() {
    let state = common::state("ws-api").await;
    let ws = common::make_workspace("ws-src");
    let (_, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/open",
        Some(serde_json::json!({ "workspacePath": ws.to_string_lossy() })),
    )
    .await;
    assert_eq!(body["ok"], true, "open body: {body}");

    let (status, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/search",
        Some(serde_json::json!({ "query": "hello" })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "search body: {body}");
    let hits = body["data"].as_array().expect("search hits");
    assert!(
        hits.iter().any(|h| h["path"] == "notes.txt"),
        "hits: {hits:?}"
    );

    let (status, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/outline",
        Some(serde_json::json!({ "relativePath": "notes.txt" })),
    )
    .await;
    assert_eq!(
        status,
        axum::http::StatusCode::OK,
        "outline body: {body}"
    );
    assert!(body["data"].is_array());

    let (status, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/folder",
        Some(serde_json::json!({ "relativePath": "empty-dir" })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "folder body: {body}");
    assert_eq!(body["data"], true);
    assert!(ws.join("empty-dir").exists());
    let _ = std::fs::remove_dir_all(ws);
}

/// readFileForWorkspace: explicit workspacePath works without an active workspace.
#[tokio::test]
async fn read_file_with_explicit_workspace_path() {
    let state = common::state("ws-api").await;
    let ws = common::make_workspace("ws-src");
    let (status, body) = common::send_request(
        state,
        Method::POST,
        "/workspace/read",
        Some(serde_json::json!({ "workspacePath": ws.to_string_lossy(), "relativePath": "notes.txt" })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert_eq!(body["data"]["content"], "hello adl-server\nsecond line");
    let _ = std::fs::remove_dir_all(ws);
}

/// Absolute-path resolution and editor dirty-path bookkeeping.
#[tokio::test]
async fn absolute_path_and_editor_dirty_paths() {
    let state = common::state("ws-api").await;
    let ws = common::make_workspace("ws-src");
    let (_, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/open",
        Some(serde_json::json!({ "workspacePath": ws.to_string_lossy() })),
    )
    .await;
    assert_eq!(body["ok"], true);

    let (status, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/absolute-path",
        Some(serde_json::json!({ "relativePath": "notes.txt" })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "abs body: {body}");
    let abs = body["data"].as_str().expect("absolute path");
    assert!(
        abs.ends_with("notes.txt"),
        "absolute path should end with notes.txt: {abs}"
    );

    let (status, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/editor-dirty-paths",
        Some(serde_json::json!({ "relativePaths": ["notes.txt"] })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "dirty body: {body}");
    assert_eq!(body["data"], true);
    let _ = std::fs::remove_dir_all(ws);
}

/// Change preview on a non-git workspace returns WORKSPACE_ERROR (faithful to
/// the real `read_change_preview`); emit-file-changed returns OK.
#[tokio::test]
async fn change_preview_and_emit_file_changed() {
    let state = common::state("ws-api").await;
    let ws = common::make_workspace("ws-src");
    let (_, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/open",
        Some(serde_json::json!({ "workspacePath": ws.to_string_lossy() })),
    )
    .await;
    assert_eq!(body["ok"], true);

    let (status, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/change-preview",
        Some(serde_json::json!({ "relativePath": "notes.txt" })),
    )
    .await;
    assert_eq!(
        status,
        axum::http::StatusCode::BAD_REQUEST,
        "preview body: {body}"
    );
    assert_eq!(body["error"]["code"], "WORKSPACE_ERROR");

    let (status, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/emit-file-changed",
        Some(serde_json::json!({ "path": "notes.txt", "lastModifiedAt": 1700000000000_i64 })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "emit body: {body}");
    assert_eq!(body["data"], true);
    let _ = std::fs::remove_dir_all(ws);
}

// ===========================================================================
// Workspace sidebar tests (workspace_sidebar.rs)
// ===========================================================================

/// POST /sidebar/list on a fresh state returns an empty recent list (covers
/// `WorkspaceBridge.listRecent`).
#[tokio::test]
async fn list_recent_empty_on_fresh_state() {
    let state = common::state("sidebar-api").await;
    let (status, body) = common::send_post(state, "/sidebar/list", None).await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert!(
        body["data"].as_array().unwrap().is_empty(),
        "fresh recent list: {body}"
    );
}

/// Opening a workspace upserts it into the sidebar recent list (completes the
/// Batch-1 deferred `workspace_open` → `upsert_sidebar_after_open` wiring).
#[tokio::test]
async fn open_workspace_then_list_recent_includes_it() {
    let state = common::state("sidebar-api").await;
    let wid = common::open_workspace_via_api(state.clone(), "a").await;

    let (status, body) = common::send_post(state, "/sidebar/list", None).await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
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
    let state = common::state("sidebar-api").await;
    let (status, body) = common::send_post(
        state,
        "/sidebar/pin",
        Some(serde_json::json!({ "workspaceId": "nope" })),
    )
    .await;
    assert_eq!(
        status,
        axum::http::StatusCode::NOT_FOUND,
        "body: {body}"
    );
    assert_eq!(body["ok"], false, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND", "body: {body}");
}

/// POST /sidebar/pin / unpin toggle the pinned flag and return the updated list
/// (covers `WorkspaceBridge.pin` / `unpin`).
#[tokio::test]
async fn pin_unpin_round_trip() {
    let state = common::state("sidebar-api").await;
    let wid = common::open_workspace_via_api(state.clone(), "pin").await;

    let (status, body) = common::send_post(
        state.clone(),
        "/sidebar/pin",
        Some(serde_json::json!({ "workspaceId": wid })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    let entry = body["data"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["id"] == wid)
        .unwrap();
    assert_eq!(entry["isPinned"], true, "body: {body}");
    assert_eq!(entry["pinnedOrder"], 0, "first pinned: {body}");

    let (status, body) = common::send_post(
        state,
        "/sidebar/unpin",
        Some(serde_json::json!({ "workspaceId": wid })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    let entry = body["data"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["id"] == wid)
        .unwrap();
    assert_eq!(entry["isPinned"], false, "body: {body}");
}

/// POST /sidebar/reorder applies pinned/unpinned orderings (covers
/// `WorkspaceBridge.reorder`).
#[tokio::test]
async fn reorder_applies_pinning_order() {
    let state = common::state("sidebar-api").await;
    let wid_a = common::open_workspace_via_api(state.clone(), "ra").await;
    let wid_b = common::open_workspace_via_api(state.clone(), "rb").await;

    let (status, body) = common::send_post(
        state.clone(),
        "/sidebar/reorder",
        Some(serde_json::json!({ "pinnedIds": [wid_a], "unpinnedIds": [wid_b] })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
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
    let state = common::state("sidebar-api").await;
    let wid = common::open_workspace_via_api(state.clone(), "rem").await;

    let (status, body) = common::send_post(
        state.clone(),
        "/sidebar/remove",
        Some(serde_json::json!({ "workspaceId": wid })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    let entries = body["data"].as_array().unwrap();
    assert!(
        !entries.iter().any(|e| e["id"] == wid),
        "removed workspace absent from presentable list: {body}"
    );

    // The workspace row is purged too.
    let remaining: Vec<WorkspaceMeta> = state
        .db
        .list_entities(adl_storage::EntityTable::Workspaces)
        .unwrap();
    assert!(
        !remaining.iter().any(|w| w.id == wid),
        "workspace row purged"
    );
}

/// POST /sidebar/restore on an unknown workspace returns 404 NOT_FOUND.
#[tokio::test]
async fn restore_unknown_workspace_returns_404() {
    let state = common::state("sidebar-api").await;
    let (status, body) = common::send_post(
        state,
        "/sidebar/restore",
        Some(serde_json::json!({ "workspaceId": "nope" })),
    )
    .await;
    assert_eq!(
        status,
        axum::http::StatusCode::NOT_FOUND,
        "body: {body}"
    );
    assert_eq!(body["error"]["code"], "NOT_FOUND", "body: {body}");
}

/// POST /sidebar/restore re-adds a workspace row that exists in the DB but was
/// removed from the sidebar (covers `WorkspaceBridge.restoreToSidebar`).
#[tokio::test]
async fn restore_re_adds_existing_workspace() {
    let state = common::state("sidebar-api").await;
    let wid = common::open_workspace_via_api(state.clone(), "rest").await;
    let (_, _) = common::send_post(
        state.clone(),
        "/sidebar/remove",
        Some(serde_json::json!({ "workspaceId": wid })),
    )
    .await;

    // The purge removed the row; re-create it directly to simulate a re-added
    // workspace (as a later open would).
    seed_workspace_row(state.clone(), &wid).await;

    let (status, body) = common::send_post(
        state,
        "/sidebar/restore",
        Some(serde_json::json!({ "workspaceId": wid })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    let entries = body["data"].as_array().unwrap();
    assert!(
        entries
            .iter()
            .any(|e| e["id"] == wid && e["removedFromSidebar"] == false),
        "restored workspace presentable: {body}"
    );
}

/// POST /sidebar/hide / show toggle right-panel visibility (covers
/// `WorkspaceBridge.hideFromRightPanels` / `showInRightPanels`).
#[tokio::test]
async fn hide_show_right_panels_round_trip() {
    let state = common::state("sidebar-api").await;
    let wid = common::open_workspace_via_api(state.clone(), "hide").await;

    let (status, body) = common::send_post(
        state.clone(),
        "/sidebar/hide",
        Some(serde_json::json!({ "workspaceId": wid })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    let entry = body["data"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["id"] == wid)
        .unwrap();
    assert_eq!(entry["hiddenFromRightPanels"], true, "body: {body}");

    let (status, body) = common::send_post(
        state,
        "/sidebar/show",
        Some(serde_json::json!({ "workspaceId": wid })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    let entry = body["data"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["id"] == wid)
        .unwrap();
    assert_eq!(entry["hiddenFromRightPanels"], false, "body: {body}");
}
