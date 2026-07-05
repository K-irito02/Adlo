//! Provider API call — builds and sends chat completion requests to
//! external model APIs (DeepSeek, MiniMax).
//!
//! [`call_provider`] handles the full request lifecycle: credential retrieval,
//! URL construction, HTTP request, deserialization, and response mapping.

use adl_errors::AppError;
use adl_kernel::{ModelChatMessage, ModelProviderId, ModelResponse, ModelTokenUsage};

use crate::secret::get_provider_secret;
use crate::wire::{ChatCompletionRequest, ChatCompletionResponse, WireMessage};
use crate::ModelGateway;

const DEEPSEEK_BASE_URL: &str = "https://api.deepseek.com";
const MINIMAX_BASE_URL: &str = "https://api.minimax.io";

pub(crate) async fn call_provider(
    gateway: &ModelGateway,
    provider: ModelProviderId,
    model_id: &str,
    messages: &[ModelChatMessage],
) -> Result<ModelResponse, AppError> {
    let api_key = tokio::task::spawn_blocking(move || get_provider_secret(provider))
        .await
        .map_err(|e| AppError::Security(e.to_string()))??;
    let url = match provider {
        ModelProviderId::Deepseek => format!("{DEEPSEEK_BASE_URL}/chat/completions"),
        ModelProviderId::Minimax => format!("{MINIMAX_BASE_URL}/v1/chat/completions"),
        _ => {
            return Err(AppError::Internal(format!(
                "provider {} not yet implemented",
                provider.as_str()
            )))
        },
    };
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
            "provider {provider:?} returned HTTP {}",
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
        provider_id: provider,
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
