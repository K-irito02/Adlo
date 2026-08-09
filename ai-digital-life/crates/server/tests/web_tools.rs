//! Web-tools domain HTTP endpoints (migrated from
//! `src-tauri/src/commands/web_tools.rs`). Both tools always return a result
//! struct — failures are carried in the struct's `error` field, never as an
//! HTTP error. Each test drives `app_router` over a fresh `ServerState` via
//! `tower::ServiceExt::oneshot`; the fetch test uses a non-http URL so it
//! short-circuits before any network I/O.

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
    let dir = std::env::temp_dir().join(format!("adl-web-tools-api-{}", uuid::Uuid::new_v4()));
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

/// POST /web-tools/fetch with a non-http URL returns a WebFetchResult whose
/// `error` field explains the rejection — no network I/O (covers
/// `WebToolsBridge.webFetch`).
#[tokio::test]
async fn web_fetch_rejects_non_http_url() {
    let state = state().await;
    let (status, body) = send(state, "/web-tools/fetch", Some(json!({ "url": "not-a-url" }))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert_eq!(body["data"]["url"], "not-a-url", "body: {body}");
    assert_eq!(body["data"]["status"], 0, "no HTTP status on failure: {body}");
    let error = body["data"]["error"].as_str().unwrap();
    assert!(error.contains("must start with http"), "error: {error}");
    assert_eq!(body["data"]["format"], "markdown", "default format: {body}");
}

/// POST /web-tools/fetch accepts a `text` format override and still rejects a
/// non-http URL before any network call.
#[tokio::test]
async fn web_fetch_text_format_override() {
    let state = state().await;
    let (status, body) = send(
        state,
        "/web-tools/fetch",
        Some(json!({ "url": "ftp://example.com/x", "format": "text" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["data"]["format"], "text", "body: {body}");
    assert!(body["data"]["error"].is_string(), "body: {body}");
}

/// POST /web-tools/search returns a WebSearchResult with the echoed query
/// (covers `WebToolsBridge.webSearch`). Without a Tavily API key it carries an
/// error in the struct; the wire shape is what the contract pins.
#[tokio::test]
async fn web_search_returns_result_shape() {
    let state = state().await;
    let (status, body) = send(state, "/web-tools/search", Some(json!({ "query": "hello" }))).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    assert_eq!(body["data"]["query"], "hello", "body: {body}");
    assert!(body["data"]["results"].is_array(), "results array present: {body}");
    assert!(body["data"].get("error").is_some(), "error field present: {body}");
}

/// POST /web-tools/search with a malformed body returns 400 INVALID_INPUT.
#[tokio::test]
async fn web_search_missing_query_returns_400() {
    let state = state().await;
    let (status, body) = send(state, "/web-tools/search", Some(json!({}))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["ok"], false, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT", "body: {body}");
}
