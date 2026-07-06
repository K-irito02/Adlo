use crate::commands::ipc;
use adl_errors::AppError;
use adl_kernel::IpcResult;

#[tauri::command]
pub async fn acp_get_status() -> Result<IpcResult<serde_json::Value>, AppError> {
    Ok(ipc(Err(AppError::Internal("ACP is not implemented (reserved for future)".to_string()))))
}

#[tauri::command]
pub async fn acp_get_config() -> Result<IpcResult<adl_kernel::types::reserved::AcpConfig>, AppError>
{
    Ok(ipc(Ok(adl_kernel::types::reserved::AcpConfig::default())))
}

#[tauri::command]
pub async fn http_api_get_status() -> Result<IpcResult<serde_json::Value>, AppError> {
    Ok(ipc(Err(AppError::Internal(
        "HTTP API server is not implemented (reserved for future)".to_string(),
    ))))
}

#[tauri::command]
pub async fn http_api_get_config(
) -> Result<IpcResult<adl_kernel::types::reserved::HttpApiConfig>, AppError> {
    Ok(ipc(Ok(adl_kernel::types::reserved::HttpApiConfig::default())))
}

#[tauri::command]
pub async fn codemode_execute(_code: String) -> Result<IpcResult<serde_json::Value>, AppError> {
    Ok(ipc(Err(AppError::Internal(
        "CodeMode is not implemented (experimental, reserved for future)".to_string(),
    ))))
}

#[tauri::command]
pub async fn codemode_get_config(
) -> Result<IpcResult<adl_kernel::types::reserved::CodeModeConfig>, AppError> {
    Ok(ipc(Ok(adl_kernel::types::reserved::CodeModeConfig::default())))
}
