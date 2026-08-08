use crate::commands::ipc;
use crate::state::AppState;
use adl_agent_runtime::loop_executor::{LoopExecutor, TurnConfig, TurnResult};
use adl_agent_runtime::part_event_bus::PartEventBus;
use adl_agent_runtime::part_store::PartStore;
use adl_agent_runtime::question::QuestionService;
use adl_agent_runtime::ToolRegistry;
use adl_errors::AppError;
use adl_model_gateway::stream_adapter::stream_chunks_to_llm_events;
use adl_storage::Database;
use adl_types::model::ModelChatMessage;
use adl_types::{IpcResult, MessageRecord, PartRecord};
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

/// `PartStore` backed by the ADL SQLite database. rusqlite is blocking, so
/// every operation runs via `spawn_blocking`.
pub struct DbPartStore(pub Database);

#[async_trait::async_trait]
impl PartStore for DbPartStore {
    async fn save_message(&self, msg: &MessageRecord) -> Result<(), AppError> {
        let db = self.0.clone();
        let msg = msg.clone();
        tokio::task::spawn_blocking(move || db.save_message(&msg))
            .await
            .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?
    }

    async fn save_part(&self, part: &PartRecord) -> Result<(), AppError> {
        let db = self.0.clone();
        let part = part.clone();
        tokio::task::spawn_blocking(move || db.save_part(&part))
            .await
            .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?
    }

    async fn list_parts(&self, message_id: &str) -> Result<Vec<PartRecord>, AppError> {
        let db = self.0.clone();
        let message_id = message_id.to_string();
        tokio::task::spawn_blocking(move || db.list_parts(&message_id))
            .await
            .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?
    }
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoopRunInput {
    pub session_id: String,
    pub prompt: String,
    pub provider_id: Option<String>,
    pub model_id: Option<String>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoopRunResult {
    pub run_id: String,
    pub turn_count: u32,
    pub status: String,
}

/// Build the model messages for a loop turn: a system prompt plus the user prompt.
fn build_llm_messages(prompt: &str) -> Vec<ModelChatMessage> {
    vec![
        ModelChatMessage {
            role: adl_types::ConversationRole::System,
            content: "You are AI Digital Life, an agentic coding assistant. Use tools to help the user."
                .to_string(),
        },
        ModelChatMessage {
            role: adl_types::ConversationRole::User,
            content: prompt.to_string(),
        },
    ]
}

#[tauri::command]
pub async fn agent_loop_run(
    state: tauri::State<'_, AppState>,
    input: LoopRunInput,
) -> Result<IpcResult<LoopRunResult>, crate::error::CommandError> {
    Ok(ipc(agent_loop_run_inner(&state, input).await))
}

async fn agent_loop_run_inner(
    state: &AppState,
    input: LoopRunInput,
) -> Result<LoopRunResult, AppError> {
    // Register the cancel token BEFORE any fallible work so aborts during
    // provider resolution / gateway streaming can cancel the loop.
    let cancel = CancellationToken::new();
    register_cancel(&state.loop_cancels, &input.session_id, cancel.clone()).await;

    // Fallible work; the token is cleaned up regardless of the outcome.
    let result = run_loop(state, &input, cancel.clone()).await;

    // ALWAYS unregister — on success AND on error.
    unregister_cancel(&state.loop_cancels, &input.session_id).await;
    result
}

/// All fallible work for a loop run. The session's cancel token is registered
/// by `agent_loop_run_inner` for the duration of this call, which guarantees
/// the token is unregistered on success and error paths alike.
async fn run_loop(
    state: &AppState,
    input: &LoopRunInput,
    cancel: CancellationToken,
) -> Result<LoopRunResult, AppError> {
    crate::commands::conversation::require_session(state, &input.session_id)?;

    // 1. provider/model resolution + gateway construction BEFORE any message
    // persistence so pre-stream failures never leave ghost messages behind.
    let (provider_id, model_id) = resolve_provider_model(state, input)?;
    let gateway = {
        let config = state
            .config
            .read()
            .map_err(|_| AppError::Internal("config lock poisoned".into()))?;
        adl_model_gateway::ModelGateway::new(
            config.model_preferences.clone(),
            state.provider_registry.clone(),
        )?
    };

    // 2. executor
    let store: Arc<dyn PartStore> = Arc::new(DbPartStore(state.db.clone()));
    let bus = PartEventBus::new(256);
    let questions = QuestionService::new(bus.clone());
    let registry = Arc::new(ToolRegistry::with_builtins());
    let executor = LoopExecutor::new(bus.clone(), store.clone(), questions, registry);

    let model_meta = serde_json::json!({ "providerID": provider_id, "id": model_id });

    // 3. user message
    let user_msg_id = adl_types::create_id("msg");
    let user_msg = MessageRecord {
        id: user_msg_id.clone(),
        session_id: input.session_id.clone(),
        role: "user".into(),
        parent_id: None,
        agent: None,
        model: None,
        summary: None,
        time_created: adl_types::now_ms(),
        time_completed: None,
    };
    store.save_message(&user_msg).await?;

    // 4. assistant message
    let assistant_msg_id = adl_types::create_id("msg");
    let assistant_msg = MessageRecord {
        id: assistant_msg_id.clone(),
        session_id: input.session_id.clone(),
        role: "assistant".into(),
        parent_id: Some(user_msg_id.clone()),
        agent: None,
        model: None,
        summary: None,
        time_created: adl_types::now_ms(),
        time_completed: None,
    };
    store.save_message(&assistant_msg).await?;

    // 5. multi-round while loop
    let mut turn_count = 0u32;
    let mut status = "completed".to_string();
    loop {
        if cancel.is_cancelled() {
            status = "cancelled".to_string();
            break;
        }
        let messages = build_llm_messages(&input.prompt);
        let stream = match gateway.chat_stream_for_model(&provider_id, &model_id, messages).await {
            Ok(s) => s,
            Err(e) => {
                // Finalize the assistant message so a failed stream open doesn't
                // leave a ghost assistant row with time_completed: None / model: None.
                let mut msg = assistant_msg.clone();
                msg.time_completed = Some(adl_types::now_ms());
                msg.model = Some(model_meta.clone());
                store.save_message(&msg).await?;
                return Err(e);
            },
        };
        let llm_events = stream_chunks_to_llm_events(stream);
        let result = executor
            .run_turn(
                TurnConfig {
                    session_id: input.session_id.clone(),
                    message_id: assistant_msg_id.clone(),
                    parent_id: Some(user_msg_id.clone()),
                    model: Some(model_meta.clone()),
                },
                llm_events,
                cancel.clone(),
            )
            .await;
        turn_count += 1;
        match result {
            Ok(TurnResult::Continue) => continue,
            Ok(TurnResult::Stop) => break,
            Ok(TurnResult::Error) => {
                status = "error".to_string();
                break;
            },
            Err(e) => {
                status = format!("error: {e}");
                break;
            },
        }
    }

    // 6. finalize assistant message: completion timestamp + resolved model.
    let mut assistant_msg = assistant_msg;
    assistant_msg.time_completed = Some(adl_types::now_ms());
    assistant_msg.model = Some(model_meta);
    store.save_message(&assistant_msg).await?;

    Ok(LoopRunResult { run_id: assistant_msg_id, turn_count, status })
}

/// Register a cancellation token for an active loop keyed by session id.
async fn register_cancel(
    cancels: &tokio::sync::Mutex<std::collections::HashMap<String, CancellationToken>>,
    session_id: &str,
    token: CancellationToken,
) {
    cancels.lock().await.insert(session_id.to_string(), token);
}

/// Remove the cancellation token for a finished/cancelled loop.
async fn unregister_cancel(
    cancels: &tokio::sync::Mutex<std::collections::HashMap<String, CancellationToken>>,
    session_id: &str,
) {
    cancels.lock().await.remove(session_id);
}

/// Resolve the provider/model pair for a loop run. Falls back to the first
/// enabled provider (by priority) from model preferences.
fn resolve_provider_model(state: &AppState, input: &LoopRunInput) -> Result<(String, String), AppError> {
    let config = state
        .config
        .read()
        .map_err(|_| AppError::Internal("config lock poisoned".into()))?;
    if let (Some(pid), Some(mid)) = (&input.provider_id, &input.model_id) {
        return Ok((pid.clone(), mid.clone()));
    }
    let mut providers: Vec<(String, i32)> = config
        .model_preferences
        .providers
        .iter()
        .filter(|(_, pref)| pref.enabled)
        .map(|(pid, pref)| (pid.clone(), pref.priority))
        .collect();
    providers.sort_by_key(|(_, priority)| *priority);
    let first = providers.first().map(|(p, _)| p.clone()).unwrap_or_else(|| "deepseek".to_string());
    let model = config
        .model_preferences
        .providers
        .get(&first)
        .map(|p| p.model_id.clone())
        .unwrap_or_else(|| "deepseek-chat".to_string());
    Ok((first, model))
}

/// Cancel the token registered for a session (no-op if none registered).
async fn abort_loop(
    cancels: &tokio::sync::Mutex<std::collections::HashMap<String, CancellationToken>>,
    session_id: &str,
) {
    let cancels = cancels.lock().await;
    if let Some(token) = cancels.get(session_id) {
        token.cancel();
    }
}

#[tauri::command]
pub async fn agent_loop_abort(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> Result<IpcResult<()>, crate::error::CommandError> {
    abort_loop(&state.loop_cancels, &session_id).await;
    Ok(ipc(Ok(())))
}

#[cfg(test)]
mod tests {
    use super::*;
    use adl_agent_runtime::part_store::PartStore;
    use adl_types::{MessageRecord, PartRecord, PartType};

    fn temp_db() -> adl_storage::Database {
        let path =
            std::env::temp_dir().join(format!("adl-dbpartstore-{}.db", uuid::Uuid::new_v4()));
        let _ = std::fs::remove_file(&path);
        let db = adl_storage::Database::open(&path).unwrap();
        db.init_schema().unwrap();
        db
    }

    #[tokio::test]
    async fn db_part_store_saves_and_lists_part() {
        let db = temp_db();
        let store = DbPartStore(db);
        let part = PartRecord {
            id: "part_1".into(),
            message_id: "msg_1".into(),
            session_id: "s1".into(),
            r#type: PartType::Text,
            ordinal: 0,
            time_created: 0,
            data: serde_json::json!({"type": "text", "text": "hi"}),
        };
        store.save_part(&part).await.unwrap();
        let parts = store.list_parts("msg_1").await.unwrap();
        assert_eq!(parts.len(), 1);
        assert_eq!(parts[0].data["text"], "hi");
    }

    #[tokio::test]
    async fn db_part_store_saves_message() {
        let db = temp_db();
        let store = DbPartStore(db);
        let msg = MessageRecord {
            id: "msg_1".into(),
            session_id: "s1".into(),
            role: "assistant".into(),
            parent_id: None,
            agent: None,
            model: None,
            summary: None,
            time_created: 0,
            time_completed: None,
        };
        store.save_message(&msg).await.unwrap();
        // 通过 load_message 验证持久化
        let loaded = db_load_message(&store.0, "msg_1").await;
        assert_eq!(loaded.unwrap().id, "msg_1");
    }

    async fn db_load_message(db: &adl_storage::Database, id: &str) -> Option<MessageRecord> {
        let db = db.clone();
        let id = id.to_string();
        tokio::task::spawn_blocking(move || db.load_message(&id).unwrap()).await.unwrap()
    }

    #[test]
    fn build_llm_messages_from_prompt() {
        let messages = build_llm_messages("hello");
        assert_eq!(messages.len(), 2); // system + user
        assert_eq!(messages[1].role, adl_types::ConversationRole::User);
        assert_eq!(messages[1].content, "hello");
    }

    #[tokio::test]
    async fn loop_cancels_register_and_cancel() {
        let cancels =
            tokio::sync::Mutex::new(std::collections::HashMap::<String, CancellationToken>::new());
        let token = CancellationToken::new();
        register_cancel(&cancels, "s1", token.clone()).await;
        assert!(cancels.lock().await.contains_key("s1"));
        unregister_cancel(&cancels, "s1").await;
        assert!(!cancels.lock().await.contains_key("s1"));
        token.cancel();
        assert!(token.is_cancelled());
    }

    #[tokio::test]
    async fn agent_loop_abort_cancels_registered_token() {
        let cancels =
            tokio::sync::Mutex::new(std::collections::HashMap::<String, CancellationToken>::new());
        let token = CancellationToken::new();
        register_cancel(&cancels, "s1", token.clone()).await;
        abort_loop(&cancels, "s1").await;
        assert!(token.is_cancelled());
    }

    /// `LogManager::init` installs a process-global tracing subscriber, so it
    /// must run at most once per test binary.
    fn shared_log_manager() -> Arc<adl_logging::LogManager> {
        use std::sync::OnceLock;
        static MANAGER: OnceLock<Arc<adl_logging::LogManager>> = OnceLock::new();
        MANAGER
            .get_or_init(|| {
                let dir =
                    std::env::temp_dir().join(format!("adl-log-{}", uuid::Uuid::new_v4()));
                Arc::new(
                    adl_logging::LogManager::init(
                        &adl_logging::LogConfig {
                            terminal_log_mode: adl_types::LogMode::Overwrite,
                            debug_log_mode: adl_types::LogMode::Overwrite,
                        },
                        &dir,
                    )
                    .expect("LogManager::init failed"),
                )
            })
            .clone()
    }

    fn test_app_state(db: adl_storage::Database, config: adl_kernel::config::AppConfig) -> AppState {
        use adl_kernel::events::EventBus;
        use adl_model_gateway::registry::ProviderRegistry;
        use adl_pty::SessionManager;
        use adl_storage::durable::DurableSessionManager;
        use std::sync::RwLock;

        AppState {
            data_dir: std::env::temp_dir(),
            db: db.clone(),
            config: Arc::new(RwLock::new(config)),
            event_bus: EventBus::new(64),
            current_workspace: RwLock::new(None),
            editor_dirty_paths: std::sync::Mutex::new(std::collections::HashSet::new()),
            pty_sessions: Arc::new(std::sync::Mutex::new(SessionManager::new())),
            browser_manager: adl_browser::BrowserManager::new(),
            log_manager: shared_log_manager(),
            started_at: adl_types::now_ms(),
            durable_manager: DurableSessionManager::new(db),
            provider_registry: Arc::new(RwLock::new(ProviderRegistry::new())),
            shared_http_client: Arc::new(reqwest::Client::new()),
            provider_ops_mutex: tokio::sync::Mutex::new(()),
            loop_cancels: tokio::sync::Mutex::new(std::collections::HashMap::new()),
        }
    }

    fn save_session(state: &AppState, id: &str) {
        let session = adl_types::ConversationSessionRecord {
            id: id.to_string(),
            workspace_id: "ws1".to_string(),
            ..Default::default()
        };
        crate::commands::conversation::save_session(state, &session).expect("save session");
    }

    #[test]
    fn resolve_provider_model_picks_priority_enabled_provider() {
        use adl_types::config::{ModelPreferences, ModelProviderPreference};
        use std::collections::BTreeMap;

        let mut providers = BTreeMap::new();
        // Disabled provider with the lowest priority must NOT win.
        providers.insert(
            "gamma".to_string(),
            ModelProviderPreference {
                enabled: false,
                priority: 0,
                model_id: "gamma-1".to_string(),
                enabled_models: None,
            },
        );
        providers.insert(
            "alpha".to_string(),
            ModelProviderPreference {
                enabled: true,
                priority: 5,
                model_id: "alpha-1".to_string(),
                enabled_models: None,
            },
        );
        providers.insert(
            "beta".to_string(),
            ModelProviderPreference {
                enabled: true,
                priority: 1,
                model_id: "beta-1".to_string(),
                enabled_models: None,
            },
        );
        let config = adl_kernel::config::AppConfig {
            model_preferences: ModelPreferences { providers },
            ..Default::default()
        };
        let state = test_app_state(temp_db(), config);

        let implicit = LoopRunInput {
            session_id: "s1".into(),
            prompt: "hi".into(),
            provider_id: None,
            model_id: None,
        };
        let (pid, mid) = resolve_provider_model(&state, &implicit).unwrap();
        assert_eq!((pid.as_str(), mid.as_str()), ("beta", "beta-1"));

        // Explicit (provider, model) override wins over preferences.
        let explicit = LoopRunInput {
            session_id: "s1".into(),
            prompt: "hi".into(),
            provider_id: Some("alpha".into()),
            model_id: Some("alpha-9".into()),
        };
        let (pid, mid) = resolve_provider_model(&state, &explicit).unwrap();
        assert_eq!((pid.as_str(), mid.as_str()), ("alpha", "alpha-9"));

        // No enabled provider → deepseek defaults.
        let mut disabled = state.config.write().unwrap().clone();
        for pref in disabled.model_preferences.providers.values_mut() {
            pref.enabled = false;
        }
        let state = test_app_state(temp_db(), disabled);
        let (pid, mid) = resolve_provider_model(&state, &implicit).unwrap();
        assert_eq!((pid.as_str(), mid.as_str()), ("deepseek", "deepseek-chat"));
    }

    #[tokio::test]
    async fn cancel_token_unregistered_when_model_stream_errors() {
        let db = temp_db();
        let mut config = adl_kernel::config::AppConfig::default();
        config
            .model_preferences
            .providers
            .get_mut("openai")
            .expect("openai preference")
            .enabled_models = Some(vec![]);
        let state = test_app_state(db, config);
        save_session(&state, "s1");

        // Disabled model → chat_stream_for_model returns Err after the token
        // was already registered.
        let result = agent_loop_run_inner(
            &state,
            LoopRunInput {
                session_id: "s1".into(),
                prompt: "hi".into(),
                provider_id: Some("openai".into()),
                model_id: Some("gpt-4o".into()),
            },
        )
        .await;

        assert!(result.is_err(), "expected provider error, got {result:?}");
        assert!(
            !state.loop_cancels.lock().await.contains_key("s1"),
            "stale cancel token left after error"
        );
    }

    #[tokio::test]
    async fn cancel_token_unregistered_when_session_missing() {
        let state = test_app_state(temp_db(), adl_kernel::config::AppConfig::default());

        let result = agent_loop_run_inner(
            &state,
            LoopRunInput {
                session_id: "missing".into(),
                prompt: "hi".into(),
                provider_id: None,
                model_id: None,
            },
        )
        .await;

        assert!(result.is_err());
        assert!(!state.loop_cancels.lock().await.contains_key("missing"));
    }
}
