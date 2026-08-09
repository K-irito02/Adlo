//! Agent pipeline (loop / turn) domain HTTP endpoints (migrated from
//! `src-tauri/src/commands/agent_loop.rs` — `agent_loop_run`, `agent_loop_abort`,
//! which are the real loop commands behind the brief's `agent_pipeline_*`
//! table entry). Each test drives `app_router` over a fresh `ServerState` via
//! `tower::ServiceExt::oneshot` — no sockets, no subprocesses, no network.
//!
//! Determinism: a disabled model makes `chat_stream_for_model` fail at the
//! enabled-models gate with `NOT_FOUND` — no network I/O — so the synchronous
//! loop errors fast and the error surfaces in the HTTP response.

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
    let dir = std::env::temp_dir().join(format!("adl-pipe-api-{}", uuid::Uuid::new_v4()));
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

/// Create a session and return its id.
async fn make_session(state: &ad_server::ServerState) -> String {
    let (status, body) =
        send(state.clone(), Method::POST, "/session", Some(json!({ "title": "pipeline-test" })))
            .await;
    assert_eq!(status, StatusCode::OK, "create body: {body}");
    body["data"]["id"].as_str().unwrap().to_string()
}

/// POST /agent/turn/run with an unknown session → 404 (the loop requires the
/// session before any provider work).
#[tokio::test]
async fn loop_run_missing_session_returns_404() {
    let state = state().await;
    let (status, body) = send(
        state,
        Method::POST,
        "/agent/turn/run",
        Some(json!({ "sessionId": "nope", "prompt": "hi" })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND");
}

/// POST /agent/turn/run with an empty prompt → 400.
#[tokio::test]
async fn loop_run_without_prompt_returns_400() {
    let state = state().await;
    let session_id = make_session(&state).await;
    let (status, body) = send(
        state,
        Method::POST,
        "/agent/turn/run",
        Some(json!({ "sessionId": session_id, "prompt": "  " })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT");
}

/// POST /agent/turn/run with a disabled model fails synchronously at the
/// enabled-models gate (no network) and surfaces the error in the response.
/// Also proves the cancel token is not left registered after the run.
#[tokio::test]
async fn loop_run_disabled_model_returns_not_found_and_cleans_token() {
    let state = state().await;
    // Disable all of openai's models → chat_stream_for_model fails fast offline.
    {
        let mut config = state.config.write().unwrap();
        if let Some(pref) = config.model_preferences.providers.get_mut("openai") {
            pref.enabled_models = Some(vec![]);
        }
    }
    let session_id = make_session(&state).await;

    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/agent/turn/run",
        Some(json!({
            "sessionId": session_id,
            "prompt": "hi",
            "providerId": "openai",
            "modelId": "gpt-4o"
        })),
    )
    .await;
    assert!(!status.is_success(), "disabled model must fail the loop: {status} {body}");
    assert_eq!(body["ok"], false);
    assert_eq!(body["error"]["code"], "NOT_FOUND", "body: {body}");

    // The cancel token must be cleaned up on the error path.
    assert!(
        !state.loop_cancels.lock().await.contains_key(&session_id),
        "stale cancel token left after loop error"
    );
}

/// POST /agent/turn/abort is a no-op when no loop is running and returns ok.
#[tokio::test]
async fn loop_abort_with_no_active_loop_returns_ok() {
    let state = state().await;
    let session_id = make_session(&state).await;
    let (status, body) =
        send(state, Method::POST, "/agent/turn/abort", Some(json!({ "sessionId": session_id })))
            .await;
    assert_eq!(status, StatusCode::OK, "abort body: {body}");
    assert_eq!(body["ok"], true);
}
