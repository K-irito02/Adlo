use crate::state::AppState;
use adl_agent_runtime::durable::DurableSessionManager;
use adl_browser::BrowserManager;
use adl_kernel::config_watcher::ConfigWatcher;
use adl_kernel::{config as adl_config, events::EventBus, now_ms};
use adl_pty::SessionManager;
use adl_storage::Database;
use adl_workspace::strip_verbatim_prefix;
use anyhow::Context;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use tauri::Manager;
use tracing::{info, warn};

fn resolve_project_root() -> PathBuf {
    // The true project root has .git (unlike ai-digital-life/ which also has AGENTS.md).
    if let Ok(cwd) = std::env::current_dir() {
        if cwd.join(".git").exists() {
            return cwd;
        }
        if let Some(parent) = cwd.parent() {
            if parent.join(".git").exists() {
                return parent.to_path_buf();
            }
        }
    }
    // Fall back: CARGO_MANIFEST_DIR → src-tauri → ai-digital-life → project root
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

pub fn init_app_state(data_dir: PathBuf) -> anyhow::Result<AppState> {
    let mut config = match adl_config::load(&data_dir) {
        Ok(c) => c,
        Err(e) => {
            warn!(error = %e, "config load failed, using default");
            adl_config::AppConfig::default()
        },
    };

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

    let log_manager =
        adl_logging::LogManager::init(&adl_logging::LogConfig::from_app_config(&config), &log_dir)
            .context("failed to init log manager")?;

    info!(?log_dir, "log manager initialized");

    let db_path = data_dir.join("state").join("app-state.db");
    let db = Database::open(&db_path).context("failed to open database")?;
    db.init_schema().context("failed to init schema")?;
    let durable_manager = DurableSessionManager::new(db.clone());

    adl_migration::run_pending(&db).context("failed to run migrations")?;
    info!("migrations complete");

    // Run-activity housekeeping (best-effort).
    crate::run_activity_seq::init_run_activity_seq_seed();
    let _ = db.prune_run_activity_events(Some(30_i64 * 24 * 60 * 60 * 1_000), Some(200_000));

    let event_bus = EventBus::default();
    let current_workspace: Option<adl_kernel::WorkspaceMeta> = db
        .get_state("current_workspace")
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_str(&value).ok())
        .map(|mut w: adl_kernel::WorkspaceMeta| {
            w.path = strip_verbatim_prefix(&w.path);
            w.root_path = strip_verbatim_prefix(&w.root_path);
            w
        });

    let config_arc = Arc::new(RwLock::new(config));

    Ok(AppState {
        data_dir,
        db,
        config: config_arc,
        event_bus,
        current_workspace: RwLock::new(current_workspace),
        editor_dirty_paths: std::sync::Mutex::new(std::collections::HashSet::new()),
        pty_sessions: std::sync::Arc::new(std::sync::Mutex::new(SessionManager::new())),
        browser_manager: BrowserManager::new(),
        log_manager,
        started_at: now_ms(),
        durable_manager,
    })
}

/// Start background tasks (config watcher, durable session recovery).
/// Spawns a dedicated std thread with its own tokio runtime so it works during Tauri setup.
pub fn start_background_tasks(state: &AppState) {
    let data_dir = state.data_dir.clone();
    let durable_manager = state.durable_manager.clone();
    let config_arc = state.config.clone();

    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("failed to create background tokio runtime");
        rt.block_on(async move {
            let recovery_manager = durable_manager;
            let data_dir_watch = data_dir.clone();

            // Background task: periodic check for crashed durable sessions
            let recovery_handle = tokio::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
                loop {
                    interval.tick().await;
                    let crashed = recovery_manager.find_crashed_sessions().await;
                    if !crashed.is_empty() {
                        tracing::info!(
                            "Found {} crashed durable sessions, initiating recovery",
                            crashed.len()
                        );
                        for session in &crashed {
                            recovery_manager.start_recovery(&session.session_id).await;
                        }
                    }
                }
            });

            // Create ConfigWatcher and start watching config.json
            let initial_config = config_arc.read().unwrap_or_else(|e| e.into_inner()).clone();
            let config_watcher = ConfigWatcher::new(initial_config);
            let mut watcher_rx = config_watcher.subscribe();

            let config_path = adl_config::config_path(&data_dir_watch);
            let config_arc_watcher = config_arc.clone();
            let watcher_handle = tokio::spawn(async move {
                config_watcher.start_watching(config_path, data_dir_watch).await;
            });

            let config_update_handle = tokio::spawn(async move {
                while watcher_rx.changed().await.is_ok() {
                    let new_config = watcher_rx.borrow().clone();
                    if let Ok(mut cfg) = config_arc_watcher.write() {
                        *cfg = (*new_config).clone();
                    }
                }
            });

            let _ = tokio::try_join!(recovery_handle, watcher_handle, config_update_handle);
        });
    });
}

pub fn save_config(state: &AppState) -> anyhow::Result<()> {
    let config = state.config.read().map_err(|_| anyhow::anyhow!("config lock poisoned"))?;
    adl_config::save(&state.data_dir, &config)?;
    Ok(())
}
