#[tauri::command]
pub async fn acp_get_status() -> Result<serde_json::Value, adl_errors::AppError> {
    Err(adl_errors::AppError::Internal("ACP is not implemented (reserved for future)".to_string()))
}

#[tauri::command]
pub async fn acp_get_config() -> Result<adl_kernel::types::reserved::AcpConfig, adl_errors::AppError>
{
    Ok(adl_kernel::types::reserved::AcpConfig::default())
}

#[tauri::command]
pub async fn http_api_get_status() -> Result<serde_json::Value, adl_errors::AppError> {
    Err(adl_errors::AppError::Internal(
        "HTTP API server is not implemented (reserved for future)".to_string(),
    ))
}

#[tauri::command]
pub async fn http_api_get_config(
) -> Result<adl_kernel::types::reserved::HttpApiConfig, adl_errors::AppError> {
    Ok(adl_kernel::types::reserved::HttpApiConfig::default())
}

#[tauri::command]
pub async fn codemode_execute(_code: String) -> Result<serde_json::Value, adl_errors::AppError> {
    Err(adl_errors::AppError::Internal(
        "CodeMode is not implemented (experimental, reserved for future)".to_string(),
    ))
}

#[tauri::command]
pub async fn codemode_get_config(
) -> Result<adl_kernel::types::reserved::CodeModeConfig, adl_errors::AppError> {
    Ok(adl_kernel::types::reserved::CodeModeConfig::default())
}
