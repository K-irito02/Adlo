use ad_server::engine::init_server_state;
use ad_server::router::app_router;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use tower::ServiceExt;

/// `/health` must answer 200 with `ok:true` and carry the engine's startup
/// metadata (`port`, `startedAt`) for the parent/probe to key off.
#[tokio::test]
async fn health_returns_ok_with_port() {
    let dir = std::env::temp_dir().join(format!("adl-health-{}", uuid::Uuid::new_v4()));
    let state = init_server_state(&dir).await.unwrap();
    let app = app_router(state.clone()).with_state(state);
    let resp =
        app.oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let bytes = axum::body::to_bytes(resp.into_body(), 4096).await.unwrap();
    let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(body["ok"], true, "body: {body}");
    assert_eq!(body["port"], 0, "port is 0 until the server binds");
    assert!(body["startedAt"].as_i64().is_some(), "startedAt should be present, body: {body}");
    let _ = std::fs::remove_dir_all(&dir);
}
