//! Fallback response generation when all providers fail.

use adl_types::{estimate_tokens, ConversationRole, ModelChatMessage, ModelTokenUsage};

use crate::registry::{ModelSource, ProviderRegistry};

pub(crate) fn default_model(provider_id: &str, registry: &ProviderRegistry) -> String {
    if let Some(def) = registry.get(provider_id) {
        if let Some(model) = &def.default_model {
            return model.clone();
        }
        if let ModelSource::Static(models) = &def.models {
            if let Some(first) = models.first() {
                return first.id.clone();
            }
        }
    }
    format!("{provider_id}-default")
}

pub(crate) fn deterministic_fallback(messages: &[ModelChatMessage], error: Option<&str>) -> String {
    let user = messages
        .iter()
        .rev()
        .find(|message| message.role == ConversationRole::User)
        .map(|message| message.content.as_str())
        .unwrap_or("");
    format!(
        "Provider route unavailable. Generated a local thin-slice response for: {user}\n{}",
        error
            .map(|value| format!("Last provider error: {value}"))
            .unwrap_or_else(|| "No provider error was available.".into())
    )
}

pub(crate) fn estimate_usage(messages: &[ModelChatMessage]) -> ModelTokenUsage {
    let prompt_tokens =
        messages.iter().map(|message| estimate_tokens(&message.content)).sum::<usize>() as u32;
    ModelTokenUsage {
        prompt_tokens: Some(prompt_tokens),
        completion_tokens: Some(64),
        total_tokens: Some(prompt_tokens + 64),
        estimated: Some(true),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapter::{ChatOptions, StreamReader};
    use crate::registry::{ApiType, AuthType, ModelSource, ProviderDefinition};
    use adl_errors::AppError;
    use adl_types::config::ModelDefinition;
    use adl_types::model::{ModelChatMessage, ModelResponse};

    struct DummyAdapter;

    #[async_trait::async_trait]
    impl crate::adapter::ProviderAdapter for DummyAdapter {
        fn provider_name(&self) -> &'static str {
            "dummy"
        }
        fn provider_id(&self) -> &'static str {
            "dummy"
        }
        fn supported_models(&self) -> Vec<ModelDefinition> {
            vec![]
        }
        async fn chat(
            &self,
            _model: &str,
            _messages: &[ModelChatMessage],
            _options: &ChatOptions,
            _api_key: &str,
        ) -> Result<ModelResponse, AppError> {
            Err(AppError::Internal("not implemented".to_string()))
        }
        async fn chat_stream(
            &self,
            _model: &str,
            _messages: &[ModelChatMessage],
            _options: &ChatOptions,
            _api_key: &str,
        ) -> Result<StreamReader, AppError> {
            Err(AppError::Internal("not implemented".to_string()))
        }
        async fn fetch_models(
            &self,
            _api_key: &str,
            _base_url: &str,
        ) -> Result<Vec<ModelDefinition>, AppError> {
            Err(AppError::Internal("not implemented".to_string()))
        }
    }

    fn make_registry(providers: Vec<ProviderDefinition>) -> ProviderRegistry {
        let mut registry = ProviderRegistry::new();
        for def in providers {
            registry.register(def, Box::new(DummyAdapter));
        }
        registry
    }

    fn make_def(id: &str, default_model: Option<&str>, models: Vec<&str>) -> ProviderDefinition {
        ProviderDefinition {
            id: id.into(),
            name: id.into(),
            description: String::new(),
            api_type: ApiType::OpenAICompatible,
            default_base_url: None,
            auth_type: AuthType::ApiKey,
            models: ModelSource::Static(
                models
                    .into_iter()
                    .map(|m| ModelDefinition {
                        id: m.into(),
                        provider_id: id.into(),
                        name: m.into(),
                        ..Default::default()
                    })
                    .collect(),
            ),
            built_in: true,
            default_model: default_model.map(|s| s.into()),
        }
    }

    #[test]
    fn returns_explicit_default_model() {
        let registry =
            make_registry(vec![make_def("openai", Some("gpt-4o"), vec!["gpt-3.5-turbo"])]);
        assert_eq!(default_model("openai", &registry), "gpt-4o");
    }

    #[test]
    fn falls_back_to_first_static_model() {
        let registry = make_registry(vec![make_def("ollama", None, vec!["llama3.1", "mistral"])]);
        assert_eq!(default_model("ollama", &registry), "llama3.1");
    }

    #[test]
    fn returns_descriptive_fallback_for_unknown_provider() {
        let registry = make_registry(vec![]);
        assert_eq!(default_model("nonexistent", &registry), "nonexistent-default");
    }

    #[test]
    fn returns_descriptive_fallback_when_no_default_and_no_models() {
        let registry = make_registry(vec![make_def("empty", None, vec![])]);
        assert_eq!(default_model("empty", &registry), "empty-default");
    }

    #[test]
    fn prefers_explicit_default_over_first_model() {
        let registry =
            make_registry(vec![make_def("deepseek", Some("deepseek-chat"), vec!["deepseek-v3"])]);
        assert_eq!(default_model("deepseek", &registry), "deepseek-chat");
    }
}
