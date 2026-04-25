use crate::state::AppState;
use adl_events::EventBus;
use adl_kernel::now_ms;
use adl_storage::Database;
use anyhow::Context;
use std::path::PathBuf;
use tauri::Manager;
use tracing::info;

pub fn resolve_data_dir(app: &tauri::App) -> anyhow::Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .context("failed to resolve app data dir")?;
    std::fs::create_dir_all(&dir)?;
    info!(?dir, "data directory resolved");
    Ok(dir)
}

pub fn init_app_state(data_dir: PathBuf) -> anyhow::Result<AppState> {
    let config = adl_config::load(&data_dir).unwrap_or_default();

    adl_logger::init(&config.log_level);
    info!("logger initialized");

    let db_path = data_dir.join("state").join("app-state.db");
    let db = Database::open(&db_path).context("failed to open database")?;
    db.init_schema().context("failed to init schema")?;

    adl_migration::run_pending(&db).context("failed to run migrations")?;
    info!("migrations complete");

    let event_bus = EventBus::default();
    let current_workspace = db
        .get_state("current_workspace")
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_str(&value).ok());

    Ok(AppState {
        data_dir,
        db,
        config: std::sync::Mutex::new(config),
        event_bus,
        current_workspace: std::sync::Mutex::new(current_workspace),
        editor_dirty_paths: std::sync::Mutex::new(std::collections::HashSet::new()),
        command_cancellations: std::sync::Arc::new(tokio::sync::Mutex::new(
            std::collections::HashMap::new(),
        )),
        started_at: now_ms(),
    })
}

pub fn save_config(state: &AppState) -> anyhow::Result<()> {
    let config = state.config.lock().expect("config mutex poisoned");
    adl_config::save(&state.data_dir, &config)?;
    Ok(())
}
