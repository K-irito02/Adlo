//! Reference-domain HTTP endpoints (migrated from
//! `src-tauri/src/commands/reference.rs`). Each test drives `app_router` over a
//! fresh `ServerState` via `tower::ServiceExt::oneshot`. References are
//! persisted to the state's config file (no explicit `dataDir` override), so
//! each test's config is isolated in its temp directory. The local-reference
//! add path points at a real temp dir so validation passes deterministically.

// Integration-test crate: unwraps in helpers (not `#[test]` fns) fall outside
// clippy's `allow-unwrap-in-tests`, so permit them at the crate level.
#![allow(clippy::unwrap_used)]

use ad_server::engine::init_server_state;
use ad_server::router::app_router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use serde_json::{Value, json};
use std::path::Path;
use tower::ServiceExt;

async fn state() -> ad_server::ServerState {
    let dir = std::env::temp_dir().join(format!("adl-ref-api-{}", uuid::Uuid::new_v4()));
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

fn local_reference(name: &str, path: &Path) -> Value {
    json!({
        "name": name,
        "source": "local",
        "path": path.to_string_lossy(),
        "branch": null,
        "enabled": true
    })
}

/// POST /reference/list on a fresh state → empty list (covers
/// `ReferenceBridge.listReferences`).
#[tokio::test]
async fn list_references_returns_empty() {
    let state = state().await;
    let (status, body) = send(state, "/reference/list", Some(json!({ "dataDir": null }))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert!(body["data"].as_array().unwrap().is_empty(), "fresh list: {body}");
}

/// POST /reference/add appends a valid local reference and persists it across a
/// fresh load (covers `ReferenceBridge.addReference`).
#[tokio::test]
async fn add_reference_persists_and_returns_list() {
    let state = state().await;
    let dir = std::env::temp_dir().join(format!("adl-ref-src-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let reference = local_reference("opencode", &dir);

    let (status, body) =
        send(state.clone(), "/reference/add", Some(json!({ "reference": reference }))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    let refs = body["data"].as_array().unwrap();
    assert_eq!(refs.len(), 1, "one reference: {body}");
    assert_eq!(refs[0]["name"], "opencode", "body: {body}");
    assert_eq!(refs[0]["source"], "local", "body: {body}");
    assert_eq!(refs[0]["enabled"], true, "body: {body}");

    // Persisted across a fresh load.
    let (_, body) = send(state, "/reference/list", Some(json!({ "dataDir": null }))).await;
    let refs = body["data"].as_array().unwrap();
    assert_eq!(refs.len(), 1, "persisted: {body}");
    assert_eq!(refs[0]["name"], "opencode", "body: {body}");
}

/// POST /reference/remove deletes a reference and persists (covers
/// `ReferenceBridge.removeReference`).
#[tokio::test]
async fn remove_reference_removes_and_persists() {
    let state = state().await;
    let dir = std::env::temp_dir().join(format!("adl-ref-src-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let reference = local_reference("opencode", &dir);

    let (_, body) =
        send(state.clone(), "/reference/add", Some(json!({ "reference": reference }))).await;
    assert_eq!(body["data"].as_array().unwrap().len(), 1);

    let (status, body) =
        send(state.clone(), "/reference/remove", Some(json!({ "name": "opencode" }))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert!(body["data"].as_array().unwrap().is_empty(), "removed: {body}");

    let (_, body) = send(state, "/reference/list", Some(json!({ "dataDir": null }))).await;
    assert!(body["data"].as_array().unwrap().is_empty(), "persisted: {body}");
}

/// POST /reference/add with a local path that does not exist → 404 (faithful to
/// `validate_reference`'s NotFound).
#[tokio::test]
async fn add_reference_missing_path_returns_404() {
    let state = state().await;
    let missing = std::env::temp_dir()
        .join(format!("adl-ref-missing-{}", uuid::Uuid::new_v4()))
        .join("does-not-exist");
    let (status, body) = send(
        state,
        "/reference/add",
        Some(json!({ "reference": local_reference("ghost", &missing) })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND");
}

/// POST /reference/prompt builds the prompt text from enabled references (covers
/// `ReferenceBridge.getReferencesPrompt`).
#[tokio::test]
async fn get_references_prompt_mentions_enabled_reference() {
    let state = state().await;
    let dir = std::env::temp_dir().join(format!("adl-ref-src-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let reference = local_reference("opencode", &dir);
    let (_, body) =
        send(state.clone(), "/reference/add", Some(json!({ "reference": reference }))).await;
    assert_eq!(body["data"].as_array().unwrap().len(), 1);

    let (status, body) = send(state, "/reference/prompt", Some(json!({ "dataDir": null }))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    let prompt = body["data"].as_str().unwrap();
    assert!(prompt.contains("opencode"), "enabled reference in prompt: {prompt}");
    assert!(prompt.contains("## Available References"), "prompt header: {prompt}");
}
