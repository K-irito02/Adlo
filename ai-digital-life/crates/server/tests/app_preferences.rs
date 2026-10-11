//! `/app/info` + `/app/preferences` route tests (browser-mode app domain).
//!
//! These lock the contract the browser surface depends on: the settings panel needs
//! `getInfo` to supply `appInfo` and `updatePreferences` to persist the three log
//! settings (level / terminal mode / debug mode) — both previously `NOT_SUPPORTED`.

mod common;

use axum::http::{Method, StatusCode};
use common::{send_post, send_request, state};
use serde_json::json;

#[tokio::test]
async fn app_info_returns_config_for_the_settings_panel() {
    let st = state("app-info").await;
    let (status, body) = send_request(st, Method::GET, "/app/info", None).await;

    assert_eq!(status, StatusCode::OK, "unexpected: {body}");
    assert_eq!(body["ok"], true);
    assert_eq!(body["data"]["appName"], "AI Digital Life");
    assert_eq!(body["data"]["config"]["logLevel"], "info");
    assert_eq!(body["data"]["config"]["terminalLogMode"], "overwrite");
    assert_eq!(body["data"]["config"]["debugLogMode"], "overwrite");
}

#[tokio::test]
async fn update_preferences_applies_all_three_log_settings() {
    let st = state("app-prefs").await;
    let (status, body) = send_post(
        st.clone(),
        "/app/preferences",
        Some(json!({
            "logLevel": "trace",
            "terminalLogMode": "multi",
            "debugLogMode": "append",
        })),
    )
    .await;

    assert_eq!(status, StatusCode::OK, "unexpected: {body}");
    assert_eq!(body["data"]["config"]["logLevel"], "trace");
    assert_eq!(body["data"]["config"]["terminalLogMode"], "multi");
    assert_eq!(body["data"]["config"]["debugLogMode"], "append");

    // 运行期已对 LogManager 生效（不只是写进了响应）。
    let live = st.log_manager.config().expect("log config");
    assert_eq!(live.log_level.to_string(), "trace");
    assert_eq!(live.terminal_log_mode.to_string(), "multi");
    assert_eq!(live.debug_log_mode.to_string(), "append");
    assert_eq!(st.log_manager.log_level().expect("level"), live.log_level);

    // 已持久化到 config.json（下次启动仍生效）。
    let config_path = st.storage.paths().config_dir.join("config.json");
    let persisted: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&config_path).expect("read config.json"))
            .expect("parse config.json");
    assert_eq!(persisted["log_level"], "trace");
    assert_eq!(persisted["terminal_log_mode"], "multi");
    assert_eq!(persisted["debug_log_mode"], "append");
}

#[tokio::test]
async fn update_preferences_rejects_unknown_log_level() {
    let st = state("app-prefs-bad").await;
    let (status, body) =
        send_post(st, "/app/preferences", Some(json!({ "logLevel": "verbose" }))).await;

    assert_eq!(status, StatusCode::BAD_REQUEST, "unexpected: {body}");
    assert_eq!(body["ok"], false);
    assert_eq!(body["error"]["code"], "INVALID_INPUT");
}

#[tokio::test]
async fn log_settings_route_applies_runtime_only_and_does_not_persist() {
    let st = state("app-log-settings").await;
    let config_path = st.storage.paths().config_dir.join("config.json");

    let (status, body) = send_post(
        st.clone(),
        "/app/log-settings",
        Some(json!({ "logLevel": "trace", "debugLogMode": "multi" })),
    )
    .await;

    assert_eq!(status, StatusCode::OK, "unexpected: {body}");
    // 运行期已生效
    let live = st.log_manager.config().expect("log config");
    assert_eq!(live.log_level.to_string(), "trace");
    assert_eq!(live.debug_log_mode.to_string(), "multi");
    assert_eq!(live.terminal_log_mode.to_string(), "overwrite", "未提供的字段不得改动");
    // 刻意不落盘（落盘真源是调用方 / `/app/preferences`）
    assert!(!config_path.exists(), "/app/log-settings must not write config.json (runtime-only)");
}

#[tokio::test]
async fn update_preferences_ignores_absent_log_fields() {
    let st = state("app-prefs-partial").await;
    let (status, body) =
        send_post(st.clone(), "/app/preferences", Some(json!({ "language": "en-US" }))).await;

    assert_eq!(status, StatusCode::OK, "unexpected: {body}");
    assert_eq!(body["data"]["config"]["language"], "en-US");
    // 未被补丁触及的日志字段保持默认。
    let live = st.log_manager.config().expect("log config");
    assert_eq!(live.log_level.to_string(), "info");
    assert_eq!(live.terminal_log_mode.to_string(), "overwrite");
}
