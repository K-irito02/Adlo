use crate::commands::ipc;
use adl_errors::AppError;
use adl_types::IpcResult;

/// Credential read-back (system capability): the desktop settings key input is
/// re-filled after a restart via these two Tauri invoke commands. All other
/// provider operations travel over HTTP to the ad-server (write-only keys).
#[tauri::command]
pub async fn has_provider_api_key(provider_id: String) -> Result<IpcResult<bool>, AppError> {
    let result =
        tokio::task::spawn_blocking(move || adl_model_gateway::get_provider_secret(&provider_id))
            .await
            .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?;
    Ok(ipc(Ok(result.is_ok())))
}

#[tauri::command]
pub async fn get_provider_api_key(
    provider_id: String,
) -> Result<IpcResult<Option<String>>, AppError> {
    // Read back the persisted credential so the settings input can be re-filled
    // after an app restart. The key stays in the encrypted credential store and
    // is masked (password input) in the UI.
    let result =
        tokio::task::spawn_blocking(move || adl_model_gateway::get_provider_secret(&provider_id))
            .await
            .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?;
    Ok(ipc(Ok(result.ok())))
}
