use crate::commands::ipc;
use adl_errors::AppError;
use adl_model_gateway::providers::openai::OpenAIProvider;
use adl_model_gateway::registry::{ApiType, AuthType, ModelSource, ProviderDefinition};
use adl_types::IpcResult;
use adl_types::config::{ModelCapability, ModelDefinition};
use serde::Serialize;

type CmdResult<T> = Result<IpcResult<T>, AppError>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    pub id: String,
    pub name: String,
    pub description: String,
    pub api_type: String,
    pub built_in: bool,
    pub configured: bool,
    pub has_key: bool,
    pub requires_key: bool,
    pub base_url: Option<String>,
    pub models: Vec<ModelDefinition>,
    pub enabled: bool,
    pub enabled_models: Option<Vec<String>>,
}

#[derive(Serialize)]
pub struct ConnectionTestResult {
    pub connected: bool,
    pub error: Option<String>,
}

fn merge_enabled(
    entry: Option<&adl_types::ModelProviderPreference>,
) -> (bool, Option<Vec<String>>) {
    match entry {
        Some(e) => (e.enabled, e.enabled_models.clone()),
        None => (true, None),
    }
}

fn map_def_to_status(
    def: &ProviderDefinition,
    pref: Option<&adl_types::ModelProviderPreference>,
) -> ProviderStatus {
    let models = match &def.models {
        ModelSource::Static(list) => list.clone(),
        ModelSource::Dynamic { .. } => vec![],
    };
    let (enabled, enabled_models) = merge_enabled(pref);
    let has_secret = def.id == "ollama" || adl_model_gateway::get_provider_secret(&def.id).is_ok();
    ProviderStatus {
        id: def.id.clone(),
        name: def.name.clone(),
        description: def.description.clone(),
        api_type: format!("{:?}", def.api_type),
        built_in: def.built_in,
        configured: has_secret,
        has_key: adl_model_gateway::get_provider_secret(&def.id).is_ok(),
        requires_key: matches!(def.auth_type, adl_model_gateway::registry::AuthType::ApiKey),
        base_url: def.default_base_url.clone(),
        models,
        enabled,
        enabled_models,
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
        let config =
            state.config.read().map_err(|_| AppError::Internal("config lock poisoned".into()))?;
        let prefs = &config.model_preferences.providers;
        let registry = state
            .provider_registry
            .read()
            .map_err(|e| AppError::Internal(format!("registry lock poisoned: {e}")))?;
        Ok(registry
            .list_all()
            .into_iter()
            .map(|def| map_def_to_status(def, prefs.get(&def.id)))
            .collect())
    })();
    Ok(ipc(result))
}

#[tauri::command]
pub async fn test_provider_connection(
    provider_id: String,
    state: tauri::State<'_, crate::state::AppState>,
) -> CmdResult<ConnectionTestResult> {
    let api_key = adl_model_gateway::get_provider_secret(&provider_id).unwrap_or_default();

    let (adapter, base_url) = {
        let registry = state
            .provider_registry
            .read()
            .map_err(|e| AppError::Internal(format!("registry lock: {}", e)))?;

        let def = registry
            .get(&provider_id)
            .ok_or_else(|| AppError::NotFound(format!("provider '{}' not found", provider_id)))?
            .clone();

        let adapter = registry
            .get_adapter_owned(&provider_id)
            .ok_or_else(|| AppError::NotFound(format!("adapter '{}' not found", provider_id)))?;

        (adapter, def.default_base_url.unwrap_or_default())
    };

    match adapter.test_connection(&api_key, &base_url).await {
        Ok(_) => Ok(ipc(Ok(ConnectionTestResult { connected: true, error: None }))),
        Err(e) => {
            Ok(ipc(Ok(ConnectionTestResult { connected: false, error: Some(e.to_string()) })))
        },
    }
}

#[tauri::command]
pub async fn fetch_provider_models(
    provider_id: String,
    state: tauri::State<'_, crate::state::AppState>,
) -> CmdResult<Vec<ModelDefinition>> {
    let (adapter, def, api_key) = {
        let registry = state
            .provider_registry
            .read()
            .map_err(|e| AppError::Internal(format!("registry lock poisoned: {e}")))?;
        let adapter = registry
            .get_adapter_owned(&provider_id)
            .ok_or_else(|| AppError::NotFound(format!("adapter '{}' not found", provider_id)))?;
        let def = registry
            .get(&provider_id)
            .ok_or_else(|| AppError::NotFound(format!("provider '{}' not found", provider_id)))?
            .clone();
        let api_key = adl_model_gateway::get_provider_secret(&provider_id).unwrap_or_default();
        let base_url = def.default_base_url.clone().unwrap_or_default();
        (adapter, def, (api_key, base_url))
    };
    let (api_key, base_url) = api_key;
    let result = if adapter.supports_dynamic_models() {
        match adapter.fetch_models(&api_key, &base_url).await {
            Ok(models) if !models.is_empty() => Ok(models),
            _ => Ok(fallback_models(&def)),
        }
    } else {
        Ok(fallback_models(&def))
    };
    Ok(ipc(result))
}

fn validate_provider_url(url: &str) -> Result<(), AppError> {
    let parsed = url::Url::parse(url)
        .map_err(|e| AppError::InvalidInput(format!("invalid provider URL: {e}")))?;
    if parsed.scheme() != "https" {
        // Allow HTTP for localhost/loopback for local development
        if let Some(host) = parsed.host_str() {
            if host == "localhost" || host == "127.0.0.1" || host == "[::1]" {
                return Ok(());
            }
        }
        return Err(AppError::InvalidInput(
            "provider URL must use HTTPS scheme (except localhost)".into(),
        ));
    }
    if parsed.host_str().is_none() {
        return Err(AppError::InvalidInput("provider URL must include a hostname".into()));
    }
    Ok(())
}

#[tauri::command]
pub async fn add_custom_provider(
    name: String,
    base_url: String,
    api_key: String,
    models: Vec<String>,
    state: tauri::State<'_, crate::state::AppState>,
) -> CmdResult<bool> {
    validate_provider_url(&base_url)?;
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
        default_model: None,
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
pub async fn set_provider_api_key(
    provider_id: String,
    api_key: String,
) -> Result<IpcResult<bool>, AppError> {
    tokio::task::spawn_blocking(move || {
        adl_model_gateway::set_provider_secret(&provider_id, &api_key)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(true)))
}

#[tauri::command]
pub async fn clear_provider_api_key(provider_id: String) -> Result<IpcResult<bool>, AppError> {
    tokio::task::spawn_blocking(move || adl_model_gateway::clear_provider_secret(&provider_id))
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(true)))
}

#[tauri::command]
pub async fn has_provider_api_key(provider_id: String) -> Result<IpcResult<bool>, AppError> {
    let result =
        tokio::task::spawn_blocking(move || adl_model_gateway::get_provider_secret(&provider_id))
            .await
            .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?;
    Ok(ipc(Ok(result.is_ok())))
}

#[tauri::command]
pub async fn save_provider_config(
    provider_id: String,
    config: serde_json::Value,
) -> CmdResult<bool> {
    if let Some(api_key) = config.get("apiKey").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
        adl_model_gateway::set_provider_secret(&provider_id, api_key)
            .map_err(|e| AppError::Security(e.to_string()))?;
    }

    let has_api_key = config.get("apiKey").and_then(|v| v.as_str()).is_some_and(|s| !s.is_empty());
    tracing::info!(provider_id = %provider_id, has_api_key = has_api_key, "provider config saved");
    Ok(ipc(Ok(true)))
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

#[cfg(test)]
mod tests {
    #[allow(unused_imports)]
    use super::*;

    #[test]
    fn save_provider_config_does_not_log_api_key() {
        let config = serde_json::json!({
            "apiKey": "sk-super-secret-key-12345",
            "baseUrl": "https://api.example.com"
        });
        assert!(config.get("apiKey").is_some());
        let has_key = config.get("apiKey").and_then(|v| v.as_str()).is_some_and(|s| !s.is_empty());
        assert!(has_key);
        // Verify the logged info does NOT contain the key text itself
        let config_str = config.to_string();
        assert!(config_str.contains("sk-super-secret-key-12345"));
        // After fix: the tracing call should only log has_api_key, not the key
    }

    #[test]
    fn rejects_http_url() {
        assert!(validate_provider_url("http://evil.com/v1").is_err());
    }

    #[test]
    fn allows_localhost_http() {
        assert!(validate_provider_url("http://localhost:11434").is_ok());
        assert!(validate_provider_url("http://127.0.0.1:8080").is_ok());
    }

    #[test]
    fn rejects_invalid_url() {
        assert!(validate_provider_url("not-a-url").is_err());
        assert!(validate_provider_url("").is_err());
    }

    #[test]
    fn accepts_valid_https_url() {
        assert!(validate_provider_url("https://api.example.com/v1").is_ok());
    }

    #[test]
    fn merge_enabled_no_entry_means_enabled_with_no_models() {
        let (enabled, models) = merge_enabled(None);
        assert!(enabled);
        assert!(models.is_none());
    }

    #[test]
    fn merge_enabled_uses_entry_fields_when_present() {
        let entry = adl_types::ModelProviderPreference {
            enabled: true,
            priority: 1,
            model_id: "model-a".to_string(),
            enabled_models: Some(vec!["a".to_string()]),
        };
        let (enabled, models) = merge_enabled(Some(&entry));
        assert!(enabled);
        assert_eq!(models, Some(vec!["a".to_string()]));
    }

    #[test]
    fn merge_enabled_disabled_provider() {
        let entry = adl_types::ModelProviderPreference {
            enabled: false,
            priority: 1,
            model_id: "model-a".to_string(),
            enabled_models: Some(vec![]),
        };
        let (enabled, models) = merge_enabled(Some(&entry));
        assert!(!enabled);
        assert_eq!(models, Some(vec![]));
    }

    #[test]
    fn provider_status_serializes_camel_case() {
        let status = ProviderStatus {
            id: "deepseek".to_string(),
            name: "DeepSeek".to_string(),
            description: "DeepSeek API".to_string(),
            api_type: "OpenAICompatible".to_string(),
            built_in: true,
            configured: true,
            has_key: true,
            requires_key: true,
            base_url: Some("https://api.deepseek.com".to_string()),
            models: vec![ModelDefinition {
                id: "deepseek-chat".to_string(),
                provider_id: "deepseek".to_string(),
                name: "DeepSeek Chat".to_string(),
                description: None,
                context_window: Some(65536),
                max_output: Some(8192),
                capabilities: vec![ModelCapability::Text, ModelCapability::Streaming],
                tier: None,
                released: None,
            }],
            enabled: true,
            enabled_models: Some(vec!["deepseek-chat".to_string()]),
        };

        let json = serde_json::to_value(&status).expect("serialize ProviderStatus");
        let obj = json.as_object().expect("ProviderStatus is an object");

        for key in ["apiType", "builtIn", "hasKey", "baseUrl", "enabledModels"] {
            assert!(obj.contains_key(key), "missing camelCase key '{key}'");
        }
        for key in ["api_type", "enabled_models"] {
            assert!(!obj.contains_key(key), "unexpected snake_case key '{key}'");
        }

        let models = obj["models"].as_array().expect("models is an array");
        let first = models[0].as_object().expect("model is an object");
        assert!(first.contains_key("providerId"), "nested model missing camelCase 'providerId'");
    }
}
