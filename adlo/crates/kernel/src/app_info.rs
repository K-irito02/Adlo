use crate::config::AppConfig;

use adl_types::now_ms;
use adl_types::types::WorkspaceMeta;
use adl_types::types::config::{
    AppInfo, ConfigSnapshot, LogEntrySummary, RuntimeInfo, Theme, ThemeMode,
};

/// 打包进二进制的 Tauri 配置：应用版本与安装包版本同源。
const TAURI_CONF: &str = include_str!("../../../src-tauri/tauri.conf.json");

/// 读取 `tauri.conf.json` 的 `version`；解析失败时退回 crate 版本（仅兜底，不该发生）。
pub fn app_version() -> String {
    serde_json::from_str::<serde_json::Value>(TAURI_CONF)
        .ok()
        .and_then(|value| value.get("version")?.as_str().map(str::to_owned))
        .unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string())
}

/// 构造跨进程一致的 `AppInfo`（Tauri shell 与 adl-server 共用，杜绝两份契约面漂移）。
///
/// `resolved_theme`：`System` 在**后端**统一解析为 `Light`（前端 `useThemeSync` 会用
/// `systemPrefersDark()` 覆盖为真实值），保持与既有 shell 行为一致。
///
/// `WorkspaceMeta` 的 verbatim 前缀剥离由调用方完成后传入 —— 该 helper 属
/// workspace crate，kernel 不得反向依赖。
///
/// `runtime` 由宿主提供（壳层读 Tauri/WebView2，ad-server 读客户端 User-Agent）：
/// kernel 不依赖 tauri，也不该猜「当前是谁在调用」。
pub fn build(
    config: &AppConfig,
    current_workspace: Option<WorkspaceMeta>,
    runtime: RuntimeInfo,
) -> AppInfo {
    let resolved = match config.theme_mode {
        ThemeMode::Light => Theme::Light,
        ThemeMode::Dark => Theme::Dark,
        ThemeMode::System => Theme::Light,
    };
    AppInfo {
        app_name: adl_types::APP_NAME.into(),
        // 应用版本以 `src-tauri/tauri.conf.json` 为唯一真源（安装包与关于页同源）。
        // 不再用 `CARGO_PKG_VERSION`：workspace 版本一旦随发版改动，全部 crate 都会重编，
        // 发版从增量变成全量。crate 版本保持独立、按需演进。
        version: app_version(),
        config: ConfigSnapshot {
            language: config.language.clone(),
            theme_mode: config.theme_mode,
            resolved_theme: resolved,
            log_level: config.log_level,
            terminal_log_mode: config.terminal_log_mode,
            debug_log_mode: config.debug_log_mode,
            max_recent_workspaces: config.max_recent_workspaces,
            keybinds: config.keybinds.clone(),
            fonts: config.fonts.clone(),
            max_concurrent_workspaces: config.max_concurrent_workspaces,
            workspace_priority_ids: config.workspace_priority_ids.clone(),
            workspace_deferred_ids: config.workspace_deferred_ids.clone(),
            workspace_natural_order: config.workspace_natural_order.clone(),
            browser_inactive_tab_suspend_ms: config.browser_inactive_tab_suspend_ms,
            link_open_method: config.link_open_method,
            file_open_method: config.file_open_method,
            agent_link_intercept: config.agent_link_intercept,
            agent_site_whitelist: config.agent_site_whitelist.clone(),
            agent_site_rules: crate::config::resolved_agent_site_rules(config),
            agent_site_overrides: crate::config::resolved_agent_site_overrides(config),
            browser_suspend_whitelist_enabled: config.browser_suspend_whitelist_enabled,
            browser_suspend_whitelist: config.browser_suspend_whitelist.clone(),
        },
        current_workspace,
        recent_logs: vec![LogEntrySummary {
            timestamp: now_ms(),
            level: "info".into(),
            scope: "backend".into(),
            message: "Backend ready.".into(),
        }],
        runtime,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use adl_types::types::config::LogLevel;
    use adl_types::types::config::LogMode;

    /// 测试用运行时：形状固定，断言只关心透传。
    fn test_runtime() -> RuntimeInfo {
        RuntimeInfo {
            shell: adl_types::types::config::RuntimeShell::Browser,
            tauri_version: None,
            webview_version: Some("141.0.0.0".into()),
            os: "windows".into(),
            arch: "x86_64".into(),
            log_dir: "/repo/.adl-logs".into(),
        }
    }

    #[test]
    fn system_theme_resolves_to_light_backend_side() {
        let config = AppConfig { theme_mode: ThemeMode::System, ..AppConfig::default() };
        assert_eq!(build(&config, None, test_runtime()).config.resolved_theme, Theme::Light);
    }

    #[test]
    fn dark_theme_resolves_to_dark() {
        let config = AppConfig { theme_mode: ThemeMode::Dark, ..AppConfig::default() };
        assert_eq!(build(&config, None, test_runtime()).config.resolved_theme, Theme::Dark);
    }

    #[test]
    fn log_settings_are_passed_through_verbatim() {
        let config = AppConfig {
            log_level: LogLevel::Trace,
            terminal_log_mode: LogMode::Multi,
            debug_log_mode: LogMode::Append,
            ..AppConfig::default()
        };
        let info = build(&config, None, test_runtime());
        assert_eq!(info.config.log_level, LogLevel::Trace);
        assert_eq!(info.config.terminal_log_mode, LogMode::Multi);
        assert_eq!(info.config.debug_log_mode, LogMode::Append);
    }

    #[test]
    fn runtime_is_passed_through_verbatim() {
        let info = build(&AppConfig::default(), None, test_runtime());
        assert_eq!(info.runtime, test_runtime());
    }

    #[test]
    fn no_workspace_yields_none_and_one_synthetic_log() {
        let info = build(&AppConfig::default(), None, test_runtime());
        assert!(info.current_workspace.is_none());
        assert_eq!(info.recent_logs.len(), 1);
        assert_eq!(info.version, app_version());
        assert!(info.version.split('.').count() >= 3, "version must look semver-ish");
        assert_eq!(
            app_version(),
            serde_json::from_str::<serde_json::Value>(TAURI_CONF)
                .expect("tauri.conf.json parses")
                .get("version")
                .and_then(|value| value.as_str())
                .expect("version string"),
            "app version must come from tauri.conf.json"
        );
    }
}
