use crate::commands::ipc;
use adl_errors::AppError;
use adl_types::IpcResult;
use std::path::PathBuf;

#[tauri::command]
pub async fn enter_plan_mode(
    workspace_id: String,
    workspace_root: String,
) -> Result<IpcResult<String>, AppError> {
    Ok(ipc({
        let mutex = super::plan_mode_states();
        let mut states = mutex.lock().unwrap_or_else(|e| e.into_inner());
        let state = states.entry(workspace_id).or_default();
        let path = state.enter(&PathBuf::from(workspace_root));
        Ok(path.to_string_lossy().to_string())
    }))
}

#[tauri::command]
pub async fn exit_plan_mode(workspace_id: String) -> Result<IpcResult<Option<String>>, AppError> {
    Ok(ipc({
        let mutex = super::plan_mode_states();
        let mut states = mutex.lock().unwrap_or_else(|e| e.into_inner());
        let state = states.entry(workspace_id).or_default();
        Ok(state.exit().map(|p| p.to_string_lossy().to_string()))
    }))
}

#[tauri::command]
pub async fn get_plan_mode_state(workspace_id: String) -> Result<IpcResult<bool>, AppError> {
    Ok(ipc({
        let states = super::plan_mode_states();
        let states = states.lock().unwrap_or_else(|e| e.into_inner());
        Ok(states.get(&workspace_id).map(|s| s.is_active()).unwrap_or(false))
    }))
}
