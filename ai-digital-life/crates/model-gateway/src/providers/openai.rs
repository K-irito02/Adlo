use crate::adapter::{ChatOptions, ProviderAdapter, StreamReader};
use adl_errors::AppError;
use adl_kernel::types::config::ModelProviderId;
use adl_kernel::types::model::{ModelChatMessage, ModelResponse, ModelTokenUsage};
use adl_kernel::ConversationRole;
use async_trait::async_trait;
use reqwest::Client;

pub struct OpenAIProvider {
    pub client: Client,
    pub base_url: String,
}

impl OpenAIProvider {
    pub fn new() -> Self {
        Self { client: Client::new(), base_url: "https://api.openai.com/v1".to_string() }
    }

    pub fn with_base_url(base_url: String) -> Self {
        Self { client: Client::new(), base_url }
    }
}

impl Default for OpenAIProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ProviderAdapter for OpenAIProvider {
    fn provider_name(&self) -> &'static str {
        "openai"
    }
    fn provider_id(&self) -> ModelProviderId {
        ModelProviderId::Openai
    }
    fn supported_models(&self) -> &'static [&'static str] {
        &["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"]
    }

    async fn chat(
        &self,
        model: &str,
        messages: &[ModelChatMessage],
        options: &ChatOptions,
        api_key: &str,
    ) -> Result<ModelResponse, AppError> {
        let body = serde_json::json!({
            "model": model,
            "messages": messages.iter().map(|m| serde_json::json!({
                "role": match m.role {
                    ConversationRole::System => "system",
                    ConversationRole::User => "user",
                    ConversationRole::Assistant => "assistant",
                    ConversationRole::Tool => "tool",
                },
                "content": m.content,
            })).collect::<Vec<_>>(),
            "stream": false,
            "temperature": options.temperature,
            "top_p": options.top_p,
            "max_tokens": options.max_tokens,
        });

        let url = format!("{}/chat/completions", self.base_url);
        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("OpenAI request failed: {}", e)))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::Internal(format!("OpenAI error {}: {}", status, text)));
        }

        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("OpenAI parse failed: {}", e)))?;

        let content = json["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string();

        Ok(ModelResponse {
            provider_id: ModelProviderId::Openai,
            model_id: model.to_string(),
            content,
            synthetic: false,
            request_id: json["id"].as_str().map(String::from),
            usage: Some(ModelTokenUsage {
                prompt_tokens: json["usage"]["prompt_tokens"].as_u64().map(|v| v as u32),
                completion_tokens: json["usage"]["completion_tokens"].as_u64().map(|v| v as u32),
                total_tokens: json["usage"]["total_tokens"].as_u64().map(|v| v as u32),
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
        let p = OpenAIProvider::new();
        assert_eq!(p.provider_name(), "openai");
        assert_eq!(p.provider_id(), ModelProviderId::Openai);
        assert!(p.supported_models().contains(&"gpt-4o"));
    }

    #[test]
    fn custom_base_url_for_compatible_apis() {
        let p = OpenAIProvider::with_base_url("https://api.deepseek.com/v1".to_string());
        assert_eq!(p.base_url, "https://api.deepseek.com/v1");
    }

    #[test]
    fn default_uses_official_endpoint() {
        let p = OpenAIProvider::new();
        assert_eq!(p.base_url, "https://api.openai.com/v1");
    }
}
