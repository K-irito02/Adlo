use crate::commands::ipc;
use crate::state::AppState;
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::{
    ConversationDetail, ConversationSessionRecord, IpcResult,
};
use tauri::Manager;

#[tauri::command]
pub async fn conversation_create_session(
    app: tauri::AppHandle,
    title: Option<String>,
    workspace_id: Option<String>,
) -> Result<IpcResult<ConversationSessionRecord>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let wid = workspace_id.unwrap_or_else(|| super::active_workspace_scope_id(&state));
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
    let workspace_id = super::active_workspace_scope_id(&state);
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
    let detail = tokio::task::spawn_blocking(move || super::get_session_detail_with_db(&db, &session_id))
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(detail)))
}

#[tauri::command]
pub async fn conversation_rename_session(
    app: tauri::AppHandle,
    input: super::RenameSessionInput,
) -> Result<IpcResult<ConversationSessionRecord>, AppError> {
    let state = app.state::<AppState>();
    let db = state.db.clone();
    let session =
        tokio::task::spawn_blocking(move || -> Result<ConversationSessionRecord, AppError> {
            let mut session = super::require_session_with_db(&db, &input.session_id)?;
            session.title = input.title;
            session.title_updated_at = Some(adl_types::now_ms());
            session.updated_at = adl_types::now_ms();
            super::save_session_with_db(&db, &session)?;
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
    let session = tokio::task::spawn_blocking(move || super::set_pinned_with_db(&db, &session_id, true))
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
    let session = tokio::task::spawn_blocking(move || super::set_pinned_with_db(&db, &session_id, false))
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
            let mut session = super::require_session_with_db(&db, &session_id)?;
            session.status = "archived".into();
            session.archived_at = Some(adl_types::now_ms());
            session.updated_at = adl_types::now_ms();
            super::save_session_with_db(&db, &session)?;
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
    let workspace_id = super::active_workspace_scope_id(&state);
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
