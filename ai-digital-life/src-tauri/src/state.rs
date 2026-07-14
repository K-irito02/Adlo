use adl_browser::BrowserManager;
use adl_kernel::{config::AppConfig, events::EventBus};
use adl_logging::LogManager;
use adl_model_gateway::registry::ProviderRegistry;
use adl_pty::SessionManager;
use adl_storage::durable::DurableSessionManager;
use adl_storage::Database;
use adl_types::WorkspaceMeta;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};

pub struct AppState {
    pub data_dir: PathBuf,
    pub db: Database,
    pub config: Arc<RwLock<AppConfig>>,
    pub event_bus: EventBus,
    pub current_workspace: RwLock<Option<WorkspaceMeta>>,
    pub editor_dirty_paths: Mutex<HashSet<String>>,
    pub pty_sessions: Arc<Mutex<SessionManager>>,
    pub browser_manager: BrowserManager,
    pub log_manager: LogManager,
    pub started_at: i64,
    pub durable_manager: DurableSessionManager,
    pub provider_registry: Arc<RwLock<ProviderRegistry>>,
}
