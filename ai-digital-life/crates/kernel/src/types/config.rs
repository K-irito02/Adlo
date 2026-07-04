use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    Light,
    Dark,
    System,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "kebab-case")]
pub enum LanguageCode {
    ZhCn,
    EnUs,
}

impl LanguageCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ZhCn => "zh-CN",
            Self::EnUs => "en-US",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

/// 日志文件写入模式
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, Default)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "snake_case")]
pub enum LogMode {
    /// 每次启动覆盖文件
    #[default]
    Overwrite,
    /// 每次启动追加到文件
    Append,
    /// 每次启动创建独立会话文件
    Multi,
}

impl std::str::FromStr for LogMode {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "overwrite" => Ok(Self::Overwrite),
            "append" => Ok(Self::Append),
            "multi" => Ok(Self::Multi),
            other => Err(format!("Invalid LogMode: {other}. Expected overwrite|append|multi")),
        }
    }
}

impl std::fmt::Display for LogMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Overwrite => write!(f, "overwrite"),
            Self::Append => write!(f, "append"),
            Self::Multi => write!(f, "multi"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, Hash, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "lowercase")]
pub enum ModelProviderId {
    Deepseek,
    Minimax,
}

impl ModelProviderId {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Deepseek => "deepseek",
            Self::Minimax => "minimax",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderPreference {
    pub enabled: bool,
    pub priority: i32,
    pub model_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct ModelPreferences {
    pub providers: std::collections::BTreeMap<ModelProviderId, ModelProviderPreference>,
}

impl Default for ModelPreferences {
    fn default() -> Self {
        let mut providers = std::collections::BTreeMap::new();
        providers.insert(
            ModelProviderId::Deepseek,
            ModelProviderPreference {
                enabled: true,
                priority: 1,
                model_id: "deepseek-v4-pro".to_string(),
            },
        );
        providers.insert(
            ModelProviderId::Minimax,
            ModelProviderPreference {
                enabled: true,
                priority: 2,
                model_id: "MiniMax-M2.7".to_string(),
            },
        );
        Self { providers }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct AppPreferencePatch {
    pub language: Option<String>,
    pub theme_mode: Option<ThemeMode>,
    pub log_level: Option<String>,
    pub terminal_log_mode: Option<LogMode>,
    pub debug_log_mode: Option<LogMode>,
    pub model_preferences:
        Option<std::collections::BTreeMap<ModelProviderId, ModelProviderPreferencePatch>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderPreferencePatch {
    pub enabled: Option<bool>,
    pub priority: Option<i32>,
    pub model_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct ConfigSnapshot {
    pub language: String,
    pub theme_mode: ThemeMode,
    pub resolved_theme: Theme,
    pub log_level: String,
    pub terminal_log_mode: LogMode,
    pub debug_log_mode: LogMode,
    pub max_recent_workspaces: usize,
    pub model_preferences: ModelPreferences,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub app_name: String,
    pub version: String,
    pub config: ConfigSnapshot,
    pub current_workspace: Option<super::WorkspaceMeta>,
    pub recent_logs: Vec<LogEntrySummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct LogEntrySummary {
    pub timestamp: super::TimestampMs,
    pub level: String,
    pub scope: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ConfigTransform {
    SetLanguage { language: String },
    SetTheme { theme_mode: ThemeMode },
    SetLogLevel { log_level: String },
    SetPreference { key: String, value: serde_json::Value },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_transform_serializes_correctly() {
        let t = ConfigTransform::SetLanguage { language: "en-US".into() };
        let json = serde_json::to_string(&t).unwrap();
        assert!(json.contains("SET_LANGUAGE"));
        assert!(json.contains("en-US"));
    }
}
