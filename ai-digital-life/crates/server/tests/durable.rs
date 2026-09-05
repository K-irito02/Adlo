//! Durable-session domain HTTP endpoints (migrated from
//! `src-tauri/src/commands/durable.rs`). Each test drives `app_router` over a
//! fresh `ServerState` via `tower::ServiceExt::oneshot` — no sockets, no
//! subprocesses. Crash detection is made deterministic by back-dating a
//! registered session's heartbeat through the shared DB.

// Integration-test crate: unwraps in helpers (not `#[test]` fns) fall outside
// clippy's `allow-unwrap-in-tests`, so permit them at the crate level.
#![allow(clippy::unwrap_used)]

use adl_server::engine::init_server_state;
use adl_server::router::app_router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use serde_json::{Value, json};
use tower::ServiceExt;

async fn state() -> adl_server::ServerState {
    let dir = std::env::temp_dir().join(format!("adl-durable-api-{}", uuid::Uuid::new_v4()));
    init_server_state(&dir).await.unwrap()
}

fn app(state: adl_server::ServerState) -> axum::Router {
    app_router(state.clone()).with_state(state)
}

async fn send(
    state: adl_server::ServerState,
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

/// POST /durable/register persists a running durable session (covers
/// `DurableBridge.registerDurableSession`).
#[tokio::test]
async fn register_durable_session_ok() {
    let state = state().await;
    let (status, body) = send(
        state.clone(),
        "/durable/register",
        Some(json!({ "sessionId": "sess-1", "runId": "run-1" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");

    // Registered row is queryable through the manager's own surface.
    let crashed = state.durable_manager.find_crashed_sessions().await;
    assert!(crashed.is_empty(), "freshly heartbeated session is not crashed: {crashed:?}");
}

/// POST /durable/heartbeat updates the session heartbeat and is a no-op for an
/// unknown session (covers `DurableBridge.heartbeatDurableSession`).
#[tokio::test]
async fn heartbeat_durable_session_ok() {
    let state = state().await;
    let (status, body) = send(
        state.clone(),
        "/durable/register",
        Some(json!({ "sessionId": "sess-1", "runId": "run-1" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "body: {body}");

    let (status, body) =
        send(state.clone(), "/durable/heartbeat", Some(json!({ "sessionId": "sess-1" }))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");

    // Unknown session heartbeat is a no-op success.
    let (status, body) =
        send(state, "/durable/heartbeat", Some(json!({ "sessionId": "nope" }))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
}

/// POST /durable/crashed on a fresh state returns no crashed sessions (covers
/// `DurableBridge.findCrashedSessions`).
#[tokio::test]
async fn find_crashed_sessions_empty_on_fresh_state() {
    let state = state().await;
    let (status, body) = send(state, "/durable/crashed", Some(json!({}))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert!(body["data"].as_array().unwrap().is_empty(), "fresh crashed list: {body}");
}

/// POST /durable/crashed detects a registered session whose heartbeat has gone
/// stale (back-dated through the shared DB).
#[tokio::test]
async fn find_crashed_sessions_detects_stale_session() {
    let state = state().await;
    let (_, body) = send(
        state.clone(),
        "/durable/register",
        Some(json!({ "sessionId": "stale-1", "runId": "run-1" })),
    )
    .await;
    assert_eq!(body["ok"], true);

    // Back-date the heartbeat so the manager's timeout window expires.
    let old = adl_types::now_ms() - 60_000;
    state
        .db
        .execute(
            "UPDATE durable_session_state SET last_heartbeat = ?1 WHERE session_id = ?2",
            &[&old, &"stale-1"],
        )
        .unwrap();

    let (status, body) = send(state, "/durable/crashed", Some(json!({}))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    let crashed = body["data"].as_array().unwrap();
    assert_eq!(crashed.len(), 1, "crashed list: {body}");
    assert_eq!(crashed[0]["session_id"], "stale-1", "body: {body}");
    assert_eq!(crashed[0]["status"], "running", "body: {body}");
    assert_eq!(crashed[0]["retry_count"], 0, "body: {body}");
}

/// POST /durable/recover on an unknown session returns false (covers
/// `DurableBridge.recoverSession`).
#[tokio::test]
async fn recover_unknown_session_returns_false() {
    let state = state().await;
    let (status, body) =
        send(state, "/durable/recover", Some(json!({ "sessionId": "nope" }))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["data"], false, "unknown session -> false: {body}");
}

/// POST /durable/recover on a registered session marks it recovering and drops
/// it out of the crashed scan.
#[tokio::test]
async fn recover_registered_session_returns_true() {
    let state = state().await;
    let (_, body) = send(
        state.clone(),
        "/durable/register",
        Some(json!({ "sessionId": "sess-recover", "runId": "run-1" })),
    )
    .await;
    assert_eq!(body["ok"], true);

    let (status, body) =
        send(state.clone(), "/durable/recover", Some(json!({ "sessionId": "sess-recover" }))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["data"], true, "registered session recoverable: {body}");

    // After recovery the session is no longer 'running', so it drops out of the
    // crashed scan.
    let (_, body) = send(state, "/durable/crashed", Some(json!({}))).await;
    let crashed = body["data"].as_array().unwrap();
    assert!(
        crashed.iter().all(|s| s["session_id"] != "sess-recover"),
        "recovering session not crashed: {body}"
    );
}
