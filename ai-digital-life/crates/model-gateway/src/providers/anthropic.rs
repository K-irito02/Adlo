use crate::adapter::{ChatOptions, ProviderAdapter, StreamReader};
use adl_errors::AppError;
use adl_kernel::types::config::ModelProviderId;
use adl_kernel::types::model::{ModelChatMessage, ModelResponse, ModelTokenUsage};
use adl_kernel::ConversationRole;
use async_trait::async_trait;
use reqwest::Client;

pub struct AnthropicProvider {
    pub client: Client,
    pub base_url: String,
}

impl AnthropicProvider {
    pub fn new() -> Self {
        Self { client: Client::new(), base_url: "https://api.anthropic.com/v1".to_string() }
    }

    pub fn with_base_url(base_url: String) -> Self {
        Self { client: Client::new(), base_url }
    }
}

impl Default for AnthropicProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ProviderAdapter for AnthropicProvider {
    fn provider_name(&self) -> &'static str {
        "anthropic"
    }
    fn provider_id(&self) -> ModelProviderId {
        ModelProviderId::Anthropic
    }
    fn supported_models(&self) -> &'static [&'static str] {
        &["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"]
    }

    async fn chat(
        &self,
        model: &str,
        messages: &[ModelChatMessage],
        _options: &ChatOptions,
        api_key: &str,
    ) -> Result<ModelResponse, AppError> {
        let mut system_text: Option<String> = None;
        let messages_arr: Vec<serde_json::Value> = messages
            .iter()
            .filter_map(|m| match m.role {
                ConversationRole::System => {
                    system_text = Some(m.content.clone());
                    None
                },
                ConversationRole::User => Some(serde_json::json!({
                    "role": "user",
                    "content": m.content,
                })),
                ConversationRole::Assistant => Some(serde_json::json!({
                    "role": "assistant",
                    "content": m.content,
                })),
                ConversationRole::Tool => Some(serde_json::json!({
                    "role": "user",
                    "content": m.content,
                })),
            })
            .collect();

        let mut body = serde_json::json!({
            "model": model,
            "max_tokens": 4096,
            "messages": messages_arr,
        });
        if let Some(sys) = system_text {
            body["system"] = serde_json::Value::String(sys);
        }

        let url = format!("{}/messages", self.base_url);
        let resp = self
            .client
            .post(&url)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("Anthropic request failed: {}", e)))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::Internal(format!("Anthropic error {}: {}", status, text)));
        }

        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("Anthropic parse failed: {}", e)))?;

        let content = json["content"][0]["text"].as_str().unwrap_or("").to_string();

        let prompt_tokens = json["usage"]["input_tokens"].as_u64().map(|v| v as u32);
        let completion_tokens = json["usage"]["output_tokens"].as_u64().map(|v| v as u32);
        let total_tokens = match (prompt_tokens, completion_tokens) {
            (Some(p), Some(c)) => Some(p + c),
            _ => None,
        };

        Ok(ModelResponse {
            provider_id: ModelProviderId::Anthropic,
            model_id: model.to_string(),
            content,
            synthetic: false,
            request_id: json["id"].as_str().map(String::from),
            usage: Some(ModelTokenUsage {
                prompt_tokens,
                completion_tokens,
                total_tokens,
                estimated: Some(false),
            }),
            route: None,
        })
    }

    async fn chat_stream(
        &self,
        _model: &str,
        _messages: &[ModelChatMessage],
        _options: &ChatOptions,
        _api_key: &str,
    ) -> Result<StreamReader, AppError> {
        Err(AppError::Internal("Streaming not yet implemented".to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_metadata() {
        let p = AnthropicProvider::new();
        assert_eq!(p.provider_name(), "anthropic");
        assert_eq!(p.provider_id(), ModelProviderId::Anthropic);
        assert!(p.supported_models().contains(&"claude-3-5-sonnet-20241022"));
    }

    #[test]
    fn custom_base_url_for_compatible_apis() {
        let p = AnthropicProvider::with_base_url("https://custom.anthropic.proxy".to_string());
        assert_eq!(p.base_url, "https://custom.anthropic.proxy");
    }

    #[test]
    fn default_uses_official_endpoint() {
        let p = AnthropicProvider::new();
        assert_eq!(p.base_url, "https://api.anthropic.com/v1");
    }
}
