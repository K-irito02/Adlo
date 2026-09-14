use crate::adl_server::AdServerHandle;
use crate::state::AppState;
use adl_kernel::config_watcher::ConfigWatcher;
use adl_kernel::{config as adl_config, events::EventBus};
use adl_types::now_ms;
use anyhow::Context;
use std::path::Path;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use tauri::Manager;
use tracing::{info, warn};

fn resolve_project_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."))
}

/// 构造壳层的存储默认值：默认根 = Tauri `app_data_dir()`；凭据目录与默认下载目录
/// 分别取平台默认与 `adl_browser` 的启发式值。
pub fn resolve_defaults(app: &tauri::App) -> anyhow::Result<adl_kernel::storage::StorageDefaults> {
    let root = app.path().app_data_dir().context("failed to resolve app data dir")?;
    let credentials_dir = adl_kernel::storage::locator::locator_dir().join("credentials");
    let downloads_dir = adl_browser::download_manager::get_default_download_path();
    Ok(adl_kernel::storage::StorageDefaults { root, credentials_dir, downloads_dir })
}

/// 壳层启动迁移：在打开任何 DB/日志句柄之前执行待迁移。
pub fn run_startup_migration(
    defaults: &adl_kernel::storage::StorageDefaults,
) -> Option<adl_kernel::storage::MigrationReport> {
    let mut locator = adl_kernel::storage::load_locator();
    locator.pending_migration.as_ref()?;
    let report = adl_kernel::storage::apply_pending(&mut locator, defaults, |progress| {
        info!(?progress, "storage migration progress");
    });
    if let Err(e) = adl_kernel::storage::save_locator(&locator) {
        tracing::error!(error = %e, "failed to persist storage locator after migration");
    }
    if let Some(r) = report.as_ref() {
        info!(ok = r.ok, files = r.moved_files, "storage migration finished");
    }
    report
}

/// Build the system-only shell state. Business (DB, workspace, providers,
/// durable sessions, SSE) lives in the spawned `adl-server` process — the shell
/// keeps config + log manager + browser manager, then spawns the adl-server child.
pub fn init_app_state(
    data_dir: PathBuf,
    storage: Arc<adl_kernel::storage::StorageService>,
    defaults: adl_kernel::storage::StorageDefaults,
) -> anyhow::Result<AppState> {
    let t0 = std::time::Instant::now();

    let mut config = match adl_config::load_from(&storage.paths().config_dir) {
        Ok(c) => c,
        Err(e) => {
            warn!(error = %e, "config load failed, using default");
            adl_config::AppConfig::default()
        },
    };
    info!("[ADL-PERF] config load: {}ms", t0.elapsed().as_millis());

    // CLI log mode override
    if let Ok(cli_mode) = std::env::var("ADL_CLI_LOG_MODE") {
        if let Ok(mode) = cli_mode.parse() {
            config.terminal_log_mode = mode;
            config.debug_log_mode = mode;
        }
    }

    // 开发态（debug）保留写仓库根 .adl-logs，release 使用 <root>/logs。
    let dev_project_root = if cfg!(debug_assertions) { Some(resolve_project_root()) } else { None };
    let log_dir =
        adl_kernel::storage::resolve_log_dir(storage.paths(), dev_project_root.as_deref());
    std::fs::create_dir_all(&log_dir)?;

    let t1 = std::time::Instant::now();
    let log_manager = adl_logging::LogManager::init(
        &adl_logging::LogConfig {
            terminal_log_mode: config.terminal_log_mode,
            debug_log_mode: config.debug_log_mode,
        },
        &log_dir,
    )
    .context("failed to init log manager")?;
    info!("[ADL-PERF] log init: {}ms", t1.elapsed().as_millis());

    let event_bus = EventBus::default();

    let config_arc = Arc::new(RwLock::new(config));

    // Spawn the adl-server child (business engine). Graceful: a missing binary or
    // failed spawn leaves `base_url: None` and the shell runs system-only.
    let ad_server = AdServerHandle::spawn(&data_dir);
    info!("[ADL-PERF] adl-server spawn: {}ms", t0.elapsed().as_millis());

    info!("[ADL-PERF] init_app_state TOTAL: {}ms", t0.elapsed().as_millis());

    let site_meta_cache = adl_browser::SiteMetaCacheStore::open(&storage.paths().root)
        .map_err(|e| anyhow::anyhow!("failed to open site-meta-cache store: {e}"))?;
    let browser_manager = adl_browser::BrowserManager::new(site_meta_cache);

    let download_db_path = storage.paths().downloads_db.clone();
    let download_db = adl_storage::Database::open(&download_db_path)
        .map_err(|e| anyhow::anyhow!("failed to open download database: {e}"))?;
    download_db
        .init_schema()
        .map_err(|e| anyhow::anyhow!("failed to init download schema: {e}"))?;
    adl_migration::run_pending(&download_db)
        .map_err(|e| anyhow::anyhow!("failed to apply download migrations: {e}"))?;
    let download_manager = adl_browser::download_handler::create_download_manager(download_db);
    download_manager.set_default_dir_override(Some(storage.paths().downloads_default_dir.clone()));

    Ok(AppState {
        storage: storage.clone(),
        storage_defaults: defaults,
        config: config_arc,
        event_bus,
        browser_manager,
        log_manager: Arc::new(log_manager),
        started_at: now_ms(),
        ad_server,
        download_manager,
    })
}

/// Start background tasks for the system shell: hot-reload `config.json` into
/// the shell's in-memory config (used by the kept app commands). The in-process
/// SSE server and durable-session recovery now live in the adl-server process —
/// this shell no longer runs them.
pub fn start_background_tasks(state: &AppState) {
    let config_path = adl_config::config_path_for(&state.storage.paths().config_dir);
    let config_dir = state.storage.paths().config_dir.clone();
    let config_arc = state.config.clone();
    let page_meta_svc = state.browser_manager.page_meta_service().clone();

    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("failed to create background tokio runtime");
        rt.block_on(async move {
            // Site-meta 缓存冷启动预载：将磁盘持久化条目载入内存，使
            // browser_page_meta_get 的缓存优先 peek 在重启后立即命中，
            // 避免每个 URL 首次访问都重复建一次静默 WebView。
            tokio::spawn(async move {
                if let Err(e) = page_meta_svc.preload().await {
                    tracing::warn!(error = %e, "site-meta-cache preload failed");
                }
            });
            // ConfigWatcher hot-reloads config.json into the shell config.
            let initial_config = match config_arc.read() {
                Ok(g) => (*g).clone(),
                Err(poisoned) => {
                    tracing::warn!("AppConfig RwLock poisoned during ConfigWatcher init; recovering with into_inner()");
                    (*poisoned.into_inner()).clone()
                },
            };
            let config_watcher = ConfigWatcher::new(initial_config);
            let mut watcher_rx = config_watcher.subscribe();

            let config_arc_watcher = config_arc.clone();
            let watcher_handle = tokio::spawn(async move {
                config_watcher.start_watching(config_path, config_dir).await;
            });

            let config_update_handle = tokio::spawn(async move {
                while watcher_rx.changed().await.is_ok() {
                    let new_config = watcher_rx.borrow().clone();
                    match config_arc_watcher.write() {
                        Ok(mut cfg) => *cfg = (*new_config).clone(),
                        Err(poisoned) => {
                            tracing::warn!("AppConfig RwLock poisoned in background config updater; recovering with into_inner()");
                            let mut cfg = poisoned.into_inner();
                            *cfg = (*new_config).clone();
                        },
                    }
                }
            });

            let _ = tokio::try_join!(watcher_handle, config_update_handle);
        });
    });
}

/// Save `config` to `config_dir`. The caller is expected to clone the config
/// out under a read lock first — this function performs no locking itself,
/// making it safe to call inside `spawn_blocking`.
pub fn save_config_to_dir(config_dir: &Path, config: &adl_config::AppConfig) -> anyhow::Result<()> {
    adl_config::save_to(config_dir, config)?;
    Ok(())
}
