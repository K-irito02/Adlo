use crate::commands::ipc;
use crate::state::AppState;
use adl_storage::EntityTable;
use adl_types::IpcResult;
use std::path::PathBuf;
use tauri::Emitter;

#[tauri::command]
pub fn retrieval_get_status(
    state: tauri::State<'_, AppState>,
) -> IpcResult<Option<adl_types::RetrievalSnapshot>> {
    ipc(crate::commands::workspace::latest_retrieval(&state))
}

#[tauri::command]
pub fn retrieval_rebuild_index(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> IpcResult<bool> {
    crate::commands::ipc_try(|| {
        let workspace = crate::commands::workspace::current_workspace(&state)?;
        let snapshot = adl_workspace::build_retrieval_snapshot(
            &workspace.id,
            PathBuf::from(&workspace.root_path).as_path(),
        )?;
        state.db.save_entity(
            EntityTable::RetrievalSnapshots,
            &workspace.id,
            Some(&workspace.id),
            None,
            Some("completed"),
            &snapshot,
        )?;
        let _ = app.emit("digital-life://retrieval-status", &snapshot);
        state
            .event_bus
            .emit(adl_kernel::events::AppEvent::RetrievalStatusChanged(workspace.id.clone()));
        Ok(true)
    })
}
