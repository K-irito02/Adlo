use crate::state::AppState;
use adl_browser::BrowserManager;
use adl_kernel::{config as adl_config, events::EventBus, now_ms};
use adl_pty::SessionManager;
use adl_storage::Database;
use adl_workspace::strip_verbatim_prefix;
use anyhow::Context;
use std::path::{Path, PathBuf};
use std::sync::RwLock;
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

    Ok(AppState {
        data_dir,
        db,
        config: RwLock::new(config),
        event_bus,
        current_workspace: RwLock::new(current_workspace),
        editor_dirty_paths: std::sync::Mutex::new(std::collections::HashSet::new()),
        pty_sessions: std::sync::Arc::new(std::sync::Mutex::new(SessionManager::new())),
        browser_manager: BrowserManager::new(),
        log_manager,
        started_at: now_ms(),
    })
}

pub fn save_config(state: &AppState) -> anyhow::Result<()> {
    let config = state.config.read().map_err(|_| anyhow::anyhow!("config lock poisoned"))?;
    adl_config::save(&state.data_dir, &config)?;
    Ok(())
}
