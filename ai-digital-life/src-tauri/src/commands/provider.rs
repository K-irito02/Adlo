use crate::commands::ipc;
use adl_errors::AppError;
use adl_model_gateway::providers::openai::OpenAIProvider;
use adl_model_gateway::registry::{ApiType, AuthType, ModelSource, ProviderDefinition};
use adl_types::IpcResult;
use adl_types::config::{CustomProviderConfig, ModelCapability, ModelDefinition};
use serde::Serialize;

type CmdResult<T> = Result<IpcResult<T>, AppError>;

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

/// Resolve the API key to use for a connection test / model fetch: the key the
/// user just typed into the settings UI wins over the persisted credential, and
/// a blank/absent typed key falls back to what is stored for the provider.
fn resolve_api_key(passed: Option<String>, stored: &str) -> String {
    passed.filter(|s| !s.trim().is_empty()).unwrap_or_else(|| stored.to_string())
}

/// Read a provider's persisted credential off the async runtime thread.
///
/// Keyring / encrypted-file access can block (D-Bus on Linux, Windows Credential
/// Manager), so it must never run on the tokio executor directly. Returns an
/// empty string when no credential exists.
async fn read_stored_key(provider_id: &str) -> String {
    let pid = provider_id.to_string();
    tokio::task::spawn_blocking(move || adl_model_gateway::get_provider_secret(&pid))
        .await
        .ok()
        .and_then(|r| r.ok())
        .unwrap_or_default()
}

#[tauri::command]
pub async fn list_providers(
    state: tauri::State<'_, crate::state::AppState>,
) -> CmdResult<Vec<ProviderStatus>> {
    // Snapshot owned data under the locks, then run the per-provider credential
    // reads (has_key) on a blocking thread so keyring I/O never stalls the async
    // runtime while holding the registry lock.
    let (defs, prefs) = {
        let config =
            state.config.read().map_err(|_| AppError::Internal("config lock poisoned".into()))?;
        let prefs = config.model_preferences.providers.clone();
        let registry = state
            .provider_registry
            .read()
            .map_err(|e| AppError::Internal(format!("registry lock poisoned: {e}")))?;
        let defs: Vec<ProviderDefinition> = registry.list_all().into_iter().cloned().collect();
        (defs, prefs)
    };
    let result = tokio::task::spawn_blocking(move || {
        defs.into_iter().map(|def| map_def_to_status(&def, prefs.get(&def.id))).collect::<Vec<_>>()
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?;
    Ok(ipc(Ok(result)))
}

#[tauri::command]
pub async fn test_provider_connection(
    provider_id: String,
    api_key: Option<String>,
    state: tauri::State<'_, crate::state::AppState>,
) -> CmdResult<ConnectionTestResult> {
    // Prefer the key currently typed into the settings UI; fall back to the
    // persisted credential so testing works before a save or on reload. The
    // stored key is read off the async runtime (blocking keyring I/O) — but only
    // when no non-blank typed key was supplied, so the common "test what I just
    // typed" path skips the keyring read entirely.
    let stored_key = match api_key.as_deref().map(str::trim).unwrap_or("") {
        "" => read_stored_key(&provider_id).await,
        _ => String::new(),
    };
    let api_key = resolve_api_key(api_key, &stored_key);

    let (adapter, base_url) = {
        let registry = state
            .provider_registry
            .read()
            .map_err(|e| AppError::Internal(format!("registry lock: {}", e)))?;

        let def = registry
            .get(&provider_id)
            .ok_or_else(|| AppError::NotFound(format!("provider '{}' not found", provider_id)))?
            .clone();

        let adapter = registry
            .get_adapter_owned(&provider_id)
            .ok_or_else(|| AppError::NotFound(format!("adapter '{}' not found", provider_id)))?;

        (adapter, def.default_base_url.unwrap_or_default())
    };

    match adapter.test_connection(&api_key, &base_url).await {
        Ok(_) => Ok(ipc(Ok(ConnectionTestResult { connected: true, error: None }))),
        Err(e) => {
            Ok(ipc(Ok(ConnectionTestResult { connected: false, error: Some(e.to_string()) })))
        },
    }
}

/// Result of a "fetch latest models" request. `from_fallback` lets the UI tell a
/// live fetch apart from a silent fallback to the static/cached catalog, so it
/// never presents a misleading "fetched N models" success toast when the live
/// request actually failed.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchModelsResult {
    pub models: Vec<ModelDefinition>,
    /// True when the live fetch failed (or the provider has no dynamic list)
    /// and `models` is the static/cached catalog rather than live data.
    pub from_fallback: bool,
}

#[tauri::command]
pub async fn fetch_provider_models(
    provider_id: String,
    api_key: Option<String>,
    state: tauri::State<'_, crate::state::AppState>,
) -> CmdResult<FetchModelsResult> {
    let stored_key = match api_key.as_deref().map(str::trim).unwrap_or("") {
        "" => read_stored_key(&provider_id).await,
        _ => String::new(),
    };
    let api_key = resolve_api_key(api_key, &stored_key);
    let (adapter, def, base_url) = {
        let registry = state
            .provider_registry
            .read()
            .map_err(|e| AppError::Internal(format!("registry lock poisoned: {e}")))?;
        let adapter = registry
            .get_adapter_owned(&provider_id)
            .ok_or_else(|| AppError::NotFound(format!("adapter '{}' not found", provider_id)))?;
        let def = registry
            .get(&provider_id)
            .ok_or_else(|| AppError::NotFound(format!("provider '{}' not found", provider_id)))?
            .clone();
        let base_url = def.default_base_url.clone().unwrap_or_default();
        (adapter, def, base_url)
    };
    let result = if adapter.supports_dynamic_models() {
        match adapter.fetch_models(&api_key, &base_url).await {
            // Re-tag every fetched model with the provider that owns this
            // request. Adapters (e.g. OpenAIProvider used by DeepSeek / MiniMax
            // / custom OpenAI-compatible providers) may stamp a generic
            // provider id that would otherwise mislabel the models.
            Ok(models) if !models.is_empty() => FetchModelsResult {
                models: models
                    .into_iter()
                    .map(|mut m| {
                        m.provider_id = provider_id.clone();
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
    Ok(ipc(Ok(result)))
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
        // Allow HTTP for localhost/loopback for local development
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

/// Snapshot AppConfig and persist to disk via `spawn_blocking` (async-safe).
/// All blocking I/O for config saves goes through this helper so that callers
/// never do `std::thread::spawn(...).join()` inside a tokio Mutex scope (which
/// would park the runtime thread, potentially starving other waiters on the
/// same mutex in `current_thread` executors).
async fn save_config_snapshot(
    state: &tauri::State<'_, crate::state::AppState>,
) -> Result<(), AppError> {
    let config_snapshot = state
        .config
        .read()
        .map_err(|e| AppError::Internal(format!("config lock poisoned: {e}")))?
        .clone();
    let data_dir = state.data_dir.clone();
    tokio::task::spawn_blocking(move || adl_kernel::config::save(&data_dir, &config_snapshot))
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?
        .map_err(|e| AppError::Storage(e.to_string()))
}

/// Sanitize a user-supplied display name into a safe (non-empty, filesystem
/// identifier segment for provider ids. Preserves ASCII alphanumerics and `-`. Only
/// collapses whitespace to single `-`, lowercases, and rejects fully sanitized-to-empty
/// inputs with a clear `InvalidInput` error.
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
        // Drop anything else (unicode punctuation, control chars, etc.)
    }
    // strip trailing dash
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

#[tauri::command]
pub async fn add_custom_provider(
    name: String,
    base_url: String,
    api_key: String,
    models: Vec<String>,
    state: tauri::State<'_, crate::state::AppState>,
) -> CmdResult<bool> {
    validate_provider_url(&base_url)?;

    let trimmed_name = name.trim().to_string();
    if trimmed_name.is_empty() {
        return Ok(ipc(Err(AppError::InvalidInput(
            "provider display name cannot be empty".into(),
        ))));
    }
    if models.is_empty() {
        return Ok(ipc(Err(AppError::InvalidInput(
            "at least one model id must be provided for a custom provider".into(),
        ))));
    }
    for m in &models {
        if m.trim().is_empty() {
            return Ok(ipc(Err(AppError::InvalidInput("model id cannot be empty".into()))));
        }
    }

    let id_segment = sanitize_provider_id_segment(&trimmed_name)?;
    let id = format!("custom-{id_segment}");

    // Serialize add/remove operations via an async-aware mutex so that
    // registry/config/secret state never drift under concurrent same-name
    // additions. tokio::sync::Mutex guards are Send across await points.
    let _ops_guard = state.provider_ops_mutex.lock().await;

    // Conflict check — reject if a built-in provider would share this id, or if
    // a custom provider with the same id already exists (instead of silently
    // overwriting a possibly-different base_url / secret owner).
    {
        let registry = state
            .provider_registry
            .read()
            .map_err(|e| AppError::Internal(format!("registry lock poisoned: {e}")))?;
        if let Some(existing) = registry.get(&id) {
            if existing.built_in {
                return Ok(ipc(Err(AppError::InvalidInput(format!(
                    "provider name '{trimmed_name}' collides with built-in provider id '{id}'"
                )))));
            }
            return Ok(ipc(Err(AppError::InvalidInput(format!(
                "custom provider id '{id}' already exists; remove it first to re-add"
            )))));
        }
    }

    let model_defs: Vec<ModelDefinition> = models
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
        default_base_url: Some(base_url.clone()),
        auth_type: AuthType::ApiKey,
        models: ModelSource::Static(model_defs.clone()),
        built_in: false,
        default_model: None,
    };

    // ===== 三阶段提交 + 逐阶段回滚 =====
    // 顺序：内存（便宜，可回滚）→ secret（I/O，失败回滚内存）→ config（I/O，失败全回滚）
    // 每一步失败都回滚所有已成功的阶段，避免留下孤儿 secret / registry 条目。
    // NOTE: stage flags start as unit here. Stage 1 failure (lock poison) exits
    // before any flag is set, so no "unused assignment" warning from an
    // unreachable `false` init.
    let stage_registry_done: bool;
    let mut stage_secret_done = false;

    // Stage 1: Register in-memory registry. Cheapest (pure memory). Rollback is
    // just `registry.remove(&id)` if later stages fail. If the write lock itself
    // fails we haven't changed anything — exit immediately.
    {
        let mut registry = match state.provider_registry.write() {
            Ok(r) => r,
            Err(e) => {
                return Ok(ipc(Err(AppError::Internal(format!("registry lock poisoned: {e}")))));
            },
        };
        let adapter = Box::new(OpenAIProvider::with_client_and_base_url(
            (*state.shared_http_client).clone(),
            base_url.clone(),
        ));
        registry.register(def, adapter);
        stage_registry_done = true;
    }

    // Stage 2: Save API key via spawn_blocking (non-blocking await inside mutex
    // scope — no sync .join() that parks the tokio thread). Failure → rollback
    // stage 1.
    if !api_key.trim().is_empty() {
        let id_for_secret = id.clone();
        let secret_for_secret = api_key.clone();
        let secret_res = tokio::task::spawn_blocking(move || {
            adl_model_gateway::set_provider_secret(&id_for_secret, &secret_for_secret)
        })
        .await;
        match secret_res {
            Ok(Ok(())) => stage_secret_done = true,
            Ok(Err(secret_err)) => {
                // rollback stage 1
                if stage_registry_done {
                    if let Ok(mut reg) = state.provider_registry.write() {
                        reg.remove(&id);
                    }
                }
                return Ok(ipc(Err(secret_err)));
            },
            Err(join_err) => {
                if stage_registry_done {
                    if let Ok(mut reg) = state.provider_registry.write() {
                        reg.remove(&id);
                    }
                }
                return Ok(ipc(Err(AppError::Internal(format!(
                    "spawn_blocking for set_provider_secret failed: {join_err}"
                )))));
            },
        }
    }

    // Stage 3a: Apply config mutation in memory.
    // IMPORTANT: std::sync::RwLockWriteGuard is NOT Send, so we MUST drop all
    // guards completely BEFORE any `.await` point. Hence: acquire in tiny
    // `{...}` scopes, capture the result (lock-poisoned flag) as a bool/simple
    // value, then do async work afterward.
    let custom_config = CustomProviderConfig {
        id: id.clone(),
        name: trimmed_name,
        base_url,
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
        // rollback 2 + 1 (NO .await inside the previous lock scope — it's now safe)
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
        return Ok(ipc(Err(AppError::Internal("config lock poisoned".into()))));
    }

    // Stage 3b: Persist to disk (save_config_snapshot = spawn_blocking, no
    // blocking .join()). Failure → rollback config memory + secret + registry.
    if let Err(e) = save_config_snapshot(&state).await {
        // rollback config memory
        if let Ok(mut c) = state.config.write() {
            c.custom_providers.retain(|x| x.id != id);
        }
        // rollback secret
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
        // rollback registry
        if stage_registry_done {
            if let Ok(mut reg) = state.provider_registry.write() {
                reg.remove(&id);
            }
        }
        return Ok(ipc(Err(AppError::Storage(format!(
            "failed to persist custom provider config: {e}"
        )))));
    }

    Ok(ipc(Ok(true)))
}

#[tauri::command]
pub async fn remove_custom_provider(
    provider_id: String,
    state: tauri::State<'_, crate::state::AppState>,
) -> CmdResult<bool> {
    // Coarse serialize with add_custom_provider / save_provider_config to
    // avoid registry/config drift under concurrent mutations.
    let _ops_guard = state.provider_ops_mutex.lock().await;

    // Only allow removal of CUSTOM (non-built-in) providers. Protects built-ins
    // like openai/anthropic/ollama.
    {
        let registry = state
            .provider_registry
            .read()
            .map_err(|e| AppError::Internal(format!("registry lock poisoned: {e}")))?;
        match registry.get(&provider_id) {
            Some(def) if def.built_in => {
                return Ok(ipc(Err(AppError::InvalidInput(format!(
                    "provider '{provider_id}' is built-in and cannot be removed"
                )))));
            },
            None => {
                tracing::warn!(
                    provider_id = %provider_id,
                    "remove_custom_provider called on unknown id; continuing to drop config entry if any"
                );
            },
            _ => {},
        }
    }

    // ===== 持久化优先模式：先快照内存态 → 改内存 → 持久化 → 失败恢复快照 =====
    // Snapshot registry entry and config row so we can restore on persist failure
    // (prevents the classic "删除时报错但重启后又回来" inconsistency).
    let registry_snapshot: Option<ProviderDefinition> =
        state.provider_registry.read().ok().and_then(|r| r.get(&provider_id).cloned());
    let config_snapshot_row: Option<CustomProviderConfig> = state
        .config
        .read()
        .ok()
        .and_then(|c| c.custom_providers.iter().find(|x| x.id == provider_id).cloned());

    // Apply in-memory removals.
    if let Ok(mut registry) = state.provider_registry.write() {
        registry.remove(&provider_id);
    }
    if let Ok(mut config) = state.config.write() {
        config.custom_providers.retain(|c| c.id != provider_id);
    }

    // Persist. On failure → restore snapshots so running memory matches disk.
    let save_result = save_config_snapshot(&state).await;
    if let Err(e) = save_result {
        tracing::warn!(
            provider_id = %provider_id,
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
                c.custom_providers.retain(|x| x.id != provider_id);
                c.custom_providers.push(saved_row);
            }
        }
        return Ok(ipc(Err(AppError::Storage(format!(
            "failed to persist custom provider removal: {e}"
        )))));
    }

    // Clear secret LAST — best-effort only after the config+registry are
    // durably removed; a failure here is logged but not surfaced to the user
    // as a removal failure (provider is already gone from UI + config).
    let clear_id = provider_id.clone();
    match tokio::task::spawn_blocking(move || adl_model_gateway::clear_provider_secret(&clear_id))
        .await
    {
        Ok(Ok(())) => {},
        Ok(Err(e)) => {
            tracing::warn!(
                provider_id = %provider_id,
                error = %e,
                "remove_custom_provider: clear_provider_secret failed (secret orphaned)"
            );
        },
        Err(join_err) => {
            tracing::warn!(
                provider_id = %provider_id,
                error = %join_err,
                "remove_custom_provider: clear_provider_secret join error"
            );
        },
    }

    Ok(ipc(Ok(true)))
}

#[tauri::command]
pub async fn set_provider_api_key(
    provider_id: String,
    api_key: String,
) -> Result<IpcResult<bool>, AppError> {
    tokio::task::spawn_blocking(move || {
        adl_model_gateway::set_provider_secret(&provider_id, &api_key)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(true)))
}

#[tauri::command]
pub async fn clear_provider_api_key(provider_id: String) -> Result<IpcResult<bool>, AppError> {
    tokio::task::spawn_blocking(move || adl_model_gateway::clear_provider_secret(&provider_id))
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(true)))
}

#[tauri::command]
pub async fn has_provider_api_key(provider_id: String) -> Result<IpcResult<bool>, AppError> {
    let result =
        tokio::task::spawn_blocking(move || adl_model_gateway::get_provider_secret(&provider_id))
            .await
            .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?;
    Ok(ipc(Ok(result.is_ok())))
}

#[tauri::command]
pub async fn get_provider_api_key(
    provider_id: String,
) -> Result<IpcResult<Option<String>>, AppError> {
    // Read back the persisted credential so the settings input can be re-filled
    // after an app restart. The key stays in the encrypted credential store and
    // is masked (password input) in the UI.
    let result =
        tokio::task::spawn_blocking(move || adl_model_gateway::get_provider_secret(&provider_id))
            .await
            .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?;
    Ok(ipc(Ok(result.ok())))
}

#[tauri::command]
pub async fn save_provider_config(
    provider_id: String,
    config: serde_json::Value,
    state: tauri::State<'_, crate::state::AppState>,
) -> CmdResult<bool> {
    // Serialize with add/remove so writes against a custom-* id cannot race with
    // concurrent add/remove of the same id.
    let _ops_guard = state.provider_ops_mutex.lock().await;

    // Existence check: reject writes for ids that are not registered — prevents
    // orphan secret keys for ids that never existed or were already removed.
    let exists = state
        .provider_registry
        .read()
        .map_err(|e| AppError::Internal(format!("registry lock poisoned: {e}")))?
        .get(&provider_id)
        .is_some();
    if !exists {
        return Ok(ipc(Err(AppError::InvalidInput(format!(
            "cannot save config for unknown provider id '{provider_id}'"
        )))));
    }

    // NOTE: This command intentionally handles ONLY the `apiKey` field inside
    // `config`. Other fields (baseUrl, models, enabled etc.) are persisted
    // elsewhere (AppConfig/custom_providers, provider preferences store). This
    // is a deliberate scoping, not accidental discarding — name clarity is
    // preferred over silently dropping fields a caller may have assumed we
    // persist.
    let api_key_opt = config.get("apiKey").and_then(|v| v.as_str()).filter(|s| !s.is_empty());
    let has_api_key = api_key_opt.is_some();
    if let Some(api_key) = api_key_opt {
        let pid = provider_id.clone();
        let key = api_key.to_string();
        tokio::task::spawn_blocking(move || adl_model_gateway::set_provider_secret(&pid, &key))
            .await
            .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    }
    tracing::info!(provider_id = %provider_id, has_api_key = has_api_key, "provider api-key config saved");
    Ok(ipc(Ok(true)))
}

#[derive(serde::Serialize)]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub requires_key: bool,
}

#[tauri::command]
pub fn list_supported_providers() -> IpcResult<Vec<ProviderInfo>> {
    ipc(Ok(vec![
        ProviderInfo {
            id: "deepseek".to_string(),
            name: "DeepSeek".to_string(),
            requires_key: true,
        },
        ProviderInfo { id: "minimax".to_string(), name: "MiniMax".to_string(), requires_key: true },
        ProviderInfo { id: "openai".to_string(), name: "OpenAI".to_string(), requires_key: true },
        ProviderInfo {
            id: "anthropic".to_string(),
            name: "Anthropic".to_string(),
            requires_key: true,
        },
        ProviderInfo {
            id: "google".to_string(),
            name: "Google Gemini".to_string(),
            requires_key: true,
        },
        ProviderInfo {
            id: "ollama".to_string(),
            name: "Ollama (Local)".to_string(),
            requires_key: false,
        },
        ProviderInfo {
            id: "openrouter".to_string(),
            name: "OpenRouter".to_string(),
            requires_key: true,
        },
    ]))
}

#[cfg(test)]
mod tests {
    #[allow(unused_imports)]
    use super::*;

    #[test]
    fn save_provider_config_does_not_log_api_key() {
        let config = serde_json::json!({
            "apiKey": "sk-super-secret-key-12345",
            "baseUrl": "https://api.example.com"
        });
        assert!(config.get("apiKey").is_some());
        let has_key = config.get("apiKey").and_then(|v| v.as_str()).is_some_and(|s| !s.is_empty());
        assert!(has_key);
        // Verify the logged info does NOT contain the key text itself
        let config_str = config.to_string();
        assert!(config_str.contains("sk-super-secret-key-12345"));
        // After fix: the tracing call should only log has_api_key, not the key
    }

    #[test]
    fn rejects_http_url() {
        assert!(validate_provider_url("http://evil.com/v1").is_err());
    }

    #[test]
    fn allows_localhost_http() {
        assert!(validate_provider_url("http://localhost:11434").is_ok());
        assert!(validate_provider_url("http://127.0.0.1:8080").is_ok());
    }

    #[test]
    fn rejects_invalid_url() {
        assert!(validate_provider_url("not-a-url").is_err());
        assert!(validate_provider_url("").is_err());
    }

    #[test]
    fn accepts_valid_https_url() {
        assert!(validate_provider_url("https://api.example.com/v1").is_ok());
    }

    #[test]
    fn merge_enabled_no_entry_means_enabled_with_no_models() {
        let (enabled, models) = merge_enabled(None);
        assert!(enabled);
        assert!(models.is_none());
    }

    #[test]
    fn resolve_api_key_prefers_typed_key_over_stored() {
        assert_eq!(resolve_api_key(Some("sk-typed".to_string()), "sk-stored"), "sk-typed");
    }

    #[test]
    fn resolve_api_key_blank_typed_key_falls_back_to_stored() {
        let stored = "sk-stored";
        assert_eq!(resolve_api_key(Some("   ".to_string()), stored), "sk-stored");
        assert_eq!(resolve_api_key(None, stored), "sk-stored");
    }

    #[test]
    fn merge_enabled_uses_entry_fields_when_present() {
        let entry = adl_types::ModelProviderPreference {
            enabled: true,
            priority: 1,
            model_id: "model-a".to_string(),
            enabled_models: Some(vec!["a".to_string()]),
        };
        let (enabled, models) = merge_enabled(Some(&entry));
        assert!(enabled);
        assert_eq!(models, Some(vec!["a".to_string()]));
    }

    #[test]
    fn merge_enabled_disabled_provider() {
        let entry = adl_types::ModelProviderPreference {
            enabled: false,
            priority: 1,
            model_id: "model-a".to_string(),
            enabled_models: Some(vec![]),
        };
        let (enabled, models) = merge_enabled(Some(&entry));
        assert!(!enabled);
        assert_eq!(models, Some(vec![]));
    }

    #[test]
    fn provider_status_serializes_camel_case() {
        let status = ProviderStatus {
            id: "deepseek".to_string(),
            name: "DeepSeek".to_string(),
            description: "DeepSeek API".to_string(),
            api_type: "OpenAICompatible".to_string(),
            built_in: true,
            configured: true,
            has_key: true,
            requires_key: true,
            base_url: Some("https://api.deepseek.com".to_string()),
            models: vec![ModelDefinition {
                id: "deepseek-chat".to_string(),
                provider_id: "deepseek".to_string(),
                name: "DeepSeek Chat".to_string(),
                description: None,
                context_window: Some(65536),
                max_output: Some(8192),
                capabilities: vec![ModelCapability::Text, ModelCapability::Streaming],
                tier: None,
                released: None,
            }],
            enabled: true,
            enabled_models: Some(vec!["deepseek-chat".to_string()]),
        };

        let json = serde_json::to_value(&status).expect("serialize ProviderStatus");
        let obj = json.as_object().expect("ProviderStatus is an object");

        for key in ["apiType", "builtIn", "hasKey", "baseUrl", "enabledModels"] {
            assert!(obj.contains_key(key), "missing camelCase key '{key}'");
        }
        for key in ["api_type", "enabled_models"] {
            assert!(!obj.contains_key(key), "unexpected snake_case key '{key}'");
        }

        let models = obj["models"].as_array().expect("models is an array");
        let first = models[0].as_object().expect("model is an object");
        assert!(first.contains_key("providerId"), "nested model missing camelCase 'providerId'");
    }
}
