use adl_errors::AppError;
use adl_types::agent::AgentId;
use adl_types::config::ModelDefinition;
use adl_types::model::{ModelChatMessage, ModelResponse, ModelTokenUsage};
use async_trait::async_trait;
use std::pin::Pin;

/// Stream of chat completion chunks.
pub type StreamReader =
    Pin<Box<dyn tokio_stream::Stream<Item = Result<StreamChunk, AppError>> + Send>>;

/// A single chunk in a streaming response.
#[derive(Debug, Clone)]
pub enum StreamChunk {
    /// Partial text delta.
    Delta(String),
    /// Tool call delta (function name + arguments fragment).
    ToolCallDelta { id: String, name: String, arguments_delta: String },
    /// Stream completed with final usage info.
    Done(ModelTokenUsage),
}

/// Options passed to chat/chat_stream.
#[derive(Debug, Clone, Default)]
pub struct ChatOptions {
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
    pub max_tokens: Option<u32>,
    pub agent_id: Option<AgentId>,
    pub tools: Vec<ToolDefinition>,
}

/// Definition of a tool the model can call.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

/// Adapter trait that each LLM provider implements.
#[async_trait]
pub trait ProviderAdapter: Send + Sync {
    fn provider_name(&self) -> &'static str;
    fn provider_id(&self) -> &'static str;
    fn supported_models(&self) -> Vec<ModelDefinition>;

    fn supports_dynamic_models(&self) -> bool {
        false
    }

    async fn fetch_models(
        &self,
        _api_key: &str,
        _base_url: &str,
    ) -> Result<Vec<ModelDefinition>, AppError> {
        Err(AppError::Internal("dynamic model fetch not supported".to_string()))
    }

    async fn chat(
        &self,
        model: &str,
        messages: &[ModelChatMessage],
        options: &ChatOptions,
        api_key: &str,
    ) -> Result<ModelResponse, AppError>;

    async fn chat_stream(
        &self,
        model: &str,
        messages: &[ModelChatMessage],
        options: &ChatOptions,
        api_key: &str,
    ) -> Result<StreamReader, AppError>;

    fn estimate_tokens(&self, text: &str) -> usize {
        adl_types::estimate_tokens(text)
    }

    async fn test_connection(&self, api_key: &str, base_url: &str) -> Result<(), AppError> {
        let _ = (api_key, base_url);
        Err(AppError::Internal("connection test not supported".to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct StubAdapter;

    #[async_trait]
    impl ProviderAdapter for StubAdapter {
        fn provider_name(&self) -> &'static str {
            "stub"
        }
        fn provider_id(&self) -> &'static str {
            "openai"
        }
        fn supported_models(&self) -> Vec<ModelDefinition> {
            vec![ModelDefinition {
                id: "stub-model".into(),
                provider_id: "openai".into(),
                name: "Stub Model".into(),
                ..Default::default()
            }]
        }

        async fn chat(
            &self,
            _model: &str,
            _messages: &[ModelChatMessage],
            _options: &ChatOptions,
            _api_key: &str,
        ) -> Result<ModelResponse, AppError> {
            Ok(ModelResponse {
                provider_id: "openai".to_string(),
                model_id: "stub-model".to_string(),
                content: "stub response".to_string(),
                synthetic: false,
                request_id: None,
                usage: Some(ModelTokenUsage {
                    prompt_tokens: Some(10),
                    completion_tokens: Some(5),
                    total_tokens: Some(15),
                    estimated: Some(false),
                }),
                route: None,
            })
        }

        async fn chat_stream(
            &self,
            _model: &str,
            _messages: &[ModelChatMessage],
            _options: &ChatOptions,
            _api_key: &str,
        ) -> Result<StreamReader, AppError> {
            Err(AppError::Internal("streaming not supported".to_string()))
        }
    }

    #[tokio::test]
    async fn stub_adapter_returns_response() {
        let adapter = StubAdapter;
        let result = adapter.chat("stub-model", &[], &ChatOptions::default(), "key").await;
        assert!(result.is_ok());
        let resp = result.unwrap();
        assert_eq!(resp.content, "stub response");
    }

    #[test]
    fn chat_options_default() {
        let opts = ChatOptions::default();
        assert!(opts.temperature.is_none());
        assert!(opts.tools.is_empty());
    }
}
