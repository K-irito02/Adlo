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
    #[ts(optional)]
    pub browser_inactive_tab_suspend_ms: Option<u64>,
    /// 只读历史的磁盘预算（字节）；None = 不改。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub terminal_history_budget_bytes: Option<u64>,
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
    #[serde(default = "default_browser_inactive_tab_suspend_ms")]
    pub browser_inactive_tab_suspend_ms: u64,
    /// 只读历史的磁盘预算（字节）。0 = 跟随磁盘剩余空间。
    #[serde(default = "default_terminal_history_budget_bytes_snapshot")]
    pub terminal_history_budget_bytes: u64,
}

fn default_max_concurrent_workspaces_snapshot() -> usize {
    6
}

/// 与 `kernel::config` 同名字段是同一产品默认（15 分钟 = 900_000），改动时两处同步。
fn default_browser_inactive_tab_suspend_ms() -> u64 {
    900_000
}

fn default_terminal_history_budget_bytes_snapshot() -> u64 {
    1 << 30
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

    #[test]
    fn app_preference_patch_deserializes_budget_bytes() {
        // 前端档位/恢复默认经此字段下发（issue 2026-09-24：后端曾直接丢弃导致恒显 1 GB）。
        let patch: AppPreferencePatch =
            serde_json::from_str(r#"{"terminalHistoryBudgetBytes": 2147483648}"#).unwrap();
        assert_eq!(patch.terminal_history_budget_bytes, Some(2147483648));
        let empty: AppPreferencePatch = serde_json::from_str(r#"{"language": "zh-CN"}"#).unwrap();
        assert_eq!(empty.terminal_history_budget_bytes, None);
    }
}
