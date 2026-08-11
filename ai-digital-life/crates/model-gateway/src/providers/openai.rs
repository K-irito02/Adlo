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

pub const DEFAULT_BASE_URL: &str = "https://api.openai.com/v1";

#[derive(Deserialize)]
struct OpenAIModelItem {
    id: String,
}

#[derive(Deserialize)]
struct OpenAIModelsResponse {
    data: Vec<OpenAIModelItem>,
}

/// Extract a text or reasoning delta from an OpenAI-compatible SSE chunk.
///
/// Priority: `delta.reasoning_content` (DeepSeek) → `delta.thinking`
/// (OpenAI o-series) → `delta.content` (normal text). Returns `Skip` when
/// none are present.
pub fn extract_openai_delta(json: &serde_json::Value) -> SseEvent {
    let delta = &json["choices"][0]["delta"];
    if let Some(t) = delta["reasoning_content"].as_str() {
        if !t.is_empty() {
            return SseEvent::Reasoning(t.to_string());
        }
    }
    if let Some(t) = delta["thinking"].as_str() {
        if !t.is_empty() {
            return SseEvent::Reasoning(t.to_string());
        }
    }
    delta["content"].as_str().map(|s| SseEvent::Delta(s.to_string())).unwrap_or(SseEvent::Skip)
}

pub struct OpenAIProvider {
    pub client: Client,
    pub base_url: String,
}

impl OpenAIProvider {
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
            .map_err(|e| map_http_err("fetch models request", e))?;
        if !resp.status().is_success() {
            let status = resp.status();
            // Only read the response body for statuses without a dedicated
            // friendly message (401/403/404 already get one, so skip the
            // wasted body read for the most common user-facing errors).
            let message = match friendly_http_message("fetch models", status) {
                Some(msg) => msg,
                None => {
                    let snippet = truncate_body(resp).await;
                    format!(
                        "fetch models returned {status}{}",
                        snippet.map(|s| format!(": {s}")).unwrap_or_default()
                    )
                },
            };
            return Err(AppError::Network(message));
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
                capabilities: vec![ModelCapability::Text, ModelCapability::Streaming],
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
            return Ok(());
        }
        let status = resp.status();
        let message = match friendly_http_message("connection test", status) {
            Some(msg) => msg,
            None => {
                let snippet = truncate_body(resp).await;
                format!(
                    "connection test returned {status}{}",
                    snippet.map(|s| format!(": {s}")).unwrap_or_default()
                )
            },
        };
        Err(AppError::Network(message))
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
            reasoning: None,
            synthetic: false,
            request_id: json["id"].as_str().map(String::from),
            usage: Some(ModelTokenUsage {
                prompt_tokens: json["usage"]["prompt_tokens"].as_u64().map(|v| v as u32),
                completion_tokens: json["usage"]["completion_tokens"].as_u64().map(|v| v as u32),
                total_tokens: json["usage"]["total_tokens"].as_u64().map(|v| v as u32),
                estimated: Some(false),
                ..Default::default()
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
        let response = send_stream_request(&builder, "OpenAI").await?;

        parse_sse_stream(response, extract_openai_delta)
    }
}

/// Friendly, user-facing message for a non-success HTTP status. Returns `None`
/// for statuses without a dedicated explanation (the caller falls back to the
/// raw status + response snippet).
fn friendly_http_message(operation: &str, status: reqwest::StatusCode) -> Option<String> {
    match status {
        reqwest::StatusCode::UNAUTHORIZED => {
            Some(format!("{operation} failed: API key is invalid or expired ({status})"))
        },
        reqwest::StatusCode::FORBIDDEN => {
            Some(format!("{operation} failed: access denied for this API key ({status})"))
        },
        reqwest::StatusCode::NOT_FOUND => Some(format!(
            "{operation} failed: endpoint not found — the Base URL may be incorrect or missing a version prefix such as /v1 ({status})"
        )),
        _ => None,
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
    fn extract_openai_delta_content() {
        let json = serde_json::json!({"choices": [{"delta": {"content": "hi"}}]});
        match extract_openai_delta(&json) {
            SseEvent::Delta(t) => assert_eq!(t, "hi"),
            other => panic!("expected Delta, got {other:?}"),
        }
    }

    #[test]
    fn extract_openai_delta_reasoning_content() {
        // DeepSeek reasoning_content field
        let json = serde_json::json!({"choices": [{"delta": {"reasoning_content": "think"}}]});
        match extract_openai_delta(&json) {
            SseEvent::Reasoning(t) => assert_eq!(t, "think"),
            other => panic!("expected Reasoning, got {other:?}"),
        }
    }

    #[test]
    fn extract_openai_delta_thinking() {
        // OpenAI o-series thinking field
        let json = serde_json::json!({"choices": [{"delta": {"thinking": "plan"}}]});
        match extract_openai_delta(&json) {
            SseEvent::Reasoning(t) => assert_eq!(t, "plan"),
            other => panic!("expected Reasoning, got {other:?}"),
        }
    }

    #[test]
    fn extract_openai_delta_skip_when_empty() {
        let json = serde_json::json!({"choices": [{"delta": {}}]});
        assert!(matches!(extract_openai_delta(&json), SseEvent::Skip));
    }

    #[test]
    fn friendly_http_message_explains_auth_and_url_issues() {
        use reqwest::StatusCode;
        assert_eq!(
            friendly_http_message("fetch models", StatusCode::UNAUTHORIZED).unwrap(),
            "fetch models failed: API key is invalid or expired (401 Unauthorized)"
        );
        assert_eq!(
            friendly_http_message("connection test", StatusCode::FORBIDDEN).unwrap(),
            "connection test failed: access denied for this API key (403 Forbidden)"
        );
        let not_found = friendly_http_message("connection test", StatusCode::NOT_FOUND).unwrap();
        assert!(not_found.contains("endpoint not found"));
        assert!(not_found.contains("Base URL"));
        assert_eq!(friendly_http_message("fetch models", StatusCode::BAD_REQUEST), None);
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
