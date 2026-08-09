//! Custom-agent registry domain HTTP endpoints (migrated from
//! `src-tauri/src/commands/custom_agent.rs`). Each test drives `app_router` over
//! a fresh `ServerState` via `tower::ServiceExt::oneshot` — the config is
//! persisted to the state's own config dir (no `dataDir` override), so each
//! test's config file is isolated in its temp directory.

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
    let dir = std::env::temp_dir().join(format!("adl-ca-api-{}", uuid::Uuid::new_v4()));
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

fn agent(name: &str, description: &str) -> Value {
    json!({
        "id": "custom",
        "name": name,
        "description": description,
        "mode": "subagent",
        "hidden": false,
        "allowsWriteTools": false,
        "promptTemplate": "template-1",
        "modelOverride": null,
        "allowedTools": ["read", "grep"]
    })
}

/// POST /custom-agent/list returns an empty list on a fresh config (covers
/// `CustomAgentBridge.listCustomAgents`).
#[tokio::test]
async fn list_custom_agents_returns_empty() {
    let state = state().await;
    let (status, body) = send(state, Method::POST, "/custom-agent/list", Some(json!({}))).await;
    assert_eq!(status, StatusCode::OK, "list body: {body}");
    assert_eq!(body["ok"], true);
    assert!(body["data"].as_array().unwrap().is_empty(), "fresh list empty: {body}");
}

/// POST /custom-agent/add appends an agent, returns the updated list and
/// persists it to disk — covers `addCustomAgent`.
#[tokio::test]
async fn add_custom_agent_persists_and_returns_list() {
    let state = state().await;
    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/custom-agent/add",
        Some(json!({ "agent": agent("My Helper", "test agent") })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "add body: {body}");
    let agents = body["data"].as_array().unwrap();
    assert_eq!(agents.len(), 1, "one agent: {body}");
    assert_eq!(agents[0]["name"], "My Helper");
    assert_eq!(agents[0]["id"], "custom");
    assert_eq!(agents[0]["allowedTools"][0], "read");

    // Persisted across a fresh load.
    let (_, body) = send(state, Method::POST, "/custom-agent/list", Some(json!({}))).await;
    let agents = body["data"].as_array().unwrap();
    assert_eq!(agents.len(), 1, "agent persisted: {body}");
    assert_eq!(agents[0]["name"], "My Helper");
}

/// POST /custom-agent/delete removes an agent by name and persists.
#[tokio::test]
async fn delete_custom_agent_removes_and_persists() {
    let state = state().await;
    let (_, add) = send(
        state.clone(),
        Method::POST,
        "/custom-agent/add",
        Some(json!({ "agent": agent("Keep Me", "keep") })),
    )
    .await;
    assert_eq!(add["data"].as_array().unwrap().len(), 1);

    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/custom-agent/delete",
        Some(json!({ "name": "Keep Me" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "delete body: {body}");
    assert!(body["data"].as_array().unwrap().is_empty(), "removed: {body}");

    let (_, body) = send(state, Method::POST, "/custom-agent/list", Some(json!({}))).await;
    assert!(body["data"].as_array().unwrap().is_empty(), "persisted: {body}");
}

/// POST /custom-agent/update replaces an agent by its original name; unknown
/// original name → 404.
#[tokio::test]
async fn update_custom_agent_updates_by_original_name() {
    let state = state().await;
    let (_, add) = send(
        state.clone(),
        Method::POST,
        "/custom-agent/add",
        Some(json!({ "agent": agent("Old Name", "before") })),
    )
    .await;
    assert_eq!(add["data"].as_array().unwrap().len(), 1);

    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/custom-agent/update",
        Some(json!({ "originalName": "Old Name", "agent": agent("New Name", "after") })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "update body: {body}");
    assert_eq!(body["data"], true, "update returns true: {body}");

    // Persisted + renamed.
    let (_, body) = send(state, Method::POST, "/custom-agent/list", Some(json!({}))).await;
    let agents = body["data"].as_array().unwrap();
    assert_eq!(agents.len(), 1, "still one agent: {body}");
    assert_eq!(agents[0]["name"], "New Name", "renamed: {body}");
    assert_eq!(agents[0]["description"], "after");
}

/// POST /custom-agent/update with an unknown original name → 404.
#[tokio::test]
async fn update_custom_agent_unknown_original_returns_404() {
    let state = state().await;
    let (status, body) = send(
        state,
        Method::POST,
        "/custom-agent/update",
        Some(json!({ "originalName": "ghost", "agent": agent("X", "y") })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND");
}
