use crate::state::ServerState;
use adl_errors::AppError;
use adl_kernel::{config as adl_config, events::EventBus};
use adl_logging::LogManager;
use adl_pty::SessionManager;
use adl_storage::Database;
use adl_storage::durable::DurableSessionManager;
use adl_types::now_ms;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use tracing::info;

fn resolve_log_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .map(|p| p.join(".adl-logs"))
        .unwrap_or_else(|| PathBuf::from(".adl-logs"))
}

pub async fn init_server_state(data_dir: &Path) -> Result<ServerState, AppError> {
    eprintln!("[ad-server] init_server_state start, data_dir={}", data_dir.display());
    let log_dir = resolve_log_dir();
    std::fs::create_dir_all(&log_dir).ok();
    let log_config = adl_logging::LogConfig {
        terminal_log_mode: adl_logging::LogMode::default(),
        debug_log_mode: adl_logging::LogMode::default(),
    };
    eprintln!("[ad-server] initializing LogManager...");
    let _log_manager = LogManager::init(&log_config, &log_dir)
        .map_err(|e| AppError::Internal(format!("LogManager init failed: {e}")))?;
    eprintln!("[ad-server] LogManager initialized");

    let db_path = data_dir.join("data.db");
    std::fs::create_dir_all(data_dir).ok();
    eprintln!("[ad-server] opening database at {}...", db_path.display());
    let db = Database::open(&db_path)
        .map_err(|e| AppError::Internal(format!("Database open failed: {e}")))?;
    eprintln!("[ad-server] database opened");

    eprintln!("[ad-server] loading config...");
    let config = adl_config::load(data_dir)
        .map_err(|e| AppError::Internal(format!("Config load failed: {e}")))?;
    eprintln!("[ad-server] config loaded");

    let event_bus = EventBus::new(256);
    let current_workspace = Arc::new(RwLock::new(None));
    let editor_dirty_paths = Arc::new(std::sync::Mutex::new(std::collections::HashSet::new()));
    let pty_sessions = Arc::new(std::sync::Mutex::new(SessionManager::new()));
    let durable_manager = DurableSessionManager::new(db.clone());
    let server_port = Arc::new(std::sync::atomic::AtomicU16::new(0));
    let lsp_clients = Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new()));

    let mcp_client = adl_mcp_client::McpClient::new();
    eprintln!("[ad-server] init_server_state complete");

    Ok(ServerState {
        data_dir: data_dir.to_path_buf(),
        db,
        config: Arc::new(RwLock::new(config)),
        event_bus,
        current_workspace,
        editor_dirty_paths,
        pty_sessions,
        started_at: now_ms(),
        durable_manager,
        server_port,
        lsp_clients,
        mcp_client,
    })
}

pub async fn serve(state: ServerState, port: u16) -> u16 {
    let app = crate::router::app_router(state.clone()).with_state(state.clone());
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr).await.expect("failed to bind TCP listener");
    let bound_port = listener.local_addr().expect("failed to get local address").port();
    state.server_port.store(bound_port, std::sync::atomic::Ordering::Relaxed);
    println!("AD_SERVER_PORT={bound_port}");
    let _ = std::io::stdout().flush();
    info!("[ad-server] listening on 127.0.0.1:{bound_port}");

    let _ = axum::serve(listener, app).await;
    bound_port
}
