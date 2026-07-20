use crate::state::AppState;
use adl_browser::BrowserManager;
use adl_kernel::config_watcher::ConfigWatcher;
use adl_kernel::{config as adl_config, events::EventBus};
use adl_model_gateway::adapter::ProviderAdapter;
use adl_model_gateway::providers::anthropic::AnthropicProvider;
use adl_model_gateway::providers::google::GoogleProvider;
use adl_model_gateway::providers::ollama::OllamaProvider;
use adl_model_gateway::providers::openai::OpenAIProvider;
use adl_model_gateway::providers::openrouter::OpenRouterProvider;
use adl_model_gateway::providers::anthropic::DEFAULT_BASE_URL as ANTHROPIC_BASE_URL;
use adl_model_gateway::providers::google::DEFAULT_BASE_URL as GOOGLE_BASE_URL;
use adl_model_gateway::providers::ollama::DEFAULT_BASE_URL as OLLAMA_BASE_URL;
use adl_model_gateway::providers::openai::DEFAULT_BASE_URL as OPENAI_BASE_URL;
use adl_model_gateway::providers::openrouter::DEFAULT_BASE_URL as OPENROUTER_BASE_URL;
use adl_model_gateway::registry::{
    ApiType, AuthType, ModelSource, ProviderDefinition, ProviderRegistry,
};
use adl_pty::SessionManager;
use adl_storage::Database;
use adl_storage::durable::DurableSessionManager;
use adl_types::now_ms;
use adl_workspace::strip_verbatim_prefix;
use anyhow::Context;
use reqwest::Client;
use std::path::{Path, PathBuf};
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

pub fn resolve_data_dir(app: &tauri::App) -> anyhow::Result<PathBuf> {
    let dir = app.path().app_data_dir().context("failed to resolve app data dir")?;
    std::fs::create_dir_all(&dir)?;
    info!(?dir, "data directory resolved");
    Ok(dir)
}

fn register_builtin_providers(shared_client: &Client) -> ProviderRegistry {
    let mut registry = ProviderRegistry::new();

    registry.register(
        ProviderDefinition {
            id: "openai".into(),
            name: "OpenAI".into(),
            description: "OpenAI GPT series models".into(),
            api_type: ApiType::OpenAICompatible,
            default_base_url: Some(OPENAI_BASE_URL.into()),
            auth_type: AuthType::ApiKey,
            models: ModelSource::Static(
                OpenAIProvider::with_client(shared_client.clone()).supported_models(),
            ),
            built_in: true,
            default_model: Some("gpt-4o".into()),
        },
        Box::new(OpenAIProvider::with_client(shared_client.clone())),
    );

    registry.register(
        ProviderDefinition {
            id: "anthropic".into(),
            name: "Anthropic".into(),
            description: "Anthropic Claude series models".into(),
            api_type: ApiType::AnthropicNative,
            default_base_url: Some(ANTHROPIC_BASE_URL.into()),
            auth_type: AuthType::ApiKey,
            models: ModelSource::Static(
                AnthropicProvider::with_client(shared_client.clone()).supported_models(),
            ),
            built_in: true,
            default_model: Some("claude-sonnet-4-20250514".into()),
        },
        Box::new(AnthropicProvider::with_client(shared_client.clone())),
    );

    registry.register(
        ProviderDefinition {
            id: "google".into(),
            name: "Google Gemini".into(),
            description: "Google Gemini models".into(),
            api_type: ApiType::GoogleNative,
            default_base_url: Some(GOOGLE_BASE_URL.into()),
            auth_type: AuthType::ApiKey,
            models: ModelSource::Static(
                GoogleProvider::with_client(shared_client.clone()).supported_models(),
            ),
            built_in: true,
            default_model: Some("gemini-2.5-pro".into()),
        },
        Box::new(GoogleProvider::with_client(shared_client.clone())),
    );

    registry.register(
        ProviderDefinition {
            id: "ollama".into(),
            name: "Ollama".into(),
            description: "Local Ollama models".into(),
            api_type: ApiType::Ollama,
            default_base_url: Some(OLLAMA_BASE_URL.into()),
            auth_type: AuthType::None,
            models: ModelSource::Static(
                OllamaProvider::with_client(shared_client.clone()).supported_models(),
            ),
            built_in: true,
            default_model: None,
        },
        Box::new(OllamaProvider::with_client(shared_client.clone())),
    );

    registry.register(
        ProviderDefinition {
            id: "openrouter".into(),
            name: "OpenRouter".into(),
            description: "OpenRouter unified API".into(),
            api_type: ApiType::OpenAICompatible,
            default_base_url: Some(OPENROUTER_BASE_URL.into()),
            auth_type: AuthType::ApiKey,
            models: ModelSource::Static(
                OpenRouterProvider::with_client(shared_client.clone()).supported_models(),
            ),
            built_in: true,
            default_model: Some("openai/gpt-4o".into()),
        },
        Box::new(OpenRouterProvider::with_client(shared_client.clone())),
    );

    registry.register(
        ProviderDefinition {
            id: "deepseek".into(),
            name: "DeepSeek".into(),
            description: "DeepSeek chat models".into(),
            api_type: ApiType::OpenAICompatible,
            default_base_url: Some("https://api.deepseek.com".into()),
            auth_type: AuthType::ApiKey,
            models: ModelSource::Static(vec![adl_types::types::config::ModelDefinition {
                id: "deepseek-chat".into(),
                provider_id: "deepseek".into(),
                name: "DeepSeek Chat".into(),
                capabilities: vec![
                    adl_types::types::config::ModelCapability::Text,
                    adl_types::types::config::ModelCapability::Streaming,
                ],
                tier: Some(adl_types::types::config::ModelTier::Standard),
                ..Default::default()
            }]),
            built_in: true,
            default_model: Some("deepseek-chat".into()),
        },
        Box::new(OpenAIProvider::with_client_and_base_url(
            shared_client.clone(),
            "https://api.deepseek.com".into(),
        )),
    );

    registry.register(
        ProviderDefinition {
            id: "minimax".into(),
            name: "MiniMax".into(),
            description: "MiniMax models".into(),
            api_type: ApiType::OpenAICompatible,
            default_base_url: Some("https://api.minimax.io".into()),
            auth_type: AuthType::ApiKey,
            models: ModelSource::Static(vec![adl_types::types::config::ModelDefinition {
                id: "MiniMax-M2.7".into(),
                provider_id: "minimax".into(),
                name: "MiniMax M2.7".into(),
                capabilities: vec![
                    adl_types::types::config::ModelCapability::Text,
                    adl_types::types::config::ModelCapability::Streaming,
                ],
                tier: Some(adl_types::types::config::ModelTier::Standard),
                ..Default::default()
            }]),
            built_in: true,
            default_model: Some("MiniMax-M2.7".into()),
        },
        Box::new(OpenAIProvider::with_client_and_base_url(
            shared_client.clone(),
            "https://api.minimax.io".into(),
        )),
    );

    registry
}

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

    let db_path = data_dir.join("state").join("app-state.db");
    let t2 = std::time::Instant::now();
    let db = Database::open(&db_path).context("failed to open database")?;
    db.init_schema().context("failed to init schema")?;
    info!("[ADL-PERF] db open+init: {}ms", t2.elapsed().as_millis());
    let durable_manager = DurableSessionManager::new(db.clone());

    let t4 = std::time::Instant::now();
    adl_migration::run_pending(&db).context("failed to run migrations")?;
    info!("[ADL-PERF] migrations: {}ms", t4.elapsed().as_millis());

    // Run-activity housekeeping (best-effort).
    let t5 = std::time::Instant::now();
    adl_agent_runtime::run_activity_seq::init_run_activity_seq_seed();
    let _ = db.prune_run_activity_events(Some(30_i64 * 24 * 60 * 60 * 1_000), Some(200_000));
    info!("[ADL-PERF] housekeeping: {}ms", t5.elapsed().as_millis());

    let event_bus = EventBus::default();
    let t6 = std::time::Instant::now();
    let current_workspace: Option<adl_types::WorkspaceMeta> = db
        .get_state("current_workspace")
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_str(&value).ok())
        .map(|mut w: adl_types::WorkspaceMeta| {
            w.path = strip_verbatim_prefix(&w.path);
            w.root_path = strip_verbatim_prefix(&w.root_path);
            w
        });
    info!("[ADL-PERF] load workspace: {}ms", t6.elapsed().as_millis());

    let config_arc = Arc::new(RwLock::new(config));

    let t7 = std::time::Instant::now();
    let shared_client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .pool_max_idle_per_host(16)
        .user_agent("ai-digital-life/1.0")
        .build()
        .context("failed to build shared HTTP client")?;
    info!("[ADL-PERF] http client: {}ms", t7.elapsed().as_millis());

    let t8 = std::time::Instant::now();
    let provider_registry = Arc::new(RwLock::new(register_builtin_providers(&shared_client)));
    info!("[ADL-PERF] register providers: {}ms", t8.elapsed().as_millis());

    info!("[ADL-PERF] init_app_state TOTAL: {}ms", t0.elapsed().as_millis());

    Ok(AppState {
        data_dir,
        db,
        config: config_arc,
        event_bus,
        current_workspace: RwLock::new(current_workspace),
        editor_dirty_paths: std::sync::Mutex::new(std::collections::HashSet::new()),
        pty_sessions: std::sync::Arc::new(std::sync::Mutex::new(SessionManager::new())),
        browser_manager: BrowserManager::new(),
        log_manager: Arc::new(log_manager),
        started_at: now_ms(),
        durable_manager,
        provider_registry,
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

/// Save `config` to `data_dir`. The caller is expected to clone the config
/// out under a read lock first — this function performs no locking itself,
/// making it safe to call inside `spawn_blocking`.
pub fn save_config_to_dir(data_dir: &Path, config: &adl_config::AppConfig) -> anyhow::Result<()> {
    adl_config::save(data_dir, config)?;
    Ok(())
}
