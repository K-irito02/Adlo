//! Sub-agent domain HTTP endpoints (migrated from
//! `src-tauri/src/commands/subagent.rs`). Each test drives `app_router` over a
//! fresh `ServerState` via `tower::ServiceExt::oneshot`. The LLM execution path
//! is made deterministic by disabling every provider in the test config so the
//! gateway answers with its synthetic fallback (no network I/O).

// Integration-test crate: unwraps in helpers (not `#[test]` fns) fall outside
// clippy's `allow-unwrap-in-tests`, so permit them at the crate level.
#![allow(clippy::unwrap_used)]

use ad_server::engine::init_server_state;
use ad_server::router::app_router;
use adl_storage::EntityTable;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use serde_json::{Value, json};
use std::time::Duration;
use tower::ServiceExt;

async fn state() -> ad_server::ServerState {
    let dir = std::env::temp_dir().join(format!("adl-subagent-api-{}", uuid::Uuid::new_v4()));
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
    let bytes = axum::body::to_bytes(resp.into_body(), 4 * 1024 * 1024).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

fn create_parent_session(state: &ad_server::ServerState) -> String {
    let session = adl_conversation::create_session("ws-subagent", Some("parent".into()), 0);
    state
        .db
        .save_entity(
            EntityTable::Sessions,
            &session.id,
            Some("ws-subagent"),
            Some(&session.id),
            Some(&session.status),
            &session,
        )
        .unwrap();
    session.id
}

fn disable_all_providers(state: &ad_server::ServerState) {
    let mut config = state.config.write().unwrap();
    for pref in config.model_preferences.providers.values_mut() {
        pref.enabled = false;
    }
}

/// POST /subagent/spawn with an unknown parent session → 404 (covers
/// `SubagentBridge.spawnSubagent`).
#[tokio::test]
async fn spawn_subagent_missing_parent_returns_404() {
    let state = state().await;
    let (status, body) = send(
        state,
        "/subagent/spawn",
        Some(json!({
            "parentSessionId": "session-nope",
            "input": {
                "taskId": "sub-404",
                "subagentType": "general",
                "prompt": "hi",
                "description": "d",
                "background": false
            }
        })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND");
}

/// POST /subagent/get for an unknown task → null (covers
/// `SubagentBridge.getSubagentTask`).
#[tokio::test]
async fn get_subagent_task_unknown_returns_null() {
    let state = state().await;
    let (status, body) = send(state, "/subagent/get", Some(json!({ "taskId": "sub_nope" }))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert!(body["data"].is_null(), "unknown task -> null: {body}");
}

/// POST /subagent/list-active on a fresh state → empty list (covers
/// `SubagentBridge.listActiveSubagents`).
#[tokio::test]
async fn list_active_subagents_returns_empty() {
    let state = state().await;
    let (status, body) =
        send(state, "/subagent/list-active", Some(json!({ "workspaceId": "ws-subagent" }))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert!(body["data"].as_array().unwrap().is_empty(), "fresh active list: {body}");
}

/// POST /subagent/cancel for an unknown task → 404 (covers
/// `SubagentBridge.cancelSubagent`).
#[tokio::test]
async fn cancel_subagent_unknown_returns_404() {
    let state = state().await;
    let (status, body) =
        send(state, "/subagent/cancel", Some(json!({ "taskId": "sub_nope" }))).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND");
}

/// POST /subagent/spawn in background returns a running ack immediately and the
/// task reaches `completed` via the synthetic gateway (deterministic).
#[tokio::test]
async fn spawn_subagent_background_returns_running_then_completes() {
    let state = state().await;
    let parent = create_parent_session(&state);
    disable_all_providers(&state);

    let (status, body) = send(
        state.clone(),
        "/subagent/spawn",
        Some(json!({
            "parentSessionId": parent,
            "input": {
                "taskId": "sub-bg-1",
                "subagentType": "general",
                "prompt": "analyze the auth module",
                "description": "Analyze the authentication module",
                "background": true
            }
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["data"]["state"], "running", "background ack: {body}");
    assert_eq!(body["data"]["taskId"], "sub-bg-1", "body: {body}");

    // Poll until the background task reaches a terminal state.
    let task = tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            let (_, body) =
                send(state.clone(), "/subagent/get", Some(json!({ "taskId": "sub-bg-1" }))).await;
            let status = body["data"]["status"].as_str().unwrap_or("").to_string();
            if status == "completed" || status == "failed" || status == "aborted" {
                return body;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("background subagent should reach a terminal state");
    assert_eq!(task["data"]["status"], "completed", "synthetic fallback completes: {task}");
    assert_eq!(task["data"]["parentSessionId"], parent, "parent linked: {task}");
    assert!(task["data"]["childSessionId"].as_str().map(|s| !s.is_empty()).unwrap_or(false));
}

/// POST /subagent/spawn in foreground waits for the (synthetic) LLM call and
/// returns a completed task.
#[tokio::test]
async fn spawn_subagent_foreground_completes_with_synthetic() {
    let state = state().await;
    let parent = create_parent_session(&state);
    disable_all_providers(&state);

    let (status, body) = send(
        state,
        "/subagent/spawn",
        Some(json!({
            "parentSessionId": parent,
            "input": {
                "taskId": "sub-fg-1",
                "subagentType": "general",
                "prompt": "analyze the auth module",
                "description": "Analyze the authentication module",
                "background": false
            }
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["data"]["state"], "completed", "foreground completes: {body}");
    assert_eq!(body["data"]["taskId"], "sub-fg-1", "body: {body}");
    assert!(
        body["data"]["result"].as_str().map(|s| !s.is_empty()).unwrap_or(false),
        "synthetic result present: {body}"
    );
}
