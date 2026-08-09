//! Run-activity history HTTP endpoint (migrated from
//! `src-tauri/src/commands/run_activity.rs`). The domain is history-query only
//! — the Tauri `save_and_emit_run_activity` persistence writes were already
//! stopped (spec §7.2), so this surface only reads existing
//! `RunActivityEvents` rows back by run id. Each test drives `app_router` over
//! a fresh `ServerState` via `tower::ServiceExt::oneshot`.

// Integration-test crate: unwraps in helpers (not `#[test]` fns) fall outside
// clippy's `allow-unwrap-in-tests`, so permit them at the crate level.
#![allow(clippy::unwrap_used)]

use ad_server::engine::init_server_state;
use ad_server::router::app_router;
use adl_types::{ConversationScenario, DigitalLifeRunActivityEventV1};
use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use serde_json::{Value, json};
use tower::ServiceExt;

async fn state() -> ad_server::ServerState {
    let dir = std::env::temp_dir().join(format!("adl-run-activity-api-{}", uuid::Uuid::new_v4()));
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

/// POST /run-activity/list for an unknown run returns an empty list (covers
/// `RunActivityBridge.listByRunId`).
#[tokio::test]
async fn list_unknown_run_returns_empty() {
    let state = state().await;
    let (status, body) = send(state, "/run-activity/list", Some(json!({ "runId": "nope" }))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert!(body["data"].as_array().unwrap().is_empty(), "unknown run -> []: {body}");
}

/// POST /run-activity/list returns events persisted for the run id, ordered by
/// `seq` and truncated by the optional `limit`.
#[tokio::test]
async fn list_returns_persisted_events_ordered_and_truncated() {
    let state = state().await;
    let run_id = "run-activity-1";
    for seq in [1i64, 3, 2] {
        let ev = DigitalLifeRunActivityEventV1::RunStart {
            v: 1,
            run_id: run_id.to_string(),
            seq,
            ts: 0,
            scenario: ConversationScenario::CodeEdit,
        };
        // Reuse the generic DB writer used by the Tauri original: the `status`
        // column carries the run id for this table.
        state
            .db
            .save_entity(
                adl_storage::EntityTable::RunActivityEvents,
                &format!("ev-{seq}"),
                Some("ws"),
                Some("sess"),
                Some(run_id),
                &ev,
            )
            .unwrap();
    }

    // Full list is ordered by seq: 1, 2, 3.
    let (status, body) =
        send(state.clone(), "/run-activity/list", Some(json!({ "runId": run_id }))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    let entries = body["data"].as_array().unwrap();
    assert_eq!(entries.len(), 3, "all events: {body}");
    let seqs: Vec<i64> = entries.iter().map(|e| e["seq"].as_i64().unwrap()).collect();
    assert_eq!(seqs, vec![1, 2, 3], "sorted by seq: {body}");

    // With a limit the list is truncated (1, 2).
    let (_, body) =
        send(state, "/run-activity/list", Some(json!({ "runId": run_id, "limit": 2 }))).await;
    let entries = body["data"].as_array().unwrap();
    assert_eq!(entries.len(), 2, "limited: {body}");
}

/// POST /run-activity/list with a malformed body returns 400 INVALID_INPUT.
#[tokio::test]
async fn list_malformed_body_returns_400() {
    let state = state().await;
    let (status, body) = send(state, "/run-activity/list", None).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["ok"], false, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT", "body: {body}");
}
