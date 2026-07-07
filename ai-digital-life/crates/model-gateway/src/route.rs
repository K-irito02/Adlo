// TODO: dual-path routing — provider chain (this file) and direct ACP/HTTP API path
// need to be unified under a single routing strategy. Currently the provider chain
// handles interactive sessions; the HTTP API path (crate::http_api) operates
// independently. These should share route config and fallback logic.

//! Provider routing — priority-ordered provider chain and provider selection.
//!
//! [`route_chain`] builds a sorted list of enabled providers by priority.
//! [`select_provider`] tries each provider in route order and returns the
//! first successful response or the last error.

use adl_kernel::{ModelChatMessage, ModelPreferences, ModelResponse};

use crate::fallback::default_model;
use crate::ModelGateway;

pub(crate) fn route_chain(preferences: &ModelPreferences) -> Vec<String> {
    let mut providers = preferences
        .providers
        .iter()
        .filter(|(_, pref)| pref.enabled)
        .map(|(provider, pref)| (provider.clone(), pref.priority))
        .collect::<Vec<_>>();
    providers.sort_by_key(|(_, priority)| *priority);
    providers.into_iter().map(|(provider, _)| provider).collect()
}

pub(crate) async fn select_provider(
    gateway: &ModelGateway,
    route: &[String],
    messages: &[ModelChatMessage],
) -> Result<(String, String, ModelResponse), Option<String>> {
    let mut last_error = None;
    for provider in route {
        let model_id = gateway
            .preferences()
            .providers
            .get(provider)
            .map(|pref| pref.model_id.clone())
            .unwrap_or_else(|| default_model(provider).to_string());
        match crate::provider::call_provider(gateway, provider, &model_id, messages).await {
            Ok(response) => return Ok((provider.clone(), model_id, response)),
            Err(error) => {
                last_error = Some(error.to_string());
            },
        }
    }
    Err(last_error)
}

/// Direct dispatch to a specific provider/model pair, bypassing the
/// priority-ordered route chain.
pub(crate) async fn select_provider_for_model(
    gateway: &ModelGateway,
    provider_id: &str,
    model_id: &str,
    messages: &[ModelChatMessage],
) -> Result<(String, String, ModelResponse), Option<String>> {
    match crate::provider::call_provider(gateway, provider_id, model_id, messages).await {
        Ok(response) => Ok((provider_id.to_string(), model_id.to_string(), response)),
        Err(error) => Err(Some(error.to_string())),
    }
}
