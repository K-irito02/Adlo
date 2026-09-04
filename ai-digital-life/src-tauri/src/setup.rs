use crate::ad_server::AdServerHandle;
use crate::state::AppState;
use adl_kernel::config_watcher::ConfigWatcher;
use adl_kernel::{config as adl_config, events::EventBus};
use adl_types::now_ms;
use anyhow::Context;
use std::path::Path;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use tauri::{Emitter, Manager};
use tracing::{info, warn};

fn resolve_project_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."))
}

pub fn resolve_data_dir(app: &tauri::App) -> anyhow::Result<PathBuf> {
    let dir = app.path().app_data_dir().context("failed to resolve app data dir")?;
    std::fs::create_dir_all(&dir)?;
    info!(?dir, "data directory resolved");
    Ok(dir)
}

/// Build the system-only shell state. Business (DB, workspace, providers,
/// durable sessions, SSE) lives in the spawned `ad-server` process — the shell
/// keeps config + log manager + browser manager, then spawns the ad-server child.
pub fn init_app_state(data_dir: PathBuf) -> anyhow::Result<AppState> {
    let t0 = std::time::Instant::now();

    let mut config = match adl_config::load(&data_dir) {
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

    let project_root = resolve_project_root();
    let log_dir = project_root.join(".adl-logs");
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

    // Spawn the ad-server child (business engine). Graceful: a missing binary or
    // failed spawn leaves `base_url: None` and the shell runs system-only.
    let ad_server = AdServerHandle::spawn(&data_dir);
    info!("[ADL-PERF] ad-server spawn: {}ms", t0.elapsed().as_millis());

    info!("[ADL-PERF] init_app_state TOTAL: {}ms", t0.elapsed().as_millis());

    let site_meta_cache = adl_browser::SiteMetaCacheStore::open(&data_dir)
        .map_err(|e| anyhow::anyhow!("failed to open site-meta-cache store: {e}"))?;
    let browser_manager = adl_browser::BrowserManager::new(site_meta_cache);

    let download_db_path = data_dir.join("downloads.db");
    let download_db = adl_storage::Database::open(&download_db_path)
        .map_err(|e| anyhow::anyhow!("failed to open download database: {e}"))?;
    download_db
        .init_schema()
        .map_err(|e| anyhow::anyhow!("failed to init download schema: {e}"))?;
    adl_migration::run_pending(&download_db)
        .map_err(|e| anyhow::anyhow!("failed to apply download migrations: {e}"))?;
    let download_manager = adl_browser::download_handler::create_download_manager(download_db);

    Ok(AppState {
        data_dir,
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
/// SSE server and durable-session recovery now live in the ad-server process —
/// this shell no longer runs them.
pub fn start_background_tasks(state: &AppState) {
    let data_dir = state.data_dir.clone();
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

            let config_path = adl_config::config_path(&data_dir);
            let config_arc_watcher = config_arc.clone();
            let watcher_handle = tokio::spawn(async move {
                config_watcher.start_watching(config_path, data_dir).await;
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

/// Save `config` to `data_dir`. The caller is expected to clone the config
/// out under a read lock first — this function performs no locking itself,
/// making it safe to call inside `spawn_blocking`.
pub fn save_config_to_dir(data_dir: &Path, config: &adl_config::AppConfig) -> anyhow::Result<()> {
    adl_config::save(data_dir, config)?;
    Ok(())
}

/// Open (and initialize schema for) the clipboard history database in `data_dir`,
/// then build a `ClipboardStore` backed by it. Mirrors the `downloads.db`
/// pattern: the shell owns this per-app DB directly (independent of the ad-server's
/// business DB). Clipboard history is global, so it does not need migration.
pub fn open_clipboard_store(data_dir: &Path) -> anyhow::Result<adl_clipboard::ClipboardStore> {
    let db_path = data_dir.join("clipboard.db");
    let db = adl_storage::Database::open(&db_path)
        .map_err(|e| anyhow::anyhow!("failed to open clipboard database: {e}"))?;
    db.init_schema().map_err(|e| anyhow::anyhow!("failed to init clipboard schema: {e}"))?;
    Ok(adl_clipboard::ClipboardStore::new(db, data_dir))
}

/// Start the desktop clipboard listener and forward new entries to the frontend.
/// Listens on the monitor's broadcast channel: `Some(id)` (new entry) is emitted
/// to the webview as `clipboard-changed` and mirrored to the kernel `EventBus`
/// for `app_get_diagnostics`; `None` (dedup merge) only updates storage, no push.
pub fn start_clipboard_monitor(
    app: tauri::AppHandle,
    store: std::sync::Arc<adl_clipboard::ClipboardStore>,
    event_bus: adl_kernel::events::EventBus,
) {
    let monitor = adl_clipboard::ClipboardMonitor::new();
    let mut rx = monitor.subscribe();
    // 句柄必须存活至应用生命周期，否则 Drop 会触发监听线程立即退出，导致
    // `clipboard-changed` 事件链路不可达。将句柄移入前向转发线程持有。
    let handle = monitor.spawn(store);
    std::thread::spawn(move || {
        let _handle = handle; // 前向转发线程存活期间保持监听存活
        while let Ok(change) = rx.blocking_recv() {
            if let Some(id) = change {
                let _ = app.emit("clipboard-changed", &id);
                event_bus.emit(adl_kernel::events::AppEvent::ClipboardChanged(id));
            }
        }
    });
}
