// TODO: dual-path routing — provider chain (this file) and direct ACP/HTTP API path
// need to be unified under a single routing strategy. Currently the provider chain
// handles interactive sessions; the HTTP API path (crate::http_api) operates
// independently. These should share route config and fallback logic.

//! Provider routing — priority-ordered provider chain and provider selection.
//!
//! [`route_chain`] builds a sorted list of enabled providers by priority.
//! [`select_provider`] tries each provider in route order and returns the
//! first successful response or the last error.

use adl_types::{ModelChatMessage, ModelPreferences, ModelResponse};
use adl_types::config::ModelProviderPreference;

use crate::ModelGateway;
use crate::fallback::default_model;

/// 解析某 provider 的实际路由模型 id，并对 per-model 禁用做强制校验。
///
/// 三态 `enabled_models`：
/// - `None`（全部启用）→ 使用 `pref.model_id`；
/// - `Some(list)` 且 `pref.model_id` 在白名单内 → 使用 `pref.model_id`；
/// - `Some(list)` 且 `pref.model_id` 不在白名单内 → 回退到白名单首个模型；
/// - `Some(empty)`（全部关闭）→ `None`，该 provider 不可路由。
pub(crate) fn resolve_model_id(pref: &ModelProviderPreference) -> Option<String> {
    match &pref.enabled_models {
        None => Some(pref.model_id.clone()),
        Some(list) if list.is_empty() => None,
        Some(list) if list.contains(&pref.model_id) => Some(pref.model_id.clone()),
        Some(list) => Some(list[0].clone()),
    }
}

pub(crate) fn route_chain(preferences: &ModelPreferences) -> Vec<String> {
    let mut providers = preferences
        .providers
        .iter()
        .filter(|(_, pref)| pref.enabled && resolve_model_id(pref).is_some())
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
        let model_id = match gateway.registry.read() {
            Ok(reg) => {
                let pref = gateway.preferences().providers.get(provider);
                match pref {
                    Some(pref) => resolve_model_id(pref),
                    None => Some(default_model(provider, &reg)),
                }
            },
            Err(_) => return Err(Some("provider registry lock poisoned".to_string())),
        };
        let Some(model_id) = model_id else {
            // 全部模型关闭 → 跳过该 provider
            continue;
        };
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
/// priority-ordered route chain. 对 per-model 禁用做强制校验：
/// 若 `enabled_models` 为显式白名单且 `model_id` 不在其中，拒绝路由。
pub(crate) async fn select_provider_for_model(
    gateway: &ModelGateway,
    provider_id: &str,
    model_id: &str,
    messages: &[ModelChatMessage],
) -> Result<(String, String, ModelResponse), Option<String>> {
    let allowed = match gateway.preferences().providers.get(provider_id) {
        Some(pref) => match &pref.enabled_models {
            None => true,
            Some(list) => !list.is_empty() && list.iter().any(|m| m == model_id),
        },
        None => true,
    };
    if !allowed {
        return Err(Some(format!(
            "model '{model_id}' is disabled for provider '{provider_id}'"
        )));
    }
    match crate::provider::call_provider(gateway, provider_id, model_id, messages).await {
        Ok(response) => Ok((provider_id.to_string(), model_id.to_string(), response)),
        Err(error) => Err(Some(error.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pref(enabled_models: Option<Vec<&str>>) -> ModelProviderPreference {
        ModelProviderPreference {
            enabled: true,
            priority: 1,
            model_id: "default-model".to_string(),
            enabled_models: enabled_models.map(|v| v.into_iter().map(String::from).collect()),
        }
    }

    #[test]
    fn resolve_none_uses_model_id() {
        assert_eq!(
            resolve_model_id(&pref(None)),
            Some("default-model".to_string())
        );
    }

    #[test]
    fn resolve_list_containing_model_id_uses_it() {
        assert_eq!(
            resolve_model_id(&pref(Some(vec!["default-model", "other"]))),
            Some("default-model".to_string())
        );
    }

    #[test]
    fn resolve_list_without_model_id_falls_back_to_first() {
        assert_eq!(
            resolve_model_id(&pref(Some(vec!["a", "b"]))),
            Some("a".to_string())
        );
    }

    #[test]
    fn resolve_empty_list_is_not_routable() {
        assert_eq!(resolve_model_id(&pref(Some(vec![]))), None);
    }

    #[test]
    fn route_chain_excludes_fully_closed_providers() {
        let mut prefs = ModelPreferences::default();
        let deepseek = prefs.providers.get_mut("deepseek").unwrap();
        deepseek.enabled_models = Some(vec![]);
        let route = route_chain(&prefs);
        assert!(!route.contains(&"deepseek".to_string()));
        assert!(route.contains(&"minimax".to_string()));
    }
}
