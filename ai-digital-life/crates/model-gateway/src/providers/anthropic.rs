use crate::adapter::{CachePolicy, ChatOptions, ProviderAdapter, StreamReader};
use crate::cache_policy::CacheBreakpoints;
use crate::http_helper::{HttpRequestBuilder, send_chat_request, send_stream_request};
use crate::providers::base::{SseEvent, parse_sse_stream};
use adl_errors::AppError;
use adl_types::ConversationRole;
use adl_types::config::{ModelCapability, ModelDefinition, ModelTier};
use adl_types::model::{ModelChatMessage, ModelResponse, ModelTokenUsage};
use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;
use std::error::Error as _;

pub const DEFAULT_BASE_URL: &str = "https://api.anthropic.com/v1";

#[derive(Deserialize)]
struct AnthropicModelItem {
    id: String,
    display_name: Option<String>,
}

#[derive(Deserialize)]
struct AnthropicModelsResponse {
    data: Vec<AnthropicModelItem>,
}

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
                    ModelCapability::Streaming,
                ],
                tier: Some(ModelTier::Premium),
                context_window: Some(200000),
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
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
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
        let body: AnthropicModelsResponse = resp
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("fetch models parse failed: {e}")))?;
        Ok(body
            .data
            .into_iter()
            .map(|m| ModelDefinition {
                id: m.id.clone(),
                provider_id: "anthropic".to_string(),
                name: m.display_name.unwrap_or_else(|| m.id.clone()),
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
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
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
        let body = build_anthropic_body(model, messages, options, false);

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
        let cache_creation_input_tokens =
            json["usage"]["cache_creation_input_tokens"].as_u64().map(|v| v as u32);
        let cache_read_input_tokens =
            json["usage"]["cache_read_input_tokens"].as_u64().map(|v| v as u32);

        Ok(ModelResponse {
            provider_id: "anthropic".to_string(),
            model_id: model.to_string(),
            content,
            reasoning: None,
            synthetic: false,
            request_id: json["id"].as_str().map(String::from),
            usage: Some(ModelTokenUsage {
                prompt_tokens,
                completion_tokens,
                total_tokens,
                cache_creation_input_tokens,
                cache_read_input_tokens,
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
        options: &ChatOptions,
        api_key: &str,
    ) -> Result<StreamReader, AppError> {
        let body = build_anthropic_body(model, messages, options, true);

        let url = format!("{}/messages", self.base_url);
        let builder = HttpRequestBuilder::new(self.client.clone(), url)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .json(body);
        let response = send_stream_request(&builder, "Anthropic").await?;

        parse_sse_stream(response, extract_anthropic_event)
    }
}

/// Split messages into (system_value, body_messages) where the system prompt
/// and the latest user message become Anthropic content-block arrays carrying
/// an ephemeral cache breakpoint when caching is Auto and the session has more
/// than one message (mirrors OpenCode `buildAnthropicMessages`).
fn anthropic_system_and_messages(
    messages: &[ModelChatMessage],
    cache_policy: CachePolicy,
) -> (Option<serde_json::Value>, Vec<serde_json::Value>) {
    let mut breakpoints = CacheBreakpoints::new();
    let multi_turn = messages.len() > 1 && cache_policy == CachePolicy::Auto;

    let mut system: Option<serde_json::Value> = None;
    let user_texts: Vec<&ModelChatMessage> =
        messages.iter().filter(|m| m.role == ConversationRole::User).collect();
    let last_user = user_texts.last().copied();

    let mut out: Vec<serde_json::Value> = Vec::with_capacity(messages.len());
    for m in messages {
        match m.role {
            ConversationRole::System => {
                if multi_turn && breakpoints.allocate() {
                    system = Some(serde_json::json!([{
                        "type": "text",
                        "text": m.content,
                        "cache_control": { "type": "ephemeral" },
                    }]));
                } else {
                    system = Some(serde_json::Value::String(m.content.clone()));
                }
            },
            ConversationRole::User => {
                let is_last_user = last_user.map(|u| std::ptr::eq(u, m)).unwrap_or(false);
                let content = if multi_turn && is_last_user && breakpoints.allocate() {
                    serde_json::json!([{
                        "type": "text",
                        "text": m.content,
                        "cache_control": { "type": "ephemeral" },
                    }])
                } else {
                    serde_json::Value::String(m.content.clone())
                };
                out.push(serde_json::json!({ "role": "user", "content": content }));
            },
            ConversationRole::Assistant => {
                out.push(serde_json::json!({ "role": "assistant", "content": m.content }));
            },
            ConversationRole::Tool => {
                // Anthropic embeds tool results as user messages (existing behavior).
                out.push(serde_json::json!({ "role": "user", "content": m.content }));
            },
        }
    }
    (system, out)
}

fn build_anthropic_body(
    model: &str,
    messages: &[ModelChatMessage],
    options: &ChatOptions,
    stream: bool,
) -> serde_json::Value {
    let (system, messages_arr) =
        anthropic_system_and_messages(messages, options.cache_policy);
    let mut body = serde_json::json!({
        "model": model,
        "max_tokens": 4096,
        "stream": stream,
        "messages": messages_arr,
    });
    if let Some(sys) = system {
        body["system"] = sys;
    }
    body
}

/// Extract an [`SseEvent`] from an Anthropic Messages API stream JSON value.
/// `thinking_delta` maps to [`SseEvent::Reasoning`], `text_delta` to
/// [`SseEvent::Delta`], and `message_stop` to [`SseEvent::Done`].
fn extract_anthropic_event(json: &serde_json::Value) -> SseEvent {
    match json["type"].as_str() {
        Some("content_block_delta") => {
            let delta_type = json["delta"]["type"].as_str().unwrap_or("");
            match delta_type {
                "thinking_delta" => json["delta"]["thinking"]
                    .as_str()
                    .map(|s| SseEvent::Reasoning(s.to_string()))
                    .unwrap_or(SseEvent::Skip),
                "text_delta" => json["delta"]["text"]
                    .as_str()
                    .map(|s| SseEvent::Delta(s.to_string()))
                    .unwrap_or(SseEvent::Skip),
                _ => SseEvent::Skip,
            }
        },
        Some("message_delta") => {
            let u = &json["message"]["usage"];
            if u.is_object() {
                let prompt_tokens = u["input_tokens"].as_u64().map(|v| v as u32);
                let completion_tokens = u["output_tokens"].as_u64().map(|v| v as u32);
                let total_tokens = match (prompt_tokens, completion_tokens) {
                    (Some(p), Some(c)) => Some(p + c),
                    _ => None,
                };
                SseEvent::Usage(ModelTokenUsage {
                    prompt_tokens,
                    completion_tokens,
                    total_tokens,
                    cache_creation_input_tokens: u["cache_creation_input_tokens"]
                        .as_u64()
                        .map(|v| v as u32),
                    cache_read_input_tokens: u["cache_read_input_tokens"]
                        .as_u64()
                        .map(|v| v as u32),
                    ..Default::default()
                })
            } else {
                SseEvent::Skip
            }
        },
        Some("message_stop") => SseEvent::Done,
        _ => SseEvent::Skip,
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

    #[test]
    fn extract_anthropic_thinking_delta() {
        let json = serde_json::json!({
            "type": "content_block_delta",
            "delta": {"type": "thinking_delta", "thinking": "ponder"}
        });
        match extract_anthropic_event(&json) {
            SseEvent::Reasoning(t) => assert_eq!(t, "ponder"),
            other => panic!("expected Reasoning, got {other:?}"),
        }
    }

    #[test]
    fn extract_anthropic_text_delta() {
        let json = serde_json::json!({
            "type": "content_block_delta",
            "delta": {"type": "text_delta", "text": "hello"}
        });
        match extract_anthropic_event(&json) {
            SseEvent::Delta(t) => assert_eq!(t, "hello"),
            other => panic!("expected Delta, got {other:?}"),
        }
    }

    #[test]
    fn extract_anthropic_message_stop() {
        let json = serde_json::json!({"type": "message_stop"});
        assert!(matches!(extract_anthropic_event(&json), SseEvent::Done));
    }

    #[test]
    fn extract_anthropic_message_delta_usage() {
        let json = serde_json::json!({
            "type": "message_delta",
            "message": {
                "usage": {
                    "input_tokens": 10,
                    "output_tokens": 5,
                    "cache_creation_input_tokens": 2,
                    "cache_read_input_tokens": 8,
                }
            }
        });
        match extract_anthropic_event(&json) {
            SseEvent::Usage(u) => {
                assert_eq!(u.prompt_tokens, Some(10));
                assert_eq!(u.completion_tokens, Some(5));
                assert_eq!(u.cache_creation_input_tokens, Some(2));
                assert_eq!(u.cache_read_input_tokens, Some(8));
            },
            other => panic!("expected Usage, got {other:?}"),
        }
    }

    #[test]
    fn anthropic_body_injects_cache_control_on_multi_turn() {
        let msgs = vec![
            ModelChatMessage { role: ConversationRole::System, content: "sys".into() },
            ModelChatMessage { role: ConversationRole::User, content: "first".into() },
            ModelChatMessage { role: ConversationRole::Assistant, content: "hi".into() },
            ModelChatMessage { role: ConversationRole::User, content: "latest".into() },
        ];
        let body = build_anthropic_body("claude-3-5-sonnet", &msgs, &ChatOptions::default(), false);
        // system is a content-block array with cache_control
        let sys = body["system"].as_array().expect("system array");
        assert_eq!(sys[0]["type"], "text");
        assert_eq!(sys[0]["cache_control"]["type"], "ephemeral");
        // only the latest user message becomes a content-block array
        let msgs_arr = body["messages"].as_array().unwrap();
        let latest = msgs_arr.last().unwrap();
        assert_eq!(latest["content"][0]["cache_control"]["type"], "ephemeral");
        // middle user message stays a plain string
        let middle = &msgs_arr[0];
        assert!(middle["content"].is_string(), "non-latest user stays string");
    }

    #[test]
    fn anthropic_body_no_cache_for_single_turn() {
        let msgs = vec![ModelChatMessage { role: ConversationRole::User, content: "hi".into() }];
        let body = build_anthropic_body("m", &msgs, &ChatOptions::default(), false);
        assert!(body["system"].is_null() || body["system"].is_string());
        assert!(body["messages"][0]["content"].is_string());
    }

    #[test]
    fn anthropic_body_cache_policy_off_disables_injection() {
        let msgs = vec![
            ModelChatMessage { role: ConversationRole::User, content: "a".into() },
            ModelChatMessage { role: ConversationRole::User, content: "b".into() },
        ];
        let opts = ChatOptions { cache_policy: CachePolicy::Off, ..Default::default() };
        let body = build_anthropic_body("m", &msgs, &opts, false);
        assert!(body["messages"][1]["content"].is_string());
    }
}
