//! CI / GitHub domain HTTP endpoints and durable-session domain HTTP endpoints
//! (merged from `ci.rs` and `durable.rs`).
//!
//! Each test drives `app_router` over a fresh `ServerState` via
//! `tower::ServiceExt::oneshot` — no sockets, no subprocesses.
//!
//! The CI access token is **write-only over HTTP**: submitted
//! once in the request body, stored in the OS credential store, and never read
//! back — only `has` returns a boolean. The network-facing handlers
//! (get-status / get-job-logs) are covered via their pre-network validation
//! (missing required fields → 400), never a live GitHub call.
//!
//! Crash detection for durable sessions is made deterministic by back-dating a
//! registered session's heartbeat through the shared DB.

// Integration-test crate: unwraps in helpers (not `#[test]` fns) fall outside
// clippy's `allow-unwrap-in-tests`, so permit them at the crate level.
#![allow(clippy::unwrap_used)]

mod common;

use serde_json::{Value, json};
use std::time::{Duration, Instant};

/// The CI access token lives under a single fixed credential account, so the
/// two token-writing tests must not run concurrently (they share the slot).
static TOKEN_TEST_MUTEX: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Poll POST /ci/access-token/has until it settles on `expected`, bounded to
/// 20s (Windows Credential Manager is eventually consistent for fresh writes).
async fn poll_has_token(state: adl_server::ServerState, expected: bool, uri: &str) -> Value {
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        let (_, body) = common::send_post(state.clone(), uri, Some(json!({}))).await;
        if body["data"].as_bool() == Some(expected) {
            return body;
        }
        assert!(Instant::now() < deadline, "has-access-token did not settle on {expected}: {body}");
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
}

// ---------------------------------------------------------------------------
// CI tests
// ---------------------------------------------------------------------------

/// POST /ci/access-token stores the token write-only and returns `true`;
/// POST /ci/access-token/has reflects presence; POST /ci/access-token/clear
/// removes it (covers `GitHubBridge.setAccessToken` / `hasAccessToken` /
/// `clearAccessToken`). The token is never read back over HTTP.
#[tokio::test]
async fn set_has_clear_access_token_round_trip() {
    let _token_guard = TOKEN_TEST_MUTEX.lock().await;
    let state = common::state("ci-api").await;

    // Clean slate.
    let (_, _) = common::send_post(state.clone(), "/ci/access-token/clear", Some(json!({}))).await;
    let (_, body) = common::send_post(state.clone(), "/ci/access-token/has", Some(json!({}))).await;
    assert_eq!(body["data"], false, "starts without token: {body}");

    let (status, body) = common::send_post(
        state.clone(),
        "/ci/access-token",
        Some(json!({ "token": "ci-test-token" })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert_eq!(body["data"], true, "set returns true: {body}");
    // The response must never echo the token.
    assert!(!body.to_string().contains("ci-test-token"), "token must not be echoed: {body}");

    let _ = poll_has_token(state.clone(), true, "/ci/access-token/has").await;

    let (status, body) =
        common::send_post(state.clone(), "/ci/access-token/clear", Some(json!({}))).await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert_eq!(body["data"], true, "clear returns true: {body}");

    let _ = poll_has_token(state, false, "/ci/access-token/has").await;
}

/// An empty token body clears the stored credential (faithful to
/// `adl_credential::set_ci_access_token`, which deletes on empty input).
#[tokio::test]
async fn set_access_token_empty_clears() {
    let _token_guard = TOKEN_TEST_MUTEX.lock().await;
    let state = common::state("ci-api").await;
    let (_, _) = common::send_post(state.clone(), "/ci/access-token/clear", Some(json!({}))).await;

    let (status, body) =
        common::send_post(state.clone(), "/ci/access-token", Some(json!({ "token": "t" }))).await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    let _ = poll_has_token(state.clone(), true, "/ci/access-token/has").await;

    let (status, body) =
        common::send_post(state.clone(), "/ci/access-token", Some(json!({ "token": "  " }))).await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    let _ = poll_has_token(state, false, "/ci/access-token/has").await;
}

/// POST /ci/status requires owner/repo/branch — `{}` fails before any network
/// call (400 INVALID_INPUT).
#[tokio::test]
async fn get_status_missing_fields_returns_400() {
    let state = common::state("ci-api").await;
    let (status, body) = common::send_post(state, "/ci/status", Some(json!({}))).await;
    assert_eq!(status, axum::http::StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["ok"], false, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT", "body: {body}");
}

/// POST /ci/status-without-token requires owner/repo/branch — `{}` fails before
/// any network call (400 INVALID_INPUT).
#[tokio::test]
async fn get_status_without_token_missing_fields_returns_400() {
    let state = common::state("ci-api").await;
    let (status, body) =
        common::send_post(state, "/ci/status-without-token", Some(json!({}))).await;
    assert_eq!(status, axum::http::StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["ok"], false, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT", "body: {body}");
}

/// POST /ci/job-logs requires both `config` and `runId` — a missing config
/// fails before any network call (400 INVALID_INPUT).
#[tokio::test]
async fn get_job_logs_missing_config_returns_400() {
    let state = common::state("ci-api").await;
    let (status, body) =
        common::send_post(state, "/ci/job-logs", Some(json!({ "runId": 5 }))).await;
    assert_eq!(status, axum::http::StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["ok"], false, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT", "body: {body}");
}

/// POST /ci/job-logs with the camelCase `{ config, runId }` body deserializes
/// and reaches the CI client — the failure is a network-level error from
/// fetching logs for a nonexistent repo/run, NOT a 400 from body parsing
/// (proves the handler got past `JobLogsBody` and executed `fetch_job_logs`).
#[tokio::test]
async fn get_job_logs_camel_case_body_reaches_ci_client() {
    let state = common::state("ci-api").await;
    let (_, body) = common::send_post(
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

// ---------------------------------------------------------------------------
// Durable-session tests
// ---------------------------------------------------------------------------

/// POST /durable/register persists a running durable session (covers
/// `DurableBridge.registerDurableSession`).
#[tokio::test]
async fn register_durable_session_ok() {
    let state = common::state("durable-api").await;
    let (status, body) = common::send_post(
        state.clone(),
        "/durable/register",
        Some(json!({ "sessionId": "sess-1", "runId": "run-1" })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");

    // Registered row is queryable through the manager's own surface.
    let crashed = state.durable_manager.find_crashed_sessions().await;
    assert!(crashed.is_empty(), "freshly heartbeated session is not crashed: {crashed:?}");
}

/// POST /durable/heartbeat updates the session heartbeat and is a no-op for an
/// unknown session (covers `DurableBridge.heartbeatDurableSession`).
#[tokio::test]
async fn heartbeat_durable_session_ok() {
    let state = common::state("durable-api").await;
    let (status, body) = common::send_post(
        state.clone(),
        "/durable/register",
        Some(json!({ "sessionId": "sess-1", "runId": "run-1" })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");

    let (status, body) = common::send_post(
        state.clone(),
        "/durable/heartbeat",
        Some(json!({ "sessionId": "sess-1" })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");

    // Unknown session heartbeat is a no-op success.
    let (status, body) =
        common::send_post(state, "/durable/heartbeat", Some(json!({ "sessionId": "nope" }))).await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
}

/// POST /durable/crashed on a fresh state returns no crashed sessions (covers
/// `DurableBridge.findCrashedSessions`).
#[tokio::test]
async fn find_crashed_sessions_empty_on_fresh_state() {
    let state = common::state("durable-api").await;
    let (status, body) = common::send_post(state, "/durable/crashed", Some(json!({}))).await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert!(body["data"].as_array().unwrap().is_empty(), "fresh crashed list: {body}");
}

/// POST /durable/crashed detects a registered session whose heartbeat has gone
/// stale (back-dated through the shared DB).
#[tokio::test]
async fn find_crashed_sessions_detects_stale_session() {
    let state = common::state("durable-api").await;
    let (_, body) = common::send_post(
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

    let (status, body) = common::send_post(state, "/durable/crashed", Some(json!({}))).await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
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
    let state = common::state("durable-api").await;
    let (status, body) =
        common::send_post(state, "/durable/recover", Some(json!({ "sessionId": "nope" }))).await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert_eq!(body["data"], false, "unknown session -> false: {body}");
}

/// POST /durable/recover on a registered session marks it recovering and drops
/// it out of the crashed scan.
#[tokio::test]
async fn recover_registered_session_returns_true() {
    let state = common::state("durable-api").await;
    let (_, body) = common::send_post(
        state.clone(),
        "/durable/register",
        Some(json!({ "sessionId": "sess-recover", "runId": "run-1" })),
    )
    .await;
    assert_eq!(body["ok"], true);

    let (status, body) = common::send_post(
        state.clone(),
        "/durable/recover",
        Some(json!({ "sessionId": "sess-recover" })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "body: {body}");
    assert_eq!(body["data"], true, "registered session recoverable: {body}");

    // After recovery the session is no longer 'running', so it drops out of the
    // crashed scan.
    let (_, body) = common::send_post(state, "/durable/crashed", Some(json!({}))).await;
    let crashed = body["data"].as_array().unwrap();
    assert!(
        crashed.iter().all(|s| s["session_id"] != "sess-recover"),
        "recovering session not crashed: {body}"
    );
}
