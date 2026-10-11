//! App / preferences domain HTTP handlers — the browser-mode mirror of the shell's
//! `app_get_info` / `app_update_preferences` Tauri commands.
//!
//! Why this domain exists on ad-server: the browser (preview) surface has no Tauri
//! invoke, so `AppBridge.getInfo` / `AppBridge.updatePreferences` previously
//! resolved to `httpBridge` `NOT_SUPPORTED` stubs — which left `appInfo` undefined
//! and made the settings panel render nothing. `config.json` is the single source
//! of truth for these preferences on both surfaces, so the server reads/writes the
//! same file the shell does.
//!
//! Recipe (rust-server-handler-recipe-pattern): `State` extraction → body parse →
//! blocking I/O in `spawn_blocking` → [`crate::ipc::to_response`].

use crate::ServerState;
use crate::ipc;
use adl_errors::AppError;
use adl_kernel::events::AppEvent;
use adl_types::types::config::AppPreferencePatch;
use axum::body::Bytes;
use axum::extract::State;
use axum::response::IntoResponse;
use std::sync::Mutex as StdMutex;

/// 串行化 config.json 的 read-modify-write（同进程并发请求时避免丢更新）。
static CONFIG_WRITE_LOCK: StdMutex<()> = StdMutex::new(());

/// 会话级 CLI/env 覆盖锁定的运行期字段：HTTP 请求不得把运行期值从 CLI 指定值
/// 改回去（`config.json` 仍按用户选择持久化，下次无 CLI 覆盖时生效）。
fn lock_out_session_overrides(
    change: &adl_logging::LogSettingsChange,
    overrides: &adl_logging::LogOverrides,
) -> adl_logging::LogSettingsChange {
    adl_logging::LogSettingsChange {
        log_level: if overrides.log_level.is_some() { None } else { change.log_level },
        terminal_log_mode: if overrides.terminal_log_mode.is_some() {
            None
        } else {
            change.terminal_log_mode
        },
        debug_log_mode: if overrides.debug_log_mode.is_some() {
            None
        } else {
            change.debug_log_mode
        },
    }
}

/// GET `/app/info` — 当前 `AppInfo`（config + 活动工作区）。
pub async fn get_info(State(state): State<ServerState>) -> impl IntoResponse {
    let result = (|| -> Result<serde_json::Value, AppError> {
        let config = state
            .config
            .read()
            .map_err(|_| AppError::Internal("config lock poisoned".into()))?
            .clone();
        let workspace = state
            .current_workspace
            .read()
            .map_err(|_| AppError::Internal("workspace lock poisoned".into()))?
            .clone();
        Ok(serde_json::to_value(adl_kernel::app_info::build(&config, workspace))?)
    })();
    ipc::to_response(result)
}

/// POST `/app/preferences` — 应用偏好补丁：日志字段先运行时生效，再把 config.json
/// 落盘并广播 `ConfigChanged`，最后返回更新后的 `AppInfo`。
pub async fn update_preferences(
    State(state): State<ServerState>,
    body: Bytes,
) -> impl IntoResponse {
    let patch: AppPreferencePatch = match ipc::json_body(body).await {
        Ok(p) => p,
        Err((status, message)) => {
            return (
                status,
                axum::Json(serde_json::json!({
                    "ok": false,
                    "error": { "code": "INVALID_INPUT", "message": message },
                })),
            );
        },
    };

    let change = lock_out_session_overrides(
        &adl_logging::LogSettingsChange::from_patch(&patch),
        &state.log_overrides,
    );
    if let Err(e) = state.log_manager.apply_change(&change) {
        return ipc::to_response(Err(AppError::Internal(format!(
            "failed to apply log settings: {e}"
        ))));
    }

    let config_dir = state.storage.paths().config_dir.clone();
    let config_arc = state.config.clone();
    let workspace = state.current_workspace.read().ok().and_then(|w| w.clone());
    let spawned = tokio::task::spawn_blocking(move || -> Result<serde_json::Value, AppError> {
        let _guard = CONFIG_WRITE_LOCK
            .lock()
            .map_err(|_| AppError::Internal("config write lock poisoned".into()))?;
        let mut config = config_arc
            .read()
            .map_err(|_| AppError::Internal("config lock poisoned".into()))?
            .clone();
        config.apply_patch(&patch);
        adl_kernel::config::save_to(&config_dir, &config)?;
        *config_arc.write().map_err(|_| AppError::Internal("config lock poisoned".into()))? =
            config.clone();
        Ok(serde_json::to_value(adl_kernel::app_info::build(&config, workspace))?)
    })
    .await;

    let value = match spawned {
        Ok(inner) => inner,
        Err(e) => {
            return ipc::to_response(Err(AppError::Internal(format!(
                "spawn_blocking failed: {e}"
            ))));
        },
    };
    state.event_bus.emit(AppEvent::ConfigChanged);
    ipc::to_response(value)
}

/// POST `/app/log-settings` — **仅运行时**应用日志设置（不触碰 `config.json`）。
///
/// 桌面壳在 UI 改设置后用它把日志字段推给 adl-server 子进程（该进程只在启动时读
/// `config.json`，运行中不跟随）。刻意**不落盘**：`config.json` 的写入真源是调用方
/// （壳），若此处再落盘会用 server 的旧内存快照覆盖调用方刚写的其它字段。
pub async fn apply_log_settings(
    State(state): State<ServerState>,
    body: Bytes,
) -> impl IntoResponse {
    let patch: AppPreferencePatch = match ipc::json_body(body).await {
        Ok(p) => p,
        Err((status, message)) => {
            return (
                status,
                axum::Json(serde_json::json!({
                    "ok": false,
                    "error": { "code": "INVALID_INPUT", "message": message },
                })),
            );
        },
    };

    let change = lock_out_session_overrides(
        &adl_logging::LogSettingsChange::from_patch(&patch),
        &state.log_overrides,
    );
    if change.is_empty() {
        return ipc::to_response(Ok(serde_json::json!(null)));
    }
    if let Err(e) = state.log_manager.apply_change(&change) {
        return ipc::to_response(Err(AppError::Internal(format!(
            "failed to apply log settings: {e}"
        ))));
    }
    ipc::to_response(Ok(serde_json::json!(null)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use adl_logging::{LogMode, LogOverrides};
    use adl_types::types::config::LogLevel;

    #[test]
    fn session_overrides_lock_out_runtime_change_only() {
        let change = adl_logging::LogSettingsChange {
            log_level: Some(LogLevel::Debug),
            terminal_log_mode: Some(LogMode::Multi),
            debug_log_mode: Some(LogMode::Append),
        };
        let overrides = LogOverrides { log_level: Some(LogLevel::Trace), ..Default::default() };
        let locked = lock_out_session_overrides(&change, &overrides);
        assert_eq!(locked.log_level, None, "CLI-locked level must not be overridden at runtime");
        assert_eq!(locked.terminal_log_mode, Some(LogMode::Multi));
        assert_eq!(locked.debug_log_mode, Some(LogMode::Append));
    }

    #[test]
    fn no_overrides_passes_change_through() {
        let change = adl_logging::LogSettingsChange {
            log_level: Some(LogLevel::Warn),
            ..Default::default()
        };
        let locked = lock_out_session_overrides(&change, &LogOverrides::default());
        assert_eq!(locked.log_level, Some(LogLevel::Warn));
    }
}
