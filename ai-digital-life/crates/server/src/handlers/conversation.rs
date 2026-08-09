//! Conversation domain HTTP handlers — the first business-domain vertical
//! slice migrated from `src-tauri/src/commands/conversation/{session,messaging,
//! state}.rs`. Every handler follows the same recipe:
//!
//! 1. `State(state): State<ServerState>` replaces `app: tauri::AppHandle` /
//!    `State<'_, AppState>`; `app.state::<AppState>()` becomes `&state`.
//! 2. Blocking rusqlite work runs in `spawn_blocking` on a cloned `Database`
//!    (see [`crate::agent_loop::run_blocking`]).
//! 3. UI-affecting signals are published as [`SessionPartEvent`] on
//!    `state.part_bus` (the SSE bridge the desktop shell used to emit via
//!    `tauri::Manager::emit`).
//! 4. Responses are wrapped with [`crate::ipc::to_response`] into the shared
//!    `IpcResult<T>` shape with an `AppError` → HTTP status mapping.
//!
//! The agent-loop machinery (loop run, cancel tokens, `PartStore`,
//! provider/model resolution) lives in [`crate::agent_loop`], shared with the
//! agent / agent_pipeline domains.

use crate::ServerState;
use crate::agent_loop;
use crate::ipc;
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::{
    AgentPlanStep, AgentRunDetail, AgentRunRecord, ConversationDetail, ConversationMessageRecord,
    ConversationScenario, ConversationSessionRecord, now_ms,
};
use axum::extract::{Path, State};
use axum::response::IntoResponse;

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
        .unwrap_or_else(|| agent_loop::workspace_scope_id(&state));
    let title = body_val.get("title").and_then(|v| v.as_str()).map(String::from);
    let db = state.db.clone();
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
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
    let wid = agent_loop::workspace_scope_id(&state);
    let db = state.db.clone();
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
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
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let detail = get_session_detail(&db, &session_id)?;
        Ok(serde_json::to_value(&detail)?)
    })
    .await;
    ipc::to_response(result)
}

/// GET `/session/{id}/message` — history read for the S2 PartStore initial
/// load. Returns every `MessageRecord` for the session with each message's
/// `PartRecord`s:
/// `{ "messages": [ { "message": MessageRecord, "parts": [PartRecord] } ] }`.
///
/// `MessageRecord` / `PartRecord` serialize camelCase (`sessionID`,
/// `parentID`, `messageID`, `timeCreated`, …), so the wire casing matches the
/// S2 `PartStore` schema. A missing session maps to `NOT_FOUND`; an empty
/// message list is valid (session exists, no loop output yet).
pub async fn get_session_messages(
    State(state): State<ServerState>,
    Path(session_id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.clone();
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        agent_loop::require_session(&db, &session_id)?;
        let messages = db.list_messages(&session_id)?;
        let entries: Vec<serde_json::Value> = messages
            .into_iter()
            .map(|message| {
                let parts = db.list_parts(&message.id)?;
                Ok(serde_json::json!({ "message": message, "parts": parts }))
            })
            .collect::<Result<_, AppError>>()?;
        Ok(serde_json::json!({ "messages": entries }))
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
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let mut session = agent_loop::require_session(&db, &session_id)?;
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
        agent_loop::save_session(&db, &session)?;
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
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
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
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
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
    let wid = agent_loop::workspace_scope_id(&state);
    let db = state.db.clone();
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
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
/// HTTP handler preserves the *effect* of the call through the shared
/// [`crate::agent_loop::kick_agent_run`]: it persists the user message,
/// publishes the same SSE signals, kicks the agent loop asynchronously against
/// `ServerState` (`loop_cancels` / `part_bus` / `questions`), and returns a
/// typed `ConversationSendResult` (run detail via `create_run`, `patch_set`
/// `None`) so the wire contract stays `IpcResult`.
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
    let result = agent_loop::kick_agent_run(
        &state,
        &session_id,
        &input.content,
        scenario,
        input.provider_id,
        input.model_id,
        None,
    )
    .await;
    match result {
        Ok(value) => match serde_json::to_value(&value) {
            Ok(v) => ipc::to_response(Ok(v)),
            Err(e) => ipc::to_response(Err(AppError::from(e))),
        },
        Err(e) => ipc::to_response(Err(e)),
    }
}

/// POST `/session/{id}/cancel` — cancel the agent loop registered for the
/// session (no-op when none is running), then mark the session's latest agent
/// run aborted. Returns the aborted run detail, or `null` when the session has
/// no runs.
pub async fn cancel_message(
    State(state): State<ServerState>,
    Path(session_id): Path<String>,
) -> impl IntoResponse {
    agent_loop::abort_loop(&state.loop_cancels, &session_id).await;
    let db = state.db.clone();
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
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
// Shared detail helpers (blocking)
// ─────────────────────────────────────────────────────────────────────────────

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
