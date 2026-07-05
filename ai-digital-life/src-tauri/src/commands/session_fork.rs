use adl_conversation::fork::fork_session;
use adl_kernel::types::conversation::ConversationSessionRecord;

#[tauri::command]
pub async fn fork_session_cmd(
    parent_session: ConversationSessionRecord,
    fork_message_id: String,
    existing_fork_count: u32,
) -> Result<ConversationSessionRecord, adl_errors::AppError> {
    Ok(fork_session(&parent_session, &fork_message_id, existing_fork_count))
}

#[tauri::command]
pub async fn list_session_forks(
    _workspace_id: String,
    _parent_session_id: String,
) -> Result<Vec<ConversationSessionRecord>, adl_errors::AppError> {
    Ok(vec![])
}
