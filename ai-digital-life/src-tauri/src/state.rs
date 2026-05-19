use adl_config::AppConfig;
use adl_events::EventBus;
use adl_kernel::WorkspaceMeta;
use adl_storage::Database;
use adl_terminal::session_manager::SessionManager;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub struct AppState {
    pub data_dir: PathBuf,
    pub db: Database,
    pub config: Mutex<AppConfig>,
    pub event_bus: EventBus,
    pub current_workspace: Mutex<Option<WorkspaceMeta>>,
    pub editor_dirty_paths: Mutex<HashSet<String>>,
    pub pty_sessions: Arc<Mutex<SessionManager>>,
    pub started_at: i64,
}
