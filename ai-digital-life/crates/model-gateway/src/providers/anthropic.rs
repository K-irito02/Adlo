use crate::adapter::{ChatOptions, ProviderAdapter, StreamReader};
use crate::http_helper::{HttpRequestBuilder, send_chat_request, send_stream_request};
use crate::providers::base::{build_request_body, parse_sse_stream, SseEvent};
use adl_errors::AppError;
use adl_types::ConversationRole;
use adl_types::config::{ModelCapability, ModelDefinition, ModelTier};
use adl_types::model::{ModelChatMessage, ModelResponse, ModelTokenUsage};
use async_trait::async_trait;
use reqwest::Client;

pub const DEFAULT_BASE_URL: &str = "https://api.anthropic.com/v1";

pub struct AnthropicProvider {
    pub client: Client,
    pub base_url: String,
}

impl AnthropicProvider {
    pub fn new() -> Self {
        Self { client: Client::new(), base_url: DEFAULT_BASE_URL.to_string() }
    }

    pub fn with_client(client: Client) -> Self {
        Self { client, base_url: DEFAULT_BASE_URL.to_string() }
    }

    pub fn with_base_url(base_url: String) -> Self {
        Self { client: Client::new(), base_url }
    }

    pub fn with_client_and_base_url(client: Client, base_url: String) -> Self {
        Self { client, base_url }
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
    fn provider_id(&self) -> &'static str {
        "anthropic"
    }
    fn supported_models(&self) -> Vec<ModelDefinition> {
        vec![
            ModelDefinition {
                id: "claude-3-5-sonnet-20241022".into(),
                provider_id: "anthropic".into(),
                name: "Claude 3.5 Sonnet".into(),
                capabilities: vec![
                    ModelCapability::Text,
                    ModelCapability::Vision,
                    ModelCapability::ToolUse,
                    ModelCapability::Streaming,
                ],
                tier: Some(ModelTier::Premium),
                context_window: Some(200000),
                ..Default::default()
            },
            ModelDefinition {
                id: "claude-3-5-haiku-20241022".into(),
                provider_id: "anthropic".into(),
                name: "Claude 3.5 Haiku".into(),
                capabilities: vec![
                    ModelCapability::Text,
                    ModelCapability::Vision,
                    ModelCapability::ToolUse,
                    ModelCapability::Streaming,
                ],
                tier: Some(ModelTier::Standard),
                context_window: Some(200000),
                ..Default::default()
            },
            ModelDefinition {
                id: "claude-3-opus-20240229".into(),
                provider_id: "anthropic".into(),
                name: "Claude 3 Opus".into(),
                capabilities: vec![
                    ModelCapability::Text,
                    ModelCapability::Vision,
                    ModelCapability::ToolUse,
                ],
                tier: Some(ModelTier::Premium),
                context_window: Some(200000),
                ..Default::default()
            },
        ]
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
        let builder = HttpRequestBuilder::new(self.client.clone(), url)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("Content-Type", "application/json")
            .json(body);
        let json = send_chat_request(&builder, "Anthropic").await?;

        let content = json["content"][0]["text"].as_str().unwrap_or("").to_string();

        let prompt_tokens = json["usage"]["input_tokens"].as_u64().map(|v| v as u32);
        let completion_tokens = json["usage"]["output_tokens"].as_u64().map(|v| v as u32);
        let total_tokens = match (prompt_tokens, completion_tokens) {
            (Some(p), Some(c)) => Some(p + c),
            _ => None,
        };

        Ok(ModelResponse {
            provider_id: "anthropic".to_string(),
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
        model: &str,
        messages: &[ModelChatMessage],
        _options: &ChatOptions,
        api_key: &str,
    ) -> Result<StreamReader, AppError> {
        let mut system_text = None;
        let chat_messages: Vec<ModelChatMessage> = messages
            .iter()
            .filter_map(|m| {
                if m.role == ConversationRole::System {
                    system_text = Some(m.content.clone());
                    None
                } else {
                    Some(ModelChatMessage {
                        role: match m.role {
                            ConversationRole::Tool => ConversationRole::User,
                            _ => m.role,
                        },
                        content: m.content.clone(),
                    })
                }
            })
            .collect();

        let mut body = build_request_body(
            model,
            &chat_messages,
            true,
            Some(serde_json::json!({"max_tokens": 4096})),
        );
        if let Some(sys) = system_text {
            body["system"] = serde_json::Value::String(sys);
        }

        let url = format!("{}/messages", self.base_url);
        let builder = HttpRequestBuilder::new(self.client.clone(), url)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .json(body);
        let response = send_stream_request(&builder, "Anthropic").await?;

        parse_sse_stream(response, |json| {
            match json["type"].as_str() {
                Some("content_block_delta") => json["delta"]["text"]
                    .as_str()
                    .map(|s| SseEvent::Delta(s.to_string()))
                    .unwrap_or(SseEvent::Skip),
                Some("message_stop") => SseEvent::Done,
                _ => SseEvent::Skip,
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_metadata() {
        let p = AnthropicProvider::new();
        assert_eq!(p.provider_name(), "anthropic");
        assert_eq!(p.provider_id(), "anthropic");
        assert!(p.supported_models().iter().any(|m| m.id == "claude-3-5-sonnet-20241022"));
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

    #[tokio::test]
    async fn anthropic_chat_stream_routes_correctly() {
        let provider = AnthropicProvider::new();
        let messages =
            vec![ModelChatMessage { role: ConversationRole::User, content: "hi".to_string() }];
        let result = provider
            .chat_stream(
                "claude-3-5-sonnet-20241022",
                &messages,
                &ChatOptions::default(),
                "fake-key",
            )
            .await;
        let is_stub = match &result {
            Err(e) => e.to_string().contains("not yet implemented"),
            Ok(_) => false,
        };
        assert!(!is_stub, "chat_stream should not return 'not yet implemented'");
    }
}
