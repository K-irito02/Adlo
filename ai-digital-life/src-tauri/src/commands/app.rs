use crate::commands::ipc;
use crate::state::AppState;
use adl_errors::AppError;
use adl_types::{
    now_ms, AppInfo, AppPreferencePatch, ConfigSnapshot, EventDiagnostics, HealthComponent,
    HealthSnapshot, HealthStatus, IpcResult, LogEntrySummary, MigrationDiagnostics,
    ModelGatewayHealthSnapshot, RuntimeDiagnosticsSnapshot, RuntimeLifecycleSnapshot, APP_NAME,
};
use adl_workspace::strip_verbatim_prefix;
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
        let gateway = adl_model_gateway::ModelGateway::new(
            config.model_preferences.clone(),
            state.provider_registry.clone(),
        )?;
        Ok(gateway.health())
    })
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
        if let Some(model_preferences) = patch.model_preferences {
            for (provider, patch) in model_preferences {
                let provider_id = provider.clone();
                let entry =
                    config.model_preferences.providers.entry(provider).or_insert_with(|| {
                        adl_types::ModelProviderPreference {
                            enabled: true,
                            priority: 10,
                            model_id: provider_id.clone(),
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
    }
    let config_clone =
        state.config.read().map_err(|_| AppError::Internal("config lock poisoned".into()))?.clone();
    let data_dir = state.data_dir.clone();
    tokio::task::spawn_blocking(move || crate::setup::save_config_to_dir(&data_dir, &config_clone))
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?
        .map_err(|e| AppError::Config(e.to_string()))?;
    state.event_bus.emit(adl_kernel::events::AppEvent::ConfigChanged);
    let info = build_app_info(&state)?;
    Ok(ipc(Ok(info)))
}

pub fn build_app_info(state: &AppState) -> Result<AppInfo, AppError> {
    let config =
        state.config.read().map_err(|_| AppError::Internal("config lock poisoned".into()))?;
    let resolved = match config.theme_mode {
        adl_types::ThemeMode::Light => adl_types::Theme::Light,
        adl_types::ThemeMode::Dark => adl_types::Theme::Dark,
        adl_types::ThemeMode::System => adl_types::Theme::Light,
    };
    let current_workspace = state
        .current_workspace
        .read()
        .map_err(|_| AppError::Internal("workspace lock poisoned".into()))?
        .clone()
        .map(|mut w: adl_types::WorkspaceMeta| {
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
            model_preferences: config.model_preferences.clone(),
            keybinds: config.keybinds.clone(),
            fonts: config.fonts.clone(),
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
) -> Result<(), String> {
    state.log_manager.write_debug_logs(&content).map_err(|e| e.to_string())
}

/// 写入调试日志到文件（委托 LogManager）
#[tauri::command]
pub async fn write_debug_logs(app: tauri::AppHandle, content: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let log_manager = state.log_manager.clone();
    tokio::task::spawn_blocking(move || log_manager.write_debug_logs(&content))
        .await
        .map_err(|e| format!("spawn_blocking failed: {e}"))?
        .map_err(|e| e.to_string())
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
    let data_dir = state.data_dir.clone();
    tokio::task::spawn_blocking(move || crate::setup::save_config_to_dir(&data_dir, &config_clone))
        .await
        .map_err(|e| format!("spawn_blocking failed: {e}"))?
        .map_err(|e| e.to_string())?;

    Ok(())
}
