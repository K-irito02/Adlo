use crate::adapter::{ChatOptions, ProviderAdapter, StreamChunk, StreamReader};
use adl_errors::AppError;
use adl_kernel::types::config::ModelProviderId;
use adl_kernel::types::model::{ModelChatMessage, ModelResponse, ModelTokenUsage};
use adl_kernel::ConversationRole;
use async_trait::async_trait;
use reqwest::Client;

pub struct GoogleProvider {
    pub client: Client,
    pub base_url: String,
}

impl GoogleProvider {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            base_url: "https://generativelanguage.googleapis.com/v1beta".to_string(),
        }
    }

    pub fn with_base_url(base_url: String) -> Self {
        Self { client: Client::new(), base_url }
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
    fn provider_id(&self) -> ModelProviderId {
        ModelProviderId::Google
    }
    fn supported_models(&self) -> &'static [&'static str] {
        &["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"]
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
        let resp = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("Google request failed: {}", e)))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::Internal(format!("Google error {}: {}", status, text)));
        }

        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("Google parse failed: {}", e)))?;

        let content =
            json["candidates"][0]["content"]["parts"][0]["text"].as_str().unwrap_or("").to_string();

        let prompt_tokens = json["usageMetadata"]["promptTokenCount"].as_u64().map(|v| v as u32);
        let completion_tokens =
            json["usageMetadata"]["candidatesTokenCount"].as_u64().map(|v| v as u32);
        let total_tokens = json["usageMetadata"]["totalTokenCount"].as_u64().map(|v| v as u32);

        Ok(ModelResponse {
            provider_id: ModelProviderId::Google,
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

        let contents: Vec<serde_json::Value> = messages.iter().filter_map(|m| {
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
        }).collect();

        let body = serde_json::json!({
            "contents": contents,
        });

        let url = format!(
            "{}/models/{}:streamGenerateContent?alt=sse&key={}",
            self.base_url, model, api_key
        );

        let response = self.client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Model(e.to_string()))?;

        let stream = response.bytes_stream().map(|chunk| {
            let chunk = chunk.map_err(|e| AppError::Model(e.to_string()))?;
            let text = String::from_utf8_lossy(&chunk).to_string();
            for line in text.lines() {
                if let Some(data) = line.strip_prefix("data: ") {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                        if let Some(candidates) = json["candidates"].as_array() {
                            if let Some(text) = candidates[0]["content"]["parts"][0]["text"].as_str() {
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
        assert_eq!(p.provider_id(), ModelProviderId::Google);
        assert!(p.supported_models().contains(&"gemini-1.5-pro"));
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
        let messages = vec![ModelChatMessage { role: ConversationRole::User, content: "hi".to_string() }];
        let result = provider.chat_stream("gemini-1.5-pro", &messages, &ChatOptions::default(), "fake-key").await;
        let err = match result {
            Err(e) => e.to_string(),
            Ok(_) => panic!("expected Err"),
        };
        assert!(!err.contains("not yet implemented"));
    }
}
