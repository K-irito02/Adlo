pub mod agent;
pub mod command;
pub mod config;
pub mod conversation;
pub mod model;
pub mod workspace;

pub use agent::*;
pub use command::*;
pub use config::*;
pub use conversation::*;
pub use model::*;
pub use workspace::*;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const APP_NAME: &str = "AI Digital Life";
pub const DEFAULT_APPROVAL_MODE: &str = "manual";
pub const GLOBAL_WORKSPACE_ID: &str = "__global__";

pub type TimestampMs = i64;

pub fn now_ms() -> TimestampMs {
    chrono::Utc::now().timestamp_millis()
}

pub fn create_id(prefix: &str) -> String {
    format!("{prefix}_{}", Uuid::new_v4())
}

pub fn estimate_tokens(text: &str) -> usize {
    let total = text.chars().count();
    let cjk_count = text
        .chars()
        .filter(|c| {
            matches!(
                c,
                // CJK Unified Ideographs (Basic)
                '\u{4E00}'..='\u{9FFF}' |
                // CJK Unified Ideographs Extension A
                '\u{3400}'..='\u{4DBF}' |
                // CJK Unified Ideographs Extension B
                '\u{20000}'..='\u{2A6DF}' |
                // CJK Unified Ideographs Extension C
                '\u{2A700}'..='\u{2B73F}' |
                // CJK Unified Ideographs Extension D
                '\u{2B740}'..='\u{2B81F}' |
                // CJK Unified Ideographs Extension E
                '\u{2B820}'..='\u{2CEAF}' |
                // CJK Unified Ideographs Extension F
                '\u{2CEB0}'..='\u{2EBEF}' |
                // CJK Unified Ideographs Extension G
                '\u{30000}'..='\u{3134F}' |
                // CJK Unified Ideographs Extension H
                '\u{31350}'..='\u{323AF}' |
                // CJK Compatibility Ideographs
                '\u{F900}'..='\u{FAFF}' |
                // CJK Compatibility Ideographs Supplement
                '\u{2F800}'..='\u{2FA1F}'
            )
        })
        .count();
    let weighted = cjk_count * 8 + (total - cjk_count);
    std::cmp::max(1, weighted.div_ceil(4))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum IpcResult<T> {
    Ok { ok: bool, data: T },
    Err { ok: bool, error: IpcError },
}

impl<T> IpcResult<T> {
    pub fn ok(data: T) -> Self {
        Self::Ok { ok: true, data }
    }

    pub fn err(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self::Err { ok: false, error: IpcError { code: code.into(), message: message.into() } }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_info_serializes() {
        let info = AppInfo {
            app_name: APP_NAME.into(),
            version: "0.1.0".into(),
            config: ConfigSnapshot {
                language: "zh-CN".into(),
                theme_mode: ThemeMode::System,
                resolved_theme: Theme::Dark,
                log_level: "info".into(),
                max_recent_workspaces: 10,
                model_preferences: ModelPreferences::default(),
            },
            current_workspace: None,
            recent_logs: vec![],
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"themeMode\":\"system\""));
        assert!(json.contains("\"appName\":\"AI Digital Life\""));
    }
}
