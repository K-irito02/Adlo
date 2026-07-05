use crate::adapter::{ChatOptions, ProviderAdapter, StreamReader};
use adl_errors::AppError;
use adl_kernel::types::config::ModelProviderId;
use adl_kernel::types::model::{ModelChatMessage, ModelResponse, ModelTokenUsage};
use adl_kernel::ConversationRole;
use async_trait::async_trait;
use reqwest::Client;

pub struct OllamaProvider {
    pub client: Client,
    pub base_url: String,
}

impl OllamaProvider {
    pub fn new() -> Self {
        Self { client: Client::new(), base_url: "http://localhost:11434".to_string() }
    }

    pub fn with_base_url(base_url: String) -> Self {
        Self { client: Client::new(), base_url }
    }
}

impl Default for OllamaProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ProviderAdapter for OllamaProvider {
    fn provider_name(&self) -> &'static str {
        "ollama"
    }
    fn provider_id(&self) -> ModelProviderId {
        ModelProviderId::Ollama
    }
    fn supported_models(&self) -> &'static [&'static str] {
        &["llama3.1", "qwen2.5", "deepseek-r1"]
    }

    async fn chat(
        &self,
        model: &str,
        messages: &[ModelChatMessage],
        _options: &ChatOptions,
        _api_key: &str,
    ) -> Result<ModelResponse, AppError> {
        let messages_arr: Vec<serde_json::Value> = messages
            .iter()
            .map(|m| {
                let role = match m.role {
                    ConversationRole::System => "system",
                    ConversationRole::User => "user",
                    ConversationRole::Assistant => "assistant",
                    ConversationRole::Tool => "tool",
                };
                serde_json::json!({
                    "role": role,
                    "content": m.content,
                })
            })
            .collect();

        let body = serde_json::json!({
            "model": model,
            "messages": messages_arr,
            "stream": false,
        });

        let url = format!("{}/api/chat", self.base_url);
        let resp = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("Ollama request failed: {}", e)))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::Internal(format!("Ollama error {}: {}", status, text)));
        }

        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("Ollama parse failed: {}", e)))?;

        let content = json["message"]["content"].as_str().unwrap_or("").to_string();

        let prompt_tokens = json["prompt_eval_count"].as_u64().map(|v| v as u32);
        let completion_tokens = json["eval_count"].as_u64().map(|v| v as u32);
        let total_tokens = match (prompt_tokens, completion_tokens) {
            (Some(p), Some(c)) => Some(p + c),
            _ => None,
        };

        Ok(ModelResponse {
            provider_id: ModelProviderId::Ollama,
            model_id: model.to_string(),
            content,
            synthetic: false,
            request_id: None,
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
        let p = OllamaProvider::new();
        assert_eq!(p.provider_name(), "ollama");
        assert_eq!(p.provider_id(), ModelProviderId::Ollama);
        assert!(p.supported_models().contains(&"llama3.1"));
    }

    #[test]
    fn custom_base_url_for_compatible_apis() {
        let p = OllamaProvider::with_base_url("http://custom.ollama:11434".to_string());
        assert_eq!(p.base_url, "http://custom.ollama:11434");
    }

    #[test]
    fn default_uses_local_endpoint() {
        let p = OllamaProvider::new();
        assert_eq!(p.base_url, "http://localhost:11434");
    }
}
