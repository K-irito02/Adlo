use crate::commands::ipc;
use crate::state::AppState;
use adl_errors::AppError;
use adl_kernel::{
    now_ms, AppInfo, AppPreferencePatch, ConfigSnapshot, EventDiagnostics, HealthComponent,
    HealthSnapshot, HealthStatus, IpcResult, LogEntrySummary, MigrationDiagnostics,
    ModelGatewayHealthSnapshot, RuntimeDiagnosticsSnapshot, RuntimeLifecycleSnapshot, APP_NAME,
};
use tauri::Manager;

#[tauri::command]
pub fn app_get_info(state: tauri::State<'_, AppState>) -> IpcResult<AppInfo> {
    ipc(build_app_info(&state))
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
                detail: "SQLite connection is open.".into(),
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

#[tauri::command]
pub fn app_get_model_health(
    state: tauri::State<'_, AppState>,
) -> IpcResult<ModelGatewayHealthSnapshot> {
    crate::commands::ipc_try(|| {
        let config =
            state.config.read().map_err(|_| AppError::Internal("config lock poisoned".into()))?;
        let gateway = adl_model_gateway::ModelGateway::new(config.model_preferences.clone())?;
        Ok(gateway.health())
    })
}

#[tauri::command]
pub fn app_update_preferences(
    state: tauri::State<'_, AppState>,
    patch: AppPreferencePatch,
) -> IpcResult<AppInfo> {
    crate::commands::ipc_try(|| {
        {
            let mut config = state
                .config
                .write()
                .map_err(|_| AppError::Internal("config lock poisoned".into()))?;
            if let Some(language) = patch.language {
                config.language = language;
            }
            if let Some(mode) = patch.theme_mode {
                config.theme_mode = mode;
            }
            if let Some(level) = patch.log_level {
                config.log_level = level;
            }
            if let Some(model_preferences) = patch.model_preferences {
                for (provider, patch) in model_preferences {
                    let entry =
                        config.model_preferences.providers.entry(provider).or_insert_with(|| {
                            adl_kernel::ModelProviderPreference {
                                enabled: true,
                                priority: 10,
                                model_id: provider.as_str().to_string(),
                            }
                        });
                    if let Some(enabled) = patch.enabled {
                        entry.enabled = enabled;
                    }
                    if let Some(priority) = patch.priority {
                        entry.priority = priority;
                    }
                    if let Some(model_id) = patch.model_id {
                        entry.model_id = model_id;
                    }
                }
            }
        }

        crate::setup::save_config(&state).map_err(|e| AppError::Config(e.to_string()))?;
        state.event_bus.emit(adl_events::AppEvent::ConfigChanged);
        build_app_info(&state)
    })
}

pub fn build_app_info(state: &AppState) -> Result<AppInfo, AppError> {
    let config =
        state.config.read().map_err(|_| AppError::Internal("config lock poisoned".into()))?;
    let resolved = match config.theme_mode {
        adl_kernel::ThemeMode::Light => adl_kernel::Theme::Light,
        adl_kernel::ThemeMode::Dark => adl_kernel::Theme::Dark,
        adl_kernel::ThemeMode::System => adl_kernel::Theme::Light,
    };
    let current_workspace = state
        .current_workspace
        .read()
        .map_err(|_| AppError::Internal("workspace lock poisoned".into()))?
        .clone();
    Ok(AppInfo {
        app_name: APP_NAME.into(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        config: ConfigSnapshot {
            language: config.language.clone(),
            theme_mode: config.theme_mode,
            resolved_theme: resolved,
            log_level: config.log_level.clone(),
            max_recent_workspaces: config.max_recent_workspaces,
            model_preferences: config.model_preferences.clone(),
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

/// 写入调试日志到当前项目目录
#[tauri::command]
pub fn write_debug_logs_to_project(
    state: tauri::State<AppState>,
    content: String,
) -> Result<(), String> {
    use std::fs;
    use std::path::PathBuf;

    // 获取当前工作区
    let workspace_guard = state.current_workspace.read().map_err(|e| e.to_string())?;
    let Some(workspace) = workspace_guard.as_ref() else {
        return Err("No workspace open".to_string());
    };

    // 日志文件路径: 项目根目录/debug-logs.txt
    use std::path::Path;
    let log_file: PathBuf = Path::new(&workspace.root_path).join("debug-logs.txt");

    // 写入文件（覆盖）
    fs::write(&log_file, content).map_err(|e| e.to_string())?;

    tracing::info!("Debug logs written to project: {:?}", log_file);
    Ok(())
}

/// 写入调试日志到文件
#[tauri::command]
pub fn write_debug_logs(app: tauri::AppHandle, content: String) -> Result<(), String> {
    use std::fs;
    use std::path::PathBuf;

    // 获取应用数据目录
    let log_dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("debug-logs");

    // 创建目录（如果不存在）
    fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;

    // 生成文件名（时间戳）
    let timestamp = chrono_lite_timestamp();
    let log_file: PathBuf = log_dir.join(format!("debug-{}.log", timestamp));

    // 写入文件
    fs::write(&log_file, content).map_err(|e| e.to_string())?;

    tracing::info!("Debug logs written to: {:?}", log_file);
    Ok(())
}

fn chrono_lite_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let secs = duration.as_secs();
    let millis = duration.subsec_millis();
    format!("{}-{}", secs, millis)
}
