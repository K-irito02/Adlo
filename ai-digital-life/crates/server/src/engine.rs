use crate::state::ServerState;
use adl_clipboard::ClipboardMonitor;
use adl_errors::AppError;
use adl_kernel::{config as adl_config, events::EventBus};
use adl_logging::LogManager;
use adl_pty::SessionManager;
use adl_storage::Database;
use adl_storage::durable::DurableSessionManager;
use adl_types::now_ms;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex as StdMutex, RwLock};
use tokio::sync::Mutex as AsyncMutex;
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
    // 确保 schema（包括 durable_session_state、clipboard_items 等）就绪。生产环境
    // 由内核在 spawn 前迁移过 data.db，但此处幂等（CREATE TABLE IF NOT EXISTS），
    // 使本函数在全新 data_dir 上也能自给自足（测试直接构造 state 时同样可用）。
    db.init_schema()
        .map_err(|e| AppError::Internal(format!("Database init_schema failed: {e}")))?;
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
    eprintln!("[ad-server] init_server_state complete");

    // 剪贴板/系统监控（浏览器预览端，等价桌面能力）。剪贴板 store 与监听线程共享同一
    // db（r2d2 连接池，Arc），供 clipboard_* handler 读写。监听线程在 `serve()` 里
    // 通过 `start_background_services` 启动（不在 `init_server_state` 启动，避免测试
    // 直接构造 state 时泄漏监听线程）。
    let clipboard_store = Arc::new(adl_clipboard::ClipboardStore::new(db.clone(), data_dir));
    let sysmon = Arc::new(StdMutex::new(adl_sysmon::SystemMonitor::new()));
    let dsh_state = Arc::new(AsyncMutex::new(None));

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
        clipboard_store,
        sysmon,
        dsh_state,
    })
}

/// Start the ad-server background services tied to the process lifetime: the
/// clipboard listener (writes history to `data.db`) plus a parked keep-alive
/// thread that holds the listener handle alive. Called from `serve()` so tests
/// that build `ServerState` directly (`init_server_state`) never spawn these.
pub fn start_background_services(state: &ServerState) {
    // 启动剪贴板监听。句柄必须存续至进程生命周期，否则 Drop 会触发监听线程立即退出；
    // 放入独立 thread，持句柄阻塞保活（与桌面端 setup::start_clipboard_monitor 同思路）。
    let monitor_handle = ClipboardMonitor::new().spawn(state.clipboard_store.clone());
    std::thread::spawn(move || {
        let _handle = monitor_handle; // 保持监听线程存活
        std::thread::park();
    });
}

pub async fn serve(state: ServerState, port: u16) -> u16 {
    start_background_services(&state);
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
