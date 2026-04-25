use crate::commands::ipc;
use crate::state::AppState;
use adl_kernel::{IpcResult, RetrievalSnapshot};

#[tauri::command]
pub fn retrieval_get_status(
    state: tauri::State<'_, AppState>,
) -> IpcResult<Option<RetrievalSnapshot>> {
    ipc(crate::commands::workspace::latest_retrieval(&state))
}
