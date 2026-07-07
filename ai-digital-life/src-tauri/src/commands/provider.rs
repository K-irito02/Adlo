use crate::commands::ipc;
use adl_errors::AppError;
use adl_kernel::types::config::{ModelCapability, ModelDefinition};
use adl_kernel::IpcResult;
use adl_model_gateway::registry::{ApiType, AuthType, ModelSource, ProviderDefinition};
use adl_model_gateway::providers::openai::OpenAIProvider;
use serde::Serialize;

type CmdResult<T> = Result<IpcResult<T>, AppError>;

#[derive(Serialize)]
pub struct ProviderStatus {
    pub id: String,
    pub name: String,
    pub description: String,
    pub api_type: String,
    pub built_in: bool,
    pub configured: bool,
    pub has_key: bool,
    pub base_url: Option<String>,
    pub models: Vec<ModelDefinition>,
}

#[derive(Serialize)]
pub struct ConnectionTestResult {
    pub connected: bool,
    pub error: Option<String>,
}

fn map_def_to_status(def: &ProviderDefinition) -> ProviderStatus {
    let models = match &def.models {
        ModelSource::Static(list) => list.clone(),
        ModelSource::Dynamic { .. } => vec![],
    };
    ProviderStatus {
        id: def.id.clone(),
        name: def.name.clone(),
        description: def.description.clone(),
        api_type: format!("{:?}", def.api_type),
        built_in: def.built_in,
        configured: true,
        has_key: adl_model_gateway::get_provider_secret(&def.id).is_ok(),
        base_url: def.default_base_url.clone(),
        models,
    }
}

fn fallback_models(def: &ProviderDefinition) -> Vec<ModelDefinition> {
    match &def.models {
        ModelSource::Static(list) => list.clone(),
        ModelSource::Dynamic { .. } => vec![],
    }
}

#[tauri::command]
pub async fn list_providers(
    state: tauri::State<'_, crate::state::AppState>,
) -> CmdResult<Vec<ProviderStatus>> {
    let result = (|| -> Result<Vec<ProviderStatus>, AppError> {
        let registry = state
            .provider_registry
            .read()
            .map_err(|e| AppError::Internal(format!("registry lock poisoned: {e}")))?;
        Ok(registry.list_all().into_iter().map(map_def_to_status).collect())
    })();
    Ok(ipc(result))
}

#[tauri::command]
pub async fn test_provider_connection(
    provider_id: String,
    state: tauri::State<'_, crate::state::AppState>,
) -> CmdResult<ConnectionTestResult> {
    let (base_url, api_key) = {
        let registry = state
            .provider_registry
            .read()
            .map_err(|e| AppError::Internal(format!("registry lock poisoned: {e}")))?;
        let def = registry
            .get(&provider_id)
            .ok_or_else(|| AppError::NotFound(format!("provider {} not found", provider_id)))?;
        let api_key = adl_model_gateway::get_provider_secret(&provider_id).unwrap_or_default();
        (def.default_base_url.clone().unwrap_or_default(), api_key)
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| AppError::Internal(format!("failed to create HTTP client: {e}")));
    let client = match client {
        Ok(c) => c,
        Err(e) => return Ok(ipc(Err(e))),
    };

    match client.get(&base_url).header("Authorization", format!("Bearer {}", api_key)).send().await {
        Ok(resp) => Ok(ipc(Ok(ConnectionTestResult {
            connected: resp.status().is_success(),
            error: if resp.status().is_success() { None } else { Some(format!("HTTP {}", resp.status())) },
        }))),
        Err(e) => Ok(ipc(Ok(ConnectionTestResult { connected: false, error: Some(e.to_string()) }))),
    }
}

#[tauri::command]
pub async fn fetch_provider_models(
    provider_id: String,
    state: tauri::State<'_, crate::state::AppState>,
) -> CmdResult<Vec<ModelDefinition>> {
    let result = (|| -> Result<Vec<ModelDefinition>, AppError> {
        let registry = state
            .provider_registry
            .read()
            .map_err(|e| AppError::Internal(format!("registry lock poisoned: {e}")))?;
        let adapter = registry
            .get_adapter(&provider_id)
            .ok_or_else(|| {
                let msg = "adapter ".to_string() + &provider_id + " not found";
                AppError::NotFound(msg)
            })?;
        let def = registry
            .get(&provider_id)
            .ok_or_else(|| {
                let msg = "provider ".to_string() + &provider_id + " not found";
                AppError::NotFound(msg)
            })?;
        let api_key = adl_model_gateway::get_provider_secret(&provider_id).unwrap_or_default();
        let base_url = def.default_base_url.as_deref().unwrap_or("");
        if adapter.supports_dynamic_models() {
            match adapter.fetch_models(&api_key, base_url) {
                Ok(models) => Ok(models),
                Err(_) => Ok(fallback_models(def)),
            }
        } else {
            Ok(fallback_models(def))
        }
    })();
    Ok(ipc(result))
}

#[tauri::command]
pub async fn add_custom_provider(
    name: String,
    base_url: String,
    api_key: String,
    models: Vec<String>,
    state: tauri::State<'_, crate::state::AppState>,
) -> CmdResult<bool> {
    let id = format!("custom-{}", name.to_lowercase().replace(' ', "-"));

    let model_defs: Vec<ModelDefinition> = models
        .into_iter()
        .map(|m| ModelDefinition {
            id: m.clone(),
            provider_id: id.clone(),
            name: m,
            description: None,
            context_window: None,
            max_output: None,
            capabilities: vec![ModelCapability::Text],
            tier: None,
            released: None,
        })
        .collect();

    let def = ProviderDefinition {
        id: id.clone(),
        name: name.clone(),
        description: format!("Custom OpenAI-compatible: {}", name),
        api_type: ApiType::OpenAICompatible,
        default_base_url: Some(base_url.clone()),
        auth_type: AuthType::ApiKey,
        models: ModelSource::Static(model_defs),
        built_in: false,
    };

    {
        let mut registry = state
            .provider_registry
            .write()
            .map_err(|e| AppError::Internal(format!("registry lock poisoned: {e}")))?;
        registry.register(def, Box::new(OpenAIProvider::with_base_url(base_url.clone())));
    }

    if !api_key.is_empty() {
        let _ = adl_model_gateway::set_provider_secret(&id, &api_key);
    }

    Ok(ipc(Ok(true)))
}

#[tauri::command]
pub async fn remove_custom_provider(
    provider_id: String,
    state: tauri::State<'_, crate::state::AppState>,
) -> CmdResult<bool> {
    {
        let mut registry = state
            .provider_registry
            .write()
            .map_err(|e| AppError::Internal(format!("registry lock poisoned: {e}")))?;
        registry.remove(&provider_id);
    }
    let _ = adl_model_gateway::clear_provider_secret(&provider_id);
    Ok(ipc(Ok(true)))
}

#[tauri::command]
pub fn set_provider_api_key(provider_id: String, api_key: String) -> IpcResult<bool> {
    ipc(adl_model_gateway::set_provider_secret(&provider_id, &api_key).map(|_| true))
}

#[tauri::command]
pub fn clear_provider_api_key(provider_id: String) -> IpcResult<bool> {
    ipc(adl_model_gateway::clear_provider_secret(&provider_id).map(|_| true))
}

#[tauri::command]
pub fn has_provider_api_key(provider_id: String) -> IpcResult<bool> {
    ipc(Ok(adl_model_gateway::get_provider_secret(&provider_id).is_ok()))
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
        ProviderInfo { id: "deepseek".to_string(), name: "DeepSeek".to_string(), requires_key: true },
        ProviderInfo { id: "minimax".to_string(), name: "MiniMax".to_string(), requires_key: true },
        ProviderInfo { id: "openai".to_string(), name: "OpenAI".to_string(), requires_key: true },
        ProviderInfo { id: "anthropic".to_string(), name: "Anthropic".to_string(), requires_key: true },
        ProviderInfo { id: "google".to_string(), name: "Google Gemini".to_string(), requires_key: true },
        ProviderInfo { id: "ollama".to_string(), name: "Ollama (Local)".to_string(), requires_key: false },
        ProviderInfo { id: "openrouter".to_string(), name: "OpenRouter".to_string(), requires_key: true },
    ]))
}
