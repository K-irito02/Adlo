use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use adl_errors::AppError;
use adl_types::{
    APP_NAME, AppInfo, AppPreferencePatch, ConfigSnapshot, EventDiagnostics, HealthComponent,
    HealthSnapshot, HealthStatus, IpcResult, LogEntrySummary, MigrationDiagnostics,
    RuntimeDiagnosticsSnapshot, RuntimeLifecycleSnapshot, WorkspaceMeta, now_ms,
};
use adl_workspace::strip_verbatim_prefix;
use serde::Serialize;
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    pub base_url: Option<String>,
    pub running: bool,
}

/// Task 10 — the desktop shell spawns the `adl-server` child and exposes its
/// discovered base URL so the frontend `httpBridge` (desktop) connects to the
/// real engine over HTTP/SSE/WS. `baseUrl` is `None` when the engine could not
/// start (system-only desktop); the frontend falls back to its default URL.
#[tauri::command]
pub fn app_get_server_info(state: tauri::State<'_, AppState>) -> IpcResult<ServerInfo> {
    let base_url = state.ad_server.base_url();
    ipc(Ok(ServerInfo { base_url: base_url.clone(), running: state.ad_server.is_running() }))
}

/// Parse the `/workspace/current` `IpcResult<Option<WorkspaceMeta>>` wire body into
/// the active workspace. Pure + testable: `null` data (no active workspace) →
/// `None`, malformed/unwrapped errors → `None`.
fn parse_current_workspace_wire(wire: &serde_json::Value) -> Option<WorkspaceMeta> {
    if !wire.get("ok")?.as_bool()? {
        return None;
    }
    let data = wire.get("data")?;
    if data.is_null() {
        return None;
    }
    serde_json::from_value(data.clone()).ok()
}

/// Bounded timeout for adl-server HTTP fetches from the desktop shell. A hung
/// `adl-server` child (e.g. a DB lock) must degrade to `None` instead of stalling
/// the desktop bootstrap (`app_get_info` / `app_update_preferences`).
const AD_SERVER_FETCH_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(3);

/// Build an HTTP client with a bounded timeout for adl-server fetches. `reqwest`
/// `Client::new()`/`reqwest::get` carry no default timeout; a hung child would
/// otherwise block the async shell indefinitely.
fn adl_server_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(AD_SERVER_FETCH_TIMEOUT)
        .build()
        .expect("failed to build adl-server HTTP client")
}

/// Fetch the active workspace from the spawned adl-server (`GET /workspace/current`).
/// The shell no longer owns the DB; the adl-server is the single source of truth
/// for workspace state. Returns `None` when the engine is not running (graceful
/// system-only degradation).
async fn fetch_current_workspace(state: &AppState) -> Option<WorkspaceMeta> {
    let base_url = state.ad_server.base_url()?;
    fetch_current_workspace_with_client(&adl_server_http_client(), &base_url).await
}

/// Fetch with an explicit client (injectable for tests; production uses
/// [`adl_server_http_client`], which applies the bounded [`AD_SERVER_FETCH_TIMEOUT`]).
async fn fetch_current_workspace_with_client(
    client: &reqwest::Client,
    base_url: &str,
) -> Option<WorkspaceMeta> {
    let resp = client.get(format!("{base_url}/workspace/current")).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let wire: serde_json::Value = resp.json().await.ok()?;
    parse_current_workspace_wire(&wire)
}

#[tauri::command]
pub async fn app_get_info(
    state: tauri::State<'_, AppState>,
) -> Result<IpcResult<AppInfo>, AppError> {
    let current_workspace = fetch_current_workspace(&state).await;
    Ok(ipc(build_app_info(&state, current_workspace)))
}

#[tauri::command]
pub fn app_get_health(_state: tauri::State<'_, AppState>) -> IpcResult<HealthSnapshot> {
    let now = now_ms();
    ipc(Ok(HealthSnapshot {
        timestamp: now,
        components: vec![
            HealthComponent {
                name: "main".into(),
                status: HealthStatus::Healthy,
                detail: "Tauri backend initialized.".into(),
                updated_at: now,
            },
            HealthComponent {
                name: "storage".into(),
                status: HealthStatus::Healthy,
                detail: "Business storage runs in the adl-server process.".into(),
                updated_at: now,
            },
            HealthComponent {
                name: "models".into(),
                status: HealthStatus::Degraded,
                detail: "Provider health depends on configured OS keyring secrets.".into(),
                updated_at: now,
            },
        ],
    }))
}

#[tauri::command]
pub fn app_get_diagnostics(
    state: tauri::State<'_, AppState>,
) -> IpcResult<RuntimeDiagnosticsSnapshot> {
    let (emitted, by_type) = state.event_bus.diagnostics();
    ipc(Ok(RuntimeDiagnosticsSnapshot {
        lifecycle: RuntimeLifecycleSnapshot {
            current_started_at: state.started_at,
            last_shutdown_at: None,
            last_shutdown_was_clean: true,
            recovered_from_crash: false,
        },
        migration: MigrationDiagnostics {
            change: "none".into(),
            from_version: None,
            to_version: env!("CARGO_PKG_VERSION").into(),
            backup_path: None,
            executed_scripts: vec![],
        },
        events: EventDiagnostics { emitted, by_type },
        recent_errors: vec![],
    }))
}

/// 只读历史磁盘预算钳制（与前端 `budgetBytesFromCustom` 同口径）：
/// 0 = 跟随磁盘剩余空间直通；其余钳制到 1GiB..=2000GiB，防止手造 patch 写入非法值。
fn clamp_terminal_history_budget_bytes(v: u64) -> u64 {
    if v == 0 { 0 } else { v.clamp(1 << 30, 2000 * (1 << 30)) }
}

#[tauri::command]
pub async fn app_update_preferences(
    app: tauri::AppHandle,
    patch: AppPreferencePatch,
) -> Result<IpcResult<AppInfo>, AppError> {
    let state = app.state::<AppState>();
    {
        let mut config =
            state.config.write().map_err(|_| AppError::Internal("config lock poisoned".into()))?;
        if let Some(language) = patch.language {
            config.language = language;
        }
        if let Some(mode) = patch.theme_mode {
            config.theme_mode = mode;
        }
        if let Some(level) = patch.log_level {
            config.log_level = level;
        }
        if let Some(mode) = patch.terminal_log_mode {
            config.terminal_log_mode = mode;
            let _ = state.log_manager.set_mode(adl_logging::LogTarget::Terminal, mode);
        }
        if let Some(mode) = patch.debug_log_mode {
            config.debug_log_mode = mode;
            let _ = state.log_manager.set_mode(adl_logging::LogTarget::Debug, mode);
        }
        if let Some(keybinds) = patch.keybinds {
            config.keybinds = keybinds;
        }
        if let Some(fonts) = patch.fonts {
            if let Some(ui) = fonts.ui_font {
                config.fonts.ui_font = Some(ui);
            }
            if let Some(code) = fonts.code_font {
                config.fonts.code_font = Some(code);
            }
            if let Some(term) = fonts.terminal_font {
                config.fonts.terminal_font = Some(term);
            }
        }
        if let Some(v) = patch.max_concurrent_workspaces {
            config.max_concurrent_workspaces = v.clamp(1, 20);
        }
        if let Some(v) = patch.workspace_priority_ids {
            config.workspace_priority_ids = v;
        }
        if let Some(v) = patch.workspace_deferred_ids {
            config.workspace_deferred_ids = v;
        }
        if let Some(v) = patch.workspace_natural_order {
            config.workspace_natural_order = v;
        }
        if let Some(v) = patch.browser_inactive_tab_suspend_ms {
            config.browser_inactive_tab_suspend_ms = v;
        }
        // 只读历史磁盘预算：0 = 跟随磁盘剩余空间直通；其余钳制到 1GiB..=2000GiB
        //（与前端 budgetBytesFromCustom 同口径；缺失此分支时前端选择档位/恢复默认会静默失效）。
        if let Some(v) = patch.terminal_history_budget_bytes {
            config.terminal_history_budget_bytes = clamp_terminal_history_budget_bytes(v);
        }
    }
    let config_clone =
        state.config.read().map_err(|_| AppError::Internal("config lock poisoned".into()))?.clone();
    let config_dir = state.storage.paths().config_dir.clone();
    tokio::task::spawn_blocking(move || {
        crate::setup::save_config_to_dir(&config_dir, &config_clone)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?
    .map_err(|e| AppError::Config(e.to_string()))?;
    state.event_bus.emit(adl_kernel::events::AppEvent::ConfigChanged);
    let current_workspace = fetch_current_workspace(&state).await;
    let info = build_app_info(&state, current_workspace)?;
    Ok(ipc(Ok(info)))
}

pub fn build_app_info(
    state: &AppState,
    current_workspace: Option<WorkspaceMeta>,
) -> Result<AppInfo, AppError> {
    let config =
        state.config.read().map_err(|_| AppError::Internal("config lock poisoned".into()))?;
    let resolved = match config.theme_mode {
        adl_types::ThemeMode::Light => adl_types::Theme::Light,
        adl_types::ThemeMode::Dark => adl_types::Theme::Dark,
        adl_types::ThemeMode::System => adl_types::Theme::Light,
    };
    let current_workspace = current_workspace.map(|mut w| {
        w.path = strip_verbatim_prefix(&w.path);
        w.root_path = strip_verbatim_prefix(&w.root_path);
        w
    });
    Ok(AppInfo {
        app_name: APP_NAME.into(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        config: ConfigSnapshot {
            language: config.language.clone(),
            theme_mode: config.theme_mode,
            resolved_theme: resolved,
            log_level: config.log_level.clone(),
            terminal_log_mode: config.terminal_log_mode,
            debug_log_mode: config.debug_log_mode,
            max_recent_workspaces: config.max_recent_workspaces,
            keybinds: config.keybinds.clone(),
            fonts: config.fonts.clone(),
            max_concurrent_workspaces: config.max_concurrent_workspaces,
            workspace_priority_ids: config.workspace_priority_ids.clone(),
            workspace_deferred_ids: config.workspace_deferred_ids.clone(),
            workspace_natural_order: config.workspace_natural_order.clone(),
            browser_inactive_tab_suspend_ms: config.browser_inactive_tab_suspend_ms,
            terminal_history_budget_bytes: config.terminal_history_budget_bytes,
        },
        current_workspace,
        recent_logs: vec![LogEntrySummary {
            timestamp: now_ms(),
            level: "info".into(),
            scope: "tauri".into(),
            message: "Backend ready.".into(),
        }],
    })
}

/// 写入调试日志到项目目录（委托 LogManager，按当前模式处理）
#[tauri::command]
pub fn write_debug_logs_to_project(
    state: tauri::State<AppState>,
    content: String,
) -> Result<IpcResult<()>, CommandError> {
    state.log_manager.write_debug_logs(&content).map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(ipc(Ok(())))
}

/// 写入调试日志到文件（委托 LogManager）
#[tauri::command]
pub async fn write_debug_logs(
    app: tauri::AppHandle,
    content: String,
) -> Result<IpcResult<()>, CommandError> {
    let state = app.state::<AppState>();
    let log_manager = state.log_manager.clone();
    tokio::task::spawn_blocking(move || log_manager.write_debug_logs(&content))
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(ipc(Ok(())))
}

/// 运行时切换日志模式
#[tauri::command]
pub async fn app_set_log_mode(
    app: tauri::AppHandle,
    target: String,
    mode: String,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let log_target: adl_logging::LogTarget = match target.as_str() {
        "terminal" => adl_logging::LogTarget::Terminal,
        "debug" => adl_logging::LogTarget::Debug,
        other => return Err(format!("Invalid log target: {other}")),
    };
    let log_mode: adl_logging::LogMode =
        mode.parse().map_err(|e: String| format!("Invalid log mode: {e}"))?;

    state.log_manager.set_mode(log_target, log_mode).map_err(|e| e.to_string())?;

    {
        let mut config = state.config.write().map_err(|_| "config lock poisoned".to_string())?;
        match log_target {
            adl_logging::LogTarget::Terminal => config.terminal_log_mode = log_mode,
            adl_logging::LogTarget::Debug => config.debug_log_mode = log_mode,
        }
    }
    let config_clone = state.config.read().map_err(|_| "config lock poisoned".to_string())?.clone();
    let config_dir = state.storage.paths().config_dir.clone();
    tokio::task::spawn_blocking(move || {
        crate::setup::save_config_to_dir(&config_dir, &config_clone)
    })
    .await
    .map_err(|e| format!("spawn_blocking failed: {e}"))?
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(test)]
mod server_info_tests {
    use super::*;

    #[test]
    fn server_info_serializes_camel_case() {
        let info = ServerInfo { base_url: Some("http://127.0.0.1:54321".into()), running: true };
        let json = serde_json::to_value(&info).unwrap();
        assert_eq!(json["baseUrl"], "http://127.0.0.1:54321");
        assert_eq!(json["running"], true);
    }

    #[test]
    fn server_info_none_base_url() {
        let info = ServerInfo { base_url: None, running: false };
        let json = serde_json::to_value(&info).unwrap();
        assert!(json["baseUrl"].is_null());
        assert_eq!(json["running"], false);
    }

    #[test]
    fn parse_current_workspace_wire_null_data_is_none() {
        let wire = serde_json::json!({ "ok": true, "data": null });
        assert!(parse_current_workspace_wire(&wire).is_none());
    }

    #[test]
    fn parse_current_workspace_wire_error_is_none() {
        let wire = serde_json::json!({ "ok": false, "error": { "code": "INTERNAL_ERROR", "message": "boom" } });
        assert!(parse_current_workspace_wire(&wire).is_none());
    }

    #[test]
    fn parse_current_workspace_wire_malformed_is_none() {
        assert!(parse_current_workspace_wire(&serde_json::json!(42)).is_none());
        assert!(parse_current_workspace_wire(&serde_json::json!({ "ok": true })).is_none());
    }

    #[test]
    fn parse_current_workspace_wire_returns_workspace() {
        let wire = serde_json::json!({
            "ok": true,
            "data": {
                "id": "ws-1",
                "path": "C:\\proj",
                "rootPath": "C:\\proj",
                "name": "proj",
                "type": "rust",
                "status": "ready",
                "gitSnapshot": null,
                "createdAt": 123,
                "updatedAt": 123,
                "lastOpenedAt": 123
            }
        });
        let ws = parse_current_workspace_wire(&wire).expect("workspace");
        assert_eq!(ws.id, "ws-1");
        assert_eq!(ws.root_path, "C:\\proj");
    }
}

#[cfg(test)]
mod workspace_loading_tests {
    use super::*;
    use adl_types::types::config::AppPreferencePatch;

    #[test]
    fn app_preference_patch_deserializes_workspace_loading_fields() {
        let json = r#"{
            "maxConcurrentWorkspaces": 8,
            "workspacePriorityIds": ["ws-1", "ws-2"],
            "workspaceDeferredIds": ["ws-3"],
            "workspaceNaturalOrder": ["ws-4", "ws-5"]
        }"#;
        let patch: AppPreferencePatch = serde_json::from_str(json).unwrap();
        assert_eq!(patch.max_concurrent_workspaces, Some(8));
        assert_eq!(patch.workspace_priority_ids, Some(vec!["ws-1".into(), "ws-2".into()]));
        assert_eq!(patch.workspace_deferred_ids, Some(vec!["ws-3".into()]));
        assert_eq!(patch.workspace_natural_order, Some(vec!["ws-4".into(), "ws-5".into()]));
    }

    #[test]
    fn app_preference_patch_deserializes_without_workspace_loading_fields() {
        // 旧客户端发送的 patch 不含新字段，应全部为 None
        let json = r#"{"language": "en-US"}"#;
        let patch: AppPreferencePatch = serde_json::from_str(json).unwrap();
        assert_eq!(patch.language, Some("en-US".into()));
        assert_eq!(patch.max_concurrent_workspaces, None);
        assert_eq!(patch.workspace_priority_ids, None);
        assert_eq!(patch.workspace_deferred_ids, None);
        assert_eq!(patch.workspace_natural_order, None);
    }

    #[test]
    fn clamp_terminal_history_budget_bytes_passes_through_follow_disk() {
        assert_eq!(clamp_terminal_history_budget_bytes(0), 0);
        assert_eq!(clamp_terminal_history_budget_bytes(1 << 30), 1 << 30);
        assert_eq!(clamp_terminal_history_budget_bytes(2000 * (1 << 30)), 2000 * (1 << 30));
    }

    #[test]
    fn clamp_terminal_history_budget_bytes_clamps_out_of_range() {
        // 与前端 budgetBytesFromCustom 同口径：非法小值抬下限、超大钳上限。
        assert_eq!(clamp_terminal_history_budget_bytes(1), 1 << 30);
        assert_eq!(clamp_terminal_history_budget_bytes(u64::MAX), 2000 * (1 << 30));
    }

    #[test]
    fn config_snapshot_deserializes_old_format_with_defaults() {
        let json = r#"{
            "language": "zh-CN",
            "themeMode": "system",
            "resolvedTheme": "light",
            "logLevel": "info",
            "terminalLogMode": "overwrite",
            "debugLogMode": "overwrite",
            "maxRecentWorkspaces": 10,
            "keybinds": {},
            "fonts": {}
        }"#;
        let snap: ConfigSnapshot = serde_json::from_str(json).unwrap();
        assert_eq!(snap.max_concurrent_workspaces, 6);
        assert!(snap.workspace_priority_ids.is_empty());
        assert!(snap.workspace_deferred_ids.is_empty());
        assert!(snap.workspace_natural_order.is_empty());
        assert_eq!(snap.browser_inactive_tab_suspend_ms, 3_600_000);
    }

    #[test]
    fn config_snapshot_serializes_workspace_loading_fields() {
        let snap = ConfigSnapshot {
            language: "zh-CN".into(),
            theme_mode: adl_types::ThemeMode::System,
            resolved_theme: adl_types::Theme::Light,
            log_level: "info".into(),
            terminal_log_mode: adl_types::LogMode::Overwrite,
            debug_log_mode: adl_types::LogMode::Overwrite,
            max_recent_workspaces: 10,
            keybinds: std::collections::BTreeMap::new(),
            fonts: adl_types::types::config::FontPreferences::default(),
            max_concurrent_workspaces: 4,
            workspace_priority_ids: vec!["a".into()],
            workspace_deferred_ids: vec!["b".into()],
            workspace_natural_order: vec!["c".into()],
            browser_inactive_tab_suspend_ms: 3_600_000,
            terminal_history_budget_bytes: 1 << 30,
        };
        let json = serde_json::to_string(&snap).unwrap();
        assert!(json.contains("\"maxConcurrentWorkspaces\":4"));
        assert!(json.contains("\"workspacePriorityIds\":[\"a\"]"));
        assert!(json.contains("\"workspaceDeferredIds\":[\"b\"]"));
        assert!(json.contains("\"workspaceNaturalOrder\":[\"c\"]"));
        assert!(json.contains("\"browserInactiveTabSuspendMs\":3600000"));
    }
}

#[cfg(test)]
mod adl_server_fetch_tests {
    use super::*;
    use std::io::Read;
    use std::net::TcpListener;
    use std::time::{Duration, Instant};

    /// A server that accepts a connection, reads the request bytes, then stalls
    /// without responding — simulating a hung adl-server child (e.g. a DB lock).
    /// Returns the base URL to point the client at.
    fn spawn_stalling_server() -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut buf = [0u8; 4096];
                let _ = stream.read(&mut buf);
                std::thread::sleep(Duration::from_secs(30));
            }
        });
        format!("http://{addr}")
    }

    #[tokio::test]
    async fn hung_server_degrades_to_none_within_bounded_timeout() {
        let url = spawn_stalling_server();
        let client = adl_server_http_client();
        let start = Instant::now();
        let result = fetch_current_workspace_with_client(&client, &url).await;
        assert!(result.is_none());
        assert!(
            start.elapsed() < Duration::from_secs(10),
            "fetch took {:?}; no bounded timeout applied",
            start.elapsed()
        );
    }

    #[tokio::test]
    async fn no_timeout_client_stays_hung_on_stalling_server() {
        // Harness sanity check: proves the stalling server genuinely hangs a
        // timeout-less client, so the bounded-timeout test above is attributable
        // to the timeout, not to the server closing the connection early.
        let url = spawn_stalling_server();
        let client = reqwest::Client::new();
        let start = Instant::now();
        let outcome =
            tokio::time::timeout(Duration::from_secs(1), client.get(url.as_str()).send()).await;
        assert!(outcome.is_err(), "no-timeout client should not resolve on a stalled server");
        assert!(start.elapsed() < Duration::from_secs(10));
    }
}
