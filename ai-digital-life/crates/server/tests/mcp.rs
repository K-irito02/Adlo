//! MCP domain HTTP endpoints (migrated from `src-tauri/src/commands/mcp.rs`).
//! Each test drives `app_router` over a fresh `ServerState` via
//! `tower::ServiceExt::oneshot`. No real MCP server is ever connected: add /
//! remove / list / catalog are in-memory deterministic, and connect is exercised
//! with an unknown server (404 before any transport work).

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
    let dir = std::env::temp_dir().join(format!("adl-mcp-api-{}", uuid::Uuid::new_v4()));
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

fn stdio_config(name: &str) -> Value {
    json!({
        "name": name,
        "transport": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server"],
        "url": null,
        "env": {},
        "oauth": false,
        "enabled": true
    })
}

/// POST /mcp/add then POST /mcp/list — a newly added server appears as
/// disconnected (covers `McpBridge.addMcpServer` / `listMcpServers`).
#[tokio::test]
async fn add_mcp_server_then_list() {
    let state = state().await;
    let (status, body) = send(state.clone(), "/mcp/add", Some(stdio_config("srv-1"))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");

    let (status, body) = send(state, "/mcp/list", Some(json!({}))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    let servers = body["data"].as_array().unwrap();
    assert_eq!(servers.len(), 1, "servers: {body}");
    assert_eq!(servers[0]["name"], "srv-1", "body: {body}");
    assert_eq!(servers[0]["state"], "disconnected", "newly added server: {body}");
}

/// POST /mcp/remove removes a server (covers `McpBridge.removeMcpServer`).
#[tokio::test]
async fn remove_mcp_server_removes_from_list() {
    let state = state().await;
    let (_, body) = send(state.clone(), "/mcp/add", Some(stdio_config("srv-1"))).await;
    assert_eq!(body["ok"], true);

    let (status, body) = send(state.clone(), "/mcp/remove", Some(json!({ "name": "srv-1" }))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");

    let (_, body) = send(state, "/mcp/list", Some(json!({}))).await;
    assert!(body["data"].as_array().unwrap().is_empty(), "removed: {body}");
}

/// POST /mcp/catalog on a fresh state → empty tools/resources (covers
/// `McpBridge.getMcpCatalog`).
#[tokio::test]
async fn get_mcp_catalog_returns_empty() {
    let state = state().await;
    let (status, body) = send(state, "/mcp/catalog", Some(json!({}))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert!(body["data"]["tools"].as_array().unwrap().is_empty(), "body: {body}");
    assert!(body["data"]["resources"].as_array().unwrap().is_empty(), "body: {body}");
}

/// POST /mcp/connect for an unknown server → 404 (covers
/// `McpBridge.connectMcpServer`).
#[tokio::test]
async fn connect_unknown_mcp_server_returns_404() {
    let state = state().await;
    let (status, body) = send(state, "/mcp/connect", Some(json!({ "name": "ghost" }))).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND");
}

/// POST /mcp/disconnect for an unknown server is a no-op success (covers
/// `McpBridge.disconnectMcpServer`).
#[tokio::test]
async fn disconnect_unknown_mcp_server_ok() {
    let state = state().await;
    let (status, body) = send(state, "/mcp/disconnect", Some(json!({ "name": "ghost" }))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
}

/// POST /mcp/load-config for a missing file → error (covers
/// `McpBridge.loadMcpConfig`).
#[tokio::test]
async fn load_mcp_config_missing_file_returns_error() {
    let state = state().await;
    let missing = std::env::temp_dir()
        .join(format!("adl-mcp-{}.mcp.json", uuid::Uuid::new_v4()))
        .to_string_lossy()
        .to_string();
    let (status, body) = send(state, "/mcp/load-config", Some(json!({ "path": missing }))).await;
    assert!(!status.is_success(), "expected error status, got {status}: {body}");
    assert_eq!(body["ok"], false, "body: {body}");
}
