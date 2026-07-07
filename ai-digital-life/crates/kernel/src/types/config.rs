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

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct ModelDefinition {
    pub id: String,
    pub provider_id: String,
    pub name: String,
    #[ts(optional)]
    pub description: Option<String>,
    #[ts(optional)]
    pub context_window: Option<u32>,
    #[ts(optional)]
    pub max_output: Option<u32>,
    pub capabilities: Vec<ModelCapability>,
    #[ts(optional)]
    pub tier: Option<ModelTier>,
    #[ts(optional)]
    pub released: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "lowercase")]
pub enum ModelCapability {
    Text,
    Vision,
    ToolUse,
    Streaming,
    Reasoning,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "lowercase")]
pub enum ModelTier {
    Free,
    LowCost,
    Standard,
    Premium,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, Hash, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "lowercase")]
pub enum ModelProviderId {
    Deepseek,
    Minimax,
    Openai,
    Anthropic,
    Google,
    Ollama,
    Openrouter,
}

impl ModelProviderId {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Deepseek => "deepseek",
            Self::Minimax => "minimax",
            Self::Openai => "openai",
            Self::Anthropic => "anthropic",
            Self::Google => "google",
            Self::Ollama => "ollama",
            Self::Openrouter => "openrouter",
        }
    }
}

/// Returns the default model ID for a provider.
pub fn default_model_for_provider(provider: ModelProviderId) -> &'static str {
    match provider {
        ModelProviderId::Deepseek => "deepseek-chat",
        ModelProviderId::Minimax => "MiniMax-M2.7",
        ModelProviderId::Openai => "gpt-4o",
        ModelProviderId::Anthropic => "claude-3-5-sonnet-20241022",
        ModelProviderId::Google => "gemini-1.5-pro",
        ModelProviderId::Ollama => "llama3.1",
        ModelProviderId::Openrouter => "openrouter/auto",
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
    #[ts(optional)]
    pub language: Option<String>,
    #[ts(optional)]
    pub theme_mode: Option<ThemeMode>,
    #[ts(optional)]
    pub log_level: Option<String>,
    #[ts(optional)]
    pub terminal_log_mode: Option<LogMode>,
    #[ts(optional)]
    pub debug_log_mode: Option<LogMode>,
    #[ts(optional)]
    pub model_preferences:
        Option<std::collections::BTreeMap<ModelProviderId, ModelProviderPreferencePatch>>,
    #[ts(optional)]
    pub keybinds: Option<std::collections::BTreeMap<String, String>>,
    #[ts(optional)]
    pub fonts: Option<FontPreferences>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderPreferencePatch {
    #[ts(optional)]
    pub enabled: Option<bool>,
    #[ts(optional)]
    pub priority: Option<i32>,
    #[ts(optional)]
    pub model_id: Option<String>,
}

/// User-defined font preferences. All fields optional — `None` means "use default".
#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
#[serde(rename_all = "camelCase")]
pub struct FontPreferences {
    #[ts(optional)]
    pub ui_font: Option<String>,
    #[ts(optional)]
    pub code_font: Option<String>,
    #[ts(optional)]
    pub terminal_font: Option<String>,
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
    pub keybinds: std::collections::BTreeMap<String, String>,
    pub fonts: FontPreferences,
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

/// 后端侧 ConfigTransform（序列化格式）。
/// shape: `{"type":"SET_LANGUAGE","language":"en-US"}`
/// 前端侧 ConfigTransform（frontend/src/app/stores/configStateMachine.ts）使用不同 shape：
/// `{type:"SET_LANGUAGE", payload:{language:"en-US"}, timestamp:...}` — 二者有意不同，
/// Rust 端为 IPC 线格式，前端为内部状态机追踪格式。
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

#[cfg(test)]
mod provider_id_tests {
    use super::*;

    #[test]
    fn new_providers_exist() {
        assert_eq!(ModelProviderId::Openai.as_str(), "openai");
        assert_eq!(ModelProviderId::Anthropic.as_str(), "anthropic");
        assert_eq!(ModelProviderId::Google.as_str(), "google");
        assert_eq!(ModelProviderId::Ollama.as_str(), "ollama");
        assert_eq!(ModelProviderId::Openrouter.as_str(), "openrouter");
    }

    #[test]
    fn existing_providers_preserved() {
        assert_eq!(ModelProviderId::Deepseek.as_str(), "deepseek");
        assert_eq!(ModelProviderId::Minimax.as_str(), "minimax");
    }

    #[test]
    fn all_providers_have_default_model() {
        for id in [
            ModelProviderId::Deepseek,
            ModelProviderId::Minimax,
            ModelProviderId::Openai,
            ModelProviderId::Anthropic,
            ModelProviderId::Google,
            ModelProviderId::Ollama,
            ModelProviderId::Openrouter,
        ] {
            let model = default_model_for_provider(id);
            assert!(!model.is_empty(), "Provider {:?} has no default model", id);
        }
    }
}
