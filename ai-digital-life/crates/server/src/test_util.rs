//! Shared test harness for `ad-server` handler smoke tests: builds a throwaway
//! `ServerState` (temp DB + fresh ClipboardStore / SystemMonitor) so handlers can
//! be driven through the real router without a full app bootstrap.

#![cfg(test)]

use crate::state::ServerState;
use adl_clipboard::ClipboardStore;
use adl_kernel::config::AppConfig;
use adl_kernel::events::EventBus;
use adl_pty::AsyncSessionManager;
use adl_storage::Database;
use adl_storage::durable::DurableSessionManager;
use adl_sysmon::SystemMonitor;
use std::collections::HashSet;
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::{Arc, Mutex as StdMutex, RwLock};
use tokio::sync::Mutex as AsyncMutex;

static COUNTER: AtomicU16 = AtomicU16::new(0);

/// Build a temp `ServerState` with real (empty) clipboard/sysmon backing.
pub fn test_server_state() -> ServerState {
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let dir = std::env::temp_dir().join(format!("adl-server-test-{}-{n}", std::process::id()));
    std::fs::create_dir_all(&dir).ok();
    let db = Database::open(&dir.join("test.db")).expect("open test db");
    db.init_schema().expect("init test schema");
    adl_migration::run_pending(&db).expect("run pending migrations");

    let root = dir.clone();
    let defaults = adl_kernel::storage::StorageDefaults {
        root: root.clone(),
        credentials_dir: root.join("credentials"),
        downloads_dir: root.clone(),
    };
    let storage = std::sync::Arc::new(adl_kernel::storage::StorageService::from_locator(
        &adl_kernel::storage::StorageLocator::default(),
        &defaults,
    ));

    // LogManager::init 在同一进程内重复调用是容错的（try_init 失败仅告警），
    // 此处取默认日志配置与独立前缀，不干扰其它测试的断言。
    let log_manager = adl_logging::LogManager::init(
        &AppConfig::default().to_log_config(),
        &dir.join("logs"),
        adl_logging::SERVER_TERMINAL_PREFIX,
    )
    .expect("init test log manager");

    ServerState {
        data_dir: dir.clone(),
        storage,
        db: db.clone(),
        config: Arc::new(RwLock::new(AppConfig::default())),
        event_bus: EventBus::new(256),
        log_manager: Arc::new(log_manager),
        log_overrides: adl_logging::LogOverrides::default(),
        current_workspace: Arc::new(RwLock::new(None)),
        editor_dirty_paths: Arc::new(StdMutex::new(HashSet::new())),
        pty_sessions: Arc::new(AsyncSessionManager::new()),
        started_at: 0,
        durable_manager: DurableSessionManager::new(db.clone()),
        server_port: Arc::new(AtomicU16::new(0)),
        clipboard_store: Arc::new(ClipboardStore::new(db, dir)),
        sysmon: Arc::new(StdMutex::new(SystemMonitor::new())),
        dsh_state: Arc::new(AsyncMutex::new(None)),
        dsh_starting: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        dsh_start_lock: Arc::new(AsyncMutex::new(())),
        dsh_version_lock: Arc::new(AsyncMutex::new(())),
        dsh_version_task: adl_dsh_version::TaskReporter::new(),
        dsh_source_cache: Arc::new(RwLock::new(None)),
        dsh_catalog_cache: Arc::new(RwLock::new(None)),
        workspace_watcher: Arc::new(StdMutex::new(None)),
    }
}
