//! Conversation domain HTTP endpoints (migrated from `src-tauri` conversation
//! commands). Each test drives `app_router` over a fresh `ServerState` via
//! `tower::ServiceExt::oneshot` — no sockets, no subprocesses.

// Integration-test crate: unwraps in helpers (not `#[test]` fns) fall outside
// clippy's `allow-unwrap-in-tests`, so permit them at the crate level.
#![allow(clippy::unwrap_used)]

use ad_server::engine::init_server_state;
use ad_server::router::app_router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use tower::ServiceExt;

async fn state() -> ad_server::ServerState {
    let dir = std::env::temp_dir().join(format!("adl-cv-{}", uuid::Uuid::new_v4()));
    init_server_state(&dir).await.unwrap()
}

fn app(state: ad_server::ServerState) -> axum::Router {
    app_router(state.clone()).with_state(state)
}

async fn send(
    state: ad_server::ServerState,
    method: Method,
    uri: &str,
    body: Option<&str>,
) -> (StatusCode, serde_json::Value) {
    let mut builder = Request::builder().method(method).uri(uri);
    if body.is_some() {
        builder = builder.header("content-type", "application/json");
    }
    let req =
        builder.body(body.map(|b| Body::from(b.to_string())).unwrap_or_else(Body::empty)).unwrap();
    let resp = app(state).oneshot(req).await.unwrap();
    let status = resp.status();
    let bytes = axum::body::to_bytes(resp.into_body(), 64 * 1024).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap_or(serde_json::json!(null)))
}

/// POST /session then GET /sessions — the canonical create+list slice.
#[tokio::test]
async fn create_and_list_sessions() {
    let state = state().await;
    let (status, body) =
        send(state.clone(), Method::POST, "/session", Some(r#"{"title":"demo"}"#)).await;
    assert_eq!(status, StatusCode::OK, "create body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    let id = body["data"]["id"].as_str().expect("session id in body").to_string();

    let (status, list) = send(state, Method::GET, "/sessions", None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(list["data"].as_array().unwrap().iter().any(|s| s["id"] == id));
}

/// PATCH /session/{id} supports rename / pin / archive sub-fields.
#[tokio::test]
async fn patch_updates_title_pin_and_archive() {
    let state = state().await;
    let (_, body) =
        send(state.clone(), Method::POST, "/session", Some(r#"{"title":"orig"}"#)).await;
    let id = body["data"]["id"].as_str().unwrap().to_string();

    let (status, body) = send(
        state.clone(),
        Method::PATCH,
        &format!("/session/{id}"),
        Some(r#"{"title":"renamed"}"#),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["title"], "renamed", "body: {body}");

    let (_, body) =
        send(state.clone(), Method::PATCH, &format!("/session/{id}"), Some(r#"{"pinned":true}"#))
            .await;
    assert_eq!(body["data"]["isPinned"], true, "body: {body}");

    let (status, body) =
        send(state.clone(), Method::PATCH, &format!("/session/{id}"), Some(r#"{"archive":true}"#))
            .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["status"], "archived", "body: {body}");
}

/// GET /session/{id} returns the detail (session + messages); unknown id → null.
#[tokio::test]
async fn get_session_returns_detail_or_null() {
    let state = state().await;
    let (status, body) = send(state, Method::GET, "/session/nope", None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["data"].is_null(), "unknown session should map to null, body: {body}");
}

/// DELETE /session/{id} removes the session and its messages.
#[tokio::test]
async fn delete_session_removes_session() {
    let state = state().await;
    let (_, body) = send(state.clone(), Method::POST, "/session", Some(r#"{"title":"del"}"#)).await;
    let id = body["data"]["id"].as_str().unwrap().to_string();

    let (status, body) = send(state.clone(), Method::DELETE, &format!("/session/{id}"), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"], true, "body: {body}");

    let (_, list) = send(state, Method::GET, "/sessions", None).await;
    assert!(!list["data"].as_array().unwrap().iter().any(|s| s["id"] == id));
}

/// PATCH on a missing session maps the AppError::NotFound to HTTP 404.
#[tokio::test]
async fn update_missing_session_returns_404() {
    let state = state().await;
    let (status, body) =
        send(state, Method::PATCH, "/session/nope", Some(r#"{"title":"x"}"#)).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["ok"], false);
    assert_eq!(body["error"]["code"], "NOT_FOUND");
}

/// POST /session/{id}/message persists the user message and returns a typed
/// ConversationSendResult (the agent loop is kicked asynchronously).
#[tokio::test]
async fn send_message_persists_user_message_and_returns_send_result() {
    let state = state().await;
    let (_, body) =
        send(state.clone(), Method::POST, "/session", Some(r#"{"title":"msgs"}"#)).await;
    let id = body["data"]["id"].as_str().unwrap().to_string();

    let (status, body) = send(
        state.clone(),
        Method::POST,
        &format!("/session/{id}/message"),
        Some(r#"{"content":"hello ad-server","scenario":"chat"}"#),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "send body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert_eq!(body["data"]["userMessage"]["content"], "hello ad-server");
    let run_id = body["data"]["runDetail"]["run"]["id"].as_str().expect("run id").to_string();
    assert_eq!(body["data"]["assistantMessage"]["runId"], run_id);

    let (status, detail) = send(state, Method::GET, &format!("/session/{id}"), None).await;
    assert_eq!(status, StatusCode::OK);
    let messages = detail["data"]["messages"].as_array().unwrap();
    assert!(
        messages.iter().any(|m| m["content"] == "hello ad-server" && m["role"] == "user"),
        "user message should be persisted, messages: {messages:?}"
    );
}

/// POST /session/{id}/message without content → 400.
#[tokio::test]
async fn send_message_without_content_returns_400() {
    let state = state().await;
    let (_, body) = send(state.clone(), Method::POST, "/session", Some(r#"{"title":"m"}"#)).await;
    let id = body["data"]["id"].as_str().unwrap().to_string();

    let (status, body) =
        send(state, Method::POST, &format!("/session/{id}/message"), Some(r#"{}"#)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT");
}

/// POST /sessions/reorder applies the pinned/unpinned ordering and returns the
/// re-sorted list (covers `ConversationBridge.reorderSessions`).
#[tokio::test]
async fn reorder_sessions_applies_pinned_unpinned_ordering() {
    let state = state().await;
    let (_, a) = send(state.clone(), Method::POST, "/session", Some(r#"{"title":"a"}"#)).await;
    let (_, b) = send(state.clone(), Method::POST, "/session", Some(r#"{"title":"b"}"#)).await;
    let id_a = a["data"]["id"].as_str().unwrap().to_string();
    let id_b = b["data"]["id"].as_str().unwrap().to_string();

    let body = format!(
        r#"{{"workspaceId":"__global__","pinnedIds":["{id_a}"],"unpinnedIds":["{id_b}"]}}"#
    );
    let (status, resp) = send(state, Method::POST, "/sessions/reorder", Some(&body)).await;
    assert_eq!(status, StatusCode::OK, "body: {resp}");
    let list = resp["data"].as_array().unwrap();
    assert!(list.iter().any(|s| s["id"] == id_a && s["isPinned"] == true));
    assert!(list.iter().any(|s| s["id"] == id_b && s["isPinned"] == false));
}

/// POST /sessions/archive-all archives every session in the active workspace
/// (covers `ConversationBridge.archiveAllInWorkspace`).
#[tokio::test]
async fn archive_all_in_workspace_archives_every_session() {
    let state = state().await;
    let (_, a) = send(state.clone(), Method::POST, "/session", Some(r#"{"title":"a"}"#)).await;
    let (_, b) = send(state.clone(), Method::POST, "/session", Some(r#"{"title":"b"}"#)).await;
    let id_a = a["data"]["id"].as_str().unwrap().to_string();
    let id_b = b["data"]["id"].as_str().unwrap().to_string();

    let (status, resp) = send(state, Method::POST, "/sessions/archive-all", None).await;
    assert_eq!(status, StatusCode::OK, "body: {resp}");
    let list = resp["data"].as_array().unwrap();
    assert!(list.iter().any(|s| s["id"] == id_a && s["status"] == "archived"));
    assert!(list.iter().any(|s| s["id"] == id_b && s["status"] == "archived"));
}
