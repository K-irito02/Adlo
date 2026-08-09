use crate::sse::SseEventBus;
use crate::sse_server::{spawn_http_server, spawn_http_server_on_port};
use crate::state::ServerState;
use adl_agent_runtime::part_event_bus::PartEventBus;
use adl_agent_runtime::question::QuestionService;
use adl_errors::AppError;
use adl_kernel::{config as adl_config, events::EventBus};
use adl_logging::{LogError, LogManager};
use adl_model_gateway::adapter::ProviderAdapter;
use adl_model_gateway::providers::anthropic::AnthropicProvider;
use adl_model_gateway::providers::anthropic::DEFAULT_BASE_URL as ANTHROPIC_BASE_URL;
use adl_model_gateway::providers::google::DEFAULT_BASE_URL as GOOGLE_BASE_URL;
use adl_model_gateway::providers::google::GoogleProvider;
use adl_model_gateway::providers::ollama::DEFAULT_BASE_URL as OLLAMA_BASE_URL;
use adl_model_gateway::providers::ollama::OllamaProvider;
use adl_model_gateway::providers::openai::DEFAULT_BASE_URL as OPENAI_BASE_URL;
use adl_model_gateway::providers::openai::OpenAIProvider;
use adl_model_gateway::providers::openrouter::DEFAULT_BASE_URL as OPENROUTER_BASE_URL;
use adl_model_gateway::providers::openrouter::OpenRouterProvider;
use adl_model_gateway::registry::{
    ApiType, AuthType, ModelSource, ProviderDefinition, ProviderRegistry,
};
use adl_pty::SessionManager;
use adl_storage::Database;
use adl_storage::durable::DurableSessionManager;
use adl_types::config::{ModelCapability, ModelDefinition};
use adl_types::now_ms;
use adl_workspace::strip_verbatim_prefix;
use reqwest::Client;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use tracing::{info, warn};

/// The `.adl-logs` directory resolves two parents above this crate's manifest
/// dir — i.e. the Cargo workspace root, mirroring `setup.rs::resolve_project_root`
/// in src-tauri. Keeps the real `LogManager` (which requires a writable log dir)
/// functional without relying on the process CWD.
fn resolve_log_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .map(|p| p.join(".adl-logs"))
        .unwrap_or_else(|| PathBuf::from(".adl-logs"))
}

/// Register the built-in providers that ship with the app. Ported verbatim from
/// `src-tauri/src/setup.rs::register_builtin_providers` so the server exposes
/// exactly the same provider set as the desktop shell.
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
            models: ModelSource::Static(vec![
                adl_types::types::config::ModelDefinition {
                    id: "deepseek-chat".into(),
                    provider_id: "deepseek".into(),
                    name: "DeepSeek Chat".into(),
                    capabilities: vec![
                        adl_types::types::config::ModelCapability::Text,
                        adl_types::types::config::ModelCapability::Streaming,
                    ],
                    tier: Some(adl_types::types::config::ModelTier::Standard),
                    ..Default::default()
                },
                adl_types::types::config::ModelDefinition {
                    id: "deepseek-v4-flash".into(),
                    provider_id: "deepseek".into(),
                    name: "DeepSeek V4 Flash".into(),
                    capabilities: vec![
                        adl_types::types::config::ModelCapability::Text,
                        adl_types::types::config::ModelCapability::Streaming,
                    ],
                    tier: Some(adl_types::types::config::ModelTier::Standard),
                    ..Default::default()
                },
                adl_types::types::config::ModelDefinition {
                    id: "deepseek-v4-pro".into(),
                    provider_id: "deepseek".into(),
                    name: "DeepSeek V4 Pro".into(),
                    capabilities: vec![
                        adl_types::types::config::ModelCapability::Text,
                        adl_types::types::config::ModelCapability::Streaming,
                    ],
                    tier: Some(adl_types::types::config::ModelTier::Standard),
                    ..Default::default()
                },
            ]),
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
            default_base_url: Some("https://api.minimaxi.com/v1".into()),
            auth_type: AuthType::ApiKey,
            models: ModelSource::Static(vec![
                adl_types::types::config::ModelDefinition {
                    id: "MiniMax-M3".into(),
                    provider_id: "minimax".into(),
                    name: "MiniMax M3".into(),
                    capabilities: vec![
                        adl_types::types::config::ModelCapability::Text,
                        adl_types::types::config::ModelCapability::Streaming,
                    ],
                    tier: Some(adl_types::types::config::ModelTier::Standard),
                    ..Default::default()
                },
                adl_types::types::config::ModelDefinition {
                    id: "MiniMax-M2.7".into(),
                    provider_id: "minimax".into(),
                    name: "MiniMax M2.7".into(),
                    capabilities: vec![
                        adl_types::types::config::ModelCapability::Text,
                        adl_types::types::config::ModelCapability::Streaming,
                    ],
                    tier: Some(adl_types::types::config::ModelTier::Standard),
                    ..Default::default()
                },
                adl_types::types::config::ModelDefinition {
                    id: "MiniMax-M2.7-highspeed".into(),
                    provider_id: "minimax".into(),
                    name: "MiniMax M2.7 High-Speed".into(),
                    capabilities: vec![
                        adl_types::types::config::ModelCapability::Text,
                        adl_types::types::config::ModelCapability::Streaming,
                    ],
                    tier: Some(adl_types::types::config::ModelTier::Standard),
                    ..Default::default()
                },
                adl_types::types::config::ModelDefinition {
                    id: "MiniMax-M2.5".into(),
                    provider_id: "minimax".into(),
                    name: "MiniMax M2.5".into(),
                    capabilities: vec![
                        adl_types::types::config::ModelCapability::Text,
                        adl_types::types::config::ModelCapability::Streaming,
                    ],
                    tier: Some(adl_types::types::config::ModelTier::Standard),
                    ..Default::default()
                },
                adl_types::types::config::ModelDefinition {
                    id: "MiniMax-M2.5-highspeed".into(),
                    provider_id: "minimax".into(),
                    name: "MiniMax M2.5 High-Speed".into(),
                    capabilities: vec![
                        adl_types::types::config::ModelCapability::Text,
                        adl_types::types::config::ModelCapability::Streaming,
                    ],
                    tier: Some(adl_types::types::config::ModelTier::Standard),
                    ..Default::default()
                },
                adl_types::types::config::ModelDefinition {
                    id: "MiniMax-M2.1".into(),
                    provider_id: "minimax".into(),
                    name: "MiniMax M2.1".into(),
                    capabilities: vec![
                        adl_types::types::config::ModelCapability::Text,
                        adl_types::types::config::ModelCapability::Streaming,
                    ],
                    tier: Some(adl_types::types::config::ModelTier::Standard),
                    ..Default::default()
                },
                adl_types::types::config::ModelDefinition {
                    id: "MiniMax-M2.1-highspeed".into(),
                    provider_id: "minimax".into(),
                    name: "MiniMax M2.1 High-Speed".into(),
                    capabilities: vec![
                        adl_types::types::config::ModelCapability::Text,
                        adl_types::types::config::ModelCapability::Streaming,
                    ],
                    tier: Some(adl_types::types::config::ModelTier::Standard),
                    ..Default::default()
                },
                adl_types::types::config::ModelDefinition {
                    id: "MiniMax-M2".into(),
                    provider_id: "minimax".into(),
                    name: "MiniMax M2".into(),
                    capabilities: vec![
                        adl_types::types::config::ModelCapability::Text,
                        adl_types::types::config::ModelCapability::Streaming,
                    ],
                    tier: Some(adl_types::types::config::ModelTier::Standard),
                    ..Default::default()
                },
            ]),
            built_in: true,
            default_model: Some("MiniMax-M2.7".into()),
        },
        Box::new(OpenAIProvider::with_client_and_base_url(
            shared_client.clone(),
            "https://api.minimaxi.com/v1".into(),
        )),
    );

    registry
}

/// Initialize the full engine state for the standalone server, extracting the
/// `init_app_state` flow from `src-tauri/src/setup.rs` (minus Tauri bindings):
/// config load, log manager, DB open + schema + migrations, provider registry
/// (built-ins + config custom providers), durable sessions, part bus and the
/// question service.
///
/// `data_dir` is the state root — the DB lives at `<data_dir>/state/app-state.db`
/// and the config at `<data_dir>/config.json`. The log directory is derived
/// from the crate layout (not the process CWD), see [`resolve_log_dir`].
pub async fn init_server_state(data_dir: &Path) -> Result<ServerState, AppError> {
    let t0 = std::time::Instant::now();

    std::fs::create_dir_all(data_dir)?;
    let mut config = match adl_config::load(data_dir) {
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

    let log_dir = resolve_log_dir();
    std::fs::create_dir_all(&log_dir)?;

    let t1 = std::time::Instant::now();
    let log_manager = LogManager::init(
        &adl_logging::LogConfig {
            terminal_log_mode: config.terminal_log_mode,
            debug_log_mode: config.debug_log_mode,
        },
        &log_dir,
    )
    .map_err(|e| match e {
        LogError::Io(io) => AppError::from(io),
        LogError::Config(msg) => AppError::Config(msg),
        LogError::ModeSwitch(msg) | LogError::Session(msg) => AppError::Internal(msg),
    })?;
    info!("[ADL-PERF] log init: {}ms", t1.elapsed().as_millis());

    let db_path = data_dir.join("state").join("app-state.db");
    let t2 = std::time::Instant::now();
    let db = Database::open(&db_path).map_err(|e| {
        AppError::Storage(format!("failed to open database at {}: {e}", db_path.display()))
    })?;
    db.init_schema()?;
    info!("[ADL-PERF] db open+init: {}ms", t2.elapsed().as_millis());
    let durable_manager = DurableSessionManager::new(db.clone());

    let t4 = std::time::Instant::now();
    adl_migration::run_pending(&db)?;
    info!("[ADL-PERF] migrations: {}ms", t4.elapsed().as_millis());

    // Run-activity housekeeping (best-effort).
    let t5 = std::time::Instant::now();
    adl_agent_runtime::run_activity_seq::init_run_activity_seq_seed();
    let _ = db.prune_run_activity_events(Some(30_i64 * 24 * 60 * 60 * 1_000), Some(200_000));
    info!("[ADL-PERF] housekeeping: {}ms", t5.elapsed().as_millis());

    let event_bus = EventBus::default();
    let part_bus = PartEventBus::new(256);
    let questions = QuestionService::new(part_bus.clone());
    // The SSE bus owns a clone of the DB so the connect from event_log replay
    // work; the bus itself becomes a ServerState field and is subscribed to
    // `part_bus` after the struct is built.
    let sse_bus = SseEventBus::new(db.clone());
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
    let shared_client = Arc::new(
        Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .pool_max_idle_per_host(16)
            .user_agent("ai-digital-life/1.0")
            .build()
            .map_err(|e| AppError::Network(format!("failed to build shared HTTP client: {e}")))?,
    );
    info!("[ADL-PERF] http client: {}ms", t7.elapsed().as_millis());

    let t8 = std::time::Instant::now();
    let mut provider_registry = register_builtin_providers(shared_client.as_ref());

    // Load user-defined custom providers from config (persisted across restarts).
    // NOTE: in-app add/remove_custom_provider flows mutate both the in-memory
    // registry and the on-disk config atomically, so this startup pass is only
    // a bootstrap from the last-persisted config.
    {
        let config_guard = match config_arc.read() {
            Ok(g) => g,
            Err(poisoned) => {
                tracing::warn!(
                    "AppConfig RwLock poisoned during startup; recovering with into_inner() and continuing to load custom providers"
                );
                poisoned.into_inner()
            },
        };
        for cp in &config_guard.custom_providers {
            let model_defs: Vec<ModelDefinition> = cp
                .models
                .iter()
                .map(|m| ModelDefinition {
                    id: m.clone(),
                    provider_id: cp.id.clone(),
                    name: m.clone(),
                    capabilities: vec![ModelCapability::Text],
                    ..Default::default()
                })
                .collect();
            let def = ProviderDefinition {
                id: cp.id.clone(),
                name: cp.name.clone(),
                description: format!("Custom OpenAI-compatible: {}", cp.name),
                api_type: ApiType::OpenAICompatible,
                default_base_url: Some(cp.base_url.clone()),
                auth_type: AuthType::ApiKey,
                models: ModelSource::Static(model_defs),
                built_in: false,
                default_model: None,
            };
            provider_registry.register(
                def,
                // Reuse the shared connection-pooled HTTP client to avoid a
                // per-custom-provider Client (each spawns background threads).
                Box::new(OpenAIProvider::with_client_and_base_url(
                    (*shared_client).clone(),
                    cp.base_url.clone(),
                )),
            );
        }
    }
    let provider_registry = Arc::new(RwLock::new(provider_registry));
    info!("[ADL-PERF] register providers: {}ms", t8.elapsed().as_millis());

    info!("[ADL-PERF] init_server_state TOTAL: {}ms", t0.elapsed().as_millis());

    let state = ServerState {
        data_dir: data_dir.to_path_buf(),
        db,
        config: config_arc,
        event_bus,
        current_workspace: Arc::new(RwLock::new(current_workspace)),
        editor_dirty_paths: Arc::new(std::sync::Mutex::new(std::collections::HashSet::new())),
        pty_sessions: std::sync::Arc::new(std::sync::Mutex::new(SessionManager::new())),
        log_manager: Arc::new(log_manager),
        started_at: now_ms(),
        durable_manager,
        provider_registry,
        shared_http_client: shared_client,
        provider_ops_mutex: Arc::new(tokio::sync::Mutex::new(())),
        loop_cancels: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
        part_bus,
        questions,
        sse_bus,
        server_port: std::sync::Arc::new(std::sync::atomic::AtomicU16::new(0)),
        lsp_clients: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
        mcp_client: adl_mcp_client::McpClient::new(),
    };

    // Subscribe the shared SSE bus to the PartEventBus so session events from
    // any agent loop reach `/event` consumers (replay + live).
    state.sse_bus.spawn(state.part_bus.clone());

    Ok(state)
}

/// Bind and serve the full ad-server HTTP surface, returning the port that was
/// actually bound (stored into `state.server_port`).
///
/// `requested_port == 0` binds an OS-assigned ephemeral port via
/// [`spawn_http_server`]. A non-zero `requested_port` binds that exact port —
/// if it is already in use the process prints the error to stderr and exits
/// non-zero, so the parent/probe (which relies on `/health`) fails loudly
/// instead of silently serving elsewhere.
pub async fn serve(state: ServerState, requested_port: u16) -> u16 {
    if requested_port == 0 {
        return spawn_http_server(&state).await;
    }
    match spawn_http_server_on_port(&state, requested_port).await {
        Ok(port) => port,
        Err(e) => {
            eprintln!("[ad-server] failed to bind port {requested_port}: {e}");
            std::process::exit(1);
        },
    }
}
