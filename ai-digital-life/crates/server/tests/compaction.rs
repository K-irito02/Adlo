//! Compaction domain HTTP endpoints (migrated from `src-tauri/src/commands/
//! compaction.rs`). Each test drives `app_router` over a fresh `ServerState`
//! via `tower::ServiceExt::oneshot` — no sockets, no subprocesses. The
//! summary-generation path is made deterministic by disabling every provider in
//! the test config so the gateway falls back to its synthetic responder without
//! any network I/O.

// Integration-test crate: unwraps in helpers (not `#[test]` fns) fall outside
// clippy's `allow-unwrap-in-tests`, so permit them at the crate level.
#![allow(clippy::unwrap_used)]

use ad_server::engine::init_server_state;
use ad_server::router::app_router;
use adl_types::conversation::{ConversationMessageRecord, ConversationRole};
use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use serde_json::{Value, json};
use tower::ServiceExt;

async fn state() -> ad_server::ServerState {
    let dir = std::env::temp_dir().join(format!("adl-cmp-api-{}", uuid::Uuid::new_v4()));
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
    let bytes = axum::body::to_bytes(resp.into_body(), 4 * 1024 * 1024).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

fn make_message(id: &str, role: ConversationRole, content: &str) -> ConversationMessageRecord {
    ConversationMessageRecord {
        id: id.to_string(),
        session_id: "sess-1".to_string(),
        role,
        content: content.to_string(),
        blocks: vec![],
        run_id: None,
        created_at: 1700000000000,
    }
}

fn messages_json(messages: &[ConversationMessageRecord]) -> String {
    serde_json::to_string(messages).expect("serialize messages")
}

/// POST /compaction/session with a small conversation (below the prune
/// threshold) → summaryNeeded false, nothing pruned, no summary.
#[tokio::test]
async fn compact_session_below_threshold_no_summary() {
    let state = state().await;
    let messages = vec![
        make_message("m1", ConversationRole::User, "short user message"),
        make_message("m2", ConversationRole::Assistant, "short assistant reply"),
    ];
    let (status, body) = send(
        state,
        Method::POST,
        "/compaction/session",
        Some(json!({
            "sessionId": "sess-1",
            "messagesJson": messages_json(&messages),
            "previousSummary": null,
            "provider": null
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert_eq!(body["data"]["summaryNeeded"], false, "body: {body}");
    assert_eq!(body["data"]["prunedCount"], 0, "body: {body}");
    assert!(body["data"]["summary"].is_null(), "no summary below threshold: {body}");
    let preserved = body["data"]["preservedMessages"].as_array().unwrap();
    assert_eq!(preserved.len(), 2, "all messages preserved: {body}");
}

/// POST /compaction/session with a large conversation (above the prune
/// threshold) triggers summary generation. All providers are disabled in the
/// test config so the gateway answers with its synthetic fallback (no network).
#[tokio::test]
async fn compact_session_triggers_summary_generation() {
    let state = state().await;
    // Deterministic synthetic fallback: disable every provider.
    {
        let mut config = state.config.write().unwrap();
        for pref in config.model_preferences.providers.values_mut() {
            pref.enabled = false;
        }
    }
    // 12 messages, each ~9KB ASCII (~2.2k tokens) → ~27k total tokens, above
    // PRUNE_MINIMUM (20k). The last 4 turns are preserved; the earlier ones
    // (pruned_count = 8) require a summary.
    let padding = "compaction summary test padding. ".repeat(500); // ~40 chars * 500 = 20KB
    let messages: Vec<ConversationMessageRecord> = (0..12)
        .map(|i| {
            make_message(
                &format!("big-{i}"),
                if i % 2 == 0 { ConversationRole::User } else { ConversationRole::Assistant },
                &padding,
            )
        })
        .collect();

    let (status, body) = send(
        state,
        Method::POST,
        "/compaction/session",
        Some(json!({
            "sessionId": "sess-1",
            "messagesJson": messages_json(&messages),
            "previousSummary": null,
            "provider": "deepseek"
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert_eq!(body["data"]["summaryNeeded"], true, "body: {body}");
    assert!(body["data"]["prunedCount"].as_u64().unwrap_or(0) > 0, "pruned: {body}");
    let summary = body["data"]["summary"].as_str().expect("summary generated");
    assert!(!summary.is_empty(), "synthetic summary should be non-empty: {body}");
    let preserved = body["data"]["preservedMessages"].as_array().unwrap();
    assert!(!preserved.is_empty(), "recent messages preserved: {body}");
}

/// POST /compaction/session with malformed messagesJson → error response.
#[tokio::test]
async fn compact_session_invalid_messages_json_returns_error() {
    let state = state().await;
    let (status, body) = send(
        state,
        Method::POST,
        "/compaction/session",
        Some(json!({
            "sessionId": "sess-1",
            "messagesJson": "not valid json {{{",
            "previousSummary": null,
            "provider": null
        })),
    )
    .await;
    assert!(!status.is_success(), "expected error status, got {status}: {body}");
    assert_eq!(body["ok"], false);
    assert!(body["error"]["code"].as_str().is_some(), "error code expected: {body}");
}
