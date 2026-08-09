//! Commands-config domain HTTP endpoints (migrated from
//! `src-tauri/src/commands/commands_config.rs`: `list_custom_commands`,
//! `add_custom_command`, `update_custom_command`, `delete_custom_command`,
//! `render_command_template`). Custom slash-commands live in the app config on
//! disk (`<data_dir>/config/config.json`), which the standalone server owns via
//! `state.data_dir`; no explicit `dataDir` override is exercised (mirroring the
//! frontend `CommandsConfigBridge` where the caller supplies the data dir
//! explicitly, the state default is the isolated temp dir per test). Each test
//! drives `app_router` over a fresh `ServerState` via
//! `tower::ServiceExt::oneshot` — no sockets, no subprocesses.

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
    let dir = std::env::temp_dir().join(format!("adl-cc-api-{}", uuid::Uuid::new_v4()));
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

fn command(name: &str, template: &str) -> Value {
    json!({
        "name": name,
        "description": format!("command {name}"),
        "agent": "build",
        "model": null,
        "template": template,
        "subtask": false,
        "hints": []
    })
}

/// POST /commands-config/list returns an empty list on a fresh config (covers
/// `CommandsConfigBridge.listCustomCommands`).
#[tokio::test]
async fn list_custom_commands_returns_empty() {
    let state = state().await;
    let (status, body) = send(state, Method::POST, "/commands-config/list", Some(json!({}))).await;
    assert_eq!(status, StatusCode::OK, "list body: {body}");
    assert_eq!(body["ok"], true);
    assert!(body["data"].as_array().unwrap().is_empty(), "fresh list empty: {body}");
}

/// POST /commands-config/add appends a command, returns the updated list and
/// persists it to disk — covers `addCustomCommand`.
#[tokio::test]
async fn add_custom_command_persists_and_returns_list() {
    let state = state().await;
    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/commands-config/add",
        Some(json!({ "command": command("refactor", "Refactor $1") })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "add body: {body}");
    let commands = body["data"].as_array().unwrap();
    assert_eq!(commands.len(), 1, "one command: {body}");
    assert_eq!(commands[0]["name"], "refactor");
    assert_eq!(commands[0]["template"], "Refactor $1");

    // Persisted across a fresh load.
    let (_, body) = send(state, Method::POST, "/commands-config/list", Some(json!({}))).await;
    let commands = body["data"].as_array().unwrap();
    assert_eq!(commands.len(), 1, "command persisted: {body}");
    assert_eq!(commands[0]["name"], "refactor");
}

/// POST /commands-config/add with a duplicate name returns 400 INVALID_INPUT
/// (faithful to the Tauri `add_custom_command` duplicate guard).
#[tokio::test]
async fn add_custom_command_duplicate_name_returns_400() {
    let state = state().await;
    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/commands-config/add",
        Some(json!({ "command": command("dup", "one") })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "add body: {body}");

    let (status, body) = send(
        state,
        Method::POST,
        "/commands-config/add",
        Some(json!({ "command": command("dup", "two") })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "dup body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT", "body: {body}");
    assert!(body["error"]["message"].as_str().unwrap().contains("already exists"), "body: {body}");
}

/// POST /commands-config/update replaces a command by its original name and
/// persists; unknown name → 404 (covers `updateCustomCommand`).
#[tokio::test]
async fn update_custom_command_updates_by_name() {
    let state = state().await;
    let (_, add) = send(
        state.clone(),
        Method::POST,
        "/commands-config/add",
        Some(json!({ "command": command("old", "before") })),
    )
    .await;
    assert_eq!(add["data"].as_array().unwrap().len(), 1);

    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/commands-config/update",
        Some(json!({ "name": "old", "command": command("new", "after") })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "update body: {body}");
    let commands = body["data"].as_array().unwrap();
    assert_eq!(commands.len(), 1, "still one command: {body}");
    assert_eq!(commands[0]["name"], "new", "renamed: {body}");
    assert_eq!(commands[0]["template"], "after");
}

/// POST /commands-config/update with an unknown name → 404 NOT_FOUND.
#[tokio::test]
async fn update_custom_command_unknown_name_returns_404() {
    let state = state().await;
    let (status, body) = send(
        state,
        Method::POST,
        "/commands-config/update",
        Some(json!({ "name": "ghost", "command": command("x", "y") })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND", "body: {body}");
}

/// POST /commands-config/delete removes a command by name and persists (covers
/// `deleteCustomCommand`).
#[tokio::test]
async fn delete_custom_command_removes_and_persists() {
    let state = state().await;
    let (_, add) = send(
        state.clone(),
        Method::POST,
        "/commands-config/add",
        Some(json!({ "command": command("keep", "k") })),
    )
    .await;
    assert_eq!(add["data"].as_array().unwrap().len(), 1);

    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/commands-config/delete",
        Some(json!({ "name": "keep" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "delete body: {body}");
    assert!(body["data"].as_array().unwrap().is_empty(), "removed: {body}");

    let (_, body) = send(state, Method::POST, "/commands-config/list", Some(json!({}))).await;
    assert!(body["data"].as_array().unwrap().is_empty(), "persisted: {body}");
}

/// POST /commands-config/render substitutes $1/$ARGUMENTS/$WORKSPACE (covers
/// `CommandsConfigBridge.renderCommandTemplate`).
#[tokio::test]
async fn render_command_template_substitutes() {
    let state = state().await;
    let (status, body) = send(
        state,
        Method::POST,
        "/commands-config/render",
        Some(json!({
            "template": "Fix $1 using $ARGUMENTS in $WORKSPACE",
            "args": ["auth.rs"],
            "workspace": "/ws/demo"
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "render body: {body}");
    assert_eq!(body["data"], "Fix auth.rs using auth.rs in /ws/demo", "body: {body}");
}

/// POST /commands-config/add with a malformed body → 400.
#[tokio::test]
async fn add_custom_command_invalid_body_returns_400() {
    let state = state().await;
    let (status, body) = send(state, Method::POST, "/commands-config/add", Some(json!({}))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT", "body: {body}");
}
