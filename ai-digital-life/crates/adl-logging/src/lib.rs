pub mod config;
pub mod error;
pub mod manager;
pub mod mode;
pub mod session;

pub use config::LogConfig;
pub use error::LogError;
pub use manager::LogManager;
pub use mode::{LogMode, LogTarget};

pub fn init(
    app_config: &adl_kernel::config::AppConfig,
    log_dir: &std::path::Path,
) -> Result<LogManager, LogError> {
    let config = LogConfig::from_app_config(app_config);
    LogManager::init(&config, log_dir)
}
