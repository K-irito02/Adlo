//! Permission ruleset domain HTTP handlers — migrated from
//! `src-tauri/src/commands/permission.rs` (`list_permission_rules`,
//! `add_permission_rule`, `delete_permission_rule`,
//! `set_permission_include_defaults`, `evaluate_permission`). The ruleset lives
//! in the app config on disk (`<data_dir>/config/config.json`), which the
//! standalone server owns via `state.data_dir`; an explicit `dataDir` in the
//! request body overrides it (matching the frontend `PermissionBridge`
//! contract). No events are emitted by the Tauri originals — faithful parity.
//!
//! Ruleset gating (`build_ruleset` / `evaluate_ruleset`) is provided by
//! `adl_kernel`; the rule-matching semantics (last matching rule wins, wildcard
//! `*` / `**` / `?`) are unchanged.

use crate::ServerState;
use crate::agent_loop;
use crate::ipc;
use adl_errors::AppError;
use adl_kernel::{build_ruleset, evaluate_ruleset};
use adl_types::permission_types::{PermissionDecision, PermissionRule};
use axum::extract::State;
use axum::response::IntoResponse;
use std::path::PathBuf;

/// POST `/permission/list` — the current ruleset config (covers
/// `PermissionBridge.listPermissionRules`).
pub async fn list_rules(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: DataDirBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let dir = data_dir(&state, input.data_dir);
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let config = adl_kernel::config::load(&dir)?;
        Ok(serde_json::to_value(config.permissions)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/permission/add` — append a custom rule and persist (covers
/// `PermissionBridge.addPermissionRule`).
pub async fn add_rule(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: AddRuleBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let dir = data_dir(&state, input.data_dir);
    let rule = input.rule;
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let mut config = adl_kernel::config::load(&dir)?;
        config.permissions.custom_rules.push(rule);
        adl_kernel::config::save(&dir, &config)?;
        Ok(serde_json::to_value(config.permissions)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/permission/delete` — remove a rule by index and persist (covers
/// `PermissionBridge.deletePermissionRule`). Out-of-range index → 404.
pub async fn delete_rule(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: DeleteRuleBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let dir = data_dir(&state, input.data_dir);
    let index = input.index;
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let mut config = adl_kernel::config::load(&dir)?;
        if index >= config.permissions.custom_rules.len() {
            return Err(AppError::NotFound(format!("Rule index {index} out of bounds")));
        }
        config.permissions.custom_rules.remove(index);
        adl_kernel::config::save(&dir, &config)?;
        Ok(serde_json::to_value(config.permissions)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/permission/include-defaults` — toggle the built-in safety ruleset and
/// persist (covers `PermissionBridge.setPermissionIncludeDefaults`).
pub async fn set_include_defaults(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: IncludeDefaultsBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let dir = data_dir(&state, input.data_dir);
    let include = input.include;
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let mut config = adl_kernel::config::load(&dir)?;
        config.permissions.include_defaults = include;
        adl_kernel::config::save(&dir, &config)?;
        Ok(serde_json::to_value(config.permissions)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/permission/evaluate` — decide Allow / Ask / Deny for a tool request
/// (covers `PermissionBridge.evaluatePermission`).
pub async fn evaluate(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: EvaluateBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let dir = data_dir(&state, input.data_dir);
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let config = adl_kernel::config::load(&dir)?;
        let ruleset =
            build_ruleset(&config.permissions.custom_rules, config.permissions.include_defaults);
        let decision: PermissionDecision =
            evaluate_ruleset(&ruleset, &input.tool_name, &input.command, &input.args);
        Ok(serde_json::to_value(decision)?)
    })
    .await;
    ipc::to_response(result)
}

// ─────────────────────────────────────────────────────────────────────────────
// Bodies / helpers
// ─────────────────────────────────────────────────────────────────────────────

/// Resolve the config data dir: an explicit body override wins, otherwise the
/// server's own `state.data_dir`.
fn data_dir(state: &ServerState, explicit: Option<String>) -> PathBuf {
    explicit.map(PathBuf::from).unwrap_or_else(|| state.data_dir.clone())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DataDirBody {
    #[serde(default)]
    data_dir: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddRuleBody {
    #[serde(default)]
    data_dir: Option<String>,
    rule: PermissionRule,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteRuleBody {
    #[serde(default)]
    data_dir: Option<String>,
    index: usize,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct IncludeDefaultsBody {
    #[serde(default)]
    data_dir: Option<String>,
    include: bool,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct EvaluateBody {
    #[serde(default)]
    data_dir: Option<String>,
    tool_name: String,
    command: String,
    args: Vec<String>,
}
