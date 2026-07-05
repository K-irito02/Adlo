use adl_agent_runtime::durable::{DurableSessionManager, DurableSessionState};
use std::sync::Arc;

#[allow(clippy::incompatible_msrv)]
static DURABLE_MANAGER: std::sync::LazyLock<Arc<DurableSessionManager>> =
    std::sync::LazyLock::new(|| Arc::new(DurableSessionManager::new()));

#[tauri::command]
pub async fn register_durable_session(session_id: String, run_id: String) -> Result<(), adl_errors::AppError> {
    DURABLE_MANAGER.register_session(&session_id, &run_id).await;
    Ok(())
}

#[tauri::command]
pub async fn heartbeat_durable_session(session_id: String) -> Result<(), adl_errors::AppError> {
    DURABLE_MANAGER.heartbeat(&session_id).await;
    Ok(())
}

#[tauri::command]
pub async fn find_crashed_sessions() -> Result<Vec<DurableSessionState>, adl_errors::AppError> {
    Ok(DURABLE_MANAGER.find_crashed_sessions().await)
}

#[tauri::command]
pub async fn recover_session(session_id: String) -> Result<bool, adl_errors::AppError> {
    Ok(DURABLE_MANAGER.start_recovery(&session_id).await)
}
