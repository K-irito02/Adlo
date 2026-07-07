//! Provider API call — sends chat completion requests to registered
//! provider adapters. Handles credential retrieval and delegates to
//! [`dispatch_to_provider`], which routes to the appropriate
//! `ProviderAdapter` via registry lookup.

use adl_errors::AppError;
use adl_kernel::{ModelChatMessage, ModelResponse};

use crate::adapter::{ChatOptions, StreamReader};
use crate::secret::get_provider_secret;
use crate::ModelGateway;

pub(crate) async fn call_provider(
    gateway: &ModelGateway,
    provider: &str,
    model_id: &str,
    messages: &[ModelChatMessage],
) -> Result<ModelResponse, AppError> {
    // Ollama is a local model server and does not require an API key.
    // All other providers must have a credential configured.
    let needs_api_key = provider != "ollama";
    let api_key = if needs_api_key {
        tokio::task::spawn_blocking({
            let provider = provider.to_string();
            move || get_provider_secret(&provider)
        })
        .await
        .map_err(|e| AppError::Security(e.to_string()))??
    } else {
        String::new()
    };
    if needs_api_key && api_key.is_empty() {
        return Err(AppError::Security(format!(
            "API key for provider {provider} is not configured"
        )));
    }
    dispatch_to_provider(gateway, provider, model_id, messages, &api_key).await
}

pub(crate) async fn call_provider_stream(
    gateway: &ModelGateway,
    provider: &str,
    model_id: &str,
    messages: &[ModelChatMessage],
) -> Result<StreamReader, AppError> {
    let needs_api_key = provider != "ollama";
    let api_key = if needs_api_key {
        tokio::task::spawn_blocking({
            let provider = provider.to_string();
            move || get_provider_secret(&provider)
        })
        .await
        .map_err(|e| AppError::Security(e.to_string()))??
    } else {
        String::new()
    };
    if needs_api_key && api_key.is_empty() {
        return Err(AppError::Security(format!(
            "API key for provider {provider} is not configured"
        )));
    }
    let options = ChatOptions::default();
    let adapter = gateway
        .registry
        .read()
        .map_err(|e| AppError::Internal(format!("registry lock poisoned: {e}")))?
        .get_adapter_owned(provider)
        .ok_or_else(|| AppError::Internal(format!("unknown provider: {provider}")))?;
    adapter.chat_stream(model_id, messages, &options, &api_key).await
}

/// Route a chat request to the appropriate provider adapter via registry
/// lookup.
///
/// This function is separated from [`call_provider`] so that tests can
/// verify routing behavior without depending on the system keyring.
pub(crate) async fn dispatch_to_provider(
    gateway: &ModelGateway,
    provider: &str,
    model_id: &str,
    messages: &[ModelChatMessage],
    api_key: &str,
) -> Result<ModelResponse, AppError> {
    let options = ChatOptions::default();
    let adapter = gateway
        .registry
        .read()
        .map_err(|e| AppError::Internal(format!("registry lock poisoned: {e}")))?
        .get_adapter_owned(provider)
        .ok_or_else(|| AppError::Internal(format!("unknown provider: {provider}")))?;
    adapter.chat(model_id, messages, &options, api_key).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::anthropic::AnthropicProvider;
    use crate::providers::google::GoogleProvider;
    use crate::providers::ollama::OllamaProvider;
    use crate::providers::openai::OpenAIProvider;
    use crate::providers::openrouter::OpenRouterProvider;
    use crate::registry::{ApiType, AuthType, ModelSource, ProviderDefinition, ProviderRegistry};
    use adl_kernel::{ConversationRole, ModelChatMessage, ModelPreferences};
    use std::sync::{Arc, RwLock};

    fn one_user_message() -> Vec<ModelChatMessage> {
        vec![ModelChatMessage { role: ConversationRole::User, content: "hi".to_string() }]
    }

    fn build_test_gateway() -> ModelGateway {
        let mut registry = ProviderRegistry::new();
        registry.register(
            ProviderDefinition {
                id: "anthropic".into(),
                name: "Anthropic".into(),
                description: "".into(),
                api_type: ApiType::AnthropicNative,
                default_base_url: None,
                auth_type: AuthType::ApiKey,
                models: ModelSource::Static(vec![]),
                built_in: true,
                default_model: None,
            },
            Box::new(AnthropicProvider::new()),
        );
        registry.register(
            ProviderDefinition {
                id: "openai".into(),
                name: "OpenAI".into(),
                description: "".into(),
                api_type: ApiType::OpenAICompatible,
                default_base_url: None,
                auth_type: AuthType::ApiKey,
                models: ModelSource::Static(vec![]),
                built_in: true,
                default_model: None,
            },
            Box::new(OpenAIProvider::new()),
        );
        registry.register(
            ProviderDefinition {
                id: "ollama".into(),
                name: "Ollama".into(),
                description: "".into(),
                api_type: ApiType::Ollama,
                default_base_url: None,
                auth_type: AuthType::None,
                models: ModelSource::Static(vec![]),
                built_in: true,
                default_model: None,
            },
            Box::new(OllamaProvider::new()),
        );
        registry.register(
            ProviderDefinition {
                id: "google".into(),
                name: "Google".into(),
                description: "".into(),
                api_type: ApiType::GoogleNative,
                default_base_url: None,
                auth_type: AuthType::ApiKey,
                models: ModelSource::Static(vec![]),
                built_in: true,
                default_model: None,
            },
            Box::new(GoogleProvider::new()),
        );
        registry.register(
            ProviderDefinition {
                id: "openrouter".into(),
                name: "OpenRouter".into(),
                description: "".into(),
                api_type: ApiType::OpenAICompatible,
                default_base_url: None,
                auth_type: AuthType::ApiKey,
                models: ModelSource::Static(vec![]),
                built_in: true,
                default_model: None,
            },
            Box::new(OpenRouterProvider::new()),
        );
        ModelGateway::new(ModelPreferences::default(), Arc::new(RwLock::new(registry))).unwrap()
    }

    // Validates routing: Anthropic must NOT return "not yet implemented".
    #[tokio::test]
    async fn call_provider_routes_to_anthropic_adapter() {
        let gateway = build_test_gateway();
        let messages = one_user_message();
        let result = dispatch_to_provider(
            &gateway,
            "anthropic",
            "claude-3-5-sonnet-20241022",
            &messages,
            "fake-key",
        )
        .await;
        let err_str = result.map(|_| String::new()).unwrap_or_else(|e| e.to_string());
        assert!(
            !err_str.contains("not yet implemented"),
            "Anthropic should be routed to adapter, got: {err_str}"
        );
    }

    // Validates routing: OpenAI must NOT return "not yet implemented".
    #[tokio::test]
    async fn call_provider_routes_to_openai_adapter() {
        let gateway = build_test_gateway();
        let messages = one_user_message();
        let result =
            dispatch_to_provider(&gateway, "openai", "gpt-4o", &messages, "fake-key").await;
        let err_str = result.map(|_| String::new()).unwrap_or_else(|e| e.to_string());
        assert!(
            !err_str.contains("not yet implemented"),
            "OpenAI should be routed to adapter, got: {err_str}"
        );
    }

    // Validates routing: Ollama must NOT return "not yet implemented".
    #[tokio::test]
    async fn call_provider_routes_to_ollama_adapter() {
        let gateway = build_test_gateway();
        let messages = one_user_message();
        let result = dispatch_to_provider(&gateway, "ollama", "llama3", &messages, "").await;
        let err_str = result.map(|_| String::new()).unwrap_or_else(|e| e.to_string());
        assert!(
            !err_str.contains("not yet implemented"),
            "Ollama should be routed to adapter, got: {err_str}"
        );
    }

    // Validates routing: Google must NOT return "not yet implemented".
    #[tokio::test]
    async fn call_provider_routes_to_google_adapter() {
        let gateway = build_test_gateway();
        let messages = one_user_message();
        let result =
            dispatch_to_provider(&gateway, "google", "gemini-1.5-pro", &messages, "fake-key").await;
        let err_str = result.map(|_| String::new()).unwrap_or_else(|e| e.to_string());
        assert!(
            !err_str.contains("not yet implemented"),
            "Google should be routed to adapter, got: {err_str}"
        );
    }

    // Validates routing: OpenRouter must NOT return "not yet implemented".
    #[tokio::test]
    async fn call_provider_routes_to_openrouter_adapter() {
        let gateway = build_test_gateway();
        let messages = one_user_message();
        let result =
            dispatch_to_provider(&gateway, "openrouter", "openrouter/auto", &messages, "fake-key")
                .await;
        let err_str = result.map(|_| String::new()).unwrap_or_else(|e| e.to_string());
        assert!(
            !err_str.contains("not yet implemented"),
            "OpenRouter should be routed to adapter, got: {err_str}"
        );
    }
}
