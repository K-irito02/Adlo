use crate::commands::ipc;
use crate::state::AppState;
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::{ConversationSessionRecord, IpcResult};
use tauri::Manager;

#[tauri::command]
pub async fn conversation_reorder_sessions(
    app: tauri::AppHandle,
    input: super::ReorderSessionsInput,
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
pub async fn conversation_mark_session_read(
    app: tauri::AppHandle,
    input: super::MarkSessionReadInput,
) -> Result<IpcResult<ConversationSessionRecord>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let session =
        tokio::task::spawn_blocking(move || -> Result<ConversationSessionRecord, AppError> {
            let mut session = super::require_session_with_db(&db, &input.session_id)?;
            session.manual_unread = false;
            session.last_read_at = Some(input.read_at.unwrap_or_else(adl_types::now_ms));
            super::save_session_with_db(&db, &session)?;
            Ok(session)
        })
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(session)))
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
            let mut session = super::require_session_with_db(&db, &session_id)?;
            session.manual_unread = true;
            super::save_session_with_db(&db, &session)?;
            Ok(session)
        })
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(session)))
}
