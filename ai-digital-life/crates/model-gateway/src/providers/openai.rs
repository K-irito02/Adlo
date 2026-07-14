use crate::adapter::{ChatOptions, ProviderAdapter, StreamChunk, StreamReader};
use crate::http_helper::{send_chat_request, send_stream_request, HttpRequestBuilder};
use adl_errors::AppError;
use adl_types::config::{ModelCapability, ModelDefinition, ModelTier};
use adl_types::model::{ModelChatMessage, ModelResponse, ModelTokenUsage};
use adl_types::ConversationRole;
use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;

#[derive(Deserialize)]
struct OpenAIModelItem {
    id: String,
}

#[derive(Deserialize)]
struct OpenAIModelsResponse {
    data: Vec<OpenAIModelItem>,
}

pub struct OpenAIProvider {
    pub client: Client,
    pub base_url: String,
}

impl OpenAIProvider {
    pub fn new() -> Self {
        Self { client: Client::new(), base_url: "https://api.openai.com/v1".to_string() }
    }

    pub fn with_client(client: Client) -> Self {
        Self { client, base_url: "https://api.openai.com/v1".to_string() }
    }

    pub fn with_base_url(base_url: String) -> Self {
        Self { client: Client::new(), base_url }
    }

    pub fn with_client_and_base_url(client: Client, base_url: String) -> Self {
        Self { client, base_url }
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
    fn provider_id(&self) -> &'static str {
        "openai"
    }
    fn supports_dynamic_models(&self) -> bool {
        true
    }

    async fn fetch_models(
        &self,
        api_key: &str,
        base_url: &str,
    ) -> Result<Vec<ModelDefinition>, AppError> {
        let url = format!("{}/models", base_url.trim_end_matches('/'));
        let resp = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", api_key))
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("fetch models request failed: {e}")))?;
        if !resp.status().is_success() {
            return Err(AppError::Internal(format!("fetch models returned {}", resp.status())));
        }
        let body: OpenAIModelsResponse = resp
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("fetch models parse failed: {e}")))?;
        Ok(body
            .data
            .into_iter()
            .map(|m| ModelDefinition {
                id: m.id.clone(),
                provider_id: "openai".to_string(),
                name: m.id,
                capabilities: vec![ModelCapability::Text],
                ..Default::default()
            })
            .collect())
    }

    async fn test_connection(&self, api_key: &str, base_url: &str) -> Result<(), AppError> {
        let url = format!("{}/models", base_url.trim_end_matches('/'));
        let resp = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", api_key))
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("connection test failed: {e}")))?;
        if resp.status().is_success() {
            Ok(())
        } else {
            Err(AppError::Internal(format!("connection test returned {}", resp.status())))
        }
    }

    fn supported_models(&self) -> Vec<ModelDefinition> {
        vec![
            ModelDefinition {
                id: "gpt-4o".into(),
                provider_id: "openai".into(),
                name: "GPT-4o".into(),
                capabilities: vec![
                    ModelCapability::Text,
                    ModelCapability::Vision,
                    ModelCapability::ToolUse,
                    ModelCapability::Streaming,
                ],
                tier: Some(ModelTier::Premium),
                context_window: Some(128000),
                ..Default::default()
            },
            ModelDefinition {
                id: "gpt-4o-mini".into(),
                provider_id: "openai".into(),
                name: "GPT-4o Mini".into(),
                capabilities: vec![
                    ModelCapability::Text,
                    ModelCapability::ToolUse,
                    ModelCapability::Streaming,
                ],
                tier: Some(ModelTier::Standard),
                context_window: Some(128000),
                ..Default::default()
            },
            ModelDefinition {
                id: "gpt-4-turbo".into(),
                provider_id: "openai".into(),
                name: "GPT-4 Turbo".into(),
                capabilities: vec![
                    ModelCapability::Text,
                    ModelCapability::Vision,
                    ModelCapability::ToolUse,
                    ModelCapability::Streaming,
                ],
                tier: Some(ModelTier::Premium),
                context_window: Some(128000),
                ..Default::default()
            },
            ModelDefinition {
                id: "gpt-3.5-turbo".into(),
                provider_id: "openai".into(),
                name: "GPT-3.5 Turbo".into(),
                capabilities: vec![
                    ModelCapability::Text,
                    ModelCapability::ToolUse,
                    ModelCapability::Streaming,
                ],
                tier: Some(ModelTier::Standard),
                context_window: Some(16384),
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
        let builder = HttpRequestBuilder::new(self.client.clone(), url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(body);
        let json = send_chat_request(&builder, "OpenAI").await?;

        let content = json["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string();

        Ok(ModelResponse {
            provider_id: "openai".to_string(),
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

        let url = format!("{}/chat/completions", self.base_url);
        let builder = HttpRequestBuilder::new(self.client.clone(), url)
            .header("Authorization", format!("Bearer {}", api_key))
            .json(body);
        let response = send_stream_request(&builder, "OpenAI").await?;

        let stream = response.bytes_stream().map(move |chunk| {
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
        let p = OpenAIProvider::new();
        assert_eq!(p.provider_name(), "openai");
        assert_eq!(p.provider_id(), "openai");
        assert!(p.supported_models().iter().any(|m| m.id == "gpt-4o"));
    }

    #[test]
    fn test_supported_models_returns_typed_definitions() {
        let p = OpenAIProvider::new();
        let models = p.supported_models();
        assert!(!models.is_empty());
        let gpt4o = models.iter().find(|m| m.id == "gpt-4o");
        assert!(gpt4o.is_some());
        assert_eq!(gpt4o.unwrap().provider_id, "openai");
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

    #[tokio::test]
    async fn chat_stream_returns_stream_reader() {
        let provider = OpenAIProvider::new();
        let messages =
            vec![ModelChatMessage { role: ConversationRole::User, content: "hi".to_string() }];
        let result =
            provider.chat_stream("gpt-4o", &messages, &ChatOptions::default(), "fake-key").await;
        let err = match result {
            Err(e) => e.to_string(),
            Ok(_) => panic!("expected Err"),
        };
        assert!(!err.contains("not yet implemented"));
    }
}
