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
fn build_llm_messages(session_id: &str, prompt: &str, _context: Option<&str>) -> Vec<ModelChatMessage> {
    let _ = session_id;
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
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: LoopRunInput,
) -> Result<IpcResult<LoopRunResult>, crate::error::CommandError> {
    Ok(ipc(agent_loop_run_inner(&app, &state, input).await))
}

async fn agent_loop_run_inner(
    _app: &tauri::AppHandle,
    state: &AppState,
    input: LoopRunInput,
) -> Result<LoopRunResult, AppError> {
    crate::commands::conversation::require_session(state, &input.session_id)?;

    // 1. user message
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
    let store: Arc<dyn PartStore> = Arc::new(DbPartStore(state.db.clone()));
    store.save_message(&user_msg).await?;

    // 2. assistant message
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

    // 3. executor
    let bus = PartEventBus::new(256);
    let questions = QuestionService::new(bus.clone());
    let registry = Arc::new(ToolRegistry::with_builtins());
    let executor = LoopExecutor::new(bus.clone(), store.clone(), questions, registry);
    let cancel = CancellationToken::new();
    register_cancel(&state.loop_cancels, &input.session_id, cancel.clone()).await;

    // 4. provider/model resolution
    let (provider_id, model_id) = resolve_provider_model(state, &input)?;

    // 5. gateway
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

    // 6. multi-round while loop
    let mut turn_count = 0u32;
    let mut status = "completed".to_string();
    loop {
        let messages = build_llm_messages(&input.session_id, &input.prompt, None);
        let stream = gateway.chat_stream_for_model(&provider_id, &model_id, messages).await?;
        let llm_events = stream_chunks_to_llm_events(stream);
        let result = executor
            .run_turn(
                TurnConfig {
                    session_id: input.session_id.clone(),
                    message_id: assistant_msg_id.clone(),
                    parent_id: Some(user_msg_id.clone()),
                    model: None,
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
    unregister_cancel(&state.loop_cancels, &input.session_id).await;

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
        let messages = build_llm_messages("s1", "hello", None);
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
}
