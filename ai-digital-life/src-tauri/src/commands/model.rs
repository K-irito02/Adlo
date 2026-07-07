use crate::commands::ipc;
use adl_kernel::IpcResult;

#[tauri::command]
pub fn model_set_provider_secret(provider_id: String, secret: String) -> IpcResult<bool> {
    ipc(adl_model_gateway::set_provider_secret(&provider_id, &secret).map(|_| true))
}

#[tauri::command]
pub fn model_clear_provider_secret(provider_id: String) -> IpcResult<bool> {
    ipc(adl_model_gateway::clear_provider_secret(&provider_id).map(|_| true))
}
