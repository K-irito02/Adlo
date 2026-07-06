use crate::commands::ipc;
use adl_conversation::fork::fork_session;
use adl_errors::AppError;
use adl_kernel::types::conversation::ConversationSessionRecord;
use adl_kernel::IpcResult;

#[tauri::command]
pub async fn fork_session_cmd(
    parent_session: ConversationSessionRecord,
    fork_message_id: String,
    existing_fork_count: u32,
) -> Result<IpcResult<ConversationSessionRecord>, AppError> {
    Ok(ipc(Ok(fork_session(&parent_session, &fork_message_id, existing_fork_count))))
}

#[tauri::command]
pub async fn list_session_forks(
    _workspace_id: String,
    _parent_session_id: String,
) -> Result<IpcResult<Vec<ConversationSessionRecord>>, AppError> {
    Ok(ipc(Ok(vec![])))
}
