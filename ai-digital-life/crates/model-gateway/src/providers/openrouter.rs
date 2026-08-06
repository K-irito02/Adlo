use crate::adapter::{ChatOptions, ProviderAdapter, StreamReader};
use crate::http_helper::{HttpRequestBuilder, send_chat_request, send_stream_request};
use crate::providers::base::{SseEvent, build_request_body, parse_sse_stream};
use adl_errors::AppError;
use adl_types::ConversationRole;
use adl_types::config::{ModelCapability, ModelDefinition, ModelTier};
use adl_types::model::{ModelChatMessage, ModelResponse, ModelTokenUsage};
use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;
use std::error::Error as _;

pub const DEFAULT_BASE_URL: &str = "https://openrouter.ai/api/v1";

#[derive(Deserialize)]
struct OpenRouterModelItem {
    id: String,
    #[serde(default)]
    name: Option<String>,
}

#[derive(Deserialize)]
struct OpenRouterModelsResponse {
    data: Vec<OpenRouterModelItem>,
}

pub struct OpenRouterProvider {
    pub client: Client,
    pub base_url: String,
}

impl OpenRouterProvider {
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
            .map_err(|e| map_http_err("fetch models request", e))?;
        let status = resp.status();
        if !status.is_success() {
            let snippet = truncate_body(resp).await;
            return Err(AppError::Network(format!(
                "fetch models returned {status}{}",
                snippet.map(|s| format!(": {s}")).unwrap_or_default()
            )));
        }
        let body: OpenRouterModelsResponse = resp
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("fetch models parse failed: {e}")))?;
        Ok(body
            .data
            .into_iter()
            .map(|m| ModelDefinition {
                id: m.id.clone(),
                provider_id: "openrouter".to_string(),
                name: m.name.unwrap_or_else(|| m.id.clone()),
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
            .map_err(|e| map_http_err("connection test", e))?;
        if resp.status().is_success() {
            Ok(())
        } else {
            let status = resp.status();
            let snippet = truncate_body(resp).await;
            Err(AppError::Network(format!(
                "connection test returned {status}{}",
                snippet.map(|s| format!(": {s}")).unwrap_or_default()
            )))
        }
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
            .header("HTTP-Referer", "https://ai-digital-life.local")
            .header("X-Title", "AI Digital Life")
            .json(body);
        let json = send_chat_request(&builder, "OpenRouter").await?;

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
        let body = build_request_body(model, messages, true, None);

        let url = format!("{}/chat/completions", self.base_url);
        let builder = HttpRequestBuilder::new(self.client.clone(), url)
            .header("Authorization", format!("Bearer {}", api_key))
            .json(body);
        let response = send_stream_request(&builder, "OpenRouter").await?;

        parse_sse_stream(response, |json| {
            json["choices"][0]["delta"]["content"]
                .as_str()
                .map(|s| SseEvent::Delta(s.to_string()))
                .unwrap_or(SseEvent::Skip)
        })
    }
}

/// Classify a `reqwest::Error` — avoid embedding the full reqwest Display
/// (which can contain URLs and sensitive headers under some transports).
fn map_http_err(ctx: &'static str, err: reqwest::Error) -> AppError {
    let is_network = err.is_timeout()
        || err.is_connect()
        || err.is_body()
        || err.is_decode()
        || err.status().is_some()
        || err.is_redirect();
    let kind = if is_network { "Network" } else { "Internal" };
    let status_snippet = match err.status() {
        Some(s) => format!(" (HTTP {s})"),
        None => String::new(),
    };
    let msg = match err.source() {
        Some(src) => format!("{ctx} failed: {kind}{status_snippet}: {src}"),
        None => format!("{ctx} failed: {kind}{status_snippet}"),
    };
    if is_network { AppError::Network(msg) } else { AppError::Internal(msg) }
}

async fn truncate_body(resp: reqwest::Response) -> Option<String> {
    let bytes = resp.bytes().await.ok()?;
    let text = String::from_utf8_lossy(&bytes);
    let snippet: String = text.chars().take(200).collect();
    if snippet.is_empty() { None } else { Some(snippet) }
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
