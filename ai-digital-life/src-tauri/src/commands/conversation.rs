use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::{
    ConversationDetail, ConversationMessageRecord, ConversationRole, ConversationScenario,
    ConversationSendResult, ConversationSessionRecord, IpcResult,
};
use tauri::Manager;

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageInput {
    pub session_id: String,
    pub content: String,
    pub scenario: Option<ConversationScenario>,
    pub provider_id: Option<String>,
    pub model_id: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameSessionInput {
    pub session_id: String,
    pub title: String,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderSessionsInput {
    pub workspace_id: String,
    pub pinned_ids: Vec<String>,
    pub unpinned_ids: Vec<String>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkSessionReadInput {
    pub session_id: String,
    pub read_at: Option<i64>,
}

#[tauri::command]
pub async fn conversation_create_session(
    app: tauri::AppHandle,
    title: Option<String>,
    workspace_id: Option<String>,
) -> Result<IpcResult<ConversationSessionRecord>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let wid = workspace_id.unwrap_or_else(|| active_workspace_scope_id(&state));
    let session =
        tokio::task::spawn_blocking(move || -> Result<ConversationSessionRecord, AppError> {
            let existing: Vec<ConversationSessionRecord> =
                db.list_entities_by_workspace(EntityTable::Sessions, &wid)?;
            let session = adl_conversation::create_session(&wid, title, existing.len() as i32);
            db.save_entity(
                EntityTable::Sessions,
                &session.id,
                Some(&wid),
                Some(&session.id),
                Some(&session.status),
                &session,
            )?;
            Ok(session)
        })
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(session)))
}

#[tauri::command]
pub async fn conversation_list_sessions(
    app: tauri::AppHandle,
) -> Result<IpcResult<Vec<ConversationSessionRecord>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let workspace_id = active_workspace_scope_id(&state);
    let sessions = tokio::task::spawn_blocking(move || {
        db.list_entities_by_workspace(EntityTable::Sessions, &workspace_id)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(sessions)))
}

#[tauri::command]
pub async fn conversation_get_session(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<IpcResult<Option<ConversationDetail>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let detail = tokio::task::spawn_blocking(move || get_session_detail_with_db(&db, &session_id))
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(detail)))
}

#[tauri::command]
pub async fn conversation_send_message(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: SendMessageInput,
) -> Result<IpcResult<ConversationSendResult>, CommandError> {
    crate::commands::agent::agent_start_run(
        app,
        state,
        crate::commands::agent::StartRunInput {
            session_id: input.session_id,
            prompt: input.content,
            scenario: input.scenario,
            provider_id: input.provider_id,
            model_id: input.model_id,
        },
    )
    .await
}

#[tauri::command]
pub async fn conversation_rename_session(
    app: tauri::AppHandle,
    input: RenameSessionInput,
) -> Result<IpcResult<ConversationSessionRecord>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let session =
        tokio::task::spawn_blocking(move || -> Result<ConversationSessionRecord, AppError> {
            let mut session = require_session_with_db(&db, &input.session_id)?;
            session.title = input.title;
            session.title_updated_at = Some(adl_types::now_ms());
            session.updated_at = adl_types::now_ms();
            save_session_with_db(&db, &session)?;
            Ok(session)
        })
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(session)))
}

#[tauri::command]
pub async fn conversation_pin_session(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<IpcResult<ConversationSessionRecord>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let session = tokio::task::spawn_blocking(move || set_pinned_with_db(&db, &session_id, true))
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(session)))
}

#[tauri::command]
pub async fn conversation_unpin_session(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<IpcResult<ConversationSessionRecord>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let session = tokio::task::spawn_blocking(move || set_pinned_with_db(&db, &session_id, false))
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(session)))
}

#[tauri::command]
pub async fn conversation_archive_session(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<IpcResult<ConversationSessionRecord>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let session =
        tokio::task::spawn_blocking(move || -> Result<ConversationSessionRecord, AppError> {
            let mut session = require_session_with_db(&db, &session_id)?;
            session.status = "archived".into();
            session.archived_at = Some(adl_types::now_ms());
            session.updated_at = adl_types::now_ms();
            save_session_with_db(&db, &session)?;
            Ok(session)
        })
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(session)))
}

#[tauri::command]
pub async fn conversation_archive_all_in_workspace(
    app: tauri::AppHandle,
) -> Result<IpcResult<Vec<ConversationSessionRecord>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let workspace_id = active_workspace_scope_id(&state);
    let sessions =
        tokio::task::spawn_blocking(move || -> Result<Vec<ConversationSessionRecord>, AppError> {
            let now = adl_types::now_ms();
            let mut sessions: Vec<ConversationSessionRecord> =
                db.list_entities_by_workspace(EntityTable::Sessions, &workspace_id)?;
            for session in &mut sessions {
                session.status = "archived".into();
                session.archived_at = Some(now);
                session.updated_at = now;
            }
            db.transaction(|conn| db.save_sessions_batch_on_conn(conn, &sessions))?;
            Ok(sessions)
        })
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(sessions)))
}

pub fn active_workspace_scope_id(state: &AppState) -> String {
    state
        .current_workspace
        .read()
        .unwrap_or_else(|poison| {
            tracing::warn!("workspace mutex poisoned, recovering inner value");
            poison.into_inner()
        })
        .as_ref()
        .map(|workspace| workspace.id.clone())
        .unwrap_or_else(|| adl_types::GLOBAL_WORKSPACE_ID.to_string())
}

#[tauri::command]
pub async fn conversation_reorder_sessions(
    app: tauri::AppHandle,
    input: ReorderSessionsInput,
) -> Result<IpcResult<Vec<ConversationSessionRecord>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let sessions =
        tokio::task::spawn_blocking(move || -> Result<Vec<ConversationSessionRecord>, AppError> {
            let now = adl_types::now_ms();
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
            Ok(sessions)
        })
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(sessions)))
}

#[tauri::command]
pub async fn conversation_delete_session(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<IpcResult<bool>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<bool, AppError> {
        db.delete_entities_by_session(EntityTable::ConversationMessages, &session_id)?;
        db.delete_entity(EntityTable::Sessions, &session_id)?;
        Ok(true)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(result)))
}

#[tauri::command]
pub async fn conversation_mark_session_read(
    app: tauri::AppHandle,
    input: MarkSessionReadInput,
) -> Result<IpcResult<ConversationSessionRecord>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let session =
        tokio::task::spawn_blocking(move || -> Result<ConversationSessionRecord, AppError> {
            let mut session = require_session_with_db(&db, &input.session_id)?;
            session.manual_unread = false;
            session.last_read_at = Some(input.read_at.unwrap_or_else(adl_types::now_ms));
            save_session_with_db(&db, &session)?;
            Ok(session)
        })
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(session)))
}

#[tauri::command]
pub async fn conversation_cancel_message(
    app: tauri::AppHandle,
    run_id: String,
) -> Result<IpcResult<Option<adl_types::AgentRunDetail>>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let detail = tokio::task::spawn_blocking(
        move || -> Result<Option<adl_types::AgentRunDetail>, AppError> {
            let Some(run) =
                db.load_entity::<adl_types::AgentRunRecord>(EntityTable::AgentRuns, &run_id)?
            else {
                return Ok(None);
            };
            let mut steps: Vec<adl_types::AgentPlanStep> =
                db.list_entities_by_run(EntityTable::AgentSteps, &run_id)?;
            steps.sort_by_key(|step| step.created_at);
            let detail = adl_types::AgentRunDetail { run, steps };
            let detail = adl_agent_runtime::abort_run(detail);
            crate::commands::agent::save_run_detail_with_db(&db, &detail)?;
            Ok(Some(detail))
        },
    )
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(detail)))
}

#[tauri::command]
pub async fn conversation_mark_session_unread(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<IpcResult<ConversationSessionRecord>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let session =
        tokio::task::spawn_blocking(move || -> Result<ConversationSessionRecord, AppError> {
            let mut session = require_session_with_db(&db, &session_id)?;
            session.manual_unread = true;
            save_session_with_db(&db, &session)?;
            Ok(session)
        })
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(session)))
}

pub fn require_session(
    state: &AppState,
    session_id: &str,
) -> Result<ConversationSessionRecord, AppError> {
    state
        .db
        .load_entity(EntityTable::Sessions, session_id)?
        .ok_or_else(|| AppError::NotFound(format!("session {session_id}")))
}

pub fn save_session(state: &AppState, session: &ConversationSessionRecord) -> Result<(), AppError> {
    state.db.save_entity(
        EntityTable::Sessions,
        &session.id,
        Some(&session.workspace_id),
        Some(&session.id),
        Some(&session.status),
        session,
    )
}

pub fn save_message(
    state: &AppState,
    workspace_id: &str,
    message: &ConversationMessageRecord,
) -> Result<(), AppError> {
    state.db.save_entity(
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

fn require_session_with_db(
    db: &adl_storage::Database,
    session_id: &str,
) -> Result<ConversationSessionRecord, AppError> {
    db.load_entity::<ConversationSessionRecord>(EntityTable::Sessions, session_id)?
        .ok_or_else(|| AppError::NotFound(format!("session {session_id}")))
}

fn save_session_with_db(
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

fn set_pinned_with_db(
    db: &adl_storage::Database,
    session_id: &str,
    pinned: bool,
) -> Result<ConversationSessionRecord, AppError> {
    let mut session = require_session_with_db(db, session_id)?;
    session.is_pinned = pinned;
    session.updated_at = adl_types::now_ms();
    save_session_with_db(db, &session)?;
    Ok(session)
}

fn get_session_detail_with_db(
    db: &adl_storage::Database,
    session_id: &str,
) -> Result<Option<ConversationDetail>, AppError> {
    let Some(session) =
        db.load_entity::<ConversationSessionRecord>(EntityTable::Sessions, session_id)?
    else {
        return Ok(None);
    };
    let mut messages: Vec<ConversationMessageRecord> =
        db.list_entities_by_session(EntityTable::ConversationMessages, session_id)?;
    messages.sort_by_key(|message| message.created_at);
    Ok(Some(ConversationDetail { session, messages }))
}
