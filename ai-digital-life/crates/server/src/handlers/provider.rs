//! Provider domain HTTP handlers — migrated from `src-tauri/src/commands/
//! provider.rs`. Credential rule: API keys arrive in request bodies (matching
//! the old Tauri invoke payload and the frontend `ProviderBridge` contract) and
//! are handed straight to the credential store via
//! `adl_model_gateway::set_provider_secret` (keyring / encrypted file). Keys
//! are never persisted to config or DB and never logged; `get_provider_api_key`
//! is the only path that reads a key back, on demand, for the masked settings
//! input.

use crate::ServerState;
use crate::ipc;
use adl_errors::AppError;
use adl_model_gateway::providers::openai::OpenAIProvider;
use adl_model_gateway::registry::{ApiType, AuthType, ModelSource, ProviderDefinition};
use adl_types::config::{CustomProviderConfig, ModelCapability, ModelDefinition};
use axum::extract::State;
use axum::response::IntoResponse;
use serde::Serialize;

/// Run a blocking closure and collapse the `spawn_blocking` join error into an
/// `AppError::Internal`. Keeps every handler free of the `?` operator so the
/// `impl IntoResponse` signature stays a plain `(StatusCode, Json<Value>)`.
async fn run_blocking<T, F>(f: F) -> Result<T, AppError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, AppError> + Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    pub id: String,
    pub name: String,
    pub description: String,
    pub api_type: String,
    pub built_in: bool,
    pub configured: bool,
    pub has_key: bool,
    pub requires_key: bool,
    pub base_url: Option<String>,
    pub models: Vec<ModelDefinition>,
    pub enabled: bool,
    pub enabled_models: Option<Vec<String>>,
}

#[derive(Serialize)]
pub struct ConnectionTestResult {
    pub connected: bool,
    pub error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchModelsResult {
    pub models: Vec<ModelDefinition>,
    pub from_fallback: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub requires_key: bool,
}

fn merge_enabled(
    entry: Option<&adl_types::ModelProviderPreference>,
) -> (bool, Option<Vec<String>>) {
    match entry {
        Some(e) => (e.enabled, e.enabled_models.clone()),
        None => (true, None),
    }
}

fn map_def_to_status(
    def: &ProviderDefinition,
    pref: Option<&adl_types::ModelProviderPreference>,
) -> ProviderStatus {
    let models = match &def.models {
        ModelSource::Static(list) => list.clone(),
        ModelSource::Dynamic { .. } => vec![],
    };
    let (enabled, enabled_models) = merge_enabled(pref);
    let has_key = adl_model_gateway::get_provider_secret(&def.id).is_ok();
    let configured = def.id == "ollama" || has_key;
    ProviderStatus {
        id: def.id.clone(),
        name: def.name.clone(),
        description: def.description.clone(),
        api_type: format!("{:?}", def.api_type),
        built_in: def.built_in,
        configured,
        has_key,
        requires_key: matches!(def.auth_type, adl_model_gateway::registry::AuthType::ApiKey),
        base_url: def.default_base_url.clone(),
        models,
        enabled,
        enabled_models,
    }
}

fn fallback_models(def: &ProviderDefinition) -> Vec<ModelDefinition> {
    match &def.models {
        ModelSource::Static(list) => list.clone(),
        ModelSource::Dynamic { .. } => vec![],
    }
}

/// The key the user just typed wins over the persisted credential; a
/// blank/absent typed key falls back to what is stored for the provider.
fn resolve_api_key(passed: Option<String>, stored: &str) -> String {
    passed.filter(|s| !s.trim().is_empty()).unwrap_or_else(|| stored.to_string())
}

/// Read a provider's persisted credential off the async runtime thread
/// (keyring / encrypted-file access can block). Empty string when absent.
async fn read_stored_key(provider_id: &str) -> String {
    let pid = provider_id.to_string();
    tokio::task::spawn_blocking(move || adl_model_gateway::get_provider_secret(&pid))
        .await
        .ok()
        .and_then(|r| r.ok())
        .unwrap_or_default()
}

/// Snapshot AppConfig and persist to disk via `spawn_blocking` (async-safe).
async fn save_config_snapshot(state: &ServerState) -> Result<(), AppError> {
    let config_snapshot = state
        .config
        .read()
        .map_err(|e| AppError::Internal(format!("config lock poisoned: {e}")))?
        .clone();
    let data_dir = state.data_dir.clone();
    run_blocking(move || adl_kernel::config::save(&data_dir, &config_snapshot))
        .await
        .map_err(|e| AppError::Storage(e.to_string()))
}

fn validate_provider_url(url: &str) -> Result<(), AppError> {
    let parsed = url::Url::parse(url)
        .map_err(|e| AppError::InvalidInput(format!("invalid provider URL: {e}")))?;
    // Strip any embedded userinfo (username/password in URL) since secrets must be
    // passed via the api_key parameter, not smuggled inside the base URL.
    if parsed.username() != "" || parsed.password().is_some() {
        return Err(AppError::InvalidInput(
            "provider URL must not contain username/password; pass API key separately".into(),
        ));
    }
    if parsed.scheme() != "https" {
        // Allow HTTP for localhost/loopback for local development.
        if let Some(host) = parsed.host_str() {
            if host == "localhost" || host == "127.0.0.1" || host == "[::1]" {
                return Ok(());
            }
        }
        return Err(AppError::InvalidInput(
            "provider URL must use HTTPS scheme (except localhost)".into(),
        ));
    }
    if parsed.host_str().is_none() {
        return Err(AppError::InvalidInput("provider URL must include a hostname".into()));
    }
    Ok(())
}

/// Sanitize a user-supplied display name into a safe filesystem identifier
/// segment for provider ids.
fn sanitize_provider_id_segment(raw: &str) -> Result<String, AppError> {
    let lower = raw.to_lowercase();
    let mut sanitized = String::with_capacity(lower.len());
    let mut prev_dash = false;
    for ch in lower.chars() {
        if ch.is_ascii_alphanumeric() {
            sanitized.push(ch);
            prev_dash = false;
        } else if (ch.is_whitespace() || ch == '-' || ch == '_')
            && !prev_dash
            && !sanitized.is_empty()
        {
            sanitized.push('-');
            prev_dash = true;
        }
    }
    while sanitized.ends_with('-') {
        sanitized.pop();
    }
    if sanitized.is_empty() {
        return Err(AppError::InvalidInput(
            "provider name has no valid id characters; use at least one ASCII letter or digit"
                .into(),
        ));
    }
    Ok(sanitized)
}

// ─────────────────────────────────────────────────────────────────────────────
// Bodies
// ─────────────────────────────────────────────────────────────────────────────

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProviderIdBody {
    provider_id: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProviderKeyBody {
    provider_id: String,
    api_key: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddCustomProviderBody {
    name: String,
    base_url: String,
    api_key: String,
    models: Vec<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetApiKeyBody {
    provider_id: String,
    api_key: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveProviderConfigBody {
    provider_id: String,
    config: serde_json::Value,
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

/// GET `/provider/list` — registry statuses with credential availability.
pub async fn list_providers(State(state): State<ServerState>) -> impl IntoResponse {
    let (defs, prefs) = {
        let config = match state.config.read() {
            Ok(g) => g,
            Err(e) => {
                return ipc::to_response(Err(AppError::Internal(format!(
                    "config lock poisoned: {e}"
                ))));
            },
        };
        let prefs = config.model_preferences.providers.clone();
        let registry = match state.provider_registry.read() {
            Ok(r) => r,
            Err(e) => {
                return ipc::to_response(Err(AppError::Internal(format!(
                    "registry lock poisoned: {e}"
                ))));
            },
        };
        let defs: Vec<ProviderDefinition> = registry.list_all().into_iter().cloned().collect();
        (defs, prefs)
    };
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let statuses: Vec<ProviderStatus> =
            defs.iter().map(|def| map_def_to_status(def, prefs.get(&def.id))).collect();
        Ok(serde_json::to_value(statuses)?)
    })
    .await;
    ipc::to_response(result)
}

/// GET `/provider/supported` — the static provider info list.
pub async fn list_supported_providers(State(_state): State<ServerState>) -> impl IntoResponse {
    let infos = vec![
        ProviderInfo { id: "deepseek".into(), name: "DeepSeek".into(), requires_key: true },
        ProviderInfo { id: "minimax".into(), name: "MiniMax".into(), requires_key: true },
        ProviderInfo { id: "openai".into(), name: "OpenAI".into(), requires_key: true },
        ProviderInfo { id: "anthropic".into(), name: "Anthropic".into(), requires_key: true },
        ProviderInfo { id: "google".into(), name: "Google Gemini".into(), requires_key: true },
        ProviderInfo { id: "ollama".into(), name: "Ollama (Local)".into(), requires_key: false },
        ProviderInfo { id: "openrouter".into(), name: "OpenRouter".into(), requires_key: true },
    ];
    let value = match serde_json::to_value(&infos) {
        Ok(v) => v,
        Err(e) => return ipc::to_response(Err(AppError::from(e))),
    };
    ipc::to_response(Ok(value))
}

/// POST `/provider/test-connection`.
pub async fn test_connection(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: ProviderKeyBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = test_connection_inner(&state, input).await;
    ipc::to_response(result)
}

async fn test_connection_inner(
    state: &ServerState,
    input: ProviderKeyBody,
) -> Result<serde_json::Value, AppError> {
    let stored_key = match input.api_key.as_deref().map(str::trim).unwrap_or("") {
        "" => read_stored_key(&input.provider_id).await,
        _ => String::new(),
    };
    let api_key = resolve_api_key(input.api_key, &stored_key);
    let (adapter, base_url) = {
        let registry = state
            .provider_registry
            .read()
            .map_err(|e| AppError::Internal(format!("registry lock: {e}")))?;
        let def = registry
            .get(&input.provider_id)
            .ok_or_else(|| {
                AppError::NotFound(format!("provider '{}' not found", input.provider_id))
            })?
            .clone();
        let adapter = registry.get_adapter_owned(&input.provider_id).ok_or_else(|| {
            AppError::NotFound(format!("adapter '{}' not found", input.provider_id))
        })?;
        (adapter, def.default_base_url.unwrap_or_default())
    };
    let conn = match adapter.test_connection(&api_key, &base_url).await {
        Ok(_) => ConnectionTestResult { connected: true, error: None },
        Err(e) => ConnectionTestResult { connected: false, error: Some(e.to_string()) },
    };
    Ok(serde_json::to_value(&conn)?)
}

/// POST `/provider/fetch-models`.
pub async fn fetch_models(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: ProviderKeyBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = fetch_models_inner(&state, input).await;
    ipc::to_response(result)
}

async fn fetch_models_inner(
    state: &ServerState,
    input: ProviderKeyBody,
) -> Result<serde_json::Value, AppError> {
    let stored_key = match input.api_key.as_deref().map(str::trim).unwrap_or("") {
        "" => read_stored_key(&input.provider_id).await,
        _ => String::new(),
    };
    let api_key = resolve_api_key(input.api_key, &stored_key);
    let (adapter, def, base_url) = {
        let registry = state
            .provider_registry
            .read()
            .map_err(|e| AppError::Internal(format!("registry lock poisoned: {e}")))?;
        let adapter = registry.get_adapter_owned(&input.provider_id).ok_or_else(|| {
            AppError::NotFound(format!("adapter '{}' not found", input.provider_id))
        })?;
        let def = registry
            .get(&input.provider_id)
            .ok_or_else(|| {
                AppError::NotFound(format!("provider '{}' not found", input.provider_id))
            })?
            .clone();
        let base_url = def.default_base_url.clone().unwrap_or_default();
        (adapter, def, base_url)
    };
    let result = if adapter.supports_dynamic_models() {
        match adapter.fetch_models(&api_key, &base_url).await {
            Ok(models) if !models.is_empty() => FetchModelsResult {
                models: models
                    .into_iter()
                    .map(|mut m| {
                        m.provider_id = input.provider_id.clone();
                        m
                    })
                    .collect(),
                from_fallback: false,
            },
            _ => FetchModelsResult { models: fallback_models(&def), from_fallback: true },
        }
    } else {
        FetchModelsResult { models: fallback_models(&def), from_fallback: true }
    };
    Ok(serde_json::to_value(&result)?)
}

/// POST `/provider/custom` — add a custom provider (three-stage commit with
/// rollback, faithful port of the Tauri `add_custom_provider`).
pub async fn add_custom_provider(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: AddCustomProviderBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = add_custom_provider_inner(&state, input).await;
    ipc::to_response(result)
}

async fn add_custom_provider_inner(
    state: &ServerState,
    input: AddCustomProviderBody,
) -> Result<serde_json::Value, AppError> {
    validate_provider_url(&input.base_url)?;

    let trimmed_name = input.name.trim().to_string();
    if trimmed_name.is_empty() {
        return Err(AppError::InvalidInput("provider display name cannot be empty".into()));
    }
    if input.models.is_empty() {
        return Err(AppError::InvalidInput(
            "at least one model id must be provided for a custom provider".into(),
        ));
    }
    for m in &input.models {
        if m.trim().is_empty() {
            return Err(AppError::InvalidInput("model id cannot be empty".into()));
        }
    }

    let id_segment = sanitize_provider_id_segment(&trimmed_name)?;
    let id = format!("custom-{id_segment}");

    // Serialize add/remove operations via an async-aware mutex.
    let _ops_guard = state.provider_ops_mutex.lock().await;

    // Conflict check.
    {
        let registry = state
            .provider_registry
            .read()
            .map_err(|e| AppError::Internal(format!("registry lock poisoned: {e}")))?;
        if let Some(existing) = registry.get(&id) {
            if existing.built_in {
                return Err(AppError::InvalidInput(format!(
                    "provider name '{trimmed_name}' collides with built-in provider id '{id}'"
                )));
            }
            return Err(AppError::InvalidInput(format!(
                "custom provider id '{id}' already exists; remove it first to re-add"
            )));
        }
    }

    let model_defs: Vec<ModelDefinition> = input
        .models
        .into_iter()
        .map(|m| {
            let mid = m.trim().to_string();
            ModelDefinition {
                id: mid.clone(),
                provider_id: id.clone(),
                name: mid,
                description: None,
                context_window: None,
                max_output: None,
                capabilities: vec![ModelCapability::Text],
                tier: None,
                released: None,
            }
        })
        .collect();

    let def = ProviderDefinition {
        id: id.clone(),
        name: trimmed_name.clone(),
        description: format!("Custom OpenAI-compatible: {trimmed_name}"),
        api_type: ApiType::OpenAICompatible,
        default_base_url: Some(input.base_url.clone()),
        auth_type: AuthType::ApiKey,
        models: ModelSource::Static(model_defs.clone()),
        built_in: false,
        default_model: None,
    };

    // Three-stage commit with per-stage rollback.
    let stage_registry_done: bool;
    let mut stage_secret_done = false;

    // Stage 1: register in-memory registry.
    {
        let mut registry = match state.provider_registry.write() {
            Ok(r) => r,
            Err(e) => {
                return Err(AppError::Internal(format!("registry lock poisoned: {e}")));
            },
        };
        let adapter = Box::new(OpenAIProvider::with_client_and_base_url(
            (*state.shared_http_client).clone(),
            input.base_url.clone(),
        ));
        registry.register(def, adapter);
        stage_registry_done = true;
    }

    // Stage 2: save API key via spawn_blocking. Failure → rollback stage 1.
    if !input.api_key.trim().is_empty() {
        let id_for_secret = id.clone();
        let secret_for_secret = input.api_key.clone();
        let secret_res = tokio::task::spawn_blocking(move || {
            adl_model_gateway::set_provider_secret(&id_for_secret, &secret_for_secret)
        })
        .await;
        match secret_res {
            Ok(Ok(())) => stage_secret_done = true,
            Ok(Err(secret_err)) => {
                if stage_registry_done {
                    if let Ok(mut reg) = state.provider_registry.write() {
                        reg.remove(&id);
                    }
                }
                return Err(secret_err);
            },
            Err(join_err) => {
                if stage_registry_done {
                    if let Ok(mut reg) = state.provider_registry.write() {
                        reg.remove(&id);
                    }
                }
                return Err(AppError::Internal(format!(
                    "spawn_blocking for set_provider_secret failed: {join_err}"
                )));
            },
        }
    }

    // Stage 3a: apply config mutation in memory (guards dropped before await).
    let custom_config = CustomProviderConfig {
        id: id.clone(),
        name: trimmed_name,
        base_url: input.base_url,
        models: model_defs.into_iter().map(|m| m.id).collect(),
        created_at: adl_types::now_ms(),
    };
    let config_apply_ok: bool = {
        match state.config.write() {
            Ok(mut config) => {
                config.custom_providers.retain(|c| c.id != id);
                config.custom_providers.push(custom_config);
                true
            },
            Err(_) => false,
        }
    };
    if !config_apply_ok {
        if stage_secret_done {
            let cid = id.clone();
            let _ =
                tokio::task::spawn_blocking(move || adl_model_gateway::clear_provider_secret(&cid))
                    .await;
        }
        if stage_registry_done {
            if let Ok(mut reg) = state.provider_registry.write() {
                reg.remove(&id);
            }
        }
        return Err(AppError::Internal("config lock poisoned".into()));
    }

    // Stage 3b: persist to disk. Failure → rollback config + secret + registry.
    if let Err(e) = save_config_snapshot(state).await {
        if let Ok(mut c) = state.config.write() {
            c.custom_providers.retain(|x| x.id != id);
        }
        if stage_secret_done {
            let clear_id = id.clone();
            match tokio::task::spawn_blocking(move || {
                adl_model_gateway::clear_provider_secret(&clear_id)
            })
            .await
            {
                Ok(Ok(())) => {},
                other => {
                    tracing::warn!(
                        provider_id = %id,
                        result = ?other,
                        "add_custom_provider config-save rollback: clear_provider_secret failed"
                    );
                },
            }
        }
        if stage_registry_done {
            if let Ok(mut reg) = state.provider_registry.write() {
                reg.remove(&id);
            }
        }
        return Err(AppError::Storage(format!("failed to persist custom provider config: {e}")));
    }

    Ok(serde_json::json!(true))
}

/// POST `/provider/custom/remove` — remove a custom provider and its secret.
pub async fn remove_custom_provider(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: ProviderIdBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = remove_custom_provider_inner(&state, input).await;
    ipc::to_response(result)
}

async fn remove_custom_provider_inner(
    state: &ServerState,
    input: ProviderIdBody,
) -> Result<serde_json::Value, AppError> {
    let _ops_guard = state.provider_ops_mutex.lock().await;

    {
        let registry = state
            .provider_registry
            .read()
            .map_err(|e| AppError::Internal(format!("registry lock poisoned: {e}")))?;
        match registry.get(&input.provider_id) {
            Some(def) if def.built_in => {
                return Err(AppError::InvalidInput(format!(
                    "provider '{}' is built-in and cannot be removed",
                    input.provider_id
                )));
            },
            None => {
                tracing::warn!(
                    provider_id = %input.provider_id,
                    "remove_custom_provider called on unknown id; continuing to drop config entry if any"
                );
            },
            _ => {},
        }
    }

    // Snapshot registry entry + config row so in-memory state can be restored if
    // the disk persist fails.
    let registry_snapshot: Option<ProviderDefinition> =
        state.provider_registry.read().ok().and_then(|r| r.get(&input.provider_id).cloned());
    let config_snapshot_row: Option<CustomProviderConfig> = state
        .config
        .read()
        .ok()
        .and_then(|c| c.custom_providers.iter().find(|x| x.id == input.provider_id).cloned());

    if let Ok(mut registry) = state.provider_registry.write() {
        registry.remove(&input.provider_id);
    }
    if let Ok(mut config) = state.config.write() {
        config.custom_providers.retain(|c| c.id != input.provider_id);
    }

    let save_result = save_config_snapshot(state).await;
    if let Err(e) = save_result {
        tracing::warn!(
            provider_id = %input.provider_id,
            error = %e,
            "remove_custom_provider: config save failed; rolling back in-memory state to match disk"
        );
        if let Some(saved_def) = registry_snapshot {
            if let Ok(mut reg) = state.provider_registry.write() {
                if let Some(base_url) = &saved_def.default_base_url {
                    let adapter = Box::new(OpenAIProvider::with_client_and_base_url(
                        (*state.shared_http_client).clone(),
                        base_url.clone(),
                    ));
                    reg.register(saved_def, adapter);
                }
            }
        }
        if let Some(saved_row) = config_snapshot_row {
            if let Ok(mut c) = state.config.write() {
                c.custom_providers.retain(|x| x.id != input.provider_id);
                c.custom_providers.push(saved_row);
            }
        }
        return Err(AppError::Storage(format!("failed to persist custom provider removal: {e}")));
    }

    // Clear secret LAST — best-effort only after the config+registry are durably
    // removed; a failure here is logged but not surfaced as a removal failure.
    let clear_id = input.provider_id.clone();
    match tokio::task::spawn_blocking(move || adl_model_gateway::clear_provider_secret(&clear_id))
        .await
    {
        Ok(Ok(())) => {},
        Ok(Err(e)) => {
            tracing::warn!(
                provider_id = %input.provider_id,
                error = %e,
                "remove_custom_provider: clear_provider_secret failed (secret orphaned)"
            );
        },
        Err(join_err) => {
            tracing::warn!(
                provider_id = %input.provider_id,
                error = %join_err,
                "remove_custom_provider: clear_provider_secret join error"
            );
        },
    }

    Ok(serde_json::json!(true))
}

/// POST `/provider/api-key` — store an API key in the credential store.
pub async fn set_api_key(
    State(_state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: SetApiKeyBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let provider_id = input.provider_id;
    let api_key = input.api_key;
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        adl_model_gateway::set_provider_secret(&provider_id, &api_key)?;
        Ok(serde_json::json!(true))
    })
    .await;
    ipc::to_response(result)
}

/// POST `/provider/api-key/clear` — remove an API key from the credential store.
pub async fn clear_api_key(
    State(_state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: ProviderIdBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let provider_id = input.provider_id;
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        adl_model_gateway::clear_provider_secret(&provider_id)?;
        Ok(serde_json::json!(true))
    })
    .await;
    ipc::to_response(result)
}

/// POST `/provider/api-key/has` — whether a credential exists for the provider.
pub async fn has_api_key(
    State(_state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: ProviderIdBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let provider_id = input.provider_id;
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let present = adl_model_gateway::get_provider_secret(&provider_id).is_ok();
        Ok(serde_json::json!(present))
    })
    .await;
    ipc::to_response(result)
}

/// POST `/provider/api-key/get` — read the persisted credential back so the
/// settings input can be re-filled (masked) after an app restart.
pub async fn get_api_key(
    State(_state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: ProviderIdBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let provider_id = input.provider_id;
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let key = adl_model_gateway::get_provider_secret(&provider_id).ok();
        Ok(serde_json::to_value(key)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/provider/config` — save the `apiKey` field of a provider config into
/// the credential store (other config fields are persisted elsewhere).
pub async fn save_provider_config(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: SaveProviderConfigBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let result = save_provider_config_inner(&state, input).await;
    ipc::to_response(result)
}

async fn save_provider_config_inner(
    state: &ServerState,
    input: SaveProviderConfigBody,
) -> Result<serde_json::Value, AppError> {
    let _ops_guard = state.provider_ops_mutex.lock().await;

    let exists = state
        .provider_registry
        .read()
        .map_err(|e| AppError::Internal(format!("registry lock poisoned: {e}")))?
        .get(&input.provider_id)
        .is_some();
    if !exists {
        return Err(AppError::InvalidInput(format!(
            "cannot save config for unknown provider id '{}'",
            input.provider_id
        )));
    }

    // This command intentionally handles ONLY the `apiKey` field inside `config`.
    let api_key_opt = input.config.get("apiKey").and_then(|v| v.as_str()).filter(|s| !s.is_empty());
    let has_api_key = api_key_opt.is_some();
    if let Some(api_key) = api_key_opt {
        let pid = input.provider_id.clone();
        let key = api_key.to_string();
        run_blocking(move || adl_model_gateway::set_provider_secret(&pid, &key)).await?;
    }
    tracing::info!(
        provider_id = %input.provider_id,
        has_api_key = has_api_key,
        "provider api-key config saved"
    );
    Ok(serde_json::json!(true))
}
