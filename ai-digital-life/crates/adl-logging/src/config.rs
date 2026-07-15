use crate::mode::LogMode;
use std::path::Path;

/// 日志子系统运行时配置（非持久化视图）。
///
/// 所有权关系：此结构体是 `kernel::config::AppConfig` 的子视图，
/// 仅包含日志模式字段。`AppConfig` 是配置真源（序列化到 config.json），
/// 本结构体通过 `AppConfig::to_log_config()` 派生，不独立持久化。
/// 重复字段是有意设计：AppConfig 拥有完整配置，LogConfig 拥有日志子系统的运行时快照。
#[derive(Debug, Clone)]
pub struct LogConfig {
    pub terminal_log_mode: LogMode,
    pub debug_log_mode: LogMode,
}

impl LogConfig {
    pub fn merge_cli(&mut self, cli_mode: LogMode) {
        self.terminal_log_mode = cli_mode;
        self.debug_log_mode = cli_mode;
    }
}

pub fn log_file_path(log_dir: &Path, prefix: &str) -> std::path::PathBuf {
    log_dir.join(format!("{prefix}.txt"))
}

pub fn session_log_path(log_dir: &Path, prefix: &str, timestamp: &str) -> std::path::PathBuf {
    log_dir.join(format!("{prefix}-{timestamp}.txt"))
}
