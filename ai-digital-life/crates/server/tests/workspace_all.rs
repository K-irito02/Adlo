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
    assert_eq!(body["data"]["rootPath"], ws.to_string_lossy().to_string(), "body: {body}");

    let (status, body) =
        common::send_request(state.clone(), Method::POST, "/workspace/clear-current", None).await;
    assert_eq!(status, axum::http::StatusCode::OK, "clear body: {body}");

    let (status, body) = common::send_request(state, Method::GET, "/workspace/current", None).await;
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
    let (status, tree) =
        common::send_request(state, Method::POST, "/workspace/tree", Some(serde_json::json!({})))
            .await;
    assert_eq!(status, axum::http::StatusCode::OK, "tree body: {tree}");
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
    let state = common::state("ws-api").await;
    let (status, body) = common::send_request(
        state,
        Method::POST,
        "/workspace/open",
        Some(
            serde_json::json!({ "workspacePath": "Z:/definitely/not/a/real/path/adl-ws-missing" }),
        ),
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

    let (status, body) =
        common::send_request(state, Method::POST, "/workspace/tree", Some(serde_json::json!({})))
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
    assert_eq!(status, axum::http::StatusCode::OK, "duplicate body: {body}");
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
    assert!(ws.join("docs/sub/d.md").exists(), "moved file should exist on disk");

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
    assert!(!ws.join("docs/sub/d.md").exists(), "deleted file should be gone");
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
    assert!(hits.iter().any(|h| h["path"] == "notes.txt"), "hits: {hits:?}");

    let (status, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/outline",
        Some(serde_json::json!({ "relativePath": "notes.txt" })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "outline body: {body}");
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
    assert!(abs.ends_with("notes.txt"), "absolute path should end with notes.txt: {abs}");

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
    assert_eq!(status, axum::http::StatusCode::BAD_REQUEST, "preview body: {body}");
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
    assert!(body["data"].as_array().unwrap().is_empty(), "fresh recent list: {body}");
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
    let remaining: Vec<WorkspaceMeta> =
        state.db.list_entities(adl_storage::EntityTable::Workspaces).unwrap();
    assert!(!remaining.iter().any(|w| w.id == wid), "workspace row purged");
}

/// `/workspace/search-in-files` 只扫描请求中列出的文件（watcher 驱动的局部重算）。
#[tokio::test]
async fn search_in_files_scans_only_requested_paths() {
    let state = common::state("ws-sif").await;
    let ws = common::make_workspace("ws-sif-src"); // 内含 notes.txt: "hello adl-server\nsecond line"
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
        "/workspace/search-in-files",
        Some(serde_json::json!({ "paths": ["notes.txt"], "query": "hello" })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "search-in-files body: {body}");
    let hits = body["data"].as_array().expect("hits");
    assert_eq!(hits.len(), 1, "hits: {hits:?}");
    assert_eq!(hits[0]["path"], "notes.txt");
    assert_eq!(hits[0]["line"], 1);

    // 未列出的文件不得出现在结果中
    let (_, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/search-in-files",
        Some(serde_json::json!({ "paths": ["package.json"], "query": "hello" })),
    )
    .await;
    assert_eq!(body["data"].as_array().unwrap().len(), 0);

    // 先停 watcher 再删目录（事项 45 Phase 4 S5：避免 watcher 线程与删除竞态）。
    let (_, _) =
        common::send_request(state.clone(), Method::POST, "/workspace/clear-current", None).await;
    let _ = std::fs::remove_dir_all(ws);
}

/// 超量 `paths` 直接拒绝（DoS 护栏），而不是逐文件读打满阻塞线程池。
#[tokio::test]
async fn search_in_files_rejects_oversized_path_list() {
    let state = common::state("ws-sif-cap").await;
    let ws = common::make_workspace("ws-sif-cap-src");
    let (_, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/open",
        Some(serde_json::json!({ "workspacePath": ws.to_string_lossy() })),
    )
    .await;
    assert_eq!(body["ok"], true, "open body: {body}");

    let paths: Vec<String> = (0..2001).map(|i| format!("f{i}.txt")).collect();
    let (status, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/search-in-files",
        Some(serde_json::json!({ "paths": paths, "query": "hello" })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT", "body: {body}");

    let (_, _) =
        common::send_request(state.clone(), Method::POST, "/workspace/clear-current", None).await;
    let _ = std::fs::remove_dir_all(ws);
}

/// 缺失 `query` 字段 → INVALID_INPUT（而不是 500）。
#[tokio::test]
async fn search_in_files_requires_query_string() {
    let state = common::state("ws-sif-bad").await;
    let ws = common::make_workspace("ws-sif-bad-src");
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
        "/workspace/search-in-files",
        Some(serde_json::json!({ "paths": ["notes.txt"] })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT");

    let (_, _) =
        common::send_request(state.clone(), Method::POST, "/workspace/clear-current", None).await;
    let _ = std::fs::remove_dir_all(ws);
}

/// 路径穿越输入（绝对路径 / `..`）→ INVALID_INPUT，不得触达工作区外文件。
#[tokio::test]
async fn search_in_files_rejects_path_traversal() {
    let state = common::state("ws-sif-trav").await;
    let ws = common::make_workspace("ws-sif-trav-src");
    let (_, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/open",
        Some(serde_json::json!({ "workspacePath": ws.to_string_lossy() })),
    )
    .await;
    assert_eq!(body["ok"], true, "open body: {body}");

    let absolute = ws.join("notes.txt").to_string_lossy().to_string();
    let evil = vec!["../evil.txt".to_string(), "sub/../../evil.txt".to_string(), absolute];
    for path in &evil {
        let (status, body) = common::send_request(
            state.clone(),
            Method::POST,
            "/workspace/search-in-files",
            Some(serde_json::json!({ "paths": [path], "query": "hello" })),
        )
        .await;
        assert_eq!(status, axum::http::StatusCode::BAD_REQUEST, "path {path}: {body}");
        assert_eq!(body["error"]["code"], "INVALID_INPUT", "path {path}: {body}");
    }

    // 空串路径同样拒绝（归一化后即根目录，语义无意义）。
    let (status, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/search-in-files",
        Some(serde_json::json!({ "paths": [""], "query": "hello" })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::BAD_REQUEST, "body: {body}");

    let (_, _) =
        common::send_request(state.clone(), Method::POST, "/workspace/clear-current", None).await;
    let _ = std::fs::remove_dir_all(ws);
}
