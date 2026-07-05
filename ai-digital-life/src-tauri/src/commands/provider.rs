use crate::commands::ipc;
use adl_kernel::{IpcResult, ModelProviderId};

#[tauri::command]
pub fn set_provider_api_key(provider_id: ModelProviderId, api_key: String) -> IpcResult<bool> {
    ipc(adl_model_gateway::set_provider_secret(provider_id, &api_key).map(|_| true))
}

#[tauri::command]
pub fn clear_provider_api_key(provider_id: ModelProviderId) -> IpcResult<bool> {
    ipc(adl_model_gateway::clear_provider_secret(provider_id).map(|_| true))
}

#[tauri::command]
pub fn has_provider_api_key(provider_id: ModelProviderId) -> IpcResult<bool> {
    ipc(Ok(adl_model_gateway::get_provider_secret(provider_id).is_ok()))
}

#[derive(serde::Serialize)]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub requires_key: bool,
}

#[tauri::command]
pub fn list_supported_providers() -> IpcResult<Vec<ProviderInfo>> {
    ipc(Ok(vec![
        ProviderInfo {
            id: "deepseek".to_string(),
            name: "DeepSeek".to_string(),
            requires_key: true,
        },
        ProviderInfo { id: "minimax".to_string(), name: "MiniMax".to_string(), requires_key: true },
        ProviderInfo { id: "openai".to_string(), name: "OpenAI".to_string(), requires_key: true },
        ProviderInfo {
            id: "anthropic".to_string(),
            name: "Anthropic".to_string(),
            requires_key: true,
        },
        ProviderInfo {
            id: "google".to_string(),
            name: "Google Gemini".to_string(),
            requires_key: true,
        },
        ProviderInfo {
            id: "ollama".to_string(),
            name: "Ollama (Local)".to_string(),
            requires_key: false,
        },
        ProviderInfo {
            id: "openrouter".to_string(),
            name: "OpenRouter".to_string(),
            requires_key: true,
        },
    ]))
}
