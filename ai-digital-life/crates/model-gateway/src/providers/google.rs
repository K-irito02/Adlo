use crate::adapter::{ChatOptions, ProviderAdapter, StreamChunk, StreamReader};
use crate::http_helper::{HttpRequestBuilder, send_chat_request, send_stream_request};
use adl_errors::AppError;
use adl_types::ConversationRole;
use adl_types::config::{ModelCapability, ModelDefinition, ModelTier};
use adl_types::model::{ModelChatMessage, ModelResponse, ModelTokenUsage};
use async_trait::async_trait;
use reqwest::Client;

const DEFAULT_BASE_URL: &str = "https://generativelanguage.googleapis.com/v1beta";

pub struct GoogleProvider {
    pub client: Client,
    pub base_url: String,
}

impl GoogleProvider {
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

impl Default for GoogleProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ProviderAdapter for GoogleProvider {
    fn provider_name(&self) -> &'static str {
        "google"
    }
    fn provider_id(&self) -> &'static str {
        "google"
    }
    fn supported_models(&self) -> Vec<ModelDefinition> {
        vec![
            ModelDefinition {
                id: "gemini-1.5-pro".into(),
                provider_id: "google".into(),
                name: "Gemini 1.5 Pro".into(),
                capabilities: vec![
                    ModelCapability::Text,
                    ModelCapability::Vision,
                    ModelCapability::ToolUse,
                    ModelCapability::Streaming,
                ],
                tier: Some(ModelTier::Premium),
                context_window: Some(2097152),
                ..Default::default()
            },
            ModelDefinition {
                id: "gemini-1.5-flash".into(),
                provider_id: "google".into(),
                name: "Gemini 1.5 Flash".into(),
                capabilities: vec![
                    ModelCapability::Text,
                    ModelCapability::Vision,
                    ModelCapability::ToolUse,
                    ModelCapability::Streaming,
                ],
                tier: Some(ModelTier::Standard),
                context_window: Some(1048576),
                ..Default::default()
            },
            ModelDefinition {
                id: "gemini-2.0-flash".into(),
                provider_id: "google".into(),
                name: "Gemini 2.0 Flash".into(),
                capabilities: vec![
                    ModelCapability::Text,
                    ModelCapability::Vision,
                    ModelCapability::ToolUse,
                    ModelCapability::Streaming,
                ],
                tier: Some(ModelTier::Standard),
                context_window: Some(1048576),
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
        let contents: Vec<serde_json::Value> = messages
            .iter()
            .filter_map(|m| match m.role {
                ConversationRole::System => {
                    system_text = Some(m.content.clone());
                    None
                },
                ConversationRole::User => Some(serde_json::json!({
                    "role": "user",
                    "parts": [{ "text": m.content }],
                })),
                ConversationRole::Assistant => Some(serde_json::json!({
                    "role": "model",
                    "parts": [{ "text": m.content }],
                })),
                ConversationRole::Tool => Some(serde_json::json!({
                    "role": "user",
                    "parts": [{ "text": m.content }],
                })),
            })
            .collect();

        let mut body = serde_json::json!({
            "contents": contents,
        });
        if let Some(sys) = system_text {
            body["systemInstruction"] = serde_json::json!({ "parts": [{ "text": sys }] });
        }

        let url = format!("{}/models/{}:generateContent?key={}", self.base_url, model, api_key);
        let builder = HttpRequestBuilder::new(self.client.clone(), url)
            .header("Content-Type", "application/json")
            .json(body);
        let json = send_chat_request(&builder, "Google").await?;

        let content =
            json["candidates"][0]["content"]["parts"][0]["text"].as_str().unwrap_or("").to_string();

        let prompt_tokens = json["usageMetadata"]["promptTokenCount"].as_u64().map(|v| v as u32);
        let completion_tokens =
            json["usageMetadata"]["candidatesTokenCount"].as_u64().map(|v| v as u32);
        let total_tokens = json["usageMetadata"]["totalTokenCount"].as_u64().map(|v| v as u32);

        Ok(ModelResponse {
            provider_id: "google".to_string(),
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
        api_key: &str,
    ) -> Result<StreamReader, AppError> {
        use tokio_stream::StreamExt;

        let contents: Vec<serde_json::Value> = messages
            .iter()
            .filter_map(|m| {
                if m.role == ConversationRole::System {
                    return None;
                }
                Some(serde_json::json!({
                    "role": match m.role {
                        ConversationRole::User => "user",
                        ConversationRole::Assistant => "model",
                        _ => "user",
                    },
                    "parts": [{"text": m.content}],
                }))
            })
            .collect();

        let body = serde_json::json!({
            "contents": contents,
        });

        let url = format!(
            "{}/models/{}:streamGenerateContent?alt=sse&key={}",
            self.base_url, model, api_key
        );

        let builder = HttpRequestBuilder::new(self.client.clone(), url).json(body);
        let response = send_stream_request(&builder, "Google").await?;

        let stream = response.bytes_stream().map(|chunk| {
            let chunk = chunk.map_err(|e| AppError::Model(e.to_string()))?;
            let text = String::from_utf8_lossy(&chunk);
            for line in text.lines() {
                if let Some(data) = line.strip_prefix("data: ") {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                        if let Some(candidates) = json["candidates"].as_array() {
                            if let Some(text) =
                                candidates[0]["content"]["parts"][0]["text"].as_str()
                            {
                                return Ok(StreamChunk::Delta(text.to_string()));
                            }
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
        let p = GoogleProvider::new();
        assert_eq!(p.provider_name(), "google");
        assert_eq!(p.provider_id(), "google");
        assert!(p.supported_models().iter().any(|m| m.id == "gemini-1.5-pro"));
    }

    #[test]
    fn custom_base_url_for_compatible_apis() {
        let p = GoogleProvider::with_base_url("https://custom.google.proxy".to_string());
        assert_eq!(p.base_url, "https://custom.google.proxy");
    }

    #[test]
    fn default_uses_official_endpoint() {
        let p = GoogleProvider::new();
        assert_eq!(p.base_url, "https://generativelanguage.googleapis.com/v1beta");
    }

    #[tokio::test]
    async fn google_chat_stream_routes_correctly() {
        let provider = GoogleProvider::new();
        let messages =
            vec![ModelChatMessage { role: ConversationRole::User, content: "hi".to_string() }];
        let result = provider
            .chat_stream("gemini-1.5-pro", &messages, &ChatOptions::default(), "fake-key")
            .await;
        let err = match result {
            Err(e) => e.to_string(),
            Ok(_) => panic!("expected Err"),
        };
        assert!(!err.contains("not yet implemented"));
    }
}
