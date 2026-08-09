//! Conversation domain HTTP handlers — the first business-domain vertical
//! slice migrated from `src-tauri/src/commands/conversation/{session,messaging,
//! state}.rs`. Every handler follows the same recipe:
//!
//! 1. `State(state): State<ServerState>` replaces `app: tauri::AppHandle` /
//!    `State<'_, AppState>`; `app.state::<AppState>()` becomes `&state`.
//! 2. Blocking rusqlite work runs in `spawn_blocking` on a cloned `Database`.
//! 3. UI-affecting signals are published as [`SessionPartEvent`] on
//!    `state.part_bus` (the SSE bridge the desktop shell used to emit via
//!    `tauri::Manager::emit`).
//! 4. Responses are wrapped with [`crate::ipc::to_response`] into the shared
//!    `IpcResult<T>` shape with an `AppError` → HTTP status mapping.

use crate::ServerState;
use crate::ipc;
use adl_agent_runtime::ToolRegistry;
use adl_agent_runtime::loop_executor::{LoopExecutor, TurnConfig, TurnResult};
use adl_agent_runtime::part_store::PartStore;
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::{
    AgentPlanStep, AgentRunDetail, AgentRunRecord, ConversationDetail, ConversationMessageRecord,
    ConversationRole, ConversationScenario, ConversationSendResult, ConversationSessionRecord,
    GLOBAL_WORKSPACE_ID, MessageRecord, ModelChatMessage, PartRecord, SessionPartEvent, now_ms,
};
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

/// Run a blocking closure and collapse the `spawn_blocking` join error into an
/// `AppError::Internal`. Keeps every handler free of the `?` operator so the
/// `impl IntoResponse` signature stays a plain `(StatusCode, Json<Value>)`.
async fn run_blocking<T, F>(f: F) -> Result<T, AppError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, AppError> + Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers (blocking; operate on a cloned `Database`)
// ─────────────────────────────────────────────────────────────────────────────

fn require_session(
    db: &adl_storage::Database,
    session_id: &str,
) -> Result<ConversationSessionRecord, AppError> {
    db.load_entity::<ConversationSessionRecord>(EntityTable::Sessions, session_id)?
        .ok_or_else(|| AppError::NotFound(format!("session {session_id}")))
}

fn save_session(
    db: &adl_storage::Database,
    session: &ConversationSessionRecord,
) -> Result<(), AppError> {
    db.save_entity(
        EntityTable::Sessions,
        &session.id,
        Some(&session.workspace_id),
        Some(&session.id),
        Some(&session.status),
        session,
    )
}

fn save_message(
    db: &adl_storage::Database,
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

fn get_session_detail(
    db: &adl_storage::Database,
    session_id: &str,
) -> Result<Option<ConversationDetail>, AppError> {
    let Some(session) =
        db.load_entity::<ConversationSessionRecord>(EntityTable::Sessions, session_id)?
    else {
        return Ok(None);
    };
    let messages: Vec<ConversationMessageRecord> =
        db.list_entities_by_session_ordered(EntityTable::ConversationMessages, session_id)?;
    Ok(Some(ConversationDetail { session, messages }))
}

/// Resolve the active workspace scope id (falls back to the global workspace).
fn workspace_scope_id(state: &ServerState) -> String {
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
// Session CRUD
// ─────────────────────────────────────────────────────────────────────────────

pub async fn create_session(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let body_val: serde_json::Value = ipc::json_body(body).await.unwrap_or(serde_json::json!({}));
    let wid = body_val
        .get("workspaceId")
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| workspace_scope_id(&state));
    let title = body_val.get("title").and_then(|v| v.as_str()).map(String::from);
    let db = state.db.clone();
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let existing: Vec<ConversationSessionRecord> =
            db.list_entities_by_workspace(EntityTable::Sessions, &wid)?;
        let s = adl_conversation::create_session(&wid, title, existing.len() as i32);
        db.save_entity(EntityTable::Sessions, &s.id, Some(&wid), Some(&s.id), Some(&s.status), &s)?;
        Ok(serde_json::to_value(&s)?)
    })
    .await;
    ipc::to_response(result)
}

pub async fn list_sessions(State(state): State<ServerState>) -> impl IntoResponse {
    let wid = workspace_scope_id(&state);
    let db = state.db.clone();
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let sessions: Vec<ConversationSessionRecord> =
            db.list_entities_by_workspace(EntityTable::Sessions, &wid)?;
        Ok(serde_json::to_value(&sessions)?)
    })
    .await;
    ipc::to_response(result)
}

pub async fn get_session(
    State(state): State<ServerState>,
    Path(session_id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.clone();
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let detail = get_session_detail(&db, &session_id)?;
        Ok(serde_json::to_value(&detail)?)
    })
    .await;
    ipc::to_response(result)
}

/// PATCH `/session/{id}` — single endpoint covering the legacy rename / pin /
/// unpin / mark-read / mark-unread / archive sub-operations. The body is an
/// object whose optional fields select which mutation(s) to apply:
/// `{ title?, pinned?, read?, readAt?, unread?, archive? }`.
pub async fn update_session(
    State(state): State<ServerState>,
    Path(session_id): Path<String>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let body_val: serde_json::Value = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let db = state.db.clone();
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let mut session = require_session(&db, &session_id)?;
        let now = now_ms();
        if let Some(title) = body_val.get("title").and_then(|v| v.as_str()) {
            session.title = title.to_string();
            session.title_updated_at = Some(now);
            session.updated_at = now;
        }
        if let Some(pinned) = body_val.get("pinned").and_then(|v| v.as_bool()) {
            session.is_pinned = pinned;
            session.updated_at = now;
        }
        if let Some(true) = body_val.get("read").and_then(|v| v.as_bool()) {
            session.manual_unread = false;
            session.last_read_at =
                Some(body_val.get("readAt").and_then(|v| v.as_i64()).unwrap_or(now));
            session.updated_at = now;
        }
        if let Some(true) = body_val.get("unread").and_then(|v| v.as_bool()) {
            session.manual_unread = true;
            session.updated_at = now;
        }
        if let Some(true) = body_val.get("archive").and_then(|v| v.as_bool()) {
            session.status = "archived".into();
            session.archived_at = Some(now);
            session.updated_at = now;
        }
        save_session(&db, &session)?;
        Ok(serde_json::to_value(&session)?)
    })
    .await;
    ipc::to_response(result)
}

pub async fn delete_session(
    State(state): State<ServerState>,
    Path(session_id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.clone();
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        db.delete_entities_by_session(EntityTable::ConversationMessages, &session_id)?;
        db.delete_entity(EntityTable::Sessions, &session_id)?;
        Ok(serde_json::json!(true))
    })
    .await;
    ipc::to_response(result)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReorderSessionsBody {
    workspace_id: String,
    pinned_ids: Vec<String>,
    unpinned_ids: Vec<String>,
}

/// POST `/sessions/reorder` — applies the given pinned/unpinned ordering to the
/// workspace's sessions and returns the re-sorted list (covers
/// `ConversationBridge.reorderSessions`).
pub async fn reorder_sessions(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: ReorderSessionsBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let db = state.db.clone();
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let now = now_ms();
        let mut sessions: Vec<ConversationSessionRecord> =
            db.list_entities_by_workspace(EntityTable::Sessions, &input.workspace_id)?;
        for session in &mut sessions {
            if let Some(order) = input.pinned_ids.iter().position(|id| id == &session.id) {
                session.is_pinned = true;
                session.pinned_order = order as i32;
                session.updated_at = now;
            }
            if let Some(order) = input.unpinned_ids.iter().position(|id| id == &session.id) {
                session.is_pinned = false;
                session.unpinned_order = order as i32;
                session.updated_at = now;
            }
        }
        db.transaction(|conn| db.save_sessions_batch_on_conn(conn, &sessions))?;
        sessions.sort_by_key(|session| {
            (
                !session.is_pinned,
                if session.is_pinned { session.pinned_order } else { session.unpinned_order },
            )
        });
        Ok(serde_json::to_value(&sessions)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/sessions/archive-all` — archives every session in the active
/// workspace and returns the updated list (covers
/// `ConversationBridge.archiveAllInWorkspace`).
pub async fn archive_all_in_workspace(State(state): State<ServerState>) -> impl IntoResponse {
    let wid = workspace_scope_id(&state);
    let db = state.db.clone();
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let now = now_ms();
        let mut sessions: Vec<ConversationSessionRecord> =
            db.list_entities_by_workspace(EntityTable::Sessions, &wid)?;
        for session in &mut sessions {
            session.status = "archived".into();
            session.archived_at = Some(now);
            session.updated_at = now;
        }
        db.transaction(|conn| db.save_sessions_batch_on_conn(conn, &sessions))?;
        Ok(serde_json::to_value(&sessions)?)
    })
    .await;
    ipc::to_response(result)
}

// ─────────────────────────────────────────────────────────────────────────────
// Messaging
// ─────────────────────────────────────────────────────────────────────────────

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SendMessageBody {
    content: String,
    scenario: Option<ConversationScenario>,
    provider_id: Option<String>,
    model_id: Option<String>,
}

/// POST `/session/{id}/message`.
///
/// Migration note: the Tauri `conversation_send_message` delegated to
/// `agent_start_run` — a fully synchronous pipeline run (prepare → model →
/// patches → finalize) that returned a complete `ConversationSendResult`. That
/// pipeline is Tauri-coupled and belongs to the agent-domain migration. This
/// HTTP handler preserves the *effect* of the call instead: it persists the
/// user message, publishes the same SSE signals, kicks the agent loop
/// asynchronously against `ServerState` (`loop_cancels` / `part_bus` /
/// `questions`), and returns a typed `ConversationSendResult` (run detail via
/// `create_run`, `patch_set` `None`) so the wire contract stays `IpcResult`.
pub async fn send_message(
    State(state): State<ServerState>,
    Path(session_id): Path<String>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: SendMessageBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    if input.content.trim().is_empty() {
        return ipc::to_response(Err(AppError::InvalidInput("missing 'content'".into())));
    }
    let scenario = input.scenario.unwrap_or(ConversationScenario::CodeEdit);
    let content = input.content;
    let content_for_msg = content.clone();
    let provider_id = input.provider_id;
    let model_id = input.model_id;
    let db = state.db.clone();
    let session_id_for_msg = session_id.clone();

    let (session, user_message, run_detail) =
        match run_blocking(move || -> Result<(ConversationSessionRecord, ConversationMessageRecord, AgentRunDetail), AppError> {
            let session = require_session(&db, &session_id_for_msg)?;
            let workspace_scope_id = session.workspace_id.clone();
            let now = now_ms();
            let run_detail = adl_agent_runtime::create_run(
                &workspace_scope_id,
                &session_id_for_msg,
                &content_for_msg,
                scenario,
            );
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
                content_for_msg,
                vec![],
                Some(&run_id),
            );
            save_message(&db, &workspace_scope_id, &user_message)?;
            let mut session = session;
            session.last_message_at = now;
            session.updated_at = now;
            session.status = "busy".into();
            save_session(&db, &session)?;
            Ok((session, user_message, run_detail))
        })
        .await
        {
            Ok(v) => v,
            Err(e) => return ipc::to_response(Err(e)),
        };

    let run_id = run_detail.run.id.clone();
    let assistant_message_id = run_id.clone();

    state.part_bus.publish(SessionPartEvent::SessionStatus {
        session_id: session_id.clone(),
        status: "busy".into(),
    });
    state.part_bus.publish(SessionPartEvent::MessageCreated {
        session_id: session_id.clone(),
        info: serde_json::json!({ "id": user_message.id, "finish": null }),
    });

    spawn_loop_task(
        state,
        session_id.clone(),
        assistant_message_id.clone(),
        content.clone(),
        provider_id,
        model_id,
    );

    let assistant_message = ConversationMessageRecord {
        id: assistant_message_id,
        session_id,
        role: ConversationRole::Assistant,
        content: String::new(),
        blocks: vec![],
        run_id: Some(run_id.clone()),
        created_at: now_ms(),
    };
    let result = ConversationSendResult {
        session,
        user_message,
        assistant_message,
        run_detail,
        patch_set: None,
    };
    let result = serde_json::to_value(&result).map_err(AppError::from);
    ipc::to_response(result)
}

/// POST `/session/{id}/cancel` — cancel the agent loop registered for the
/// session (no-op when none is running), then mark the session's latest agent
/// run aborted. Returns the aborted run detail, or `null` when the session has
/// no runs.
pub async fn cancel_message(
    State(state): State<ServerState>,
    Path(session_id): Path<String>,
) -> impl IntoResponse {
    abort_loop(&state.loop_cancels, &session_id).await;
    let db = state.db.clone();
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let mut runs: Vec<AgentRunRecord> =
            db.list_entities_by_session(EntityTable::AgentRuns, &session_id)?;
        runs.sort_by_key(|run| run.created_at);
        let Some(run) = runs.pop() else {
            return Ok(serde_json::json!(null));
        };
        let mut steps: Vec<AgentPlanStep> =
            db.list_entities_by_run(EntityTable::AgentSteps, &run.id)?;
        steps.sort_by_key(|step| step.created_at);
        let detail = adl_agent_runtime::abort_run(AgentRunDetail { run, steps });
        db.save_entity(
            EntityTable::AgentRuns,
            &detail.run.id,
            Some(&detail.run.workspace_id),
            Some(&detail.run.session_id),
            Some(detail.run.status.as_status_str()),
            &detail.run,
        )?;
        Ok(serde_json::to_value(&detail)?)
    })
    .await;
    ipc::to_response(result)
}

// ─────────────────────────────────────────────────────────────────────────────
// Server-native agent loop (the async "kick" behind send_message)
// ─────────────────────────────────────────────────────────────────────────────

const LOOP_SYSTEM_PROMPT: &str =
    "You are AI Digital Life, an agentic coding assistant. Use tools to help the user.";

/// `PartStore` backed by the ADL SQLite database (blocking ops via
/// `spawn_blocking`), mirroring `agent_loop::DbPartStore`.
struct DbPartStore(adl_storage::Database);

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

/// Fire-and-forget agent loop: registers a session-scoped cancel token, runs
/// the LoopExecutor over `part_bus` / `questions`, always unregisters the token
/// and publishes the terminal session status over SSE.
fn spawn_loop_task(
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
            Ok(status) => status,
            Err(e) => {
                tracing::warn!(error = %e, session_id = %session_id, "ad-server agent loop failed");
                "error".to_string()
            },
        };
        state.part_bus.publish(SessionPartEvent::SessionStatus { session_id, status });
    });
}

async fn run_loop(
    state: &ServerState,
    session_id: &str,
    assistant_message_id: &str,
    prompt: &str,
    provider_id: Option<String>,
    model_id: Option<String>,
    cancel: &CancellationToken,
) -> Result<String, AppError> {
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
            ModelChatMessage {
                role: ConversationRole::System,
                content: LOOP_SYSTEM_PROMPT.to_string(),
            },
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
    Ok(status)
}

/// Resolve the provider/model pair, preferring the explicit request override
/// and falling back to the first enabled provider by priority.
fn resolve_provider_model(
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
async fn abort_loop(
    cancels: &tokio::sync::Mutex<std::collections::HashMap<String, CancellationToken>>,
    session_id: &str,
) {
    if let Some(token) = cancels.lock().await.get(session_id) {
        token.cancel();
    }
}
