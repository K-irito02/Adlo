use crate::adapter::{ChatOptions, ProviderAdapter, StreamChunk, StreamReader};
use adl_errors::AppError;
use adl_kernel::types::config::{ModelCapability, ModelDefinition, ModelTier};
use adl_kernel::types::model::{ModelChatMessage, ModelResponse, ModelTokenUsage};
use adl_kernel::ConversationRole;
use async_trait::async_trait;
use reqwest::Client;

pub struct OpenRouterProvider {
    pub client: Client,
    pub base_url: String,
}

impl OpenRouterProvider {
    pub fn new() -> Self {
        Self { client: Client::new(), base_url: "https://openrouter.ai/api/v1".to_string() }
    }

    pub fn with_base_url(base_url: String) -> Self {
        Self { client: Client::new(), base_url }
    }
}

impl Default for OpenRouterProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ProviderAdapter for OpenRouterProvider {
    fn provider_name(&self) -> &'static str {
        "openrouter"
    }
    fn provider_id(&self) -> &'static str {
        "openrouter"
    }
    fn supported_models(&self) -> Vec<ModelDefinition> {
        vec![
            ModelDefinition {
                id: "openrouter/auto".into(),
                provider_id: "openrouter".into(),
                name: "OpenRouter Auto".into(),
                capabilities: vec![ModelCapability::Text, ModelCapability::Streaming],
                tier: Some(ModelTier::Standard),
                ..Default::default()
            },
            ModelDefinition {
                id: "anthropic/claude-3.5-sonnet".into(),
                provider_id: "openrouter".into(),
                name: "Claude 3.5 Sonnet".into(),
                capabilities: vec![
                    ModelCapability::Text,
                    ModelCapability::Vision,
                    ModelCapability::ToolUse,
                    ModelCapability::Streaming,
                ],
                tier: Some(ModelTier::Premium),
                ..Default::default()
            },
            ModelDefinition {
                id: "openai/gpt-4o".into(),
                provider_id: "openrouter".into(),
                name: "GPT-4o".into(),
                capabilities: vec![
                    ModelCapability::Text,
                    ModelCapability::Vision,
                    ModelCapability::ToolUse,
                    ModelCapability::Streaming,
                ],
                tier: Some(ModelTier::Premium),
                ..Default::default()
            },
        ]
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
            .header("HTTP-Referer", "https://ai-digital-life.local")
            .header("X-Title", "AI Digital Life")
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("OpenRouter request failed: {}", e)))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::Internal(format!("OpenRouter error {}: {}", status, text)));
        }

        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("OpenRouter parse failed: {}", e)))?;

        let content = json["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string();

        Ok(ModelResponse {
            provider_id: "openrouter".to_string(),
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
        model: &str,
        messages: &[ModelChatMessage],
        _options: &ChatOptions,
        api_key: &str,
    ) -> Result<StreamReader, AppError> {
        use tokio_stream::StreamExt;

        let body = serde_json::json!({
            "model": model,
            "messages": messages.iter().map(|m| {
                serde_json::json!({
                    "role": match m.role {
                        ConversationRole::System => "system",
                        ConversationRole::User => "user",
                        ConversationRole::Assistant => "assistant",
                        ConversationRole::Tool => "tool",
                    },
                    "content": m.content,
                })
            }).collect::<Vec<_>>(),
            "stream": true,
        });

        let response = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .bearer_auth(api_key)
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Model(e.to_string()))?;

        let stream = response.bytes_stream().map(|chunk| {
            let chunk = chunk.map_err(|e| AppError::Model(e.to_string()))?;
            let text = String::from_utf8_lossy(&chunk).to_string();
            for line in text.lines() {
                if let Some(data) = line.strip_prefix("data: ") {
                    if data == "[DONE]" {
                        return Ok(StreamChunk::Done(ModelTokenUsage {
                            prompt_tokens: None,
                            completion_tokens: None,
                            total_tokens: None,
                            estimated: None,
                        }));
                    }
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                        if let Some(delta) = json["choices"][0]["delta"]["content"].as_str() {
                            return Ok(StreamChunk::Delta(delta.to_string()));
                        }
                    }
                }
            }
            Ok(StreamChunk::Delta(String::new()))
        });

        Ok(Box::pin(stream))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_metadata() {
        let p = OpenRouterProvider::new();
        assert_eq!(p.provider_name(), "openrouter");
        assert_eq!(p.provider_id(), "openrouter");
        assert!(p.supported_models().iter().any(|m| m.id == "openrouter/auto"));
    }

    #[test]
    fn custom_base_url_for_compatible_apis() {
        let p = OpenRouterProvider::with_base_url("https://custom.openrouter.proxy".to_string());
        assert_eq!(p.base_url, "https://custom.openrouter.proxy");
    }

    #[test]
    fn default_uses_official_endpoint() {
        let p = OpenRouterProvider::new();
        assert_eq!(p.base_url, "https://openrouter.ai/api/v1");
    }

    #[tokio::test]
    async fn openrouter_chat_stream_routes_correctly() {
        let provider = OpenRouterProvider::new();
        let messages =
            vec![ModelChatMessage { role: ConversationRole::User, content: "hi".to_string() }];
        let result = provider
            .chat_stream("openrouter/auto", &messages, &ChatOptions::default(), "fake-key")
            .await;
        let is_stub = match &result {
            Err(e) => e.to_string().contains("not yet implemented"),
            Ok(_) => false,
        };
        assert!(!is_stub, "chat_stream should not return 'not yet implemented'");
    }
}
