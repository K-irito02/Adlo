use crate::types::{ModelPreferences, ThemeMode};
use adl_errors::AppError;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub language: String,
    pub theme_mode: ThemeMode,
    pub log_level: String,
    pub max_recent_workspaces: usize,
    #[serde(default)]
    pub model_preferences: ModelPreferences,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            language: "zh-CN".into(),
            theme_mode: ThemeMode::System,
            log_level: "info".into(),
            max_recent_workspaces: 10,
            model_preferences: ModelPreferences::default(),
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
        AppError::Config(format!("Failed to parse config; falling back requires a valid rewrite: {e}"))
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
