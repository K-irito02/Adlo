use crate::commands::ipc;
use crate::state::AppState;
use adl_errors::AppError;
use adl_storage::EntityTable;
use adl_types::IpcResult;
use std::path::PathBuf;
use tauri::Emitter;
use tauri::Manager;

#[tauri::command]
pub fn retrieval_get_status(
    state: tauri::State<'_, AppState>,
) -> IpcResult<Option<adl_types::RetrievalSnapshot>> {
    ipc(crate::commands::workspace::latest_retrieval(&state))
}

#[tauri::command]
pub async fn retrieval_rebuild_index(app: tauri::AppHandle) -> Result<IpcResult<bool>, AppError> {
    let state = app.state::<AppState>();
    let workspace = crate::commands::workspace::current_workspace(&state)?;
    let workspace_id = workspace.id.clone();
    let root_path = workspace.root_path.clone();
    let db = state.db.clone();

    let snapshot = tokio::task::spawn_blocking({
        let workspace_id = workspace_id.clone();
        move || {
            adl_workspace::build_retrieval_snapshot(
                &workspace_id,
                PathBuf::from(&root_path).as_path(),
            )
        }
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;

    db.save_entity(
        EntityTable::RetrievalSnapshots,
        &workspace_id,
        Some(&workspace_id),
        None,
        Some("completed"),
        &snapshot,
    )?;
    let _ = app.emit("digital-life://retrieval-status", &snapshot);
    state.event_bus.emit(adl_kernel::events::AppEvent::RetrievalStatusChanged(workspace_id));
    Ok(ipc(Ok(true)))
}
