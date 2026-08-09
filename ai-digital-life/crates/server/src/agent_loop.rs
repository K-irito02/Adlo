//! Shared agent-loop machinery for the ad-server HTTP layer.
//!
//! Extracted from `handlers/conversation.rs` (Task 4) so the conversation
//! domain and the agent / agent_pipeline domains share ONE implementation of
//! the LoopExecutor run: `DbPartStore`, `run_loop`, `spawn_loop_task`,
//! `resolve_provider_model`, `abort_loop` and the session persistence helpers.
//! The Tauri `agent_loop.rs` (src-tauri) still carries its own copy; it is
//! removed in Task 10 when the desktop shell bridges to these endpoints.
//!
//! Every rusqlite / file access is blocking, so all DB work runs through
//! [`run_blocking`] on a cloned `Database`.

use crate::ServerState;
use adl_agent_runtime::ToolRegistry;
use adl_agent_runtime::loop_executor::{LoopExecutor, TurnConfig, TurnResult};
use adl_agent_runtime::part_store::PartStore;
use adl_errors::AppError;
use adl_storage::Database;
use adl_storage::EntityTable;
use adl_types::{
    AgentRunDetail, ConversationMessageRecord, ConversationRole, ConversationScenario,
    ConversationSendResult, ConversationSessionRecord, GLOBAL_WORKSPACE_ID, MessageRecord,
    ModelChatMessage, PartRecord, SessionPartEvent, now_ms,
};
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

/// Run a blocking closure and collapse the `spawn_blocking` join error into an
/// `AppError::Internal`. Keeps every handler free of the `?` operator so the
/// `impl IntoResponse` signature stays a plain `(StatusCode, Json<Value>)`.
pub async fn run_blocking<T, F>(f: F) -> Result<T, AppError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, AppError> + Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared blocking session/message helpers (operate on a cloned `Database`)
// ─────────────────────────────────────────────────────────────────────────────

pub fn require_session(
    db: &Database,
    session_id: &str,
) -> Result<ConversationSessionRecord, AppError> {
    db.load_entity::<ConversationSessionRecord>(EntityTable::Sessions, session_id)?
        .ok_or_else(|| AppError::NotFound(format!("session {session_id}")))
}

pub fn save_session(db: &Database, session: &ConversationSessionRecord) -> Result<(), AppError> {
    db.save_entity(
        EntityTable::Sessions,
        &session.id,
        Some(&session.workspace_id),
        Some(&session.id),
        Some(&session.status),
        session,
    )
}

pub fn save_message(
    db: &Database,
    workspace_id: &str,
    message: &ConversationMessageRecord,
) -> Result<(), AppError> {
    db.save_entity(
        EntityTable::ConversationMessages,
        &message.id,
        Some(workspace_id),
        Some(&message.session_id),
        Some(match message.role {
            ConversationRole::System => "system",
            ConversationRole::User => "user",
            ConversationRole::Assistant => "assistant",
            ConversationRole::Tool => "tool",
        }),
        message,
    )
}

/// Resolve the active workspace scope id (falls back to the global workspace).
pub fn workspace_scope_id(state: &ServerState) -> String {
    state
        .current_workspace
        .read()
        .unwrap_or_else(|poison| {
            tracing::warn!("workspace mutex poisoned, recovering inner value");
            poison.into_inner()
        })
        .as_ref()
        .map(|workspace| workspace.id.clone())
        .unwrap_or_else(|| GLOBAL_WORKSPACE_ID.to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// Server-native agent loop (the async "kick" behind send_message / start_run)
// ─────────────────────────────────────────────────────────────────────────────

const LOOP_SYSTEM_PROMPT: &str =
    "You are AI Digital Life, an agentic coding assistant. Use tools to help the user.";

/// `PartStore` backed by the ADL SQLite database (blocking ops via
/// `spawn_blocking`), mirroring `agent_loop::DbPartStore`.
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

/// Map the agent loop's terminal status onto the persisted session status
/// vocabulary. Normal completion (`"idle"`) maps to `"active"` — the resting
/// status `create_session` uses — and `"cancelled"` / `"error"` (including
/// `"error: {detail}"`) stay distinct so the session list reflects the last
/// loop outcome. Both the `Sessions` row and the SSE event use this canonical
/// value so live status and `GET /session` agree.
fn canonical_terminal_status(status: &str) -> &'static str {
    match status {
        "idle" => "active",
        "cancelled" => "cancelled",
        _ => "error", // "error" and "error: {detail}"
    }
}

/// Fire-and-forget agent loop: registers a session-scoped cancel token, runs
/// the LoopExecutor over `part_bus` / `questions`, always unregisters the token,
/// persists the terminal session status back to the `Sessions` table and
/// publishes it over SSE. The persistence is what keeps `send_message`'s
/// `"busy"` from sticking forever (previously only the SSE event carried the
/// terminal status).
pub fn spawn_loop_task(
    state: ServerState,
    session_id: String,
    assistant_message_id: String,
    prompt: String,
    provider_id: Option<String>,
    model_id: Option<String>,
) {
    tokio::spawn(async move {
        let cancel = CancellationToken::new();
        {
            let mut cancels = state.loop_cancels.lock().await;
            cancels.insert(session_id.clone(), cancel.clone());
        }
        let outcome = run_loop(
            &state,
            &session_id,
            &assistant_message_id,
            &prompt,
            provider_id,
            model_id,
            &cancel,
        )
        .await;
        {
            let mut cancels = state.loop_cancels.lock().await;
            cancels.remove(&session_id);
        }
        let status = match outcome {
            Ok((_, status)) => canonical_terminal_status(&status).to_string(),
            Err(e) => {
                tracing::warn!(error = %e, session_id = %session_id, "ad-server agent loop failed");
                "error".to_string()
            },
        };
        // Persist the terminal status so `GET /session` / `GET /sessions` never
        // report a stale "busy". Blocking rusqlite runs in `spawn_blocking`;
        // persistence is best-effort — the SSE signal below still fires so the
        // UI never spins forever even if the write fails.
        {
            let db = state.db.clone();
            let session_id_for_db = session_id.clone();
            let persisted = status.clone();
            if let Err(e) = run_blocking(move || -> Result<(), AppError> {
                let mut session = require_session(&db, &session_id_for_db)?;
                session.status = persisted;
                session.updated_at = now_ms();
                save_session(&db, &session)
            })
            .await
            {
                tracing::warn!(
                    error = %e,
                    session_id = %session_id,
                    "failed to persist terminal session status"
                );
            }
        }
        state.part_bus.publish(SessionPartEvent::SessionStatus { session_id, status });
    });
}

/// Outcome of a full loop run: the number of completed turns plus the terminal
/// status string (`"idle"` | `"cancelled"` | `"error"` | `"error: {detail}"`).
pub type LoopOutcome = (u32, String);

/// Run the LoopExecutor to completion against `state.part_bus` / `questions`,
/// persisting the user + assistant `MessageRecord`s as it goes. Returns
/// `(turn_count, status)`; every error path first finalizes the assistant
/// message so no ghost rows are left behind.
pub async fn run_loop(
    state: &ServerState,
    session_id: &str,
    assistant_message_id: &str,
    prompt: &str,
    provider_id: Option<String>,
    model_id: Option<String>,
    cancel: &CancellationToken,
) -> Result<LoopOutcome, AppError> {
    require_session(&state.db, session_id)?;
    let (provider_id, model_id) = resolve_provider_model(state, provider_id, model_id)?;
    let gateway = {
        let config =
            state.config.read().map_err(|_| AppError::Internal("config lock poisoned".into()))?;
        adl_model_gateway::ModelGateway::new(
            config.model_preferences.clone(),
            state.provider_registry.clone(),
        )?
    };
    let store: Arc<dyn PartStore> = Arc::new(DbPartStore(state.db.clone()));
    let registry = Arc::new(ToolRegistry::with_builtins());
    let executor =
        LoopExecutor::new(state.part_bus.clone(), store.clone(), state.questions.clone(), registry);
    let model_meta = serde_json::json!({ "providerID": provider_id, "id": model_id });

    let user_msg_id = adl_types::create_id("msg");
    let user_msg = MessageRecord {
        id: user_msg_id.clone(),
        session_id: session_id.to_string(),
        role: "user".into(),
        parent_id: None,
        agent: None,
        model: None,
        summary: None,
        time_created: now_ms(),
        time_completed: None,
    };
    store.save_message(&user_msg).await?;

    let assistant_msg = MessageRecord {
        id: assistant_message_id.to_string(),
        session_id: session_id.to_string(),
        role: "assistant".into(),
        parent_id: Some(user_msg_id.clone()),
        agent: None,
        model: Some(model_meta.clone()),
        summary: None,
        time_created: now_ms(),
        time_completed: None,
    };
    store.save_message(&assistant_msg).await?;

    let mut turn_count = 0u32;
    let mut status = "idle".to_string();
    loop {
        if cancel.is_cancelled() {
            status = "cancelled".to_string();
            break;
        }
        let messages = vec![
            ModelChatMessage { role: ConversationRole::System, content: LOOP_SYSTEM_PROMPT.into() },
            ModelChatMessage { role: ConversationRole::User, content: prompt.to_string() },
        ];
        let stream = match gateway.chat_stream_for_model(&provider_id, &model_id, messages).await {
            Ok(s) => s,
            Err(e) => {
                // Finalize the assistant message so a failed stream open doesn't
                // leave a ghost row with time_completed: None / model: None.
                let mut msg = assistant_msg.clone();
                msg.time_completed = Some(now_ms());
                store.save_message(&msg).await?;
                return Err(e);
            },
        };
        let llm_events = adl_model_gateway::stream_adapter::stream_chunks_to_llm_events(stream);
        let result = executor
            .run_turn(
                TurnConfig {
                    session_id: session_id.to_string(),
                    message_id: assistant_message_id.to_string(),
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
    let mut assistant_msg = assistant_msg;
    assistant_msg.time_completed = Some(now_ms());
    store.save_message(&assistant_msg).await?;
    tracing::debug!(session_id, turn_count, status, "ad-server agent loop finished");
    Ok((turn_count, status))
}

/// Resolve the provider/model pair, preferring the explicit request override
/// and falling back to the first enabled provider by priority.
pub fn resolve_provider_model(
    state: &ServerState,
    provider_id: Option<String>,
    model_id: Option<String>,
) -> Result<(String, String), AppError> {
    let config =
        state.config.read().map_err(|_| AppError::Internal("config lock poisoned".into()))?;
    if let (Some(pid), Some(mid)) = (provider_id, model_id) {
        return Ok((pid, mid));
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
pub async fn abort_loop(
    cancels: &tokio::sync::Mutex<std::collections::HashMap<String, CancellationToken>>,
    session_id: &str,
) {
    if let Some(token) = cancels.lock().await.get(session_id) {
        token.cancel();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Kick a run (the async send-message / start-run flow)
// ─────────────────────────────────────────────────────────────────────────────

/// Persist a user message + agent run, publish the `busy` / `MessageCreated`
/// signals, kick the agent loop asynchronously via [`spawn_loop_task`], and
/// return the typed `ConversationSendResult` ack (assistant message id == the
/// run id, `patch_set` `None`).
///
/// This is the single shared implementation behind both
/// `POST /session/{id}/message` (conversation.send_message) and
/// `POST /agent/start-run` (agent.start_run). The old Tauri `agent_start_run`
/// ran the full pipeline synchronously; per the async+SSE decision (2026-08-09)
/// the HTTP layer returns a quick ack and streams loop progress over SSE.
pub async fn kick_agent_run(
    state: &ServerState,
    session_id: &str,
    content: &str,
    scenario: ConversationScenario,
    provider_id: Option<String>,
    model_id: Option<String>,
    plan_prompt: Option<String>,
) -> Result<ConversationSendResult, AppError> {
    let content_for_loop = content.to_string();
    let session_id_for_msg = session_id.to_string();
    let db = state.db.clone();

    let (session, user_message, run_detail) =
        match run_blocking(move || -> Result<(ConversationSessionRecord, ConversationMessageRecord, AgentRunDetail), AppError> {
            let mut session = require_session(&db, &session_id_for_msg)?;
            let workspace_scope_id = session.workspace_id.clone();
            let now = now_ms();
            let mut run_detail =
                adl_agent_runtime::create_run(&workspace_scope_id, &session_id_for_msg, &content_for_loop, scenario);
            if let Some(plan_prompt) = plan_prompt {
                run_detail =
                    adl_agent_runtime::inject_plan_mode_prompt(run_detail, &plan_prompt);
            }
            let run_id = run_detail.run.id.clone();
            db.save_entity(
                EntityTable::AgentRuns,
                &run_detail.run.id,
                Some(&workspace_scope_id),
                Some(&session_id_for_msg),
                Some(run_detail.run.status.as_status_str()),
                &run_detail.run,
            )?;
            for step in &run_detail.steps {
                db.save_entity(
                    EntityTable::AgentSteps,
                    &step.id,
                    Some(&workspace_scope_id),
                    Some(&session_id_for_msg),
                    Some(&step.status),
                    step,
                )?;
            }
            let user_message = adl_conversation::create_message(
                &session_id_for_msg,
                ConversationRole::User,
                content_for_loop,
                vec![],
                Some(&run_id),
            );
            save_message(&db, &workspace_scope_id, &user_message)?;
            session.last_message_at = now;
            session.updated_at = now;
            session.status = "busy".into();
            save_session(&db, &session)?;
            Ok((session, user_message, run_detail))
        })
        .await
        {
            Ok(v) => v,
            Err(e) => return Err(e),
        };

    let run_id = run_detail.run.id.clone();
    let assistant_message_id = run_id.clone();

    state.part_bus.publish(SessionPartEvent::SessionStatus {
        session_id: session_id.to_string(),
        status: "busy".into(),
    });
    state.part_bus.publish(SessionPartEvent::MessageCreated {
        session_id: session_id.to_string(),
        info: serde_json::json!({ "id": user_message.id, "finish": null }),
    });

    spawn_loop_task(
        state.clone(),
        session_id.to_string(),
        assistant_message_id.clone(),
        content.to_string(),
        provider_id,
        model_id,
    );

    let assistant_message = ConversationMessageRecord {
        id: assistant_message_id,
        session_id: session_id.to_string(),
        role: ConversationRole::Assistant,
        content: String::new(),
        blocks: vec![],
        run_id: Some(run_id.clone()),
        created_at: now_ms(),
    };
    Ok(ConversationSendResult {
        session,
        user_message,
        assistant_message,
        run_detail,
        patch_set: None,
    })
}
