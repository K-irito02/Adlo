//! Model provider routing (DeepSeek / MiniMax) with controlled fallback.
//! Routes requests through a priority-ordered provider chain and falls
//! back to a local synthetic response when all providers fail.

pub mod adapter;
pub mod registry;
pub use adl_kernel::types::config::ModelDefinition;
pub use registry::{
    ApiType, AuthType, ModelSource, ProviderDefinition, ProviderRegistry,
};
mod audit;
mod fallback;
pub mod prompts;
mod provider;
pub mod providers;
mod route;
mod secret;
mod wire;

pub use secret::{clear_provider_secret, get_provider_secret, set_provider_secret};

use adl_errors::AppError;
use adl_kernel::{
    create_id, now_ms, ConversationScenario, ModelCallAuditRecord, ModelChatMessage,
    ModelGatewayHealthSnapshot, ModelPreferences, ModelProviderId, ModelResponse,
    ModelRouteDecision, ProviderHealthStatus,
};
use audit::{audit_record, AuditInput};
use fallback::{deterministic_fallback, estimate_usage};
use reqwest::Client;
use std::time::{Duration, Instant};

#[derive(Clone)]
pub struct ModelGateway {
    pub(crate) client: Client,
    pub(crate) preferences: ModelPreferences,
}

impl ModelGateway {
    pub fn new(preferences: ModelPreferences) -> Result<Self, AppError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .map_err(|e| AppError::Model(e.to_string()))?;
        Ok(Self { client, preferences })
    }

    pub fn preferences(&self) -> &ModelPreferences {
        &self.preferences
    }

    pub async fn chat(
        &self,
        workspace_id: &str,
        session_id: &str,
        run_id: Option<&str>,
        scenario: ConversationScenario,
        messages: Vec<ModelChatMessage>,
    ) -> (ModelResponse, ModelCallAuditRecord) {
        let started = Instant::now();
        let route = route::route_chain(&self.preferences);
        let route_meta = ModelRouteDecision {
            reason: "provider priority and enabled state".into(),
            chain: route.iter().map(|provider| provider.as_str().to_string()).collect(),
            synthetic: None,
        };

        match route::select_provider(self, &route, &messages).await {
            Ok((
                _provider_id,
                model_id,
                ModelResponse {
                    usage,
                    model_id: resp_model_id,
                    provider_id: resp_provider_id,
                    content,
                    synthetic,
                    request_id,
                    route: resp_route,
                },
            )) => {
                let audit = audit_record(AuditInput {
                    workspace_id,
                    session_id,
                    run_id,
                    provider_id: resp_provider_id,
                    model_id,
                    scenario,
                    route_meta,
                    started,
                    usage: usage.clone(),
                    error: None,
                });
                (
                    ModelResponse {
                        provider_id: resp_provider_id,
                        model_id: resp_model_id,
                        content,
                        synthetic,
                        request_id,
                        usage,
                        route: resp_route,
                    },
                    audit,
                )
            },
            Err(last_error) => {
                let provider = ModelProviderId::Deepseek;
                let model_id = "synthetic-local".to_string();
                let content = deterministic_fallback(&messages, last_error.as_deref());
                let usage = Some(estimate_usage(&messages));
                let route = ModelRouteDecision {
                    reason: "all configured providers failed or are missing secrets; used local deterministic fallback".into(),
                    chain: vec!["synthetic-local".into()],
                    synthetic: Some(true),
                };
                let response = ModelResponse {
                    provider_id: provider,
                    model_id: model_id.clone(),
                    content,
                    synthetic: true,
                    request_id: Some(create_id("modelreq")),
                    usage: usage.clone(),
                    route: Some(route.clone()),
                };
                let audit = audit_record(AuditInput {
                    workspace_id,
                    session_id,
                    run_id,
                    provider_id: provider,
                    model_id,
                    scenario,
                    route_meta: route,
                    started,
                    usage,
                    error: last_error,
                });
                (response, audit)
            },
        }
    }

    pub fn health(&self) -> ModelGatewayHealthSnapshot {
        let checked_at = now_ms();
        let all_providers = [
            ModelProviderId::Deepseek,
            ModelProviderId::Minimax,
            ModelProviderId::Anthropic,
            ModelProviderId::Openai,
            ModelProviderId::Google,
            ModelProviderId::Ollama,
            ModelProviderId::Openrouter,
        ];
        let providers = all_providers
            .into_iter()
            .map(|provider_id| {
                // Ollama is a local service and does not require an API key;
                // treat it as healthy without checking the keyring.
                let is_ollama = matches!(provider_id, ModelProviderId::Ollama);
                let has_secret = is_ollama || get_provider_secret(provider_id).is_ok();
                let detail = if is_ollama {
                    "Local Ollama service (no API key required).".to_string()
                } else if has_secret {
                    "API key is configured.".to_string()
                } else {
                    "API key is not configured; calls will use fallback after route failure."
                        .to_string()
                };
                ProviderHealthStatus { provider_id, healthy: has_secret, detail }
            })
            .collect();
        ModelGatewayHealthSnapshot { checked_at, providers }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gateway_routes_by_priority() {
        let gateway = ModelGateway::new(ModelPreferences::default()).unwrap();
        let route = route::route_chain(gateway.preferences());
        assert_eq!(route[0], ModelProviderId::Deepseek);
    }
}
