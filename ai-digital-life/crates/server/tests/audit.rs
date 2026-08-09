//! Audit domain HTTP endpoint (migrated from `src-tauri/src/commands/audit.rs`).
//!
//! The Tauri audit.rs module holds *helpers* (`save_audit_entry_with_db`,
//! `list_audit_entries_with_db`) with no Tauri command attributes — its read
//! surface becomes `POST /audit/list`, and the shared write helper is hosted in
//! the server's `handlers::audit` module (the command/patch/task domains now
//! call it instead of their inlined copies). Each test drives `app_router` over
//! a fresh `ServerState` via `tower::ServiceExt::oneshot`.

// Integration-test crate: unwraps in helpers (not `#[test]` fns) fall outside
// clippy's `allow-unwrap-in-tests`, so permit them at the crate level.
#![allow(clippy::unwrap_used)]

use ad_server::engine::init_server_state;
use ad_server::router::app_router;
use adl_types::{AuditEntry, RiskLevel};
use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use serde_json::{Value, json};
use tower::ServiceExt;

async fn state() -> ad_server::ServerState {
    let dir = std::env::temp_dir().join(format!("adl-audit-api-{}", uuid::Uuid::new_v4()));
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

/// POST /audit/list on a fresh state returns an empty list (the audit-domain
/// read surface; mirrors `list_audit_entries_with_db`).
#[tokio::test]
async fn list_audit_entries_empty_on_fresh_state() {
    let state = state().await;
    let (status, body) = send(state, "/audit/list", Some(json!({}))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert!(body["data"].as_array().unwrap().is_empty(), "fresh audit list: {body}");
}

/// POST /audit/list returns previously persisted audit entries, newest first.
#[tokio::test]
async fn list_audit_entries_returns_saved_entries() {
    let state = state().await;
    for (i, summary) in ["first", "second"].iter().enumerate() {
        let entry = AuditEntry {
            id: format!("audit-{i}"),
            timestamp: 1000 + i as i64,
            operation_type: "test.op".to_string(),
            summary: summary.to_string(),
            risk_level: RiskLevel::Low,
            decision: None,
            detail: None,
        };
        state
            .db
            .save_entity(
                adl_storage::EntityTable::AuditRecords,
                &entry.id,
                Some("ws-1"),
                None,
                Some("test.op"),
                &entry,
            )
            .unwrap();
    }

    let (status, body) = send(state, "/audit/list", Some(json!({}))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    let entries = body["data"].as_array().unwrap();
    assert_eq!(entries.len(), 2, "both entries: {body}");
    let summaries: Vec<&str> = entries.iter().map(|e| e["summary"].as_str().unwrap()).collect();
    assert_eq!(summaries, vec!["first", "second"], "body: {body}");
}

/// POST /audit/list honours the optional `limit`.
#[tokio::test]
async fn list_audit_entries_respects_limit() {
    let state = state().await;
    for i in 0..5 {
        let entry = AuditEntry {
            id: format!("audit-limit-{i}"),
            timestamp: 1000 + i,
            operation_type: "test.op".to_string(),
            summary: format!("entry-{i}"),
            risk_level: RiskLevel::Low,
            decision: None,
            detail: None,
        };
        state
            .db
            .save_entity(
                adl_storage::EntityTable::AuditRecords,
                &entry.id,
                Some("ws-1"),
                None,
                Some("test.op"),
                &entry,
            )
            .unwrap();
    }

    let (status, body) = send(state, "/audit/list", Some(json!({ "limit": 2 }))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["data"].as_array().unwrap().len(), 2, "limited: {body}");
}

/// POST /audit/list with a malformed body returns 400 INVALID_INPUT.
#[tokio::test]
async fn list_audit_entries_malformed_body_returns_400() {
    let state = state().await;
    let (status, body) = send(state, "/audit/list", None).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["ok"], false, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT", "body: {body}");
}
