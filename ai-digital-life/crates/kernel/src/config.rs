use adl_errors::AppError;
use adl_logging::LogMode;
use adl_types::CommandConfig;
use adl_types::types::ThemeMode;
use adl_types::types::config::{AppPreferencePatch, LogLevel};
use adl_types::types::reference::ReferenceConfig;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use ts_rs::TS;

/// 与前端 `shared/defaultPreferences.ts::DEFAULT_LANGUAGE` 同一产品默认（`"system"` =
/// 跟随系统语言，前端经 `i18n/resolveLanguage.ts` 解析 zh* → zh-CN，其余 → en-US）。
/// 改动时两处必须同步（跨语言契约）。
const DEFAULT_LANGUAGE: &str = "system";
const DEFAULT_MAX_RECENT_WORKSPACES: usize = 10;

fn default_max_concurrent_workspaces() -> usize {
    6
}

/// 与前端 `DEFAULT_BROWSER_SUSPEND_MS` 是同一产品默认（15 分钟 = 900_000）。
/// 改动时两处必须同步（跨语言契约：Rust 侧 `app.rs` 断言字面量，前端钉值测试）。
fn default_browser_inactive_tab_suspend_ms() -> u64 {
    900_000
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]

pub struct AppConfig {
    pub language: String,
    pub theme_mode: ThemeMode,
    /// 日志详细程度（派生为 LogConfig.log_level）。缺省 = `info`。
    #[serde(default)]
    pub log_level: LogLevel,
    /// 终端日志模式（派生为 LogConfig.terminal_log_mode）。
    #[serde(default)]
    pub terminal_log_mode: LogMode,
    /// 调试日志模式（派生为 LogConfig.debug_log_mode）。
    #[serde(default)]
    pub debug_log_mode: LogMode,
    pub max_recent_workspaces: usize,
    /// User-defined slash commands.
    #[serde(default)]
    pub commands: Vec<CommandConfig>,
    /// Reference directories (extra accessible paths).
    #[serde(default)]
    #[ts(skip)]
    pub references: Vec<ReferenceConfig>,
    /// User-defined keyboard shortcuts (command ID → keybinding string).
    #[serde(default)]
    pub keybinds: std::collections::BTreeMap<String, String>,
    /// User-defined font preferences.
    #[serde(default)]
    pub fonts: adl_types::types::config::FontPreferences,
    /// Maximum concurrent workspace loads during the priority (startup) phase.
    #[serde(default = "default_max_concurrent_workspaces")]
    pub max_concurrent_workspaces: usize,
    /// Workspace IDs loaded synchronously at startup (blocks first screen).
    #[serde(default)]
    pub workspace_priority_ids: Vec<String>,
    /// Workspace IDs loaded asynchronously after first screen is ready.
    #[serde(default)]
    pub workspace_deferred_ids: Vec<String>,
    /// Workspace IDs loaded after priority and deferred phases complete.
    /// Default order: newest-added first (user can customize via drag-and-drop).
    #[serde(default)]
    pub workspace_natural_order: Vec<String>,
    /// Browser 标签页空闲挂起阈值（毫秒）。默认 15 分钟（900_000），供 tab suspend 调度器读取。
    #[serde(default = "default_browser_inactive_tab_suspend_ms")]
    pub browser_inactive_tab_suspend_ms: u64,
}

impl AppConfig {
    /// 从 AppConfig 提取 LogConfig（日志子系统运行时视图）。
    ///
    /// 所有权关系：AppConfig 是配置真源，LogConfig 是其子视图。
    /// 调用方应通过此方法派生 LogConfig，避免手动复制字段导致不一致。
    pub fn to_log_config(&self) -> adl_logging::config::LogConfig {
        adl_logging::config::LogConfig {
            terminal_log_mode: self.terminal_log_mode,
            debug_log_mode: self.debug_log_mode,
            log_level: self.log_level,
        }
    }

    /// 应用会话级日志覆盖（CLI flag / 环境变量）：**只改内存，不落盘**。
    /// `RUST_LOG` 的优先级由 `LogManager` 内部处理（作为全局基础 filter）。
    pub fn apply_log_overrides(&mut self, overrides: &adl_logging::LogOverrides) {
        let mut log_config = self.to_log_config();
        overrides.apply(&mut log_config);
        self.log_level = log_config.log_level;
        self.terminal_log_mode = log_config.terminal_log_mode;
        self.debug_log_mode = log_config.debug_log_mode;
    }

    /// 应用偏好补丁（shell 的 `app_update_preferences` 与 ad-server 的
    /// `/app/preferences` 共用，杜绝两份字段映射漂移）。
    ///
    /// 仅覆盖补丁中显式提供的字段；`fonts` 逐子字段覆盖（不整体替换）。
    /// 日志字段的**运行时生效**由调用方转交 `LogManager`（见
    /// [`LogSettingsChange`]），本方法只改内存配置。
    pub fn apply_patch(&mut self, patch: &AppPreferencePatch) {
        if let Some(language) = patch.language.as_ref() {
            self.language = language.clone();
        }
        if let Some(mode) = patch.theme_mode {
            self.theme_mode = mode;
        }
        if let Some(level) = patch.log_level {
            self.log_level = level;
        }
        if let Some(mode) = patch.terminal_log_mode {
            self.terminal_log_mode = mode;
        }
        if let Some(mode) = patch.debug_log_mode {
            self.debug_log_mode = mode;
        }
        if let Some(keybinds) = patch.keybinds.as_ref() {
            self.keybinds = keybinds.clone();
        }
        if let Some(fonts) = patch.fonts.as_ref() {
            if fonts.ui_font.is_some() {
                self.fonts.ui_font = fonts.ui_font.clone();
            }
            if fonts.code_font.is_some() {
                self.fonts.code_font = fonts.code_font.clone();
            }
            if fonts.terminal_font.is_some() {
                self.fonts.terminal_font = fonts.terminal_font.clone();
            }
        }
        if let Some(v) = patch.max_concurrent_workspaces {
            self.max_concurrent_workspaces = v.clamp(1, 20);
        }
        if let Some(v) = patch.workspace_priority_ids.as_ref() {
            self.workspace_priority_ids = v.clone();
        }
        if let Some(v) = patch.workspace_deferred_ids.as_ref() {
            self.workspace_deferred_ids = v.clone();
        }
        if let Some(v) = patch.workspace_natural_order.as_ref() {
            self.workspace_natural_order = v.clone();
        }
        if let Some(v) = patch.browser_inactive_tab_suspend_ms {
            self.browser_inactive_tab_suspend_ms = v;
        }
    }
}

// 需要同步到 `LogManager` 的日志字段变更集见 `adl_logging::LogSettingsChange`。

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            language: DEFAULT_LANGUAGE.into(),
            theme_mode: ThemeMode::System,
            log_level: LogLevel::default(),
            terminal_log_mode: LogMode::default(),
            debug_log_mode: LogMode::default(),
            max_recent_workspaces: DEFAULT_MAX_RECENT_WORKSPACES,
            commands: Vec::new(),
            references: Vec::new(),
            keybinds: std::collections::BTreeMap::new(),
            fonts: adl_types::types::config::FontPreferences::default(),
            max_concurrent_workspaces: default_max_concurrent_workspaces(),
            workspace_priority_ids: Vec::new(),
            workspace_deferred_ids: Vec::new(),
            workspace_natural_order: Vec::new(),
            browser_inactive_tab_suspend_ms: default_browser_inactive_tab_suspend_ms(),
        }
    }
}

pub fn config_path_for(config_dir: &Path) -> PathBuf {
    config_dir.join("config.json")
}

pub fn load_from(config_dir: &Path) -> Result<AppConfig, AppError> {
    let path = config_path_for(config_dir);
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| AppError::Config(format!("Failed to read config: {e}")))?;
    serde_json::from_str(&content).map_err(|e| {
        AppError::Config(format!(
            "Failed to parse config; falling back requires a valid rewrite: {e}"
        ))
    })
}

pub fn save_to(config_dir: &Path, config: &AppConfig) -> Result<(), AppError> {
    std::fs::create_dir_all(config_dir)?;
    let path = config_path_for(config_dir);
    let content = serde_json::to_string_pretty(config)?;
    std::fs::write(&path, content)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env::temp_dir;

    #[test]
    fn default_config_round_trips() {
        let dir = temp_dir().join("adl-config-test");
        let _ = std::fs::remove_dir_all(&dir);
        let cfg = AppConfig::default();
        save_to(&dir, &cfg).unwrap();
        let loaded = load_from(&dir).unwrap();
        assert_eq!(loaded.language, DEFAULT_LANGUAGE);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn to_log_config_derives_correct_modes() {
        let config = AppConfig {
            terminal_log_mode: LogMode::Overwrite,
            debug_log_mode: LogMode::Multi,
            ..Default::default()
        };
        let log_config = config.to_log_config();
        assert_eq!(log_config.terminal_log_mode, LogMode::Overwrite);
        assert_eq!(log_config.debug_log_mode, LogMode::Multi);
    }

    #[test]
    fn load_save_accept_config_dir_directly() {
        let dir = temp_dir().join("adl-config-dir-direct-test");
        let cfg_dir = dir.join("custom-config");
        let _ = std::fs::remove_dir_all(&dir);
        let cfg = AppConfig::default();
        save_to(&cfg_dir, &cfg).unwrap();
        assert!(config_path_for(&cfg_dir).exists());
        let loaded = load_from(&cfg_dir).unwrap();
        assert_eq!(loaded.language, DEFAULT_LANGUAGE);
        let _ = std::fs::remove_dir_all(&dir);
    }
}

#[cfg(test)]
mod config_extension_tests {
    use super::*;
    use std::env::temp_dir;

    #[test]
    fn app_config_has_commands_field() {
        let config = AppConfig::default();
        assert!(config.commands.is_empty());
    }

    #[test]
    fn app_config_has_workspace_loading_fields_with_defaults() {
        let config = AppConfig::default();
        assert_eq!(config.max_concurrent_workspaces, 6);
        assert!(config.workspace_priority_ids.is_empty());
        assert!(config.workspace_deferred_ids.is_empty());
        assert!(config.workspace_natural_order.is_empty());
    }

    #[test]
    fn app_config_round_trips_workspace_loading_fields() {
        let dir = temp_dir().join("adl-config-workspace-loading-test");
        let _ = std::fs::remove_dir_all(&dir);
        let config = AppConfig {
            max_concurrent_workspaces: 4,
            workspace_priority_ids: vec!["ws-1".into(), "ws-2".into()],
            workspace_deferred_ids: vec!["ws-3".into()],
            workspace_natural_order: vec!["ws-4".into()],
            ..Default::default()
        };
        save_to(&dir, &config).unwrap();
        let loaded = load_from(&dir).unwrap();
        assert_eq!(loaded.max_concurrent_workspaces, 4);
        assert_eq!(loaded.workspace_priority_ids, vec!["ws-1".to_string(), "ws-2".to_string()]);
        assert_eq!(loaded.workspace_deferred_ids, vec!["ws-3".to_string()]);
        assert_eq!(loaded.workspace_natural_order, vec!["ws-4".to_string()]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn app_config_loads_old_config_without_workspace_fields() {
        // 模拟旧版本 config.json：不含 workspace loading 字段
        let dir = temp_dir().join("adl-config-old-format-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("config")).unwrap();
        let old_json = r#"{
            "language": "zh-CN",
            "theme_mode": "system",
            "log_level": "info",
            "terminal_log_mode": "overwrite",
            "debug_log_mode": "overwrite",
            "max_recent_workspaces": 10,
            "commands": [],
            "references": [],
            "keybinds": {},
            "fonts": {}
        }"#;
        std::fs::write(config_path_for(&dir), old_json).unwrap();
        let loaded = load_from(&dir).unwrap();
        assert_eq!(loaded.max_concurrent_workspaces, 6);
        assert!(loaded.workspace_priority_ids.is_empty());
        assert!(loaded.workspace_deferred_ids.is_empty());
        assert!(loaded.workspace_natural_order.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
