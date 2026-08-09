//! Permission ruleset domain HTTP endpoints (migrated from
//! `src-tauri/src/commands/permission.rs`). Each test drives `app_router` over a
//! fresh `ServerState` via `tower::ServiceExt::oneshot` — the ruleset is
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
    let dir = std::env::temp_dir().join(format!("adl-perm-api-{}", uuid::Uuid::new_v4()));
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

/// POST /permission/list returns the default ruleset config (include_defaults
/// true, empty custom rules) — covers `PermissionBridge.listPermissionRules`.
#[tokio::test]
async fn list_permission_rules_returns_defaults() {
    let state = state().await;
    let (status, body) = send(state, Method::POST, "/permission/list", Some(json!({}))).await;
    assert_eq!(status, StatusCode::OK, "list body: {body}");
    assert_eq!(body["ok"], true);
    assert_eq!(body["data"]["include_defaults"], true, "body: {body}");
    assert!(body["data"]["custom_rules"].as_array().unwrap().is_empty(), "body: {body}");
}

/// POST /permission/add appends a rule, returns the updated config and persists
/// it to disk (a follow-up list sees it) — covers `addPermissionRule`.
#[tokio::test]
async fn add_permission_rule_persists_and_returns_config() {
    let state = state().await;
    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/permission/add",
        Some(json!({
            "rule": {
                "pattern": "echo *",
                "decision": "deny",
                "tool_type": "bash",
                "always": true,
                "reason": "test rule"
            }
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "add body: {body}");
    let rules = body["data"]["custom_rules"].as_array().unwrap();
    assert_eq!(rules.len(), 1, "one rule added: {body}");
    assert_eq!(rules[0]["pattern"], "echo *");
    assert_eq!(rules[0]["decision"], "deny");
    assert_eq!(rules[0]["tool_type"], "bash");

    // Persisted across a fresh load.
    let (_, body) = send(state, Method::POST, "/permission/list", Some(json!({}))).await;
    let rules = body["data"]["custom_rules"].as_array().unwrap();
    assert_eq!(rules.len(), 1, "rule persisted: {body}");
    assert_eq!(rules[0]["pattern"], "echo *");
}

/// POST /permission/delete removes a rule by index; out-of-range → 404.
#[tokio::test]
async fn delete_permission_rule_out_of_bounds_returns_404() {
    let state = state().await;
    let (status, body) =
        send(state, Method::POST, "/permission/delete", Some(json!({ "index": 5 }))).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND");
}

/// POST /permission/delete removes an existing rule and persists.
#[tokio::test]
async fn delete_permission_rule_removes_and_persists() {
    let state = state().await;
    let (_, add) = send(
        state.clone(),
        Method::POST,
        "/permission/add",
        Some(json!({
            "rule": { "pattern": "git push --force*", "decision": "ask", "tool_type": "bash",
                      "always": true, "reason": "rule to delete" }
        })),
    )
    .await;
    assert_eq!(add["data"]["custom_rules"].as_array().unwrap().len(), 1);

    let (status, body) =
        send(state.clone(), Method::POST, "/permission/delete", Some(json!({ "index": 0 }))).await;
    assert_eq!(status, StatusCode::OK, "delete body: {body}");
    assert!(body["data"]["custom_rules"].as_array().unwrap().is_empty());

    let (_, body) = send(state, Method::POST, "/permission/list", Some(json!({}))).await;
    assert!(body["data"]["custom_rules"].as_array().unwrap().is_empty(), "persisted: {body}");
}

/// POST /permission/include-defaults toggles the built-in ruleset flag.
#[tokio::test]
async fn set_permission_include_defaults_updates_config() {
    let state = state().await;
    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/permission/include-defaults",
        Some(json!({ "include": false })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["data"]["include_defaults"], false, "body: {body}");

    let (_, body) = send(state, Method::POST, "/permission/list", Some(json!({}))).await;
    assert_eq!(body["data"]["include_defaults"], false, "persisted: {body}");
}

/// POST /permission/evaluate applies custom rules (last matching rule wins) and
/// the risk-derived default when nothing matches.
#[tokio::test]
async fn evaluate_permission_applies_custom_rules() {
    let state = state().await;
    let (_, add) = send(
        state.clone(),
        Method::POST,
        "/permission/add",
        Some(json!({
            "rule": { "pattern": "echo *", "decision": "deny", "tool_type": "bash",
                      "always": true, "reason": "block echo" }
        })),
    )
    .await;
    assert_eq!(add["ok"], true, "add: {add}");

    // Custom deny rule matches the command.
    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/permission/evaluate",
        Some(json!({ "toolName": "bash", "command": "echo", "args": ["hello"] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "eval body: {body}");
    assert_eq!(body["data"], "deny", "custom deny rule wins: {body}");

    // No rule matches → low-risk default allow.
    let (_, body) = send(
        state,
        Method::POST,
        "/permission/evaluate",
        Some(json!({ "toolName": "bash", "command": "git", "args": ["status"] })),
    )
    .await;
    assert_eq!(body["data"], "allow", "default allow: {body}");
}

/// POST /permission/evaluate with the default ruleset denies destructive
/// recursive deletion.
#[tokio::test]
async fn evaluate_permission_default_ruleset_denies_rm_rf() {
    let state = state().await;
    let (status, body) = send(
        state,
        Method::POST,
        "/permission/evaluate",
        Some(json!({ "toolName": "bash", "command": "rm", "args": ["-rf", "/tmp/x"] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "eval body: {body}");
    assert_eq!(body["data"], "deny", "built-in rm -rf deny rule: {body}");
}
