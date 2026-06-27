mod audit;
mod fallback;
mod secret;
mod wire;

pub use secret::{clear_provider_secret, get_provider_secret, set_provider_secret};

use adl_errors::AppError;
use adl_kernel::{
    create_id, now_ms, ConversationScenario, ModelCallAuditRecord, ModelChatMessage,
    ModelGatewayHealthSnapshot, ModelPreferences, ModelProviderId, ModelResponse,
    ModelRouteDecision, ModelTokenUsage, ProviderHealthStatus,
};
use audit::{AuditInput, audit_record};
use fallback::{default_model, deterministic_fallback, estimate_usage};
use reqwest::Client;
use std::time::{Duration, Instant};
use wire::{ChatCompletionRequest, ChatCompletionResponse, WireMessage};

const DEEPSEEK_BASE_URL: &str = "https://api.deepseek.com";
const MINIMAX_BASE_URL: &str = "https://api.minimax.io";

#[derive(Clone)]
pub struct ModelGateway {
    client: Client,
    preferences: ModelPreferences,
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
        let route = self.route_chain();
        let route_meta = ModelRouteDecision {
            reason: "provider priority and enabled state".into(),
            chain: route.iter().map(|provider| provider.as_str().to_string()).collect(),
            synthetic: None,
        };

        match self.select_provider(&route, &messages).await {
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
                    run_id: None,
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

    async fn select_provider(
        &self,
        route: &[ModelProviderId],
        messages: &[ModelChatMessage],
    ) -> Result<(ModelProviderId, String, ModelResponse), Option<String>> {
        let mut last_error = None;
        for &provider in route {
            let model_id = self
                .preferences
                .providers
                .get(&provider)
                .map(|pref| pref.model_id.clone())
                .unwrap_or_else(|| default_model(provider).to_string());
            match self.call_provider(provider, &model_id, messages).await {
                Ok(response) => return Ok((provider, model_id, response)),
                Err(error) => {
                    last_error = Some(error.to_string());
                },
            }
        }
        Err(last_error)
    }

    pub fn health(&self) -> ModelGatewayHealthSnapshot {
        let checked_at = now_ms();
        let providers = [ModelProviderId::Deepseek, ModelProviderId::Minimax]
            .into_iter()
            .map(|provider_id| {
                let has_secret = get_provider_secret(provider_id).is_ok();
                ProviderHealthStatus {
                    provider_id,
                    healthy: has_secret,
                    detail: if has_secret {
                        "API key is configured.".into()
                    } else {
                        "API key is not configured; calls will use fallback after route failure."
                            .into()
                    },
                }
            })
            .collect();
        ModelGatewayHealthSnapshot { checked_at, providers }
    }

    fn route_chain(&self) -> Vec<ModelProviderId> {
        let mut providers = self
            .preferences
            .providers
            .iter()
            .filter(|(_, pref)| pref.enabled)
            .map(|(provider, pref)| (*provider, pref.priority))
            .collect::<Vec<_>>();
        providers.sort_by_key(|(_, priority)| *priority);
        providers.into_iter().map(|(provider, _)| provider).collect()
    }

    async fn call_provider(
        &self,
        provider: ModelProviderId,
        model_id: &str,
        messages: &[ModelChatMessage],
    ) -> Result<ModelResponse, AppError> {
        let api_key = tokio::task::spawn_blocking(move || get_provider_secret(provider))
            .await
            .map_err(|e| AppError::Security(e.to_string()))??;
        let url = match provider {
            ModelProviderId::Deepseek => format!("{DEEPSEEK_BASE_URL}/chat/completions"),
            ModelProviderId::Minimax => format!("{MINIMAX_BASE_URL}/v1/chat/completions"),
        };
        let request = ChatCompletionRequest {
            model: model_id.to_string(),
            messages: messages
                .iter()
                .map(|message| WireMessage {
                    role: match message.role {
                        adl_kernel::ConversationRole::System => "system",
                        adl_kernel::ConversationRole::User => "user",
                        adl_kernel::ConversationRole::Assistant => "assistant",
                        adl_kernel::ConversationRole::Tool => "tool",
                    }
                    .into(),
                    content: message.content.clone(),
                })
                .collect(),
            stream: false,
        };
        let response = self
            .client
            .post(url)
            .bearer_auth(api_key)
            .json(&request)
            .send()
            .await
            .map_err(|e| AppError::Model(e.to_string()))?;
        if !response.status().is_success() {
            return Err(AppError::Model(format!(
                "provider {provider:?} returned HTTP {}",
                response.status()
            )));
        }
        let body: ChatCompletionResponse =
            response.json().await.map_err(|e| AppError::Model(e.to_string()))?;
        let content =
            body.choices.first().map(|choice| choice.message.content.clone()).ok_or_else(|| {
                AppError::Model(format!("API returned empty choices array (model={model_id})"))
            })?;
        Ok(ModelResponse {
            provider_id: provider,
            model_id: body.model.unwrap_or_else(|| model_id.into()),
            content,
            synthetic: false,
            request_id: body.id,
            usage: body.usage.map(|usage| ModelTokenUsage {
                prompt_tokens: usage.prompt_tokens,
                completion_tokens: usage.completion_tokens,
                total_tokens: usage.total_tokens,
                estimated: Some(false),
            }),
            route: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gateway_routes_by_priority() {
        let gateway = ModelGateway::new(ModelPreferences::default()).unwrap();
        let route = gateway.route_chain();
        assert_eq!(route[0], ModelProviderId::Deepseek);
    }
}
