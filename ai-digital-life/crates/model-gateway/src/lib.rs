//! Model provider routing (DeepSeek / MiniMax) with controlled fallback.
//! Routes requests through a priority-ordered provider chain and falls
//! back to a local synthetic response when all providers fail.

pub mod adapter;
pub mod http_helper;
pub mod registry;
pub use adl_types::config::ModelDefinition;
pub use registry::{ApiType, AuthType, ModelSource, ProviderDefinition, ProviderRegistry};
mod audit;
mod fallback;
pub mod prompts;
mod provider;
pub mod providers;
mod route;
mod secret;

pub use secret::{clear_provider_secret, get_provider_secret, set_provider_secret};

use crate::adapter::StreamReader;
use adl_errors::AppError;
use adl_types::{
    ConversationScenario, ModelCallAuditRecord, ModelChatMessage, ModelGatewayHealthSnapshot,
    ModelPreferences, ModelResponse, ModelRouteDecision, ProviderHealthStatus, create_id, now_ms,
};
use audit::{AuditInput, audit_record};
use fallback::{deterministic_fallback, estimate_usage};
use std::sync::{Arc, RwLock};
use std::time::Instant;

#[derive(Clone)]
pub struct ModelGateway {
    pub(crate) preferences: ModelPreferences,
    pub(crate) registry: Arc<RwLock<ProviderRegistry>>,
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
                    reasoning,
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
                        reasoning,
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
                    reasoning: None,
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
                    reasoning: None,
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

    pub fn resolve_route(&self) -> Vec<String> {
        route::route_chain(&self.preferences)
    }

    pub async fn chat_stream(
        &self,
        _workspace_id: &str,
        _session_id: &str,
        _run_id: Option<&str>,
        _scenario: ConversationScenario,
        messages: Vec<ModelChatMessage>,
    ) -> Result<StreamReader, AppError> {
        let route = route::route_chain(&self.preferences);
        let mut last_error: Option<AppError> = None;
        for provider in &route {
            let model_id = {
                let registry = self.registry.read().map_err(|_| {
                    AppError::Internal("provider registry lock poisoned".to_string())
                })?;
                match self.preferences.providers.get(provider) {
                    Some(pref) => route::resolve_model_id(pref),
                    None => Some(fallback::default_model(provider, &registry)),
                }
            };
            let Some(model_id) = model_id else {
                continue;
            };
            match crate::provider::call_provider_stream(self, provider, &model_id, &messages).await
            {
                Ok(stream) => return Ok(stream),
                Err(e) => last_error = Some(e),
            }
        }
        Err(last_error.unwrap_or_else(|| {
            AppError::Internal("no providers configured for streaming".to_string())
        }))
    }

    pub async fn chat_stream_for_model(
        &self,
        provider_id: &str,
        model_id: &str,
        messages: Vec<ModelChatMessage>,
    ) -> Result<StreamReader, AppError> {
        let allowed = match self.preferences.providers.get(provider_id) {
            Some(pref) => match &pref.enabled_models {
                None => true,
                Some(list) => !list.is_empty() && list.iter().any(|m| m == model_id),
            },
            None => true,
        };
        if !allowed {
            return Err(AppError::NotFound(format!(
                "model '{model_id}' is disabled for provider '{provider_id}'"
            )));
        }
        crate::provider::call_provider_stream(self, provider_id, model_id, &messages).await
    }

    /// Health snapshot over the registered providers.
    ///
    /// NOTE: reads each provider's persisted credential synchronously (blocking
    /// keyring/file I/O). Must be called from a blocking thread (e.g.
    /// `tokio::task::spawn_blocking`), never directly on the async executor.
    pub fn health(&self) -> ModelGatewayHealthSnapshot {
        let checked_at = now_ms();
        let registry = match self.registry.read() {
            Ok(r) => r,
            Err(_) => return ModelGatewayHealthSnapshot { checked_at, providers: vec![] },
        };
        let providers: Vec<ProviderHealthStatus> = registry
            .list_all()
            .iter()
            .map(|def| {
                let is_ollama = def.id == "ollama";
                let has_secret = is_ollama || get_provider_secret(&def.id).is_ok();
                let detail = if is_ollama {
                    "Local Ollama service (no API key required)."
                } else if has_secret {
                    "API key is configured."
                } else {
                    "API key is not configured; calls will use fallback after route failure."
                }
                .to_string();
                ProviderHealthStatus { provider_id: def.id.clone(), healthy: has_secret, detail }
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
        let gateway = ModelGateway::new(
            ModelPreferences::default(),
            Arc::new(RwLock::new(ProviderRegistry::new())),
        )
        .unwrap();
        let route = route::route_chain(gateway.preferences());
        assert_eq!(route[0], "deepseek");
    }
}
