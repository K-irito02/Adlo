use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use adl_errors::AppError;
use adl_kernel::{
    ConversationDetail, ConversationMessageRecord, ConversationRole, ConversationScenario,
    ConversationSendResult, ConversationSessionRecord, IpcResult,
};
use adl_storage::EntityTable;

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageInput {
    pub session_id: String,
    pub content: String,
    pub scenario: Option<ConversationScenario>,
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
pub fn conversation_create_session(
    state: tauri::State<'_, AppState>,
    title: Option<String>,
) -> IpcResult<ConversationSessionRecord> {
    crate::commands::ipc_try(|| {
        let workspace_id = active_workspace_scope_id(&state);
        let existing: Vec<ConversationSessionRecord> = state
            .db
            .list_entities_by_workspace(EntityTable::Sessions, &workspace_id)?;
        let session =
            adl_conversation::create_session(&workspace_id, title, existing.len() as i32);
        state.db.save_entity(
            EntityTable::Sessions,
            &session.id,
            Some(&workspace_id),
            Some(&session.id),
            Some(&session.status),
            &session,
        )?;
        Ok(session)
    })
}

#[tauri::command]
pub fn conversation_list_sessions(
    state: tauri::State<'_, AppState>,
) -> IpcResult<Vec<ConversationSessionRecord>> {
    crate::commands::ipc_try(|| {
        state
            .db
            .list_entities_by_workspace(EntityTable::Sessions, &active_workspace_scope_id(&state))
    })
}

#[tauri::command]
pub fn conversation_get_session(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> IpcResult<Option<ConversationDetail>> {
    ipc(get_session_detail(&state, &session_id))
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
        },
    )
    .await
}

#[tauri::command]
pub fn conversation_rename_session(
    state: tauri::State<'_, AppState>,
    input: RenameSessionInput,
) -> IpcResult<ConversationSessionRecord> {
    crate::commands::ipc_try(|| {
        let mut session = require_session(&state, &input.session_id)?;
        session.title = input.title;
        session.title_updated_at = Some(adl_kernel::now_ms());
        session.updated_at = adl_kernel::now_ms();
        save_session(&state, &session)?;
        Ok(session)
    })
}

#[tauri::command]
pub fn conversation_pin_session(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> IpcResult<ConversationSessionRecord> {
    set_pinned(&state, &session_id, true)
}

#[tauri::command]
pub fn conversation_unpin_session(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> IpcResult<ConversationSessionRecord> {
    set_pinned(&state, &session_id, false)
}

#[tauri::command]
pub fn conversation_archive_session(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> IpcResult<ConversationSessionRecord> {
    crate::commands::ipc_try(|| {
        let mut session = require_session(&state, &session_id)?;
        session.status = "archived".into();
        session.archived_at = Some(adl_kernel::now_ms());
        session.updated_at = adl_kernel::now_ms();
        save_session(&state, &session)?;
        Ok(session)
    })
}

#[tauri::command]
pub fn conversation_archive_all_in_workspace(
    state: tauri::State<'_, AppState>,
) -> IpcResult<Vec<ConversationSessionRecord>> {
    crate::commands::ipc_try(|| {
        let workspace_id = active_workspace_scope_id(&state);
        let mut sessions: Vec<ConversationSessionRecord> = state
            .db
            .list_entities_by_workspace(EntityTable::Sessions, &workspace_id)?;
        for session in &mut sessions {
            session.status = "archived".into();
            session.archived_at = Some(adl_kernel::now_ms());
            session.updated_at = adl_kernel::now_ms();
            save_session(&state, session)?;
        }
        Ok(sessions)
    })
}

pub fn active_workspace_scope_id(state: &AppState) -> String {
    state
        .current_workspace
        .lock()
        .expect("workspace mutex poisoned")
        .as_ref()
        .map(|workspace| workspace.id.clone())
        .unwrap_or_else(|| adl_kernel::GLOBAL_WORKSPACE_ID.to_string())
}

#[tauri::command]
pub fn conversation_reorder_sessions(
    state: tauri::State<'_, AppState>,
    input: ReorderSessionsInput,
) -> IpcResult<Vec<ConversationSessionRecord>> {
    crate::commands::ipc_try(|| {
        let mut sessions: Vec<ConversationSessionRecord> = state
            .db
            .list_entities_by_workspace(EntityTable::Sessions, &input.workspace_id)?;
        for session in &mut sessions {
            if let Some(order) = input.pinned_ids.iter().position(|id| id == &session.id) {
                session.is_pinned = true;
                session.pinned_order = order as i32;
                session.updated_at = adl_kernel::now_ms();
                save_session(&state, session)?;
            }
            if let Some(order) = input.unpinned_ids.iter().position(|id| id == &session.id) {
                session.is_pinned = false;
                session.unpinned_order = order as i32;
                session.updated_at = adl_kernel::now_ms();
                save_session(&state, session)?;
            }
        }
        sessions.sort_by_key(|session| {
            (
                !session.is_pinned,
                if session.is_pinned {
                    session.pinned_order
                } else {
                    session.unpinned_order
                },
            )
        });
        Ok(sessions)
    })
}

#[tauri::command]
pub fn conversation_delete_session(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> IpcResult<bool> {
    ipc(state.db.delete_entity(EntityTable::Sessions, &session_id))
}

#[tauri::command]
pub fn conversation_mark_session_read(
    state: tauri::State<'_, AppState>,
    input: MarkSessionReadInput,
) -> IpcResult<ConversationSessionRecord> {
    crate::commands::ipc_try(|| {
        let mut session = require_session(&state, &input.session_id)?;
        session.manual_unread = false;
        session.last_read_at = Some(input.read_at.unwrap_or_else(adl_kernel::now_ms));
        save_session(&state, &session)?;
        Ok(session)
    })
}

#[tauri::command]
pub fn conversation_cancel_message(
    state: tauri::State<'_, AppState>,
    run_id: String,
) -> IpcResult<Option<adl_kernel::AgentRunDetail>> {
    crate::commands::ipc_try(|| {
        let Some(detail) = crate::commands::agent::load_run_detail(&state, &run_id)? else {
            return Ok(None);
        };
        let detail = adl_agent_runtime::abort_run(detail);
        crate::commands::agent::save_run_detail(&state, &detail)?;
        Ok(Some(detail))
    })
}

#[tauri::command]
pub fn conversation_mark_session_unread(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> IpcResult<ConversationSessionRecord> {
    crate::commands::ipc_try(|| {
        let mut session = require_session(&state, &session_id)?;
        session.manual_unread = true;
        save_session(&state, &session)?;
        Ok(session)
    })
}

pub fn get_session_detail(
    state: &AppState,
    session_id: &str,
) -> Result<Option<ConversationDetail>, AppError> {
    let Some(session) = state
        .db
        .load_entity::<ConversationSessionRecord>(EntityTable::Sessions, session_id)?
    else {
        return Ok(None);
    };
    let mut messages: Vec<ConversationMessageRecord> = state
        .db
        .list_entities_by_session(EntityTable::ConversationMessages, session_id)?;
    messages.sort_by_key(|message| message.created_at);
    Ok(Some(ConversationDetail { session, messages }))
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

fn set_pinned(
    state: &AppState,
    session_id: &str,
    pinned: bool,
) -> IpcResult<ConversationSessionRecord> {
    crate::commands::ipc_try(|| {
        let mut session = require_session(state, session_id)?;
        session.is_pinned = pinned;
        session.updated_at = adl_kernel::now_ms();
        save_session(state, &session)?;
        Ok(session)
    })
}
