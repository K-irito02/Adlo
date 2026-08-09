//! Provider domain HTTP endpoints (migrated from `src-tauri/src/commands/
//! provider.rs`). Each test drives `app_router` over a fresh `ServerState` via
//! `tower::ServiceExt::oneshot` — no sockets, no subprocesses.
//!
//! Security rule: every API-key write uses a unique `test-*` provider id and is
//! cleared at the end of the test, so the real credential store (keyring /
//! encrypted file) is never polluted with a fake key under a real provider id.

// Integration-test crate: unwraps in helpers (not `#[test]` fns) fall outside
// clippy's `allow-unwrap-in-tests`, so permit them at the crate level.
#![allow(clippy::unwrap_used)]

use ad_server::engine::init_server_state;
use ad_server::router::app_router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use serde_json::{Value, json};
use std::time::Duration;
use tower::ServiceExt;

async fn state() -> ad_server::ServerState {
    let dir = std::env::temp_dir().join(format!("adl-prov-api-{}", uuid::Uuid::new_v4()));
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

/// GET /provider/list returns the registry statuses with the frontend's
/// camelCase ProviderStatus shape (built-in set is deterministic).
#[tokio::test]
async fn list_providers_returns_builtin_statuses() {
    let state = state().await;
    let (status, body) = send(state, Method::GET, "/provider/list", None).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["ok"], true, "body: {body}");
    let providers = body["data"].as_array().expect("providers array");
    assert!(!providers.is_empty());
    let deepseek = providers.iter().find(|p| p["id"] == "deepseek").expect("deepseek present");
    for key in [
        "id",
        "name",
        "apiType",
        "builtIn",
        "configured",
        "hasKey",
        "requiresKey",
        "models",
        "enabled",
    ] {
        assert!(deepseek.get(key).is_some(), "ProviderStatus missing '{key}': {deepseek}");
    }
    assert_eq!(deepseek["builtIn"], true);
    assert!(deepseek["requiresKey"].is_boolean());
    assert!(deepseek["hasKey"].is_boolean());
    assert!(deepseek["enabled"].is_boolean());
    assert!(deepseek["enabledModels"].is_null() || deepseek["enabledModels"].is_array());
    assert!(
        !deepseek.as_object().unwrap().contains_key("enabled_models"),
        "no snake_case key on the wire: {deepseek}"
    );
}

/// GET /provider/supported returns the static ProviderInfo list.
#[tokio::test]
async fn list_supported_providers_returns_infos() {
    let state = state().await;
    let (status, body) = send(state, Method::GET, "/provider/supported", None).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    let infos = body["data"].as_array().expect("infos array");
    assert!(infos.iter().any(|i| i["id"] == "deepseek" && i["name"] == "DeepSeek"));
    assert!(infos.iter().all(|i| i.get("requiresKey").is_some()));
}

/// Poll `POST /provider/api-key/get` until `data` matches `expected` (or the
/// bounded timeout elapses). Windows Credential Manager is eventually
/// consistent under heavy concurrent process load (dozens of test binaries in
/// `cargo test --workspace`), so round-trip assertions poll instead of
/// asserting on the first read.
async fn get_key_until(state: ad_server::ServerState, pid: &str, expected: Value) {
    tokio::time::timeout(Duration::from_secs(20), async {
        loop {
            let (status, body) = send(
                state.clone(),
                Method::POST,
                "/provider/api-key/get",
                Some(json!({ "providerId": pid })),
            )
            .await;
            assert_eq!(status, StatusCode::OK, "get body: {body}");
            if body["data"] == expected {
                return;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await
    .unwrap_or_else(|_| panic!("provider api-key did not settle on {expected} within timeout"));
}

/// set / get / has / clear API-key round trip through the credential store,
/// using a unique test provider id so no real credential is touched.
#[tokio::test]
async fn set_get_has_clear_api_key_round_trip() {
    let state = state().await;
    let pid = format!("api-key-test-{}", uuid::Uuid::new_v4());

    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/provider/api-key",
        Some(json!({ "providerId": pid, "apiKey": "sk-test-secret" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "set body: {body}");
    assert_eq!(body["data"], true);

    get_key_until(state.clone(), &pid, json!("sk-test-secret")).await;

    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/provider/api-key/has",
        Some(json!({ "providerId": pid })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "has body: {body}");
    assert_eq!(body["data"], true);

    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/provider/api-key/clear",
        Some(json!({ "providerId": pid })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "clear body: {body}");
    assert_eq!(body["data"], true);

    get_key_until(state.clone(), &pid, Value::Null).await;
}

/// test-connection on an unknown provider id → NOT_FOUND (no network I/O).
#[tokio::test]
async fn test_connection_unknown_provider_returns_404() {
    let state = state().await;
    let (status, body) = send(
        state,
        Method::POST,
        "/provider/test-connection",
        Some(json!({ "providerId": "no-such-provider-xyz" })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND");
}

/// fetch-models on an unknown provider id → NOT_FOUND.
#[tokio::test]
async fn fetch_models_unknown_provider_returns_404() {
    let state = state().await;
    let (status, body) = send(
        state,
        Method::POST,
        "/provider/fetch-models",
        Some(json!({ "providerId": "no-such-provider-xyz" })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(body["error"]["code"], "NOT_FOUND");
}

/// add_custom_provider registers a custom provider, persists config, and the
/// provider appears in the list; remove_custom_provider cleans it up.
#[tokio::test]
async fn add_and_remove_custom_provider() {
    let state = state().await;
    let name = format!("Test Custom {}", uuid::Uuid::new_v4());
    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/provider/custom",
        Some(json!({
            "name": name,
            "baseUrl": "https://api.example.com/v1",
            "apiKey": "sk-custom",
            "models": ["m1", "m2"]
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "add body: {body}");
    assert_eq!(body["data"], true, "add body: {body}");

    // The sanitized id: lowercase name with whitespace collapsed to '-'.
    let expected_id =
        format!("custom-{}", name.to_lowercase().split_whitespace().collect::<Vec<_>>().join("-"));
    let (status, list) = send(state.clone(), Method::GET, "/provider/list", None).await;
    assert_eq!(status, StatusCode::OK);
    let providers = list["data"].as_array().unwrap();
    let custom = providers.iter().find(|p| p["id"] == expected_id).expect("custom provider listed");
    assert_eq!(custom["builtIn"], false);
    assert_eq!(custom["baseUrl"], "https://api.example.com/v1");
    let model_ids: Vec<&str> =
        custom["models"].as_array().unwrap().iter().map(|m| m["id"].as_str().unwrap()).collect();
    assert!(model_ids.contains(&"m1") && model_ids.contains(&"m2"));

    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/provider/custom/remove",
        Some(json!({ "providerId": expected_id })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "remove body: {body}");
    assert_eq!(body["data"], true);

    let (_, list) = send(state, Method::GET, "/provider/list", None).await;
    assert!(
        !list["data"].as_array().unwrap().iter().any(|p| p["id"] == expected_id),
        "custom provider should be removed"
    );
}

/// add_custom_provider rejects a plain-http (non-localhost) base URL.
#[tokio::test]
async fn add_custom_provider_invalid_url_returns_400() {
    let state = state().await;
    let (status, body) = send(
        state,
        Method::POST,
        "/provider/custom",
        Some(json!({
            "name": "Evil",
            "baseUrl": "http://evil.com/v1",
            "apiKey": "sk-x",
            "models": ["m1"]
        })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT");
}

/// save_provider_config rejects writes for unknown provider ids.
#[tokio::test]
async fn save_provider_config_unknown_provider_returns_400() {
    let state = state().await;
    let (status, body) = send(
        state,
        Method::POST,
        "/provider/config",
        Some(json!({ "providerId": "no-such-provider-xyz", "config": { "apiKey": "sk-x" } })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["error"]["code"], "INVALID_INPUT");
}

/// save_provider_config persists the apiKey field into the credential store
/// (never plaintext in config/DB), verified via get-provider-api-key.
#[tokio::test]
async fn save_provider_config_stores_api_key() {
    let state = state().await;
    let name = format!("Cfg Target {}", uuid::Uuid::new_v4());
    let expected_id =
        format!("custom-{}", name.to_lowercase().split_whitespace().collect::<Vec<_>>().join("-"));
    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/provider/custom",
        Some(json!({
            "name": name,
            "baseUrl": "https://api.example.com/v1",
            "apiKey": "",
            "models": ["m1"]
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "add body: {body}");

    let (status, body) = send(
        state.clone(),
        Method::POST,
        "/provider/config",
        Some(json!({ "providerId": expected_id, "config": { "apiKey": "sk-from-config" } })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "config body: {body}");
    assert_eq!(body["data"], true);

    get_key_until(state.clone(), &expected_id, json!("sk-from-config")).await;

    // Cleanup: remove the custom provider (also clears its stored secret).
    let (_, _) = send(
        state.clone(),
        Method::POST,
        "/provider/custom/remove",
        Some(json!({ "providerId": expected_id })),
    )
    .await;
    get_key_until(state, &expected_id, Value::Null).await;
}
