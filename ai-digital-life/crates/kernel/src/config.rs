use crate::types::agent::AgentConfig;
use crate::types::reference::ReferenceConfig;
use crate::types::{ModelPreferences, ThemeMode};
use adl_logging::LogMode;
use crate::CommandConfig;
use crate::PermissionRulesetConfig;
use adl_errors::AppError;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
pub struct AppConfig {
    pub language: String,
    pub theme_mode: ThemeMode,
    pub log_level: String,
    #[serde(default)]
    pub terminal_log_mode: LogMode,
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
    pub fonts: crate::types::config::FontPreferences,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            language: "zh-CN".into(),
            theme_mode: ThemeMode::System,
            log_level: "info".into(),
            terminal_log_mode: LogMode::default(),
            debug_log_mode: LogMode::default(),
            max_recent_workspaces: 10,
            model_preferences: ModelPreferences::default(),
            commands: Vec::new(),
            permissions: PermissionRulesetConfig::default(),
            references: Vec::new(),
            custom_agents: Vec::new(),
            keybinds: std::collections::BTreeMap::new(),
            fonts: crate::types::config::FontPreferences::default(),
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
}

#[cfg(test)]
mod config_extension_tests {
    use super::*;
    use crate::types::agent::AgentId;
    use crate::types::commands::CommandConfig;

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
            theme_mode: crate::types::config::ThemeMode::Light,
            log_level: "debug".into(),
            terminal_log_mode: adl_logging::LogMode::Overwrite,
            debug_log_mode: adl_logging::LogMode::Overwrite,
            max_recent_workspaces: 10,
            model_preferences: crate::types::config::ModelPreferences::default(),
            commands: vec![CommandConfig {
                name: "deploy".to_string(),
                description: "Deploy to production".to_string(),
                agent: AgentId::Build,
                model: None,
                template: "Deploy $ARGUMENTS to production".to_string(),
                subtask: false,
                hints: vec![],
            }],
            permissions: crate::PermissionRulesetConfig::default(),
            references: vec![],
            custom_agents: vec![],
            keybinds: std::collections::BTreeMap::new(),
            fonts: crate::types::config::FontPreferences::default(),
        };
        assert_eq!(config.commands.len(), 1);
        assert_eq!(config.commands[0].name, "deploy");
    }
}
