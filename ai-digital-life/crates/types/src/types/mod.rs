pub mod ci;
pub mod commands;
pub mod config;
pub mod conversation;
pub mod git_visualization;
pub mod patch_types;
pub mod part;
pub mod reference;
pub mod reserved;
pub mod session;
pub mod workspace;

pub use ci::*;
pub use commands::{CommandConfig, CommandHint};
pub use config::*;
pub use conversation::*;
pub use git_visualization::*;
pub use patch_types::*;
pub use part::*;
pub use reference::{ReferenceConfig, ReferenceSource};
pub use reserved::{AcpConfig, CodeModeConfig, HttpApiConfig};
pub use workspace::*;

use serde::{Deserialize, Serialize};
use ts_rs::TS;
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct IpcError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
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
                terminal_log_mode: LogMode::default(),
                debug_log_mode: LogMode::default(),
                max_recent_workspaces: 10,
                keybinds: std::collections::BTreeMap::new(),
                fonts: FontPreferences::default(),
                max_concurrent_workspaces: 6,
                workspace_priority_ids: vec![],
                workspace_deferred_ids: vec![],
                workspace_natural_order: vec![],
                browser_inactive_tab_suspend_ms: 3_600_000,
            },
            current_workspace: None,
            recent_logs: vec![],
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"themeMode\":\"system\""));
        assert!(json.contains("\"appName\":\"AI Digital Life\""));
    }
}
