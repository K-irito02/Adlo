use adl_config::AppConfig;
use adl_events::EventBus;
use adl_kernel::WorkspaceMeta;
use adl_storage::Database;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;

pub struct AppState {
    pub data_dir: PathBuf,
    pub db: Database,
    pub config: Mutex<AppConfig>,
    pub event_bus: EventBus,
    pub current_workspace: Mutex<Option<WorkspaceMeta>>,
    pub editor_dirty_paths: Mutex<HashSet<String>>,
    pub command_cancellations: Arc<tokio::sync::Mutex<HashMap<String, oneshot::Sender<()>>>>,
    pub started_at: i64,
}
