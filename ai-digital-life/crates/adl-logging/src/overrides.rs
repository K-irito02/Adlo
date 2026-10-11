use crate::config::LogConfig;
use crate::mode::LogMode;

use adl_types::types::config::{AppPreferencePatch, LogLevel};

/// 会话级日志覆盖（CLI flag / 环境变量）。**不写回 config.json** ——
/// 一次性调试不应污染用户持久化设置。
///
/// 传输通道：两个 Rust 入口（`src-tauri` shell / `adl-server`）都把 CLI flag 写进
/// 环境变量，本结构体再从环境读取，因此同一条 env 会同时覆盖两个后端进程
/// （adl-server 由 shell 派生，自动继承环境）。
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct LogOverrides {
    pub log_level: Option<LogLevel>,
    pub terminal_log_mode: Option<LogMode>,
    pub debug_log_mode: Option<LogMode>,
}

impl LogOverrides {
    pub fn any(&self) -> bool {
        self.log_level.is_some()
            || self.terminal_log_mode.is_some()
            || self.debug_log_mode.is_some()
    }

    /// 从任意键值查找器构造（便于测试；生产用 [`Self::from_env`]）。
    ///
    /// 键：`ADL_LOG_LEVEL` / `ADL_TERMINAL_LOG_MODE` / `ADL_DEBUG_LOG_MODE`；
    /// 兼容旧键 `ADL_CLI_LOG_MODE`（同时设两模式，具体键优先）。
    pub fn from_lookup(lookup: impl Fn(&str) -> Option<String>) -> Self {
        let log_level = lookup_parsed::<LogLevel>(&lookup, "ADL_LOG_LEVEL");
        let cli_mode = lookup_parsed::<LogMode>(&lookup, "ADL_CLI_LOG_MODE");
        let terminal_log_mode =
            lookup_parsed::<LogMode>(&lookup, "ADL_TERMINAL_LOG_MODE").or(cli_mode);
        let debug_log_mode = lookup_parsed::<LogMode>(&lookup, "ADL_DEBUG_LOG_MODE").or(cli_mode);
        Self { log_level, terminal_log_mode, debug_log_mode }
    }

    pub fn from_env() -> Self {
        Self::from_lookup(|key| std::env::var(key).ok())
    }

    /// 解析 CLI 参数（开发阶段入口：`pnpm dev:tauri -- --log-level trace`）。
    ///
    /// 支持 `--log-level <level>` / `--terminal-log-mode <mode>` /
    /// `--debug-log-mode <mode>`，以及兼容简写 `--log-mode <mode>`（同时设两模式）。
    /// 未知参数与缺值参数原样跳过（不干扰 `--port` / `--data-dir` 等其它入口参数）；
    /// 非法取值经 [`Self::from_lookup`] 打印告警后忽略。
    pub fn from_cli_args(args: &[String]) -> Self {
        let mut pairs: Vec<(&str, &str)> = Vec::new();
        let mut i = 0;
        while i < args.len() {
            let Some(key) = cli_flag_env_key(&args[i]) else {
                i += 1;
                continue;
            };
            match args.get(i + 1) {
                Some(value) if !value.starts_with("--") => {
                    pairs.push((key, value.as_str()));
                    i += 2;
                },
                _ => {
                    eprintln!("[ADL-CLI] ignoring {} with no value", args[i]);
                    i += 1;
                },
            }
        }
        Self::from_lookup(|k| pairs.iter().find(|(pk, _)| *pk == k).map(|(_, v)| (*v).to_string()))
    }

    /// 导出为环境变量 —— 跨进程传输通道：shell 派生的 adl-server 子进程自动继承，
    /// 因此单一 env 可同时覆盖两个后端进程。
    pub fn export_to_env(&self) {
        // SAFETY: 仅在进程启动早期、任何其它线程读取环境变量之前调用一次。
        unsafe {
            if let Some(v) = self.log_level {
                std::env::set_var("ADL_LOG_LEVEL", v.to_string());
            }
            if let Some(v) = self.terminal_log_mode {
                std::env::set_var("ADL_TERMINAL_LOG_MODE", v.to_string());
            }
            if let Some(v) = self.debug_log_mode {
                std::env::set_var("ADL_DEBUG_LOG_MODE", v.to_string());
            }
        }
    }

    /// 把覆盖应用到 `LogConfig`（仅覆盖已提供项）。
    pub fn apply(&self, config: &mut LogConfig) {
        if let Some(v) = self.log_level {
            config.log_level = v;
        }
        if let Some(v) = self.terminal_log_mode {
            config.terminal_log_mode = v;
        }
        if let Some(v) = self.debug_log_mode {
            config.debug_log_mode = v;
        }
    }

    /// 启动日志行内容（供用户/agent 自证 flag 已生效）。
    pub fn summary(&self) -> String {
        format!(
            "level={} terminal={} debug={}",
            self.log_level.map_or_else(|| "-".to_string(), |v| v.to_string()),
            self.terminal_log_mode.map_or_else(|| "-".to_string(), |v| v.to_string()),
            self.debug_log_mode.map_or_else(|| "-".to_string(), |v| v.to_string()),
        )
    }
}

/// 需要应用到 `LogManager` 的日志字段变更集（补丁或配置重载后计算）。
///
/// 与 [`LogOverrides`] 的区别：`LogOverrides` 是**进程启动期**的 CLI/env 覆盖；
/// 本结构体是**运行期**由偏好补丁 / 外部配置变更产生的、需要热切换的字段。
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct LogSettingsChange {
    pub log_level: Option<LogLevel>,
    pub terminal_log_mode: Option<LogMode>,
    pub debug_log_mode: Option<LogMode>,
}

impl LogSettingsChange {
    pub fn is_empty(&self) -> bool {
        self.log_level.is_none()
            && self.terminal_log_mode.is_none()
            && self.debug_log_mode.is_none()
    }

    /// 从偏好补丁中提取显式提供的日志字段。
    pub fn from_patch(patch: &AppPreferencePatch) -> Self {
        Self {
            log_level: patch.log_level,
            terminal_log_mode: patch.terminal_log_mode,
            debug_log_mode: patch.debug_log_mode,
        }
    }
}

/// CLI flag → 环境变量键（env 是跨进程传输通道）。
fn cli_flag_env_key(flag: &str) -> Option<&'static str> {
    match flag {
        "--log-level" => Some("ADL_LOG_LEVEL"),
        "--terminal-log-mode" => Some("ADL_TERMINAL_LOG_MODE"),
        "--debug-log-mode" => Some("ADL_DEBUG_LOG_MODE"),
        "--log-mode" => Some("ADL_CLI_LOG_MODE"),
        _ => None,
    }
}

/// 读取并解析环境变量；非法值打印告警并忽略（不 abort 启动）。
fn lookup_parsed<T: std::str::FromStr>(
    lookup: &impl Fn(&str) -> Option<String>,
    key: &str,
) -> Option<T>
where
    T::Err: std::fmt::Display,
{
    let raw = lookup(key)?;
    match raw.parse::<T>() {
        Ok(v) => Some(v),
        Err(e) => {
            eprintln!("[ADL-CLI] ignoring invalid {key}={raw}: {e}");
            None
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lookup_with<'a>(pairs: &'a [(&'a str, &'a str)]) -> impl Fn(&str) -> Option<String> + 'a {
        move |key| pairs.iter().find(|(k, _)| *k == key).map(|(_, v)| v.to_string())
    }

    #[test]
    fn empty_env_yields_no_overrides() {
        let overrides = LogOverrides::from_lookup(lookup_with(&[]));
        assert!(!overrides.any());
        assert_eq!(overrides, LogOverrides::default());
    }

    #[test]
    fn specific_keys_map_to_their_fields() {
        let overrides = LogOverrides::from_lookup(lookup_with(&[
            ("ADL_LOG_LEVEL", "trace"),
            ("ADL_TERMINAL_LOG_MODE", "append"),
            ("ADL_DEBUG_LOG_MODE", "multi"),
        ]));
        assert_eq!(overrides.log_level, Some(LogLevel::Trace));
        assert_eq!(overrides.terminal_log_mode, Some(LogMode::Append));
        assert_eq!(overrides.debug_log_mode, Some(LogMode::Multi));
    }

    #[test]
    fn legacy_cli_log_mode_sets_both_modes() {
        let overrides = LogOverrides::from_lookup(lookup_with(&[("ADL_CLI_LOG_MODE", "multi")]));
        assert_eq!(overrides.terminal_log_mode, Some(LogMode::Multi));
        assert_eq!(overrides.debug_log_mode, Some(LogMode::Multi));
        assert_eq!(overrides.log_level, None);
    }

    #[test]
    fn specific_key_wins_over_legacy() {
        let overrides = LogOverrides::from_lookup(lookup_with(&[
            ("ADL_CLI_LOG_MODE", "multi"),
            ("ADL_DEBUG_LOG_MODE", "append"),
        ]));
        assert_eq!(overrides.terminal_log_mode, Some(LogMode::Multi));
        assert_eq!(overrides.debug_log_mode, Some(LogMode::Append));
    }

    #[test]
    fn invalid_values_are_ignored_not_panicking() {
        let overrides = LogOverrides::from_lookup(lookup_with(&[
            ("ADL_LOG_LEVEL", "verbose"),
            ("ADL_TERMINAL_LOG_MODE", "rotate"),
        ]));
        assert_eq!(overrides.log_level, None);
        assert_eq!(overrides.terminal_log_mode, None);
        assert!(!overrides.any());
    }

    #[test]
    fn apply_only_overwrites_provided_fields() {
        let mut config = LogConfig {
            terminal_log_mode: LogMode::Overwrite,
            debug_log_mode: LogMode::Overwrite,
            log_level: LogLevel::Info,
        };
        let overrides = LogOverrides { log_level: Some(LogLevel::Debug), ..Default::default() };
        overrides.apply(&mut config);
        assert_eq!(config.log_level, LogLevel::Debug);
        assert_eq!(config.terminal_log_mode, LogMode::Overwrite);
        assert_eq!(config.debug_log_mode, LogMode::Overwrite);
    }

    #[test]
    fn summary_uses_dash_for_unset_fields() {
        let overrides = LogOverrides { log_level: Some(LogLevel::Trace), ..Default::default() };
        assert_eq!(overrides.summary(), "level=trace terminal=- debug=-");
    }

    fn argv(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| (*s).to_string()).collect()
    }

    #[test]
    fn cli_args_parse_all_three_flags() {
        let overrides = LogOverrides::from_cli_args(&argv(&[
            "--log-level",
            "trace",
            "--terminal-log-mode",
            "append",
            "--debug-log-mode",
            "multi",
        ]));
        assert_eq!(overrides.log_level, Some(LogLevel::Trace));
        assert_eq!(overrides.terminal_log_mode, Some(LogMode::Append));
        assert_eq!(overrides.debug_log_mode, Some(LogMode::Multi));
    }

    #[test]
    fn cli_shorthand_sets_both_modes() {
        let overrides = LogOverrides::from_cli_args(&argv(&["--log-mode", "multi"]));
        assert_eq!(overrides.terminal_log_mode, Some(LogMode::Multi));
        assert_eq!(overrides.debug_log_mode, Some(LogMode::Multi));
        assert_eq!(overrides.log_level, None);
    }

    #[test]
    fn cli_args_ignore_unknown_and_valueless_flags() {
        let overrides = LogOverrides::from_cli_args(&argv(&[
            "--port",
            "5174",
            "--log-level",
            "--data-dir",
            "/tmp/x",
        ]));
        // `--log-level` 后跟另一个 flag → 视为缺值，整条忽略；未知 flag 不干扰。
        assert!(!overrides.any());
    }

    #[test]
    fn cli_args_ignore_invalid_values() {
        let overrides =
            LogOverrides::from_cli_args(&argv(&["--log-level", "verbose", "--log-mode", "rotate"]));
        assert!(!overrides.any());
    }
}
