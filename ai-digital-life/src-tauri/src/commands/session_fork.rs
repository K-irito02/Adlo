use crate::commands::ipc;
use crate::state::AppState;
use adl_conversation::fork::fork_session;
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::IpcResult;
use adl_types::conversation::ConversationSessionRecord;

#[tauri::command]
pub async fn fork_session_cmd(
    state: tauri::State<'_, AppState>,
    parent_session: ConversationSessionRecord,
    _fork_message_id: String,
) -> Result<IpcResult<ConversationSessionRecord>, AppError> {
    let existing_fork_count = state
        .db
        .list_entities_by_workspace::<ConversationSessionRecord>(
            EntityTable::Sessions,
            &parent_session.workspace_id,
        )?
        .into_iter()
        .filter(|s| s.parent_id.as_deref() == Some(&parent_session.id))
        .count() as u32;
    Ok(ipc(Ok(fork_session(&parent_session, existing_fork_count))))
}

#[tauri::command]
pub async fn list_session_forks(
    state: tauri::State<'_, AppState>,
    workspace_id: String,
    parent_session_id: String,
) -> Result<IpcResult<Vec<ConversationSessionRecord>>, AppError> {
    let forks: Vec<ConversationSessionRecord> = state
        .db
        .list_entities_by_workspace::<ConversationSessionRecord>(
            EntityTable::Sessions,
            &workspace_id,
        )?
        .into_iter()
        .filter(|s| s.parent_id.as_deref() == Some(&parent_session_id))
        .collect();
    Ok(ipc(Ok(forks)))
}
