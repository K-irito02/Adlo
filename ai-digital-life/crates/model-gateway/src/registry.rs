use std::collections::HashMap;

use crate::adapter::ProviderAdapter;

/// API protocol type used by a provider.
#[derive(Clone, Debug)]
pub enum ApiType {
    OpenAICompatible,
    AnthropicNative,
    GoogleNative,
    Ollama,
}

/// Authentication method for a provider.
#[derive(Clone, Debug)]
pub enum AuthType {
    ApiKey,
    OAuth,
    None,
}

/// Where model definitions come from for a provider.
#[derive(Clone, Debug)]
pub enum ModelSource {
    Static(Vec<ModelDefinition>),
    Dynamic { endpoint: Option<String> },
}

/// Placeholder for model definition — will be replaced in Task A2.
#[derive(Clone, Debug)]
pub struct ModelDefinition;

/// Describes a registered provider.
#[derive(Clone, Debug)]
pub struct ProviderDefinition {
    pub id: String,
    pub name: String,
    pub description: String,
    pub api_type: ApiType,
    pub default_base_url: Option<String>,
    pub auth_type: AuthType,
    pub models: ModelSource,
    pub built_in: bool,
}

/// Registry of known providers with their definitions and adapters.
pub struct ProviderRegistry {
    providers: HashMap<String, ProviderDefinition>,
    adapters: HashMap<String, Box<dyn ProviderAdapter + Send + Sync>>,
}

impl ProviderRegistry {
    pub fn new() -> Self {
        Self { providers: HashMap::new(), adapters: HashMap::new() }
    }

    pub fn register(
        &mut self,
        def: ProviderDefinition,
        adapter: Box<dyn ProviderAdapter + Send + Sync>,
    ) {
        let id = def.id.clone();
        self.providers.insert(id.clone(), def);
        self.adapters.insert(id, adapter);
    }

    pub fn get(&self, id: &str) -> Option<&ProviderDefinition> {
        self.providers.get(id)
    }

    pub fn get_adapter(&self, id: &str) -> Option<&(dyn ProviderAdapter + Send + Sync)> {
        self.adapters.get(id).map(|b| b.as_ref())
    }

    pub fn list_all(&self) -> Vec<&ProviderDefinition> {
        self.providers.values().collect()
    }

    pub fn remove(&mut self, id: &str) {
        self.providers.remove(id);
        self.adapters.remove(id);
    }
}

#[cfg(test)]
mod tests {
    use adl_errors::AppError;
    use adl_kernel::types::config::ModelProviderId;
    use adl_kernel::types::model::{ModelChatMessage, ModelResponse, ModelTokenUsage};

    use super::*;
    use crate::adapter::{ChatOptions, StreamReader};

    struct TestAdapter;

    #[async_trait::async_trait]
    impl ProviderAdapter for TestAdapter {
        fn provider_name(&self) -> &'static str {
            "test"
        }
        fn provider_id(&self) -> ModelProviderId {
            ModelProviderId::Openai
        }
        fn supported_models(&self) -> &'static [&'static str] {
            &["test-model"]
        }

        async fn chat(
            &self,
            _model: &str,
            _messages: &[ModelChatMessage],
            _options: &ChatOptions,
            _api_key: &str,
        ) -> Result<ModelResponse, AppError> {
            Ok(ModelResponse {
                provider_id: ModelProviderId::Openai,
                model_id: "test-model".to_string(),
                content: "test response".to_string(),
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

    #[test]
    fn test_register_and_get() {
        let mut reg = ProviderRegistry::new();
        let def = ProviderDefinition {
            id: "test-provider".into(),
            name: "Test".into(),
            description: "".into(),
            api_type: ApiType::OpenAICompatible,
            default_base_url: Some("https://api.test.com".into()),
            auth_type: AuthType::ApiKey,
            models: ModelSource::Static(vec![]),
            built_in: true,
        };
        reg.register(def.clone(), Box::new(TestAdapter));
        assert!(reg.get("test-provider").is_some());
        assert!(reg.get_adapter("test-provider").is_some());
    }
}
