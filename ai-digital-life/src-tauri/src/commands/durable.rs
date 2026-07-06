use crate::state::AppState;
use adl_agent_runtime::durable::DurableSessionState;

#[tauri::command]
pub async fn register_durable_session(
    state: tauri::State<'_, AppState>,
    session_id: String,
    run_id: String,
) -> Result<(), adl_errors::AppError> {
    state.durable_manager.register_session(&session_id, &run_id).await;
    Ok(())
}

#[tauri::command]
pub async fn heartbeat_durable_session(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> Result<(), adl_errors::AppError> {
    state.durable_manager.heartbeat(&session_id).await;
    Ok(())
}

#[tauri::command]
pub async fn find_crashed_sessions(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<DurableSessionState>, adl_errors::AppError> {
    Ok(state.durable_manager.find_crashed_sessions().await)
}

#[tauri::command]
pub async fn recover_session(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> Result<bool, adl_errors::AppError> {
    Ok(state.durable_manager.start_recovery(&session_id).await)
}
