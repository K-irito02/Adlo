//! Session-fork domain HTTP endpoints (migrated from
//! `src-tauri/src/commands/session_fork.rs`). Each test drives `app_router` over
//! a fresh `ServerState` via `tower::ServiceExt::oneshot` — no sockets, no
//! subprocesses.

// Integration-test crate: unwraps in helpers (not `#[test]` fns) fall outside
// clippy's `allow-unwrap-in-tests`, so permit them at the crate level.
#![allow(clippy::unwrap_used)]

use ad_server::engine::init_server_state;
use ad_server::router::app_router;
use adl_storage::EntityTable;
use adl_types::ConversationSessionRecord;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use serde_json::{Value, json};
use tower::ServiceExt;

async fn state() -> ad_server::ServerState {
    let dir = std::env::temp_dir().join(format!("adl-fork-api-{}", uuid::Uuid::new_v4()));
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

/// Create a session via POST /session and return its full record JSON.
async fn make_session(state: &ad_server::ServerState) -> Value {
    let (status, body) =
        send(state.clone(), Method::POST, "/session", Some(json!({ "title": "parent" }))).await;
    assert_eq!(status, StatusCode::OK, "create body: {body}");
    body["data"].clone()
}

/// Persist a session record directly into the DB (the fork command itself does
/// not persist).
fn persist_session(state: &ad_server::ServerState, session: &ConversationSessionRecord) {
    state
        .db
        .save_entity(
            EntityTable::Sessions,
            &session.id,
            Some(&session.workspace_id),
            Some(&session.id),
            Some(&session.status),
            session,
        )
        .unwrap();
}

/// POST /session-fork computes a child session linked to the parent (covers
/// `SessionForkBridge.forkSession`).
#[tokio::test]
async fn fork_session_creates_child_with_parent_link() {
    let state = state().await;
    let parent = make_session(&state).await;
    let parent_id = parent["id"].as_str().unwrap().to_string();

    let (status, body) = send(
        state,
        Method::POST,
        "/session-fork",
        Some(json!({ "parentSession": parent, "forkMessageId": "msg-1" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "fork body: {body}");
    assert_eq!(body["ok"], true);
    assert_eq!(body["data"]["parentId"], parent_id, "child linked to parent: {body}");
    let title = body["data"]["title"].as_str().unwrap();
    assert!(title.contains("(fork #1)"), "first fork numbered: {title}");
}

/// Fork numbering increments when a previous child was persisted in the DB.
#[tokio::test]
async fn fork_number_increments_with_existing_forks() {
    let state = state().await;
    let parent = make_session(&state).await;
    let parent_record: ConversationSessionRecord = serde_json::from_value(parent.clone()).unwrap();

    // First fork (not persisted) → #1.
    let (_, body) = send(
        state.clone(),
        Method::POST,
        "/session-fork",
        Some(json!({ "parentSession": parent, "forkMessageId": "msg-1" })),
    )
    .await;
    assert!(body["data"]["title"].as_str().unwrap().contains("(fork #1)"), "body: {body}");

    // Persist the first child, then fork again → #2.
    let child1: ConversationSessionRecord = serde_json::from_value(body["data"].clone()).unwrap();
    persist_session(&state, &child1);
    let (_, body) = send(
        state,
        Method::POST,
        "/session-fork",
        Some(json!({ "parentSession": parent_record, "forkMessageId": "msg-2" })),
    )
    .await;
    let title = body["data"]["title"].as_str().unwrap();
    assert!(title.contains("(fork #2)"), "second fork numbered: {title}");
}

/// POST /session-fork/list returns only sessions whose parent_id matches.
#[tokio::test]
async fn list_session_forks_returns_only_children() {
    let state = state().await;
    let parent = make_session(&state).await;
    let parent_id = parent["id"].as_str().unwrap().to_string();
    let workspace_id = parent["workspaceId"].as_str().unwrap().to_string();

    // Create a child via fork + persist.
    let (_, body) = send(
        state.clone(),
        Method::POST,
        "/session-fork",
        Some(json!({ "parentSession": parent.clone(), "forkMessageId": "msg-1" })),
    )
    .await;
    let child: ConversationSessionRecord = serde_json::from_value(body["data"].clone()).unwrap();
    persist_session(&state, &child);

    // An unrelated session must NOT appear in the fork list.
    let (_, unrelated) =
        send(state.clone(), Method::POST, "/session", Some(json!({ "title": "unrelated" }))).await;
    let unrelated_id = unrelated["data"]["id"].as_str().unwrap().to_string();

    let (status, body) = send(
        state,
        Method::POST,
        "/session-fork/list",
        Some(json!({ "workspaceId": workspace_id, "parentSessionId": parent_id })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "list body: {body}");
    let forks = body["data"].as_array().unwrap();
    assert_eq!(forks.len(), 1, "only the child: {body}");
    assert_eq!(forks[0]["id"], child.id, "child listed: {body}");
    assert_ne!(forks[0]["id"], unrelated_id, "unrelated session excluded: {body}");
}
