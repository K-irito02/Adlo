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
    // open_workspace 落库的是 canonicalize + 去 verbatim 前缀后的规范路径；
    // TEMP 含 8.3 短名（如 CI 的 RUNNER~1）时与原始输入字面不等，按同配方归一后再比。
    let canon = std::fs::canonicalize(&ws).expect("workspace dir must canonicalize");
    let expected = adl_workspace::strip_verbatim_prefix(&canon.to_string_lossy());
    assert_eq!(body["data"]["rootPath"], expected, "body: {body}");

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
    let nodes = tree["data"]["tree"].as_array().expect("tree array");
    assert_eq!(tree["data"]["fromCache"], false, "tree body: {tree}");
    assert!(
        nodes.iter().any(|n| n["path"] == "notes.txt" || n["name"] == "notes.txt"),
        "tree should contain notes.txt: {nodes:?}"
    );
    let _ = std::fs::remove_dir_all(ws);
}

/// POST /workspace/add registers a workspace in the sidebar **without**
/// activating it (agent file links outside every known workspace rely on this).
#[tokio::test]
async fn add_workspace_registers_without_activating() {
    let state = common::state("ws-add").await;
    let ws = common::make_workspace("ws-add-src");
    let (status, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/add",
        Some(serde_json::json!({ "workspacePath": ws.to_string_lossy() })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    let id = body["data"]["id"].as_str().expect("workspace id").to_string();
    assert!(!id.is_empty());

    // 不激活当前工作区。
    let (status, current) =
        common::send_request(state.clone(), Method::GET, "/workspace/current", None).await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {current}");
    assert!(current["data"].is_null(), "add must not activate: {current}");

    // 侧栏列表包含新条目。
    let (status, sidebar) =
        common::send_request(state, Method::POST, "/sidebar/list", Some(serde_json::json!({})))
            .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {sidebar}");
    let entries = sidebar["data"].as_array().expect("sidebar array");
    assert!(
        entries.iter().any(|entry| entry["id"] == id),
        "sidebar should contain {id}: {sidebar}"
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

/// POST /workspace/open with `create: true` creates a missing absolute directory.
#[tokio::test]
async fn open_workspace_with_create_makes_the_directory() {
    let state = common::state("ws-api").await;
    let base = std::env::temp_dir().join(format!("adl-ws-create-{}", uuid::Uuid::new_v4()));
    let target = base.join("nested").join("workspace");
    let (status, body) = common::send_request(
        state,
        Method::POST,
        "/workspace/open",
        Some(serde_json::json!({
            "workspacePath": target.to_string_lossy(),
            "create": true
        })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert!(target.is_dir(), "create=true must create the directory: {body}");
    let _ = std::fs::remove_dir_all(base);
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
    let hits = body["data"]["hits"].as_array().expect("search hits");
    assert!(hits.iter().any(|h| h["path"] == "notes.txt"), "hits: {hits:?}");
    // 小夹具不会被截断：精确的 hasMore 契约（旧实现只能靠"等于上限"保守推断）。
    assert_eq!(body["data"]["hasMore"], false, "search body: {body}");

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
    let hits = body["data"]["hits"].as_array().expect("hits");
    assert_eq!(hits.len(), 1, "hits: {hits:?}");
    assert_eq!(hits[0]["path"], "notes.txt");
    assert_eq!(hits[0]["line"], 1);
    assert_eq!(body["data"]["hasMore"], false, "hits: {hits:?}");

    // 未列出的文件不得出现在结果中
    let (_, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/search-in-files",
        Some(serde_json::json!({ "paths": ["package.json"], "query": "hello" })),
    )
    .await;
    assert_eq!(body["data"]["hits"].as_array().unwrap().len(), 0);

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

/// `/workspace/search` 显式 `workspacePath` 覆盖后端当前激活工作区：多工作区下
/// 检索目标可偏离"最后打开的工作区"（事项 3）。
#[tokio::test]
async fn search_with_explicit_workspace_path_scans_that_workspace() {
    let state = common::state("ws-search-target").await;
    // 当前激活工作区 A：不含命中标记。
    let active = common::make_workspace("ws-search-active");
    let (_, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/open",
        Some(serde_json::json!({ "workspacePath": active.to_string_lossy() })),
    )
    .await;
    assert_eq!(body["ok"], true, "open body: {body}");

    // 另一工作区 B：命中标记仅存在于 B。
    let other = common::temp_dir("ws-search-other");
    std::fs::write(other.join("target.txt"), "needle-other-marker\n").unwrap();

    // 显式 workspacePath=B → 命中来自 B。
    let (status, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/search",
        Some(serde_json::json!({
            "query": "needle-other-marker",
            "workspacePath": other.to_string_lossy(),
        })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "search body: {body}");
    let hits = body["data"]["hits"].as_array().expect("hits");
    assert_eq!(hits.len(), 1, "hits: {hits:?}");
    assert_eq!(hits[0]["path"], "target.txt");

    // 缺省（不带 workspacePath）→ 落在当前激活工作区 A，命中为空。
    let (_, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/search",
        Some(serde_json::json!({ "query": "needle-other-marker" })),
    )
    .await;
    assert_eq!(body["data"]["hits"].as_array().unwrap().len(), 0, "body: {body}");

    let (_, _) =
        common::send_request(state.clone(), Method::POST, "/workspace/clear-current", None).await;
    let _ = std::fs::remove_dir_all(active);
    let _ = std::fs::remove_dir_all(other);
}

/// `/workspace/search-in-files` 同样接受显式 `workspacePath`（P4-R1-B3）；
/// 不存在的根返回空页（warn + empty，与 search 的 read_dir 错误不对称，此处钉住）。
#[tokio::test]
async fn search_in_files_with_explicit_workspace_path() {
    let state = common::state("ws-sif-target").await;
    let active = common::make_workspace("ws-sif-active");
    let (_, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/open",
        Some(serde_json::json!({ "workspacePath": active.to_string_lossy() })),
    )
    .await;
    assert_eq!(body["ok"], true, "open body: {body}");

    let other = common::temp_dir("ws-sif-other");
    std::fs::write(other.join("target.txt"), "needle-other-marker\n").unwrap();

    let (status, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/search-in-files",
        Some(serde_json::json!({
            "paths": ["target.txt"],
            "query": "needle-other-marker",
            "workspacePath": other.to_string_lossy(),
        })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "search-in-files body: {body}");
    let hits = body["data"]["hits"].as_array().expect("hits");
    assert_eq!(hits.len(), 1, "hits: {hits:?}");
    assert_eq!(hits[0]["path"], "target.txt");

    // 不存在的根：空页（与 search 的错误回包不对称，属预存行为，此处仅钉住）。
    let (_, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/search-in-files",
        Some(serde_json::json!({
            "paths": ["target.txt"],
            "query": "needle-other-marker",
            "workspacePath": other.join("no-such-dir").to_string_lossy(),
        })),
    )
    .await;
    assert_eq!(body["data"]["hits"].as_array().unwrap().len(), 0, "body: {body}");

    let (_, _) =
        common::send_request(state.clone(), Method::POST, "/workspace/clear-current", None).await;
    let _ = std::fs::remove_dir_all(active);
    let _ = std::fs::remove_dir_all(other);
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

/// 检索分页窗口经 HTTP 层的契约：`limit` 截断 + `hasMore` 精确、`offset` 续页不重不漏、
/// 且超大 `limit` 被服务端钳制到安全阀（调用方无法绕过）。
#[tokio::test]
async fn search_window_pages_with_precise_has_more() {
    let state = common::state("ws-win").await;
    let ws = common::make_workspace("ws-win-src"); // notes.txt 两行都含 'e'（"hello adl-server" / "second line"）
    let (_, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/open",
        Some(serde_json::json!({ "workspacePath": ws.to_string_lossy() })),
    )
    .await;
    assert_eq!(body["ok"], true, "open body: {body}");

    // 第一页：limit=1 → 1 条 + hasMore=true
    let (status, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/search",
        Some(serde_json::json!({ "query": "e", "limit": 1 })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "page1 body: {body}");
    let page1 = body["data"]["hits"].as_array().expect("page1 hits");
    assert_eq!(page1.len(), 1, "page1: {body}");
    assert_eq!(page1[0]["line"], 1);
    assert_eq!(body["data"]["hasMore"], true, "page1: {body}");

    // 第二页：offset=1 → 承接下一页，且已取尽
    let (_, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/search",
        Some(serde_json::json!({ "query": "e", "limit": 1, "offset": 1 })),
    )
    .await;
    let page2 = body["data"]["hits"].as_array().expect("page2 hits");
    assert_eq!(page2.len(), 1, "page2: {body}");
    assert_eq!(page2[0]["line"], 2);
    assert_eq!(body["data"]["hasMore"], false, "page2: {body}");

    // 超大 limit 被钳制：请求 10_000_000 也不报错，且结果正常返回
    let (status, body) = common::send_request(
        state.clone(),
        Method::POST,
        "/workspace/search",
        Some(serde_json::json!({ "query": "e", "limit": 10_000_000 })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "clamp body: {body}");
    assert_eq!(body["data"]["hits"].as_array().unwrap().len(), 2, "clamp body: {body}");
    assert_eq!(body["data"]["hasMore"], false, "clamp body: {body}");

    let (_, _) =
        common::send_request(state.clone(), Method::POST, "/workspace/clear-current", None).await;
    let _ = std::fs::remove_dir_all(ws);
}

// ===========================================================================
// 媒体流式端点（事项 7：GET /workspace/media，HTTP Range）
// ===========================================================================

/// 发送原始 GET（返回 status/headers/body bytes），供流式端点断言使用。
async fn send_raw_get(
    state: adl_server::ServerState,
    uri: &str,
    range: Option<&str>,
) -> (axum::http::StatusCode, axum::http::HeaderMap, Vec<u8>) {
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    let mut builder = Request::builder().method(Method::GET).uri(uri);
    if let Some(range) = range {
        builder = builder.header("range", range);
    }
    let request = builder.body(Body::empty()).unwrap();
    let response = common::app(state).oneshot(request).await.unwrap();
    let status = response.status();
    let headers = response.headers().clone();
    let bytes = axum::body::to_bytes(response.into_body(), 8 * 1024 * 1024).await.unwrap().to_vec();
    (status, headers, bytes)
}

fn encode_query_value(value: &str) -> String {
    value
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b':' | b'/' => {
                (b as char).to_string()
            },
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// 全量读取：200 + `Accept-Ranges: bytes` + 扩展名推断的 MIME + 完整字节。
#[tokio::test]
async fn media_stream_returns_full_file_with_range_support() {
    let state = common::state("ws-media").await;
    let ws = common::make_workspace("ws-media-src");
    let bytes: Vec<u8> = (0..=255u8).cycle().take(64 * 1024).collect();
    std::fs::write(ws.join("clip.mp4"), &bytes).unwrap();

    let uri = format!(
        "/workspace/media?path=clip.mp4&workspacePath={}",
        encode_query_value(&ws.to_string_lossy())
    );
    let (status, headers, body) = send_raw_get(state.clone(), &uri, None).await;

    assert_eq!(status, axum::http::StatusCode::OK);
    assert_eq!(headers["content-type"], "video/mp4");
    assert_eq!(headers["accept-ranges"], "bytes");
    assert_eq!(headers["content-length"], bytes.len().to_string());
    // 跨源（浏览器模式）必须能读到 mtime 头，否则外部变更刷新失效。
    assert_eq!(
        headers["access-control-expose-headers"],
        "x-adl-mtime-ms, content-range, accept-ranges"
    );
    // mtime 头必须真实存在且是毫秒整数（前端据此做外部变更比对）。
    assert!(
        headers["x-adl-mtime-ms"]
            .to_str()
            .ok()
            .and_then(|value| value.parse::<u128>().ok())
            .is_some(),
        "missing/invalid x-adl-mtime-ms: {:?}",
        headers.get("x-adl-mtime-ms")
    );
    assert_eq!(body, bytes);

    // 畸形 Range 按 RFC 忽略：仍返回完整 200，而不是 416/半截数据。
    let (status, _, body) = send_raw_get(state.clone(), &uri, Some("bytes=abc")).await;
    assert_eq!(status, axum::http::StatusCode::OK);
    assert_eq!(body, bytes);

    let _ = std::fs::remove_dir_all(ws);
}

/// 缺失文件：GET / HEAD 都返回 404（与浏览器模式端点一致；前端据此走 not-found 视图）。
#[tokio::test]
async fn media_stream_missing_file_is_404() {
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    let state = common::state("ws-media").await;
    let ws = common::make_workspace("ws-media-src");
    let uri = format!(
        "/workspace/media?path=gone.mp3&workspacePath={}",
        encode_query_value(&ws.to_string_lossy())
    );

    let get = Request::builder().method(Method::GET).uri(&uri).body(Body::empty()).unwrap();
    let response = common::app(state.clone()).oneshot(get).await.unwrap();
    assert_eq!(response.status(), axum::http::StatusCode::NOT_FOUND);

    let head = Request::builder().method(Method::HEAD).uri(&uri).body(Body::empty()).unwrap();
    let response = common::app(state).oneshot(head).await.unwrap();
    assert_eq!(response.status(), axum::http::StatusCode::NOT_FOUND);

    let _ = std::fs::remove_dir_all(ws);
}

/// 单段 Range：206 + `Content-Range` + 只回请求的字节。
#[tokio::test]
async fn media_stream_honours_byte_range() {
    let state = common::state("ws-media").await;
    let ws = common::make_workspace("ws-media-src");
    let bytes: Vec<u8> = (0..100u8).collect();
    std::fs::write(ws.join("song.mp3"), &bytes).unwrap();

    let uri = format!(
        "/workspace/media?path=song.mp3&workspacePath={}",
        encode_query_value(&ws.to_string_lossy())
    );
    let (status, headers, body) = send_raw_get(state.clone(), &uri, Some("bytes=10-19")).await;

    assert_eq!(status, axum::http::StatusCode::PARTIAL_CONTENT);
    assert_eq!(headers["content-range"], "bytes 10-19/100");
    assert_eq!(headers["content-length"], "10");
    assert_eq!(body, bytes[10..=19].to_vec());

    // 后缀区间 bytes=-5 → 最后 5 字节。
    let (status, headers, body) = send_raw_get(state.clone(), &uri, Some("bytes=-5")).await;
    assert_eq!(status, axum::http::StatusCode::PARTIAL_CONTENT);
    assert_eq!(headers["content-range"], "bytes 95-99/100");
    assert_eq!(body, bytes[95..=99].to_vec());

    // 与浏览器端一致：`+N` 前缀按 Rust u64 解析规则接受。
    let (status, headers, body) = send_raw_get(state.clone(), &uri, Some("bytes=+2-5")).await;
    assert_eq!(status, axum::http::StatusCode::PARTIAL_CONTENT);
    assert_eq!(headers["content-range"], "bytes 2-5/100");
    assert_eq!(body, bytes[2..=5].to_vec());

    let _ = std::fs::remove_dir_all(ws);
}

/// 不可满足的 Range → 416（播放器据此重试或报错，而不是拿到半截数据）。
#[tokio::test]
async fn media_stream_rejects_unsatisfiable_range() {
    let state = common::state("ws-media").await;
    let ws = common::make_workspace("ws-media-src");
    std::fs::write(ws.join("clip.webm"), [1u8, 2, 3, 4]).unwrap();

    let uri = format!(
        "/workspace/media?path=clip.webm&workspacePath={}",
        encode_query_value(&ws.to_string_lossy())
    );
    let (status, headers, _) = send_raw_get(state.clone(), &uri, Some("bytes=99-120")).await;

    assert_eq!(status, axum::http::StatusCode::RANGE_NOT_SATISFIABLE);
    assert_eq!(headers["content-range"], "bytes */4");

    let _ = std::fs::remove_dir_all(ws);
}

/// 越界路径（`..` 逃出工作区）必须被拒，不得读到工作区外文件。
#[tokio::test]
async fn media_stream_rejects_path_escape() {
    let state = common::state("ws-media").await;
    let ws = common::make_workspace("ws-media-src");
    let outside = ws.parent().unwrap().join(format!("secret-{}.txt", uuid::Uuid::new_v4()));
    std::fs::write(&outside, b"top secret").unwrap();

    let uri = format!(
        "/workspace/media?path=../{}&workspacePath={}",
        outside.file_name().unwrap().to_string_lossy(),
        encode_query_value(&ws.to_string_lossy())
    );
    let (status, _, body) = send_raw_get(state.clone(), &uri, None).await;

    assert_ne!(status, axum::http::StatusCode::OK, "越界读取必须失败");
    assert!(!body.windows(9).any(|window| window == b"top secret"));

    let _ = std::fs::remove_dir_all(ws);
    let _ = std::fs::remove_file(outside);
}

/// 0 字节文件即使带 Range 也是 200 空响应（浏览器端同构实现已对齐）。
#[tokio::test]
async fn media_stream_empty_file_with_range_is_200() {
    let state = common::state("ws-media").await;
    let ws = common::make_workspace("ws-media-src");
    std::fs::write(ws.join("empty.mp4"), []).unwrap();

    let uri = format!(
        "/workspace/media?path=empty.mp4&workspacePath={}",
        encode_query_value(&ws.to_string_lossy())
    );
    let (status, headers, body) = send_raw_get(state.clone(), &uri, Some("bytes=0-9")).await;

    assert_eq!(status, axum::http::StatusCode::OK);
    assert_eq!(headers["content-length"], "0");
    assert!(body.is_empty());

    let _ = std::fs::remove_dir_all(ws);
}

/// 目录目标：400（与浏览器端一致）。
#[tokio::test]
async fn media_stream_directory_is_400() {
    let state = common::state("ws-media").await;
    let ws = common::make_workspace("ws-media-src");
    std::fs::create_dir_all(ws.join("folder")).unwrap();

    let uri = format!(
        "/workspace/media?path=folder&workspacePath={}",
        encode_query_value(&ws.to_string_lossy())
    );
    let (status, _, _) = send_raw_get(state.clone(), &uri, None).await;
    assert_eq!(status, axum::http::StatusCode::BAD_REQUEST);

    let _ = std::fs::remove_dir_all(ws);
}

/// 工作区内的**文件符号链接**指向界外：父目录还在工作区内，只有最终
/// `canonicalize` 后的界内校验能拦住它。
///
/// Windows 无开发者模式/符号链接权限时创建会失败；此时跳过（本机开发者模式下实跑），
/// 另有目录 junction 用例覆盖“父目录解析”路径。
#[tokio::test]
async fn media_stream_rejects_file_symlink_escape() {
    let state = common::state("ws-media").await;
    let ws = common::make_workspace("ws-media-src");
    let outside = ws.parent().unwrap().join(format!("secret-file-{}.txt", uuid::Uuid::new_v4()));
    std::fs::write(&outside, b"top secret").unwrap();
    let link = ws.join("link.mp4");

    #[cfg(windows)]
    {
        if std::os::windows::fs::symlink_file(&outside, &link).is_err() {
            let _ = std::fs::remove_dir_all(ws);
            let _ = std::fs::remove_file(outside);
            return;
        }
    }
    #[cfg(unix)]
    std::os::unix::fs::symlink(&outside, &link).unwrap();

    let uri = format!(
        "/workspace/media?path=link.mp4&workspacePath={}",
        encode_query_value(&ws.to_string_lossy())
    );
    let (status, _, body) = send_raw_get(state.clone(), &uri, None).await;

    assert_eq!(status, axum::http::StatusCode::FORBIDDEN);
    assert!(!body.windows(9).any(|window| window == b"top secret"));

    let _ = std::fs::remove_dir_all(ws);
    let _ = std::fs::remove_file(outside);
}

/// 工作区内的目录链接指向界外：父目录 canonical 校验必须拒绝。
///
/// Windows 优先 `symlink_dir`（需开发者模式），失败回退 `mklink /J`
/// （普通用户可创建 junction），两者都不可用才跳过。
#[tokio::test]
async fn media_stream_rejects_directory_link_escape() {
    let state = common::state("ws-media").await;
    let ws = common::make_workspace("ws-media-src");
    let outside_dir = ws.parent().unwrap().join(format!("secret-dir-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&outside_dir).unwrap();
    std::fs::write(outside_dir.join("secret.txt"), b"top secret").unwrap();

    #[cfg(windows)]
    let relative = {
        let link = ws.join("linkdir");
        let linked = std::os::windows::fs::symlink_dir(&outside_dir, &link).is_ok()
            || std::process::Command::new("cmd")
                .args(["/C", "mklink", "/J"])
                .arg(&link)
                .arg(&outside_dir)
                .status()
                .map(|status| status.success())
                .unwrap_or(false);
        if !linked {
            // 无符号链接权限且 junction 创建失败：显式跳过（无可用的链接机制）。
            let _ = std::fs::remove_dir_all(ws);
            let _ = std::fs::remove_dir_all(outside_dir);
            return;
        }
        "linkdir/secret.txt"
    };
    #[cfg(unix)]
    let relative = {
        let link = ws.join("linkdir");
        std::os::unix::fs::symlink(&outside_dir, &link).unwrap();
        "linkdir/secret.txt"
    };

    let uri = format!(
        "/workspace/media?path={}&workspacePath={}",
        encode_query_value(relative),
        encode_query_value(&ws.to_string_lossy())
    );
    let (status, _, body) = send_raw_get(state.clone(), &uri, None).await;

    assert_eq!(status, axum::http::StatusCode::FORBIDDEN);
    assert!(!body.windows(9).any(|window| window == b"top secret"));

    let _ = std::fs::remove_dir_all(ws);
    let _ = std::fs::remove_dir_all(outside_dir);
}
