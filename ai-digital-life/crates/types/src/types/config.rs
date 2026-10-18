use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS, Default)]
// 注：`rename_all` 现仅约束序列化（反序列化走下方手写 `Deserialize`，复用
// 大小写不敏感的 `FromStr`）；线格式仍为全小写 snake_case。
#[serde(rename_all = "snake_case")]
pub enum LogMode {
    #[default]
    Overwrite,
    Append,
    Multi,
}

// 手写反序列化（复用大小写不敏感的 `FromStr`）：手写/历史 `config.json` 中的
// `"Multi"` / `"APPEND"` 不应导致整份配置加载失败（`load_from` 遇错整体返回 Err）。
// 序列化仍为全小写，线格式不变。
impl<'de> serde::Deserialize<'de> for LogMode {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        s.parse().map_err(serde::de::Error::custom)
    }
}

impl std::str::FromStr for LogMode {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        // 与 `LogLevel::from_str` 同口径：手输通道做大小写/空白归一，
        // `ADL_TERMINAL_LOG_MODE=Multi` 与 `--terminal-log-mode Multi` 均可生效。
        match s.trim().to_ascii_lowercase().as_str() {
            "overwrite" => Ok(Self::Overwrite),
            "append" => Ok(Self::Append),
            "multi" => Ok(Self::Multi),
            _ => Err(format!("Invalid LogMode: {s}. Expected overwrite|append|multi")),
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

/// 网址链接的默认打开落点。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, Default)]
#[serde(rename_all = "lowercase")]
pub enum LinkOpenMethod {
    Middle,
    #[default]
    Panel,
    External,
}

/// 本地文件的默认打开方式。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, Default)]
#[serde(rename_all = "lowercase")]
pub enum FileOpenMethod {
    #[default]
    Panel,
    External,
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

/// 日志详细程度。声明顺序即 verbosity 顺序（`Error` 最粗 … `Trace` 最细），
/// 因此 `Ord` 可直接用于 `max_verbosity`（取更详细者）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, TS, Default)]
// 注：`rename_all` 现仅约束序列化（反序列化走下方手写 `Deserialize`）。
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Error,
    Warn,
    #[default]
    Info,
    Debug,
    Trace,
}

// 手写反序列化（复用大小写不敏感的 `FromStr`）：手写/历史 `config.json` 中的
// `"INFO"` / `"Warn"` / `"warning"` 不应导致整份配置加载失败。序列化仍为全小写。
impl<'de> serde::Deserialize<'de> for LogLevel {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        s.parse().map_err(serde::de::Error::custom)
    }
}

impl LogLevel {
    /// 取两者中更详细（verbosity 更高）的一方。
    pub fn max_verbosity(a: Self, b: Self) -> Self {
        a.max(b)
    }
}

impl std::str::FromStr for LogLevel {
    type Err = String;
    /// 输入侧宽容（含 `"warning"` 别名）；序列化/TS 线格式恒为 `"warn"`
    ///（input-only alias，后人勿误以为 wire 格式含 `warning`）。
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_ascii_lowercase().as_str() {
            "error" => Ok(Self::Error),
            "warn" | "warning" => Ok(Self::Warn),
            "info" => Ok(Self::Info),
            "debug" => Ok(Self::Debug),
            "trace" => Ok(Self::Trace),
            other => {
                Err(format!("Invalid LogLevel: {other}. Expected error|warn|info|debug|trace"))
            },
        }
    }
}

impl std::fmt::Display for LogLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Error => "error",
            Self::Warn => "warn",
            Self::Info => "info",
            Self::Debug => "debug",
            Self::Trace => "trace",
        };
        f.write_str(s)
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
    pub log_level: Option<LogLevel>,
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
    #[ts(optional)]
    pub link_open_method: Option<LinkOpenMethod>,
    #[ts(optional)]
    pub file_open_method: Option<FileOpenMethod>,
    #[ts(optional)]
    pub agent_link_intercept: Option<bool>,
    #[ts(optional)]
    pub agent_site_whitelist: Option<Vec<String>>,
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
    pub log_level: LogLevel,
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
    #[serde(default)]
    pub link_open_method: LinkOpenMethod,
    #[serde(default)]
    pub file_open_method: FileOpenMethod,
    #[serde(default)]
    pub agent_link_intercept: bool,
    #[serde(default)]
    pub agent_site_whitelist: Vec<String>,
}

fn default_max_concurrent_workspaces_snapshot() -> usize {
    6
}

/// 与 `kernel::config` 同名字段是同一产品默认（15 分钟 = 900_000），改动时两处同步。
fn default_browser_inactive_tab_suspend_ms() -> u64 {
    900_000
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

/// `updatePreferences` 的响应体：更新后的应用信息 + 本次被会话级 CLI/env 覆盖
/// 锁定的日志字段（JSON 补丁名，如 `"logLevel"`）。
///
/// 被锁字段仍会落盘（下次无 CLI 覆盖启动时生效），但本次运行期保持 CLI 值；
/// 前端凭此弹"下次启动生效"提示，消除双进程静默分歧（Phase 4 F3）。
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePreferencesResult {
    pub info: AppInfo,
    #[serde(default)]
    pub session_locked_fields: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct LogEntrySummary {
    pub timestamp: super::TimestampMs,
    pub level: String,
    pub scope: String,
    pub message: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn log_level_parses_case_insensitively_and_rejects_unknown() {
        assert_eq!("TRACE".parse::<LogLevel>().unwrap(), LogLevel::Trace);
        assert_eq!(" Info ".parse::<LogLevel>().unwrap(), LogLevel::Info);
        assert!("verbose".parse::<LogLevel>().is_err());
    }

    #[test]
    fn log_level_orders_by_verbosity() {
        assert!(LogLevel::Error < LogLevel::Warn);
        assert!(LogLevel::Info < LogLevel::Debug);
        assert!(LogLevel::Debug < LogLevel::Trace);
    }

    #[test]
    fn log_level_max_verbosity_picks_more_verbose() {
        assert_eq!(LogLevel::max_verbosity(LogLevel::Error, LogLevel::Debug), LogLevel::Debug);
        assert_eq!(LogLevel::max_verbosity(LogLevel::Trace, LogLevel::Debug), LogLevel::Trace);
    }

    #[test]
    fn log_level_serde_round_trip_is_lowercase() {
        assert_eq!(serde_json::to_string(&LogLevel::Warn).unwrap(), "\"warn\"");
        assert_eq!(serde_json::from_str::<LogLevel>("\"trace\"").unwrap(), LogLevel::Trace);
        assert_eq!(LogLevel::default(), LogLevel::Info);
        assert_eq!(LogLevel::Debug.to_string(), "debug");
    }

    #[test]
    fn log_level_serde_accepts_mixed_case_from_hand_edited_config() {
        // 手写 config.json 的大小写不应导致整份配置加载失败（Phase 4 R3）。
        assert_eq!(serde_json::from_str::<LogLevel>("\"INFO\"").unwrap(), LogLevel::Info);
        assert_eq!(serde_json::from_str::<LogLevel>("\"Warn\"").unwrap(), LogLevel::Warn);
        assert_eq!(serde_json::from_str::<LogLevel>("\"warning\"").unwrap(), LogLevel::Warn);
        assert!(serde_json::from_str::<LogLevel>("\"verbose\"").is_err());
    }

    #[test]
    fn log_mode_from_str_and_serde_accept_mixed_case() {
        // 与 LogLevel 同口径：手输通道大小写不敏感（Phase 4 R5）。
        assert_eq!("Multi".parse::<LogMode>().unwrap(), LogMode::Multi);
        assert_eq!(" APPEND ".parse::<LogMode>().unwrap(), LogMode::Append);
        assert_eq!(serde_json::from_str::<LogMode>("\"Multi\"").unwrap(), LogMode::Multi);
        assert_eq!(serde_json::to_string(&LogMode::Append).unwrap(), "\"append\"");
        assert!("rotate".parse::<LogMode>().is_err());
    }
}
