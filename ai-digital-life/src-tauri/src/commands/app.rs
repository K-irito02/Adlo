use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use adl_errors::AppError;
use adl_types::{
    APP_NAME, AppInfo, AppPreferencePatch, ConfigSnapshot, EventDiagnostics, HealthComponent,
    HealthSnapshot, HealthStatus, IpcResult, LogEntrySummary, MigrationDiagnostics,
    ModelGatewayHealthSnapshot, RuntimeDiagnosticsSnapshot, RuntimeLifecycleSnapshot, now_ms,
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

/// 将单个 provider 的 preference patch 合并到已有配置；`None` 字段保持原值不变。
fn apply_model_patch(
    entry: &mut adl_types::ModelProviderPreference,
    patch: adl_types::ModelProviderPreferencePatch,
) {
    if let Some(enabled) = patch.enabled {
        entry.enabled = enabled;
    }
    if let Some(priority) = patch.priority {
        entry.priority = priority;
    }
    if let Some(model_id) = patch.model_id {
        entry.model_id = model_id;
    }
    if let Some(enabled_models) = patch.enabled_models {
        entry.enabled_models = enabled_models;
    }
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
                            enabled_models: None,
                        }
                    });
                apply_model_patch(entry, patch);
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
            max_concurrent_workspaces: config.max_concurrent_workspaces,
            workspace_priority_ids: config.workspace_priority_ids.clone(),
            workspace_deferred_ids: config.workspace_deferred_ids.clone(),
            workspace_natural_order: config.workspace_natural_order.clone(),
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
    let data_dir = state.data_dir.clone();
    tokio::task::spawn_blocking(move || crate::setup::save_config_to_dir(&data_dir, &config_clone))
        .await
        .map_err(|e| format!("spawn_blocking failed: {e}"))?
        .map_err(|e| e.to_string())?;

    Ok(())
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
    fn config_snapshot_deserializes_old_format_with_defaults() {
        let json = r#"{
            "language": "zh-CN",
            "themeMode": "system",
            "resolvedTheme": "light",
            "logLevel": "info",
            "terminalLogMode": "overwrite",
            "debugLogMode": "overwrite",
            "maxRecentWorkspaces": 10,
            "modelPreferences": { "providers": {} },
            "keybinds": {},
            "fonts": {}
        }"#;
        let snap: ConfigSnapshot = serde_json::from_str(json).unwrap();
        assert_eq!(snap.max_concurrent_workspaces, 6);
        assert!(snap.workspace_priority_ids.is_empty());
        assert!(snap.workspace_deferred_ids.is_empty());
        assert!(snap.workspace_natural_order.is_empty());
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
            model_preferences: adl_types::ModelPreferences::default(),
            keybinds: std::collections::BTreeMap::new(),
            fonts: adl_types::types::config::FontPreferences::default(),
            max_concurrent_workspaces: 4,
            workspace_priority_ids: vec!["a".into()],
            workspace_deferred_ids: vec!["b".into()],
            workspace_natural_order: vec!["c".into()],
        };
        let json = serde_json::to_string(&snap).unwrap();
        assert!(json.contains("\"maxConcurrentWorkspaces\":4"));
        assert!(json.contains("\"workspacePriorityIds\":[\"a\"]"));
        assert!(json.contains("\"workspaceDeferredIds\":[\"b\"]"));
        assert!(json.contains("\"workspaceNaturalOrder\":[\"c\"]"));
    }
}

#[cfg(test)]
mod model_preference_patch_tests {
    use super::*;
    use adl_types::{ModelProviderPreference, ModelProviderPreferencePatch};

    fn entry() -> ModelProviderPreference {
        ModelProviderPreference {
            enabled: true,
            priority: 5,
            model_id: "default".into(),
            enabled_models: Some(vec!["old".into()]),
        }
    }

    #[test]
    fn enabled_models_some_replaces_list_entirely() {
        let mut entry = entry();
        apply_model_patch(
            &mut entry,
            ModelProviderPreferencePatch {
                enabled: None,
                priority: None,
                model_id: None,
                enabled_models: Some(Some(vec!["a".into(), "b".into()])),
            },
        );
        assert_eq!(entry.enabled_models, Some(vec!["a".to_string(), "b".to_string()]));
        assert!(entry.enabled);
        assert_eq!(entry.priority, 5);
        assert_eq!(entry.model_id, "default");
    }

    #[test]
    fn enabled_models_some_empty_clears_list() {
        let mut entry = entry();
        apply_model_patch(
            &mut entry,
            ModelProviderPreferencePatch {
                enabled: None,
                priority: None,
                model_id: None,
                enabled_models: Some(Some(vec![])),
            },
        );
        assert_eq!(entry.enabled_models, Some(vec![]));
        assert!(entry.enabled);
        assert_eq!(entry.priority, 5);
        assert_eq!(entry.model_id, "default");
    }

    #[test]
    fn enabled_models_none_leaves_list_unchanged() {
        let mut entry = entry();
        apply_model_patch(
            &mut entry,
            ModelProviderPreferencePatch {
                enabled: None,
                priority: None,
                model_id: None,
                enabled_models: None,
            },
        );
        assert_eq!(entry.enabled_models, Some(vec!["old".to_string()]));
        assert!(entry.enabled);
        assert_eq!(entry.priority, 5);
        assert_eq!(entry.model_id, "default");
    }

    #[test]
    fn other_fields_apply_independently_alongside_enabled_models() {
        let mut entry = entry();
        apply_model_patch(
            &mut entry,
            ModelProviderPreferencePatch {
                enabled: Some(false),
                priority: Some(99),
                model_id: Some("gpt-4".into()),
                enabled_models: Some(Some(vec!["gpt-4".into()])),
            },
        );
        assert!(!entry.enabled);
        assert_eq!(entry.priority, 99);
        assert_eq!(entry.model_id, "gpt-4");
        assert_eq!(entry.enabled_models, Some(vec!["gpt-4".to_string()]));
    }

    #[test]
    fn enabled_models_explicit_none_sets_all_enabled() {
        let mut entry = entry();
        apply_model_patch(
            &mut entry,
            ModelProviderPreferencePatch {
                enabled: None,
                priority: None,
                model_id: None,
                enabled_models: Some(None),
            },
        );
        assert!(entry.enabled_models.is_none());
        assert_eq!(entry.enabled_models, None);
    }
}
