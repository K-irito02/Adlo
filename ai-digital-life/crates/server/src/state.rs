use adl_clipboard::ClipboardStore;
use adl_kernel::config::AppConfig;
use adl_kernel::events::EventBus;
use adl_lsp_client::LspClient;
use adl_mcp_client::McpClient;
use adl_pty::SessionManager;
use adl_storage::Database;
use adl_storage::durable::DurableSessionManager;
use adl_sysmon::SystemMonitor;
use adl_types::WorkspaceMeta;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::AtomicU16;
use std::sync::{Arc, Mutex as StdMutex, RwLock};
use tokio::sync::Mutex as AsyncMutex;

#[derive(Clone)]
pub struct ServerState {
    pub data_dir: PathBuf,
    pub db: Database,
    pub config: Arc<RwLock<AppConfig>>,
    pub event_bus: EventBus,
    pub current_workspace: Arc<RwLock<Option<WorkspaceMeta>>>,
    pub editor_dirty_paths: Arc<StdMutex<HashSet<String>>>,
    pub pty_sessions: Arc<StdMutex<SessionManager>>,
    pub started_at: i64,
    pub durable_manager: DurableSessionManager,
    pub server_port: Arc<AtomicU16>,
    pub lsp_clients: Arc<AsyncMutex<HashMap<String, Arc<LspClient>>>>,
    pub mcp_client: McpClient,
    pub clipboard_store: Arc<ClipboardStore>,
    pub sysmon: Arc<StdMutex<SystemMonitor>>,
}
