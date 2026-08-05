use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, Default)]
#[serde(rename_all = "snake_case")]
pub enum LogMode {
    #[default]
    Overwrite,
    Append,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    Light,
    Dark,
    System,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
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
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
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
#[serde(rename_all = "lowercase")]
pub enum ModelCapability {
    Text,
    Vision,
    ToolUse,
    Streaming,
    Reasoning,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum ModelTier {
    Free,
    LowCost,
    Standard,
    Premium,
}

/// Returns the default model ID for a provider.
pub fn default_model_for_provider(provider: &str) -> &'static str {
    match provider {
        "deepseek" => "deepseek-chat",
        "minimax" => "MiniMax-M2.7",
        "openai" => "gpt-4o",
        "anthropic" => "claude-3-5-sonnet-20241022",
        "google" => "gemini-1.5-pro",
        "ollama" => "llama3.1",
        "openrouter" => "openrouter/auto",
        _ => "unknown",
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderPreference {
    pub enabled: bool,
    pub priority: i32,
    pub model_id: String,
    /// 三态模型启用语义：`None` = 全部启用；`Some([])` = 全部关闭；`Some(ids)` = 白名单子集。
    /// 路由层（model-gateway::route）据此强校验：`model_id` 不在白名单时回退到首个启用模型，
    /// 白名单为空时该 provider 不可路由。
    #[serde(default)]
    pub enabled_models: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ModelPreferences {
    pub providers: std::collections::BTreeMap<String, ModelProviderPreference>,
}

impl Default for ModelPreferences {
    fn default() -> Self {
        let mut providers = std::collections::BTreeMap::new();
        for (idx, id) in
            ["deepseek", "minimax", "openai", "anthropic", "google", "ollama", "openrouter"]
                .into_iter()
                .enumerate()
        {
            providers.insert(
                id.to_string(),
                ModelProviderPreference {
                    enabled: true,
                    priority: (idx + 1) as i32,
                    model_id: default_model_for_provider(id).to_string(),
                    enabled_models: None,
                },
            );
        }
        Self { providers }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
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
    pub model_preferences: Option<std::collections::BTreeMap<String, ModelProviderPreferencePatch>>,
    #[ts(optional)]
    pub keybinds: Option<std::collections::BTreeMap<String, String>>,
    #[ts(optional)]
    pub fonts: Option<FontPreferences>,
    #[ts(optional)]
    pub max_concurrent_workspaces: Option<usize>,
    #[ts(optional)]
    pub workspace_priority_ids: Option<Vec<String>>,
    #[ts(optional)]
    pub workspace_deferred_ids: Option<Vec<String>>,
    #[ts(optional)]
    pub workspace_natural_order: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderPreferencePatch {
    #[ts(optional)]
    pub enabled: Option<bool>,
    #[ts(optional)]
    pub priority: Option<i32>,
    #[ts(optional)]
    pub model_id: Option<String>,
    /// 三态语义：缺省(JSON absent)→None(保留原值)；显式 null→Some(None)=全部启用；
    /// 数组→Some(Some(list))=白名单(空数组=全部关闭)。
    /// `deserialize_with` 使 JSON null 反序列化为 `Some(None)`（显式"全部启用"），
    /// 而非与"缺省"相同的 `None`。ts-rs 无法解析 `deserialize_with` 会在构建时告警但忽略
    /// （ipc-types.generated.ts 为手工维护，不受影响），clippy `-D warnings` 不受影响。
    #[ts(optional)]
    #[serde(default, deserialize_with = "deserialize_enabled_models")]
    pub enabled_models: Option<Option<Vec<String>>>,
}

/// 使 JSON `null` → `Some(None)`（显式"全部启用"），JSON 数组 → `Some(Some(list))`。
/// 缺省（键不存在）由 `#[serde(default)]` 提供外层 `None`。
fn deserialize_enabled_models<'de, D>(deserializer: D) -> Result<Option<Option<Vec<String>>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let inner = Option::<Vec<String>>::deserialize(deserializer)?;
    Ok(Some(inner))
}

/// User-defined font preferences. All fields optional — `None` means "use default".
#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
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
    #[serde(default = "default_max_concurrent_workspaces_snapshot")]
    pub max_concurrent_workspaces: usize,
    #[serde(default)]
    pub workspace_priority_ids: Vec<String>,
    #[serde(default)]
    pub workspace_deferred_ids: Vec<String>,
    #[serde(default)]
    pub workspace_natural_order: Vec<String>,
}

fn default_max_concurrent_workspaces_snapshot() -> usize {
    6
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub app_name: String,
    pub version: String,
    pub config: ConfigSnapshot,
    pub current_workspace: Option<super::WorkspaceMeta>,
    pub recent_logs: Vec<LogEntrySummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
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
    fn all_providers_have_default_model() {
        for id in ["deepseek", "minimax", "openai", "anthropic", "google", "ollama", "openrouter"] {
            let model = default_model_for_provider(id);
            assert!(!model.is_empty(), "Provider {id} has no default model");
        }
    }
}

#[cfg(test)]
mod model_preferences_default_tests {
    use super::*;

    #[test]
    fn default_preferences_cover_all_builtin_providers() {
        let prefs = ModelPreferences::default();
        for id in ["deepseek", "minimax", "openai", "anthropic", "google", "ollama", "openrouter"] {
            let entry = prefs
                .providers
                .get(id)
                .unwrap_or_else(|| panic!("Default preferences missing provider {id}"));
            assert!(entry.enabled, "Provider {id} should be enabled by default");
            assert!(entry.priority > 0, "Provider {id} should have priority > 0");
            assert!(!entry.model_id.is_empty(), "Provider {id} should have a default model");
        }
    }

    #[test]
    fn deepseek_default_model_matches_gateway() {
        let prefs = ModelPreferences::default();
        let deepseek = prefs.providers.get("deepseek").expect("deepseek present");
        assert_eq!(deepseek.model_id, "deepseek-chat");
    }
}

#[cfg(test)]
mod enabled_models_serde_tests {
    use super::*;

    #[test]
    fn enabled_models_serde_roundtrip() {
        let pref = ModelProviderPreference {
            enabled: true,
            priority: 1,
            model_id: "deepseek-chat".to_string(),
            enabled_models: Some(vec!["a".to_string(), "b".to_string()]),
        };
        let json = serde_json::to_string(&pref).unwrap();
        let back: ModelProviderPreference = serde_json::from_str(&json).unwrap();
        assert_eq!(back.enabled_models, Some(vec!["a".to_string(), "b".to_string()]));
    }

    #[test]
    fn missing_enabled_models_defaults_to_none() {
        let json = r#"{"enabled":true,"priority":1,"modelId":"deepseek-chat"}"#;
        let pref: ModelProviderPreference = serde_json::from_str(json).unwrap();
        assert!(pref.enabled_models.is_none());
    }

    #[test]
    fn explicit_null_enabled_models_serializes_as_null() {
        let pref = ModelProviderPreference {
            enabled: true,
            priority: 1,
            model_id: "deepseek-chat".to_string(),
            enabled_models: None,
        };
        let json = serde_json::to_value(&pref).unwrap();
        assert_eq!(json["enabledModels"], serde_json::Value::Null);
    }

    #[test]
    fn patch_json_null_maps_to_some_none_all_enabled() {
        let patch: ModelProviderPreferencePatch =
            serde_json::from_str(r#"{"enabledModels":null}"#).unwrap();
        assert_eq!(patch.enabled_models, Some(None));
    }

    #[test]
    fn patch_json_absent_maps_to_outer_none_keep() {
        let patch: ModelProviderPreferencePatch = serde_json::from_str(r#"{}"#).unwrap();
        assert_eq!(patch.enabled_models, None);
    }

    #[test]
    fn patch_json_array_maps_to_some_some_list() {
        let patch: ModelProviderPreferencePatch =
            serde_json::from_str(r#"{"enabledModels":["deepseek-chat"]}"#).unwrap();
        assert_eq!(patch.enabled_models, Some(Some(vec!["deepseek-chat".to_string()])));
    }
}
