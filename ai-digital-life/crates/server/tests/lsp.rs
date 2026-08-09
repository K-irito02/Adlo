//! LSP domain HTTP endpoints (migrated from `src-tauri/src/commands/lsp.rs`).
//! Each test drives `app_router` over a fresh `ServerState` via
//! `tower::ServiceExt::oneshot`. No language server is ever spawned: the
//! no-client paths return empty/null deterministically, and the start path is
//! exercised with a command that cannot resolve on PATH (deterministic error).

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
    let dir = std::env::temp_dir().join(format!("adl-lsp-api-{}", uuid::Uuid::new_v4()));
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

/// POST /lsp/symbols with no client for the workspace → empty list (covers
/// `LspBridge.getSymbols`).
#[tokio::test]
async fn lsp_symbols_without_server_returns_empty() {
    let state = state().await;
    let (status, body) = send(
        state,
        "/lsp/symbols",
        Some(json!({ "workspaceId": "ws-1", "filePath": "src/main.rs" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert!(body["data"].as_array().unwrap().is_empty(), "no server -> empty: {body}");
}

/// POST /lsp/diagnostics with no client for the workspace → empty list (covers
/// `LspBridge.getDiagnostics`).
#[tokio::test]
async fn lsp_diagnostics_without_server_returns_empty() {
    let state = state().await;
    let (status, body) = send(
        state,
        "/lsp/diagnostics",
        Some(json!({ "workspaceId": "ws-1", "filePath": "src/main.rs" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert!(body["data"].as_array().unwrap().is_empty(), "no server -> empty: {body}");
}

/// POST /lsp/diagnostics without a filePath → empty list (mirrors the Tauri
/// `Option<String>` argument defaulting to empty).
#[tokio::test]
async fn lsp_diagnostics_missing_file_path_returns_empty() {
    let state = state().await;
    let (status, body) =
        send(state, "/lsp/diagnostics", Some(json!({ "workspaceId": "ws-1", "filePath": null })))
            .await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert!(body["data"].as_array().unwrap().is_empty(), "no file path -> empty: {body}");
}

/// POST /lsp/goto-definition with no client → null (covers
/// `LspBridge.gotoDefinition`).
#[tokio::test]
async fn lsp_goto_definition_without_server_returns_null() {
    let state = state().await;
    let (status, body) = send(
        state,
        "/lsp/goto-definition",
        Some(json!({ "workspaceId": "ws-1", "filePath": "src/main.rs", "line": 1, "column": 0 })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert!(body["data"].is_null(), "no server -> null: {body}");
}

/// POST /lsp/stop with no client is a no-op success (covers
/// `LspBridge.stopServer`).
#[tokio::test]
async fn lsp_stop_without_server_is_ok() {
    let state = state().await;
    let (status, body) =
        send(state, "/lsp/stop", Some(json!({ "workspaceId": "ws-1", "server": "rust-analyzer" })))
            .await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
}

/// POST /lsp/start with a server command that cannot resolve on PATH → error
/// response (deterministic — no subprocess is spawned).
#[tokio::test]
async fn lsp_start_unknown_server_returns_error() {
    let state = state().await;
    let (status, body) = send(
        state,
        "/lsp/start",
        Some(json!({
            "workspaceId": "ws-1",
            "workspaceRoot": std::env::temp_dir().to_string_lossy(),
            "server": "custom-nonexistent-lsp-xyzzy"
        })),
    )
    .await;
    assert!(!status.is_success(), "expected error status, got {status}: {body}");
    assert_eq!(body["ok"], false, "body: {body}");
    assert!(body["error"]["code"].as_str().is_some(), "error code expected: {body}");
}
