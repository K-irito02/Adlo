//! Provider API call — builds and sends chat completion requests to
//! external model APIs (DeepSeek, MiniMax, Anthropic, OpenAI, Google,
//! Ollama, OpenRouter).
//!
//! [`call_provider`] handles credential retrieval and delegates to
//! [`dispatch_to_provider`], which routes to either the OpenAI-compatible
//! direct path (DeepSeek/MiniMax) or the appropriate `ProviderAdapter`
//! implementation.

use adl_errors::AppError;
use adl_kernel::{ModelChatMessage, ModelResponse, ModelTokenUsage};

use crate::adapter::{ChatOptions, ProviderAdapter};
use crate::providers::anthropic::AnthropicProvider;
use crate::providers::google::GoogleProvider;
use crate::providers::ollama::OllamaProvider;
use crate::providers::openai::OpenAIProvider;
use crate::providers::openrouter::OpenRouterProvider;
use crate::secret::get_provider_secret;
use crate::wire::{ChatCompletionRequest, ChatCompletionResponse, WireMessage};
use crate::ModelGateway;

const DEEPSEEK_BASE_URL: &str = "https://api.deepseek.com";
const MINIMAX_BASE_URL: &str = "https://api.minimax.io";

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

/// Route a chat request to the appropriate provider adapter or direct path.
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
    match provider {
        "deepseek" => {
            call_deepseek_direct(gateway, api_key, model_id, messages).await
        },
        "minimax" => call_minimax_direct(gateway, api_key, model_id, messages).await,
        "anthropic" => {
            AnthropicProvider::new().chat(model_id, messages, &options, api_key).await
        },
        "openai" => {
            OpenAIProvider::new().chat(model_id, messages, &options, api_key).await
        },
        "google" => {
            GoogleProvider::new().chat(model_id, messages, &options, api_key).await
        },
        "ollama" => {
            OllamaProvider::new().chat(model_id, messages, &options, "").await
        },
        "openrouter" => {
            OpenRouterProvider::new().chat(model_id, messages, &options, api_key).await
        },
        _ => Err(AppError::Internal(format!("unknown provider: {provider}"))),
    }
}

/// DeepSeek direct call (preserves the existing stable implementation).
async fn call_deepseek_direct(
    gateway: &ModelGateway,
    api_key: &str,
    model_id: &str,
    messages: &[ModelChatMessage],
) -> Result<ModelResponse, AppError> {
    let url = format!("{DEEPSEEK_BASE_URL}/chat/completions");
    call_openai_compatible(gateway, url, api_key, model_id, messages, "deepseek")
        .await
}

/// MiniMax direct call (preserves the existing stable implementation).
async fn call_minimax_direct(
    gateway: &ModelGateway,
    api_key: &str,
    model_id: &str,
    messages: &[ModelChatMessage],
) -> Result<ModelResponse, AppError> {
    let url = format!("{MINIMAX_BASE_URL}/v1/chat/completions");
    call_openai_compatible(gateway, url, api_key, model_id, messages, "minimax")
        .await
}

/// OpenAI-compatible protocol call (shared by DeepSeek and MiniMax).
async fn call_openai_compatible(
    gateway: &ModelGateway,
    url: String,
    api_key: &str,
    model_id: &str,
    messages: &[ModelChatMessage],
    provider: &str,
) -> Result<ModelResponse, AppError> {
    let request = ChatCompletionRequest {
        model: model_id.to_string(),
        messages: messages
            .iter()
            .map(|message| WireMessage {
                role: match message.role {
                    adl_kernel::ConversationRole::System => "system",
                    adl_kernel::ConversationRole::User => "user",
                    adl_kernel::ConversationRole::Assistant => "assistant",
                    adl_kernel::ConversationRole::Tool => "tool",
                }
                .into(),
                content: message.content.clone(),
            })
            .collect(),
        stream: false,
    };
    let response = gateway
        .client
        .post(url)
        .bearer_auth(api_key)
        .json(&request)
        .send()
        .await
        .map_err(|e| AppError::Model(e.to_string()))?;
    if !response.status().is_success() {
        return Err(AppError::Model(format!(
            "provider {provider} returned HTTP {}",
            response.status()
        )));
    }
    let body: ChatCompletionResponse =
        response.json().await.map_err(|e| AppError::Model(e.to_string()))?;
    let content =
        body.choices.first().map(|choice| choice.message.content.clone()).ok_or_else(|| {
            AppError::Model(format!("API returned empty choices array (model={model_id})"))
        })?;
    Ok(ModelResponse {
        provider_id: provider.to_string(),
        model_id: body.model.unwrap_or_else(|| model_id.into()),
        content,
        synthetic: false,
        request_id: body.id,
        usage: body.usage.map(|usage| ModelTokenUsage {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
            estimated: Some(false),
        }),
        route: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use adl_kernel::{ConversationRole, ModelChatMessage, ModelPreferences};

    fn one_user_message() -> Vec<ModelChatMessage> {
        vec![ModelChatMessage { role: ConversationRole::User, content: "hi".to_string() }]
    }

    // Validates routing: Anthropic must NOT return "not yet implemented".
    // Calls dispatch_to_provider directly with a fake api_key to bypass
    // keyring availability issues in the test environment.
    #[tokio::test]
    async fn call_provider_routes_to_anthropic_adapter() {
        let gateway = ModelGateway::new(ModelPreferences::default()).unwrap();
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
        let gateway = ModelGateway::new(ModelPreferences::default()).unwrap();
        let messages = one_user_message();
        let result = dispatch_to_provider(
            &gateway,
            "openai",
            "gpt-4o",
            &messages,
            "fake-key",
        )
        .await;
        let err_str = result.map(|_| String::new()).unwrap_or_else(|e| e.to_string());
        assert!(
            !err_str.contains("not yet implemented"),
            "OpenAI should be routed to adapter, got: {err_str}"
        );
    }

    // Validates routing: Ollama must NOT return "not yet implemented".
    // Ollama needs no api_key; an empty string is passed.
    #[tokio::test]
    async fn call_provider_routes_to_ollama_adapter() {
        let gateway = ModelGateway::new(ModelPreferences::default()).unwrap();
        let messages = one_user_message();
        let result =
            dispatch_to_provider(&gateway, "ollama", "llama3", &messages, "").await;
        let err_str = result.map(|_| String::new()).unwrap_or_else(|e| e.to_string());
        assert!(
            !err_str.contains("not yet implemented"),
            "Ollama should be routed to adapter, got: {err_str}"
        );
    }

    // Validates routing: Google must NOT return "not yet implemented".
    #[tokio::test]
    async fn call_provider_routes_to_google_adapter() {
        let gateway = ModelGateway::new(ModelPreferences::default()).unwrap();
        let messages = one_user_message();
        let result = dispatch_to_provider(
            &gateway,
            "google",
            "gemini-1.5-pro",
            &messages,
            "fake-key",
        )
        .await;
        let err_str = result.map(|_| String::new()).unwrap_or_else(|e| e.to_string());
        assert!(
            !err_str.contains("not yet implemented"),
            "Google should be routed to adapter, got: {err_str}"
        );
    }

    // Validates routing: OpenRouter must NOT return "not yet implemented".
    #[tokio::test]
    async fn call_provider_routes_to_openrouter_adapter() {
        let gateway = ModelGateway::new(ModelPreferences::default()).unwrap();
        let messages = one_user_message();
        let result = dispatch_to_provider(
            &gateway,
            "openrouter",
            "openrouter/auto",
            &messages,
            "fake-key",
        )
        .await;
        let err_str = result.map(|_| String::new()).unwrap_or_else(|e| e.to_string());
        assert!(
            !err_str.contains("not yet implemented"),
            "OpenRouter should be routed to adapter, got: {err_str}"
        );
    }
}
