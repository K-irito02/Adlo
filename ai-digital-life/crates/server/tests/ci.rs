//! CI / GitHub domain HTTP endpoints (migrated from
//! `src-tauri/src/commands/ci.rs`). The GitHubBridge contract is served
//! entirely by `ci_*` commands — there are no separate `github_*` commands in
//! the real code.
//!
//! The access token is **write-only over HTTP** (OpenCode-aligned): submitted
//! once in the request body, stored in the OS credential store, and never read
//! back — only `has` returns a boolean. The network-facing handlers
//! (get-status / get-job-logs) are covered via their pre-network validation
//! (missing required fields → 400), never a live GitHub call.

// Integration-test crate: unwraps in helpers (not `#[test]` fns) fall outside
// clippy's `allow-unwrap-in-tests`, so permit them at the crate level.
#![allow(clippy::unwrap_used)]

use ad_server::engine::init_server_state;
use ad_server::router::app_router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use serde_json::{Value, json};
use std::time::{Duration, Instant};
use tower::ServiceExt;

/// The CI access token lives under a single fixed credential account, so the
/// two token-writing tests must not run concurrently (they share the slot).
static TOKEN_TEST_MUTEX: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

async fn state() -> ad_server::ServerState {
    let dir = std::env::temp_dir().join(format!("adl-ci-api-{}", uuid::Uuid::new_v4()));
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

/// Poll POST /ci/access-token/has until it settles on `expected`, bounded to
/// 20s (Windows Credential Manager is eventually consistent for fresh writes).
async fn poll_has_token(state: ad_server::ServerState, expected: bool, uri: &str) -> Value {
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        let (_, body) = send(state.clone(), uri, Some(json!({}))).await;
        if body["data"].as_bool() == Some(expected) {
            return body;
        }
        assert!(Instant::now() < deadline, "has-access-token did not settle on {expected}: {body}");
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
}

/// POST /ci/access-token stores the token write-only and returns `true`;
/// POST /ci/access-token/has reflects presence; POST /ci/access-token/clear
/// removes it (covers `GitHubBridge.setAccessToken` / `hasAccessToken` /
/// `clearAccessToken`). The token is never read back over HTTP.
#[tokio::test]
async fn set_has_clear_access_token_round_trip() {
    let _token_guard = TOKEN_TEST_MUTEX.lock().await;
    let state = state().await;

    // Clean slate.
    let (_, _) = send(state.clone(), "/ci/access-token/clear", Some(json!({}))).await;
    let (_, body) = send(state.clone(), "/ci/access-token/has", Some(json!({}))).await;
    assert_eq!(body["data"], false, "starts without token: {body}");

    let (status, body) =
        send(state.clone(), "/ci/access-token", Some(json!({ "token": "ci-test-token" }))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert_eq!(body["data"], true, "set returns true: {body}");
    // The response must never echo the token.
    assert!(!body.to_string().contains("ci-test-token"), "token must not be echoed: {body}");

    let _ = poll_has_token(state.clone(), true, "/ci/access-token/has").await;

    let (status, body) = send(state.clone(), "/ci/access-token/clear", Some(json!({}))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["data"], true, "clear returns true: {body}");

    let _ = poll_has_token(state, false, "/ci/access-token/has").await;
}

/// An empty token body clears the stored credential (faithful to
/// `adl_credential::set_ci_access_token`, which deletes on empty input).
#[tokio::test]
async fn set_access_token_empty_clears() {
    let _token_guard = TOKEN_TEST_MUTEX.lock().await;
    let state = state().await;
    let (_, _) = send(state.clone(), "/ci/access-token/clear", Some(json!({}))).await;

    let (status, body) =
        send(state.clone(), "/ci/access-token", Some(json!({ "token": "t" }))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    let _ = poll_has_token(state.clone(), true, "/ci/access-token/has").await;

    let (status, body) =
        send(state.clone(), "/ci/access-token", Some(json!({ "token": "  " }))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    let _ = poll_has_token(state, false, "/ci/access-token/has").await;
}

/// POST /ci/status requires owner/repo/branch — `{}` fails before any network
/// call (400 INVALID_INPUT).
#[tokio::test]
async fn get_status_missing_fields_returns_400() {
    let state = state().await;
    let (status, body) = send(state, "/ci/status", Some(json!({}))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["ok"], false, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT", "body: {body}");
}

/// POST /ci/status-without-token requires owner/repo/branch — `{}` fails before
/// any network call (400 INVALID_INPUT).
#[tokio::test]
async fn get_status_without_token_missing_fields_returns_400() {
    let state = state().await;
    let (status, body) = send(state, "/ci/status-without-token", Some(json!({}))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["ok"], false, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT", "body: {body}");
}

/// POST /ci/job-logs requires both `config` and `runId` — a missing config
/// fails before any network call (400 INVALID_INPUT).
#[tokio::test]
async fn get_job_logs_missing_config_returns_400() {
    let state = state().await;
    let (status, body) = send(state, "/ci/job-logs", Some(json!({ "runId": 5 }))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["ok"], false, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT", "body: {body}");
}

/// POST /ci/job-logs with the camelCase `{ config, runId }` body deserializes
/// and reaches the CI client — the failure is a network-level error from
/// fetching logs for a nonexistent repo/run, NOT a 400 from body parsing
/// (proves the handler got past `JobLogsBody` and executed `fetch_job_logs`).
#[tokio::test]
async fn get_job_logs_camel_case_body_reaches_ci_client() {
    let state = state().await;
    let (_, body) = send(
        state,
        "/ci/job-logs",
        Some(json!({
            "config": {
                "owner": "octocat",
                "repo": "no-such-repo-adl",
                "branch": "main"
            },
            "runId": 5
        })),
    )
    .await;
    assert_eq!(body["ok"], false, "body: {body}");
    assert_eq!(
        body["error"]["code"], "NETWORK_ERROR",
        "must be the CI client's network error, not a parse 400: {body}"
    );
    assert!(
        body["error"]["message"].as_str().unwrap().contains("fetch job logs:"),
        "message shows the client ran: {body}"
    );
}
