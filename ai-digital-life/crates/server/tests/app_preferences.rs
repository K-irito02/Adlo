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
    assert_eq!(body["data"]["info"]["config"]["logLevel"], "trace");
    assert_eq!(body["data"]["info"]["config"]["terminalLogMode"], "multi");
    assert_eq!(body["data"]["info"]["config"]["debugLogMode"], "append");
    // 无会话覆盖时锁定集为空。
    assert_eq!(body["data"]["sessionLockedFields"], serde_json::json!([]));

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
    assert_eq!(body["data"]["info"]["config"]["language"], "en-US");
    // 未被补丁触及的日志字段保持默认。
    let live = st.log_manager.config().expect("log config");
    assert_eq!(live.log_level.to_string(), "info");
    assert_eq!(live.terminal_log_mode.to_string(), "overwrite");
}

#[tokio::test]
async fn update_preferences_reports_session_locked_fields() {
    use adl_types::types::config::LogLevel;
    let mut st = state("app-prefs-locked").await;
    // 模拟 CLI 会话覆盖：logLevel 被锁定（按生产顺序先叠加到内存 + 运行期）。
    st.log_overrides =
        adl_logging::LogOverrides { log_level: Some(LogLevel::Trace), ..Default::default() };
    {
        let mut cfg = st.config.write().expect("config lock");
        cfg.apply_log_overrides(&st.log_overrides);
    }
    st.log_manager
        .apply_change(&adl_logging::LogSettingsChange {
            log_level: Some(LogLevel::Trace),
            ..Default::default()
        })
        .expect("seed runtime level");

    let (status, body) = send_post(
        st.clone(),
        "/app/preferences",
        Some(json!({ "logLevel": "warn", "terminalLogMode": "multi" })),
    )
    .await;

    assert_eq!(status, StatusCode::OK, "unexpected: {body}");
    // 被锁字段上报（前端弹"下次启动生效"），且运行期保持 CLI 值。
    assert_eq!(body["data"]["sessionLockedFields"], serde_json::json!(["logLevel"]));
    let live = st.log_manager.config().expect("log config");
    assert_eq!(live.log_level, LogLevel::Trace, "locked field keeps CLI value at runtime");
    assert_eq!(live.terminal_log_mode.to_string(), "multi");
    // 但落盘用的是用户选择的值（下次无 CLI 启动时生效）。
    let config_path = st.storage.paths().config_dir.join("config.json");
    let persisted: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&config_path).expect("read config.json"))
            .expect("parse config.json");
    assert_eq!(persisted["log_level"], "warn");
}
