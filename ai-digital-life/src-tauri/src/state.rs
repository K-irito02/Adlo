use adl_browser::BrowserManager;
use adl_browser::download_manager::DownloadManager;
use adl_kernel::config::AppConfig;
use adl_kernel::events::EventBus;
use adl_logging::LogManager;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use crate::adl_server::AdServerHandle;

/// Narrowed system-shell state (Task 10). All business lives in the spawned
/// `adl-server` process (crates/server) over HTTP/SSE/WS; this struct holds only
/// what the KEPT Tauri system commands need: app config + diagnostics, the
/// WebView2 browser manager, log handling, and the adl-server child handle.
pub struct AppState {
    pub data_dir: PathBuf,
    pub config: Arc<RwLock<AppConfig>>,
    pub event_bus: EventBus,
    pub browser_manager: BrowserManager,
    pub log_manager: Arc<LogManager>,
    pub started_at: i64,
    /// The spawned `adl-server` child + its discovered base URL (`None` when the
    /// engine could not start → system-only desktop).
    pub ad_server: Arc<AdServerHandle>,
    pub download_manager: Arc<DownloadManager>,
}
