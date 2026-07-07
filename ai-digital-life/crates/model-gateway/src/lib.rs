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

pub use secret::{clear_provider_secret, get_provider_secret, set_provider_secret};

use adl_errors::AppError;
use adl_kernel::{
    create_id, now_ms, ConversationScenario, ModelCallAuditRecord, ModelChatMessage,
    ModelGatewayHealthSnapshot, ModelPreferences, ModelResponse,
    ModelRouteDecision, ProviderHealthStatus,
};
use audit::{audit_record, AuditInput};
use fallback::{deterministic_fallback, estimate_usage};
use std::sync::{Arc, RwLock};
use std::time::Instant;

#[derive(Clone)]
pub struct ModelGateway {
    pub(crate) preferences: ModelPreferences,
    pub(crate) registry: Arc<RwLock<ProviderRegistry>>,
}

fn fallback_models(def: &registry::ProviderDefinition) -> Vec<adl_kernel::types::config::ModelDefinition> {
    match &def.models {
        registry::ModelSource::Static(models) => models.clone(),
        registry::ModelSource::Dynamic { .. } => vec![],
    }
}

impl ModelGateway {
    pub fn new(
        preferences: ModelPreferences,
        registry: Arc<RwLock<ProviderRegistry>>,
    ) -> Result<Self, AppError> {
        Ok(Self { preferences, registry })
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
            chain: route.clone(),
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
                    provider_id: resp_provider_id.clone(),
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
                let provider = "deepseek".to_string();
                let model_id = "synthetic-local".to_string();
                let content = deterministic_fallback(&messages, last_error.as_deref());
                let usage = Some(estimate_usage(&messages));
                let route = ModelRouteDecision {
                    reason: "all configured providers failed or are missing secrets; used local deterministic fallback".into(),
                    chain: vec!["synthetic-local".into()],
                    synthetic: Some(true),
                };
                let response = ModelResponse {
                    provider_id: provider.clone(),
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

    /// Send a chat message to a specific provider/model pair, bypassing the
    /// priority-ordered route chain. Falls back to synthetic response on failure.
    pub async fn chat_for_model(
        &self,
        provider_id: &str,
        model_id: &str,
        messages: Vec<ModelChatMessage>,
    ) -> (ModelResponse, ModelCallAuditRecord) {
        let started = Instant::now();

        match route::select_provider_for_model(self, provider_id, model_id, &messages).await {
            Ok((_pid, _mid, response)) => {
                let audit = audit_record(AuditInput {
                    workspace_id: "",
                    session_id: "",
                    run_id: None,
                    provider_id: response.provider_id.clone(),
                    model_id: response.model_id.clone(),
                    scenario: ConversationScenario::CodeEdit,
                    route_meta: ModelRouteDecision {
                        reason: format!("direct dispatch to {provider_id}/{model_id}"),
                        chain: vec![provider_id.to_string()],
                        synthetic: None,
                    },
                    started,
                    usage: response.usage.clone(),
                    error: None,
                });
                (response, audit)
            },
            Err(last_error) => {
                let content = deterministic_fallback(&messages, last_error.as_deref());
                let usage = Some(estimate_usage(&messages));
                let response = ModelResponse {
                    provider_id: provider_id.to_string(),
                    model_id: model_id.to_string(),
                    content,
                    synthetic: true,
                    request_id: Some(create_id("modelreq")),
                    usage: usage.clone(),
                    route: Some(ModelRouteDecision {
                        reason: "direct dispatch failed; used local deterministic fallback".into(),
                        chain: vec![provider_id.to_string()],
                        synthetic: Some(true),
                    }),
                };
                let audit = audit_record(AuditInput {
                    workspace_id: "",
                    session_id: "",
                    run_id: None,
                    provider_id: provider_id.to_string(),
                    model_id: model_id.to_string(),
                    scenario: ConversationScenario::CodeEdit,
                    route_meta: ModelRouteDecision {
                        reason: "direct dispatch failed; used local deterministic fallback".into(),
                        chain: vec!["synthetic-local".into()],
                        synthetic: Some(true),
                    },
                    started,
                    usage,
                    error: last_error,
                });
                (response, audit)
            },
        }
    }

    pub async fn fetch_models(
        &self,
        provider_id: &str,
    ) -> Result<Vec<adl_kernel::types::config::ModelDefinition>, AppError> {
        let (adapter, def) = {
            let registry = self
                .registry
                .read()
                .map_err(|e| AppError::Internal(format!("registry lock poisoned: {e}")))?;
            let adapter = registry
                .get_adapter_owned(provider_id)
                .ok_or_else(|| AppError::NotFound(format!("adapter '{}' not found", provider_id)))?;
            let def = registry
                .get(provider_id)
                .ok_or_else(|| AppError::NotFound(format!("provider '{}' not found", provider_id)))?
                .clone();
            (adapter, def)
        };
        if adapter.supports_dynamic_models() {
            let api_key = crate::get_provider_secret(provider_id).unwrap_or_default();
            let base_url = def.default_base_url.as_deref().unwrap_or("");
            match adapter.fetch_models(&api_key, base_url).await {
                Ok(models) if !models.is_empty() => Ok(models),
                _ => Ok(fallback_models(&def)),
            }
        } else {
            Ok(fallback_models(&def))
        }
    }

    pub fn health(&self) -> ModelGatewayHealthSnapshot {
        let checked_at = now_ms();
        let all_providers = [
            "deepseek", "minimax", "anthropic", "openai", "google", "ollama", "openrouter",
        ];
        let providers = all_providers
            .into_iter()
            .map(|provider_id| {
                // Ollama is a local service and does not require an API key;
                // treat it as healthy without checking the keyring.
                let is_ollama = provider_id == "ollama";
                let has_secret = is_ollama || get_provider_secret(provider_id).is_ok();
                let detail = if is_ollama {
                    "Local Ollama service (no API key required).".to_string()
                } else if has_secret {
                    "API key is configured.".to_string()
                } else {
                    "API key is not configured; calls will use fallback after route failure."
                        .to_string()
                };
                ProviderHealthStatus { provider_id: provider_id.to_string(), healthy: has_secret, detail }
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
        let gateway =
            ModelGateway::new(ModelPreferences::default(), Arc::new(RwLock::new(ProviderRegistry::new())))
                .unwrap();
        let route = route::route_chain(gateway.preferences());
        assert_eq!(route[0], "deepseek");
    }
}
