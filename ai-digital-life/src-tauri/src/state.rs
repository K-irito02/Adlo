use adl_agent_runtime::part_event_bus::PartEventBus;
use adl_agent_runtime::question::QuestionService;
use adl_browser::BrowserManager;
use adl_kernel::{config::AppConfig, events::EventBus};
use adl_logging::LogManager;
use adl_model_gateway::registry::ProviderRegistry;
use adl_pty::SessionManager;
use adl_storage::Database;
use adl_storage::durable::DurableSessionManager;
use adl_types::WorkspaceMeta;
use reqwest::Client;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::atomic::AtomicU16;
use std::sync::{Arc, Mutex as StdMutex, RwLock};
use tokio::sync::Mutex as AsyncMutex;

pub struct AppState {
    pub data_dir: PathBuf,
    pub db: Database,
    pub config: Arc<RwLock<AppConfig>>,
    pub event_bus: EventBus,
    pub current_workspace: RwLock<Option<WorkspaceMeta>>,
    pub editor_dirty_paths: StdMutex<HashSet<String>>,
    pub pty_sessions: Arc<StdMutex<SessionManager>>,
    pub browser_manager: BrowserManager,
    pub log_manager: Arc<LogManager>,
    pub started_at: i64,
    pub durable_manager: DurableSessionManager,
    pub provider_registry: Arc<RwLock<ProviderRegistry>>,
    /// Shared connection-pooled HTTP client for all provider adapters and
    /// ad-hoc network calls. Avoids per-provider Client background threads.
    pub shared_http_client: Arc<Client>,
    /// Async-aware mutex guarding add/remove custom provider operations.
    /// Uses tokio::sync::Mutex so the guard can live across await points
    /// (required by Tauri's Send-bound command-future contract).
    pub provider_ops_mutex: AsyncMutex<()>,
    /// Cancellation tokens for active agent loops (session_id → token).
    pub loop_cancels: AsyncMutex<std::collections::HashMap<String, tokio_util::sync::CancellationToken>>,
    /// Shared PartEventBus for all Agent Loop runs; the SSE server subscribes
    /// to it so session events reach SSE clients in real time.
    pub part_bus: PartEventBus,
    /// Shared QuestionService resolving question.asked events from any loop.
    pub questions: QuestionService,
    /// Port of the SSE HTTP server (0 = not started). Arc so the background
    /// setup thread can store the port without borrowing AppState.
    pub sse_port: Arc<AtomicU16>,
}
