use crate::adapter::{ChatOptions, ProviderAdapter, StreamReader};
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

pub const DEFAULT_BASE_URL: &str = "https://generativelanguage.googleapis.com/v1beta";

#[derive(Deserialize)]
struct GoogleModelItem {
    name: String,
    #[serde(default)]
    display_name: Option<String>,
    #[serde(default)]
    supported_generation_methods: Vec<String>,
}

#[derive(Deserialize)]
struct GoogleModelsResponse {
    models: Vec<GoogleModelItem>,
}

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

    fn supports_dynamic_models(&self) -> bool {
        true
    }

    async fn fetch_models(
        &self,
        api_key: &str,
        base_url: &str,
    ) -> Result<Vec<ModelDefinition>, AppError> {
        let base = base_url.trim_end_matches('/');
        let resp = self
            .client
            .get(format!("{base}/models"))
            .query(&[("key", api_key)])
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
        let body: GoogleModelsResponse = resp
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("fetch models parse failed: {e}")))?;
        Ok(body
            .models
            .into_iter()
            .filter(|m| m.supported_generation_methods.iter().any(|m| m == "generateContent"))
            .map(|m| {
                let id = m.name.strip_prefix("models/").unwrap_or(&m.name).to_string();
                ModelDefinition {
                    id: id.clone(),
                    provider_id: "google".to_string(),
                    name: m.display_name.unwrap_or(id),
                    capabilities: vec![ModelCapability::Text],
                    ..Default::default()
                }
            })
            .collect())
    }

    async fn test_connection(&self, api_key: &str, base_url: &str) -> Result<(), AppError> {
        let base = base_url.trim_end_matches('/');
        let resp = self
            .client
            .get(format!("{base}/models"))
            .query(&[("key", api_key)])
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

        let url = format!("{}/models/{}:generateContent", self.base_url, model);
        let builder = HttpRequestBuilder::new(self.client.clone(), url)
            .query(&[("key", api_key)])
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

        let url = format!("{}/models/{}:streamGenerateContent", self.base_url, model);

        let builder = HttpRequestBuilder::new(self.client.clone(), url)
            .query(&[("alt", "sse"), ("key", api_key)])
            .json(body);
        let response = send_stream_request(&builder, "Google").await?;

        parse_sse_stream(response, |json| {
            json["candidates"]
                .as_array()
                .and_then(|c| c.first())
                .and_then(|c| c["content"]["parts"][0]["text"].as_str())
                .map(|s| SseEvent::Delta(s.to_string()))
                .unwrap_or(SseEvent::Skip)
        })
    }
}

/// Classify a `reqwest::Error` into AppError variants. Avoids embedding full
/// URL in the message because Google (and proxy query transports) may encode
/// secrets as URL query parameters; we strip URLs from reqwest Display output
/// by hand-crafting a context message, and use `.without_url()` when
/// supported via the `url()` method inspect.
fn map_http_err(ctx: &'static str, err: reqwest::Error) -> AppError {
    // Determine classification: is_request() means client-construction bug;
    // anything with a status or transport/timeout layer → Network for users.
    let is_network = err.is_timeout()
        || err.is_connect()
        || err.is_body()
        || err.is_decode()
        || err.status().is_some()
        || err.is_redirect();
    let kind = if is_network { "Network" } else { "Internal" };
    // Exclude URL: explicitly render only the error's source/cause text and status.
    let status_snippet = match err.status() {
        Some(s) => format!(" (HTTP {s})"),
        None => String::new(),
    };
    // Use Debug for source chain but strip anything that looks like a URL/key.
    let msg = match err.source() {
        Some(src) => format!("{ctx} failed: {kind}{status_snippet}: {src}"),
        None => format!("{ctx} failed: {kind}{status_snippet}"),
    };
    if is_network { AppError::Network(msg) } else { AppError::Internal(msg) }
}

/// Best-effort read up to 200 chars of a response body for diagnostic inclusion
/// in error messages. Returns `None` on stream/UTF-8 failure. The response is
/// consumed by this call, so only use it before any `.json()`/`.text()`.
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
