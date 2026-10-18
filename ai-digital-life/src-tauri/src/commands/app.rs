use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use adl_errors::AppError;
use adl_types::{
    AppInfo, AppPreferencePatch, EventDiagnostics, HealthComponent, HealthSnapshot, HealthStatus,
    IpcResult, MigrationDiagnostics, RuntimeDiagnosticsSnapshot, RuntimeLifecycleSnapshot,
    UpdatePreferencesResult, WorkspaceMeta, now_ms,
};
use adl_workspace::strip_verbatim_prefix;
use serde::Serialize;
use std::sync::OnceLock;
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
///
/// 全局复用单个 Client（连接池复用；Phase 4 F8）。
fn adl_server_http_client() -> reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            reqwest::Client::builder()
                .timeout(AD_SERVER_FETCH_TIMEOUT)
                .build()
                .expect("failed to build adl-server HTTP client")
        })
        .clone()
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

/// 供 `/app/log-settings` 的最小补丁体（只带日志字段，其余为 `None`）。
fn log_settings_patch_body(change: &adl_logging::LogSettingsChange) -> AppPreferencePatch {
    AppPreferencePatch {
        log_level: change.log_level,
        terminal_log_mode: change.terminal_log_mode,
        debug_log_mode: change.debug_log_mode,
        ..AppPreferencePatch::default()
    }
}

/// 把日志设置推给 adl-server 子进程（其 LogManager 只在**启动时**读 config.json）。
///
/// 走 `/app/log-settings`（仅运行时、不落盘）——落盘由壳在调用处一次性完成，
/// 避免 server 用其旧内存快照覆盖壳刚写入的其它字段。失败**不阻断**：壳侧已生效，
/// 且 config.json 已落盘，server 下次启动仍会读到正确值。
///
/// 后台发送（Phase 4 F7）：forward 的结果本就不影响返回值，server 半死时同步等待
/// 会把设置保存 UI 拖住至多约 3s；调用方传 owned 数据，不借用 AppState。
/// 已知边界（Closing L4）：每次 spawn 独立 POST、无序号——快速连改可能后发先至，
/// server 短暂停在旧值，下次保存/重启自愈。后天若需严格保序，加单调序号或防抖合并。
fn forward_log_settings_to_server(
    client: reqwest::Client,
    base_url: String,
    change: adl_logging::LogSettingsChange,
) {
    if change.is_empty() {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let resp = client
            .post(format!("{base_url}/app/log-settings"))
            .json(&log_settings_patch_body(&change))
            .send()
            .await;
        match resp {
            Ok(r) if r.status().is_success() => {},
            Ok(r) => {
                tracing::warn!(status = %r.status(), "ad-server rejected forwarded log settings");
            },
            Err(e) => tracing::warn!(error = %e, "forwarding log settings to ad-server failed"),
        }
    });
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

/// 串行化并发 `app_update_preferences` 的进程内写锁（Closing M2）：内存改写与
/// 落盘结果必须同序。tokio 锁可持有跨 `.await`；watcher 线程取同一把锁。
/// 与 server 侧 `CONFIG_WRITE_LOCK`（进程内串行 read-modify-write）同形。
pub(crate) static CONFIG_WRITE_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[tauri::command]
pub async fn app_update_preferences(
    app: tauri::AppHandle,
    patch: AppPreferencePatch,
) -> Result<IpcResult<UpdatePreferencesResult>, AppError> {
    let state = app.state::<AppState>();
    let _write_guard = CONFIG_WRITE_LOCK.lock().await;
    // 1) 日志字段先运行时生效：失败即返回，内存 config 尚未改写 → 无
    //    「config 已变但 LogManager 未生效」的永久漂移（原 `let _ =` 吞错缺陷）。
    //    会话覆盖锁定的字段跳过运行期（仅落盘，下次启动生效；与 server 同语义）。
    //    顺序语义：日志字段先行校验，失败则整个补丁被拒绝（含无关字段）。
    //    apply_change 失败仅 poison 可触发（锁损坏即进程状态不可信），不回滚。
    let locked_fields = adl_logging::session_locked_field_names(&patch, &state.log_overrides);
    let full_change = adl_logging::LogSettingsChange::from_patch(&patch);
    let log_change = adl_logging::lock_out_session_overrides(&full_change, &state.log_overrides);
    // 回滚锚点：落盘失败时把运行期恢复到补丁前的值（best-effort，Phase 4 F1）。
    let previous_log_config = state.log_manager.config().ok();
    state
        .log_manager
        .apply_change(&log_change)
        .map_err(|e| AppError::Config(format!("failed to apply log settings: {e}")))?;
    // 2) 应用补丁到内存 config（与 ad-server 共用同一字段映射）。
    //    回滚锚点 + 落盘副本在同一次写锁临界区内取得（Phase 4 D8）：省一次加锁与
    //    全量 clone，且两者互斥一致（watcher 线程也可能并发写内存，不可分两次读）。
    let (previous_config, config_clone) = {
        let mut config =
            state.config.write().map_err(|_| AppError::Internal("config lock poisoned".into()))?;
        let previous = config.clone();
        config.apply_patch(&patch);
        let snapshot = config.clone();
        (previous, snapshot)
    };
    // 3) 落盘 + 广播 ConfigChanged。
    //    落盘前剥离会话覆盖泄漏（Closing M1）：被锁且补丁未提供的字段恢复磁盘值。
    let config_dir = state.storage.paths().config_dir.clone();
    let overrides = state.log_overrides;
    let persist_result = tokio::task::spawn_blocking(move || {
        let to_save = match adl_kernel::config::load_from(&config_dir) {
            Ok(disk) => {
                adl_kernel::config::resolve_persisted_config(&config_clone, &patch, &overrides, &disk)
            },
            Err(e) => {
                // 预读失败也走剥离（Closing N2）：用默认磁盘值而非内存原样保存，
                // 否则 M1 泄漏在该异常路径重现（读不到盘时 save 多半也会失败，
                // 回滚路径兜底；此处先保证"能落盘即不泄漏"）。
                tracing::warn!(error = %e, "persist pre-read failed, stripping locked fields against defaults");
                adl_kernel::config::resolve_persisted_config(
                    &config_clone,
                    &patch,
                    &overrides,
                    &adl_kernel::config::AppConfig::default(),
                )
            },
        };
        crate::setup::save_config_to_dir(&config_dir, &to_save)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?
    .map_err(|e| AppError::Config(e.to_string()));
    if let Err(persist_error) = persist_result {
        // 落盘失败：回滚运行期 + 内存，避免"当时似乎生效、重启又没了"的
        //  confusing 行为（回滚本身 best-effort，失败仅告警；仅恢复本次应用字段）。
        if let Some(previous) = previous_log_config {
            let rollback = adl_logging::LogSettingsChange::rollback_for(&log_change, &previous);
            if !rollback.is_empty() {
                if let Err(e) = state.log_manager.apply_change(&rollback) {
                    tracing::warn!(error = %e, "persist failed and runtime rollback failed");
                }
            }
        }
        if let Ok(mut config) =
            state.config.write().map_err(|_| AppError::Internal("config lock poisoned".into()))
        {
            *config = previous_config;
        }
        // 保留原始错误信息（磁盘满/权限等根因应在 UI 错误卡可见，Phase 4 R1）。
        return Err(persist_error);
    }
    // 落盘完成即释放写锁：转发与 workspace 获取是只读下游，不必串行化。
    drop(_write_guard);
    // 4) 把日志字段推给 adl-server 子进程（运行期同步；后台发送，失败仅告警，
    //    见 helper 注释）。转发完整变更：server 侧用同样的锁定语义自行丢弃被锁字段。
    if let Some(base_url) = state.ad_server.base_url() {
        forward_log_settings_to_server(adl_server_http_client(), base_url, full_change);
    }
    state.event_bus.emit(adl_kernel::events::AppEvent::ConfigChanged);
    let current_workspace = fetch_current_workspace(&state).await;
    let info = build_app_info(&state, current_workspace)?;
    Ok(ipc(Ok(UpdatePreferencesResult { info, session_locked_fields: locked_fields })))
}

pub fn build_app_info(
    state: &AppState,
    current_workspace: Option<WorkspaceMeta>,
) -> Result<AppInfo, AppError> {
    let config =
        state.config.read().map_err(|_| AppError::Internal("config lock poisoned".into()))?;
    // verbatim 前缀剥离留在 shell 侧（helper 属 workspace crate，kernel 不得反向依赖）。
    let current_workspace = current_workspace.map(|mut w| {
        w.path = strip_verbatim_prefix(&w.path);
        w.root_path = strip_verbatim_prefix(&w.root_path);
        w
    });
    Ok(adl_kernel::app_info::build(&config, current_workspace))
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

#[cfg(test)]
mod server_info_tests {
    use super::*;

    #[test]
    fn log_settings_patch_body_carries_only_log_fields() {
        let change = adl_logging::LogSettingsChange {
            log_level: Some(adl_types::types::config::LogLevel::Trace),
            terminal_log_mode: Some(adl_types::LogMode::Multi),
            debug_log_mode: None,
        };
        let body = log_settings_patch_body(&change);
        assert_eq!(body.log_level, Some(adl_types::types::config::LogLevel::Trace));
        assert_eq!(body.terminal_log_mode, Some(adl_types::LogMode::Multi));
        assert_eq!(body.debug_log_mode, None);
        // 其余字段必须为空 —— 该端点只做运行时应用，不得携带会落盘的无关字段。
        let json = serde_json::to_value(&body).unwrap();
        assert_eq!(json["language"], serde_json::Value::Null);
        assert_eq!(json["themeMode"], serde_json::Value::Null);
        assert_eq!(json["keybinds"], serde_json::Value::Null);
        assert_eq!(json["fonts"], serde_json::Value::Null);
    }

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
    use adl_types::ConfigSnapshot;
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
        assert_eq!(snap.browser_inactive_tab_suspend_ms, 900_000);
    }

    #[test]
    fn config_snapshot_serializes_workspace_loading_fields() {
        let snap = ConfigSnapshot {
            language: "zh-CN".into(),
            theme_mode: adl_types::ThemeMode::System,
            resolved_theme: adl_types::Theme::Light,
            log_level: adl_types::types::config::LogLevel::Info,
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
            link_open_method: Default::default(),
            file_open_method: Default::default(),
            agent_link_intercept: false,
            agent_site_whitelist: vec![],
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
