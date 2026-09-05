//! Patch domain HTTP endpoints (migrated from `src-tauri/src/commands/patch.rs`
//! — `patch_get_patch_set`, `patch_set_hunk_decision`, `patch_apply_patch_set`,
//! `patch_rollback_patch_set`). Each test drives `app_router` over a fresh
//! `ServerState` via `tower::ServiceExt::oneshot` — no sockets, no
//! subprocesses (the apply workspace has no Cargo.toml/package.json, so the
//! validation command is skipped and nothing executes).

// Integration-test crate: unwraps in helpers (not `#[test]` fns) fall outside
// clippy's `allow-unwrap-in-tests`, so permit them at the crate level.
#![allow(clippy::unwrap_used)]

use ad_server::engine::init_server_state;
use ad_server::router::app_router;
use adl_fs_ops::content_hash;
use adl_storage::EntityTable;
use adl_types::{FilePatch, PatchHunk, PatchHunkDecision, PatchSet, PatchSetStatus, now_ms};
use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use serde_json::{Value, json};
use tower::ServiceExt;

async fn state() -> ad_server::ServerState {
    let dir = std::env::temp_dir().join(format!("adl-patch-api-{}", uuid::Uuid::new_v4()));
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
    let bytes = axum::body::to_bytes(resp.into_body(), 256 * 1024).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

/// Open a bare temp workspace (no Cargo.toml/package.json → no validation
/// command → validation is "skipped" and nothing executes).
async fn open_bare_workspace(state: &ad_server::ServerState) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("adl-patch-ws-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/workspace/open",
        Some(json!({ "workspacePath": dir.to_string_lossy() })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "open body: {body}");
    dir
}

/// Build a ready PatchSet editing `app.txt` from `before` to `after` with one
/// accepted hunk, and persist it into the DB.
fn persist_patch_set(
    state: &ad_server::ServerState,
    workspace_id: &str,
    session_id: &str,
    before: &str,
    after: &str,
    run_id: Option<String>,
) -> String {
    let now = now_ms();
    let rel = "app.txt".to_string();
    let patch_set_id = "pset-1".to_string();
    let file_patch = FilePatch {
        id: "fp-1".to_string(),
        patch_set_id: patch_set_id.clone(),
        relative_path: rel.clone(),
        language: Some("txt".into()),
        before_content: before.to_string(),
        after_content: after.to_string(),
        before_hash: content_hash(before),
        hunks: vec![PatchHunk {
            id: "hunk-1".to_string(),
            file_patch_id: "fp-1".to_string(),
            patch_set_id: patch_set_id.clone(),
            relative_path: rel.clone(),
            old_start: 0,
            old_lines: 1,
            new_start: 0,
            new_lines: 1,
            preview: format!("-{before}\n+{after}"),
            before_text: before.to_string(),
            after_text: after.to_string(),
            decision: PatchHunkDecision::Accepted,
        }],
    };
    let patch_set = PatchSet {
        id: patch_set_id.clone(),
        workspace_id: workspace_id.to_string(),
        session_id: session_id.to_string(),
        run_id,
        title: "Change app.txt".into(),
        summary: "Applies the accepted hunk".into(),
        status: PatchSetStatus::Ready,
        checkpoint_id: None,
        file_patches: vec![file_patch],
        created_at: now,
        updated_at: now,
    };
    state
        .db
        .save_entity(
            EntityTable::PatchSets,
            &patch_set.id,
            Some(workspace_id),
            Some(session_id),
            Some("ready"),
            &patch_set,
        )
        .unwrap();
    patch_set_id
}

/// GET /patch/{id} returns a persisted patch set; unknown id → null (covers
/// `PatchBridge.getPatchSet`).
#[tokio::test]
async fn get_patch_set_returns_set_or_null() {
    let state = state().await;
    persist_patch_set(&state, "ws-1", "s-1", "before", "after", None);

    let (status, body) = send(state.clone(), Method::GET, "/patch/pset-1", None).await;
    assert_eq!(status, StatusCode::OK, "get body: {body}");
    assert_eq!(body["ok"], true);
    assert_eq!(body["data"]["id"], "pset-1");
    assert_eq!(body["data"]["status"], "ready");
    assert_eq!(body["data"]["filePatches"][0]["afterContent"], "after");

    let (_, body) = send(state, Method::GET, "/patch/does-not-exist", None).await;
    assert!(body["data"].is_null(), "unknown patch set → null: {body}");
}

/// POST /patch/hunk-decision sets a hunk's decision and persists it (covers
/// `PatchBridge.setHunkDecision`).
#[tokio::test]
async fn set_hunk_decision_updates_and_persists() {
    let state = state().await;
    persist_patch_set(&state, "ws-1", "s-1", "before", "after", None);

    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/patch/hunk-decision",
        Some(json!({ "patchSetId": "pset-1", "hunkId": "hunk-1", "decision": "rejected" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "decision body: {body}");
    assert_eq!(body["data"]["filePatches"][0]["hunks"][0]["decision"], "rejected");

    let (_, body) = send(state, Method::GET, "/patch/pset-1", None).await;
    assert_eq!(body["data"]["filePatches"][0]["hunks"][0]["decision"], "rejected", "persisted");
}

/// POST /patch/hunk-decision with an unknown hunk → 404.
#[tokio::test]
async fn set_hunk_decision_unknown_hunk_returns_404() {
    let state = state().await;
    persist_patch_set(&state, "ws-1", "s-1", "before", "after", None);
    let (status, body) = send(
        state,
        Method::POST,
        "/patch/hunk-decision",
        Some(json!({ "patchSetId": "pset-1", "hunkId": "nope", "decision": "accepted" })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND");
}

/// POST /patch/apply applies the accepted hunk to the workspace file, persists
/// the applied patch set + skipped validation (no validation command in a bare
/// workspace), and does NOT execute anything.
#[tokio::test]
async fn apply_patch_set_applies_file_and_persists() {
    let state = state().await;
    let ws_dir = open_bare_workspace(&state).await;
    std::fs::write(ws_dir.join("app.txt"), "before").unwrap();
    // Open a workspace; the patch set links to it with a synthetic session id
    // (the agent-era `/session` endpoint is gone — host flow needs no session).
    let ws_meta = state.current_workspace.read().unwrap().clone().unwrap();
    persist_patch_set(&state, &ws_meta.id, "s-apply", "before", "after", None);

    let (status, body) =
        send(state.clone(), Method::POST, "/patch/apply", Some(json!({ "patchSetId": "pset-1" })))
            .await;
    assert_eq!(status, StatusCode::OK, "apply body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert_eq!(body["data"]["patchSet"]["status"], "applied", "body: {body}");
    assert_eq!(body["data"]["rolledBack"], false, "body: {body}");
    assert!(body["data"]["validation"].is_null(), "no validation in host flow: {body}");
    assert!(body["data"]["commandResult"].is_null(), "nothing executed: {body}");

    // File on disk was updated.
    assert_eq!(std::fs::read_to_string(ws_dir.join("app.txt")).unwrap(), "after");

    // Patch set persisted with applied status.
    let (_, body) = send(state, Method::GET, "/patch/pset-1", None).await;
    assert_eq!(body["data"]["status"], "applied", "persisted: {body}");
}

/// POST /patch/apply without an active workspace → 404.
#[tokio::test]
async fn apply_patch_set_without_workspace_returns_404() {
    let state = state().await;
    persist_patch_set(&state, "ws-1", "s-1", "before", "after", None);
    let (status, body) =
        send(state, Method::POST, "/patch/apply", Some(json!({ "patchSetId": "pset-1" }))).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND");
}

/// POST /patch/rollback reverts the applied file change and marks the patch set
/// rolled-back (covers `PatchBridge.rollbackPatchSet`).
#[tokio::test]
async fn rollback_patch_set_reverts_file_and_persists() {
    let state = state().await;
    let ws_dir = open_bare_workspace(&state).await;
    std::fs::write(ws_dir.join("app.txt"), "before").unwrap();
    let ws_meta = state.current_workspace.read().unwrap().clone().unwrap();
    persist_patch_set(&state, &ws_meta.id, "s-rollback", "before", "after", None);

    let (status, body) =
        send(state.clone(), Method::POST, "/patch/apply", Some(json!({ "patchSetId": "pset-1" })))
            .await;
    assert_eq!(status, StatusCode::OK, "apply body: {body}");
    assert_eq!(std::fs::read_to_string(ws_dir.join("app.txt")).unwrap(), "after");

    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/patch/rollback",
        Some(json!({ "patchSetId": "pset-1" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "rollback body: {body}");
    assert_eq!(body["data"]["status"], "rolled-back", "body: {body}");
    assert_eq!(std::fs::read_to_string(ws_dir.join("app.txt")).unwrap(), "before");

    let (_, body) = send(state, Method::GET, "/patch/pset-1", None).await;
    assert_eq!(body["data"]["status"], "rolled-back", "persisted: {body}");
}
