use crate::mode::LogMode;
use std::path::Path;

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
