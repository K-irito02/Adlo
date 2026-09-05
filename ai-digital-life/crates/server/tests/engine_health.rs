//! Engine initialisation and HTTP health/CORS endpoint tests (merged from
//! `engine.rs` and `health.rs`).

#![allow(clippy::unwrap_used)]

mod common;

use adl_server::engine::init_server_state;
use tower::ServiceExt;

#[tokio::test]
async fn engine_init_creates_workable_state() {
    let data_dir = std::env::temp_dir().join(format!("adl-server-{}", uuid::Uuid::new_v4()));
    let state = init_server_state(&data_dir).await.expect("init should succeed");

    let conn = state.db.conn().expect("db connection should be obtainable");
    let one: i64 =
        conn.query_row("SELECT 1", [], |row| row.get(0)).expect("db should answer a trivial query");
    assert_eq!(one, 1);

    assert_eq!(
        state.server_port.load(std::sync::atomic::Ordering::Relaxed),
        0,
        "server_port should start at 0 (not bound)"
    );

    let _ = std::fs::remove_dir_all(&data_dir);
}

/// `/health` must answer 200 with `ok:true` and carry the engine's startup
/// metadata (`port`, `startedAt`) for the parent/probe to key off.
#[tokio::test]
async fn health_returns_ok_with_port() {
    let state = common::state("health").await;
    let app = common::app(state.clone());
    let resp =
        app.oneshot(axum::http::Request::builder().uri("/health").body(axum::body::Body::empty()).unwrap()).await.unwrap();
    assert_eq!(resp.status(), axum::http::StatusCode::OK);
    let bytes = axum::body::to_bytes(resp.into_body(), 4096).await.unwrap();
    let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(body["ok"], true, "body: {body}");
    assert_eq!(body["port"], 0, "port is 0 until the server binds");
    assert!(body["startedAt"].as_i64().is_some(), "startedAt should be present, body: {body}");
}

/// The browser preview loads from the Vite dev server on a different port, so
/// the adl-server must answer cross-origin requests with
/// `Access-Control-Allow-Origin: *` (no credentials). Both a plain response and
/// an OPTIONS preflight (triggered by the httpBridge's `content-type: json`)
/// must carry the header.
#[tokio::test]
async fn cors_headers_on_every_response_and_preflight() {
    let state = common::state("cors").await;
    let app = common::app(state.clone());

    let resp = app
        .clone()
        .oneshot(axum::http::Request::builder().uri("/health").body(axum::body::Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(resp.status(), axum::http::StatusCode::OK);
    assert_eq!(
        resp.headers().get("access-control-allow-origin").and_then(|v| v.to_str().ok()),
        Some("*"),
        "every response must carry Access-Control-Allow-Origin"
    );

    let preflight = app
        .oneshot(
            axum::http::Request::builder()
                .method("OPTIONS")
                .uri("/session")
                .header("origin", "http://127.0.0.1:5173")
                .header("access-control-request-method", "POST")
                .header("access-control-request-headers", "content-type")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(preflight.status(), axum::http::StatusCode::OK, "preflight must be answered");
    assert_eq!(
        preflight.headers().get("access-control-allow-origin").and_then(|v| v.to_str().ok()),
        Some("*"),
        "preflight must carry Access-Control-Allow-Origin"
    );
    assert_eq!(
        preflight.headers().get("access-control-allow-methods").and_then(|v| v.to_str().ok()),
        Some("GET, POST, PATCH, DELETE, OPTIONS"),
        "preflight must advertise allowed methods"
    );
}
