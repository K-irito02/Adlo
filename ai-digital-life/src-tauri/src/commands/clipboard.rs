use std::sync::Arc;

use adl_clipboard::ClipboardStore;
use adl_types::IpcResult;
use adl_types::types::clipboard::ClipboardItem;

use crate::commands::ipc;

/// Managed Tauri state holding the shared clipboard store. `Arc` allows the
/// clipboard monitor background thread and the command handlers to share one
/// store + one r2d2-backed SQLite connection pool.
pub struct ManagedClipboard(pub Arc<ClipboardStore>);

#[tauri::command]
pub fn clipboard_list(
    state: tauri::State<'_, ManagedClipboard>,
    limit: usize,
) -> IpcResult<Vec<ClipboardItem>> {
    ipc(state.0.list(limit.min(500)))
}

#[tauri::command]
pub fn clipboard_remove(state: tauri::State<'_, ManagedClipboard>, id: String) -> IpcResult<bool> {
    ipc(state.0.remove(&id))
}

#[tauri::command]
pub fn clipboard_clear(state: tauri::State<'_, ManagedClipboard>) -> IpcResult<usize> {
    ipc(state.0.clear())
}
