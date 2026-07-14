use crate::adapter::{ChatOptions, ProviderAdapter, StreamChunk, StreamReader};
use crate::http_helper::{send_chat_request, send_stream_request, HttpRequestBuilder};
use adl_errors::AppError;
use adl_types::config::{ModelCapability, ModelDefinition, ModelTier};
use adl_types::model::{ModelChatMessage, ModelResponse, ModelTokenUsage};
use adl_types::ConversationRole;
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

    pub fn with_client(client: Client) -> Self {
        Self { client, base_url: "http://localhost:11434".to_string() }
    }

    pub fn with_base_url(base_url: String) -> Self {
        Self { client: Client::new(), base_url }
    }

    pub fn with_client_and_base_url(client: Client, base_url: String) -> Self {
        Self { client, base_url }
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
    fn provider_id(&self) -> &'static str {
        "ollama"
    }
    fn supported_models(&self) -> Vec<ModelDefinition> {
        vec![
            ModelDefinition {
                id: "llama3.1".into(),
                provider_id: "ollama".into(),
                name: "Llama 3.1".into(),
                capabilities: vec![ModelCapability::Text, ModelCapability::Streaming],
                tier: Some(ModelTier::Standard),
                context_window: Some(128000),
                ..Default::default()
            },
            ModelDefinition {
                id: "qwen2.5".into(),
                provider_id: "ollama".into(),
                name: "Qwen 2.5".into(),
                capabilities: vec![ModelCapability::Text, ModelCapability::Streaming],
                tier: Some(ModelTier::Standard),
                context_window: Some(128000),
                ..Default::default()
            },
            ModelDefinition {
                id: "deepseek-r1".into(),
                provider_id: "ollama".into(),
                name: "DeepSeek R1".into(),
                capabilities: vec![
                    ModelCapability::Text,
                    ModelCapability::Reasoning,
                    ModelCapability::Streaming,
                ],
                tier: Some(ModelTier::Standard),
                context_window: Some(128000),
                ..Default::default()
            },
        ]
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
        let builder = HttpRequestBuilder::new(self.client.clone(), url)
            .header("Content-Type", "application/json")
            .json(body);
        let json = send_chat_request(&builder, "Ollama").await?;

        let content = json["message"]["content"].as_str().unwrap_or("").to_string();

        let prompt_tokens = json["prompt_eval_count"].as_u64().map(|v| v as u32);
        let completion_tokens = json["eval_count"].as_u64().map(|v| v as u32);
        let total_tokens = match (prompt_tokens, completion_tokens) {
            (Some(p), Some(c)) => Some(p + c),
            _ => None,
        };

        Ok(ModelResponse {
            provider_id: "ollama".to_string(),
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
        model: &str,
        messages: &[ModelChatMessage],
        _options: &ChatOptions,
        _api_key: &str,
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
                        _ => "user",
                    },
                    "content": m.content,
                })
            }).collect::<Vec<_>>(),
            "stream": true,
        });

        let url = format!("{}/api/chat", self.base_url);
        let builder = HttpRequestBuilder::new(self.client.clone(), url).json(body);
        let response = send_stream_request(&builder, "Ollama").await?;

        let stream = response.bytes_stream().map(|chunk| {
            let chunk = chunk.map_err(|e| AppError::Model(e.to_string()))?;
            let text = String::from_utf8_lossy(&chunk).to_string();
            for line in text.lines() {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                    if json["done"].as_bool().unwrap_or(false) {
                        return Ok(StreamChunk::Done(ModelTokenUsage {
                            prompt_tokens: None,
                            completion_tokens: None,
                            total_tokens: None,
                            estimated: None,
                        }));
                    }
                    if let Some(content) = json["message"]["content"].as_str() {
                        return Ok(StreamChunk::Delta(content.to_string()));
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
        let p = OllamaProvider::new();
        assert_eq!(p.provider_name(), "ollama");
        assert_eq!(p.provider_id(), "ollama");
        assert!(p.supported_models().iter().any(|m| m.id == "llama3.1"));
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

    #[tokio::test]
    async fn ollama_chat_stream_routes_correctly() {
        let provider = OllamaProvider::new();
        let messages =
            vec![ModelChatMessage { role: ConversationRole::User, content: "hi".to_string() }];
        let result = provider.chat_stream("llama3.1", &messages, &ChatOptions::default(), "").await;
        let err_msg = result.as_ref().err().map(|e| e.to_string()).unwrap_or_default();
        assert!(!err_msg.contains("not yet implemented"), "Ollama streaming should not be stubbed");
    }
}
