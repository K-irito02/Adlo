use adl_errors::AppError;
use adl_logging::LogMode;
use adl_types::permission_types::PermissionRulesetConfig;
use adl_types::types::agent::AgentConfig;
use adl_types::types::reference::ReferenceConfig;
use adl_types::types::{ModelPreferences, ThemeMode};
use adl_types::CommandConfig;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use ts_rs::TS;

const DEFAULT_LANGUAGE: &str = "zh-CN";
const DEFAULT_LOG_LEVEL: &str = "info";
const DEFAULT_MAX_RECENT_WORKSPACES: usize = 10;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]

pub struct AppConfig {
    pub language: String,
    pub theme_mode: ThemeMode,
    pub log_level: String,
    /// 终端日志模式（派生为 LogConfig.terminal_log_mode）。
    #[serde(default)]
    pub terminal_log_mode: LogMode,
    /// 调试日志模式（派生为 LogConfig.debug_log_mode）。
    #[serde(default)]
    pub debug_log_mode: LogMode,
    pub max_recent_workspaces: usize,
    #[serde(default)]
    pub model_preferences: ModelPreferences,
    /// User-defined slash commands.
    #[serde(default)]
    pub commands: Vec<CommandConfig>,
    /// Permission ruleset configuration.
    #[serde(default)]
    pub permissions: PermissionRulesetConfig,
    /// Reference directories (extra accessible paths).
    #[serde(default)]
    #[ts(skip)]
    pub references: Vec<ReferenceConfig>,
    /// User-defined custom agent configurations.
    #[serde(default)]
    #[ts(skip)]
    pub custom_agents: Vec<AgentConfig>,
    /// User-defined keyboard shortcuts (command ID → keybinding string).
    #[serde(default)]
    pub keybinds: std::collections::BTreeMap<String, String>,
    /// User-defined font preferences.
    #[serde(default)]
    pub fonts: adl_types::types::config::FontPreferences,
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
        }
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            language: DEFAULT_LANGUAGE.into(),
            theme_mode: ThemeMode::System,
            log_level: DEFAULT_LOG_LEVEL.into(),
            terminal_log_mode: LogMode::default(),
            debug_log_mode: LogMode::default(),
            max_recent_workspaces: DEFAULT_MAX_RECENT_WORKSPACES,
            model_preferences: ModelPreferences::default(),
            commands: Vec::new(),
            permissions: PermissionRulesetConfig::default(),
            references: Vec::new(),
            custom_agents: Vec::new(),
            keybinds: std::collections::BTreeMap::new(),
            fonts: adl_types::types::config::FontPreferences::default(),
        }
    }
}

pub fn config_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("config")
}

pub fn config_path(data_dir: &Path) -> PathBuf {
    config_dir(data_dir).join("config.json")
}

pub fn load(data_dir: &Path) -> Result<AppConfig, AppError> {
    let path = config_path(data_dir);
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

pub fn save(data_dir: &Path, config: &AppConfig) -> Result<(), AppError> {
    let dir = config_dir(data_dir);
    std::fs::create_dir_all(&dir)?;
    let path = config_path(data_dir);
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
        save(&dir, &cfg).unwrap();
        let loaded = load(&dir).unwrap();
        assert_eq!(loaded.language, "zh-CN");
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
}

#[cfg(test)]
mod config_extension_tests {
    use super::*;
    use adl_types::types::agent::AgentId;
    use adl_types::types::commands::CommandConfig;

    #[test]
    fn app_config_has_commands_field() {
        let config = AppConfig::default();
        assert!(config.commands.is_empty());
        assert!(config.permissions.include_defaults);
    }

    #[test]
    fn app_config_with_custom_commands() {
        let config = AppConfig {
            language: "en-US".into(),
            theme_mode: adl_types::types::config::ThemeMode::Light,
            log_level: "debug".into(),
            terminal_log_mode: adl_logging::LogMode::Overwrite,
            debug_log_mode: adl_logging::LogMode::Overwrite,
            max_recent_workspaces: 10,
            model_preferences: adl_types::types::config::ModelPreferences::default(),
            commands: vec![CommandConfig {
                name: "deploy".to_string(),
                description: "Deploy to production".to_string(),
                agent: AgentId::Build,
                model: None,
                template: "Deploy $ARGUMENTS to production".to_string(),
                subtask: false,
                hints: vec![],
            }],
            permissions: adl_types::permission_types::PermissionRulesetConfig::default(),
            references: vec![],
            custom_agents: vec![],
            keybinds: std::collections::BTreeMap::new(),
            fonts: adl_types::types::config::FontPreferences::default(),
        };
        assert_eq!(config.commands.len(), 1);
        assert_eq!(config.commands[0].name, "deploy");
    }
}
