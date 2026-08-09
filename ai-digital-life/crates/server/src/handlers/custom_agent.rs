//! Custom-agent registry domain HTTP handlers — migrated from
//! `src-tauri/src/commands/custom_agent.rs` (`list_custom_agents`,
//! `add_custom_agent`, `delete_custom_agent`, `update_custom_agent`). Custom
//! agents live in the app config on disk (`<data_dir>/config/config.json`),
//! which the standalone server owns via `state.data_dir`; an explicit `dataDir`
//! in the request body overrides it (matching the frontend `CustomAgentBridge`
//! contract). No events are emitted by the Tauri originals — faithful parity.

use crate::ServerState;
use crate::agent_loop;
use crate::ipc;
use adl_errors::AppError;
use adl_types::agent::AgentConfig;
use axum::extract::State;
use axum::response::IntoResponse;
use std::path::PathBuf;

/// POST `/custom-agent/list` — the registered custom agents (covers
/// `CustomAgentBridge.listCustomAgents`).
pub async fn list_agents(
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
        Ok(serde_json::to_value(config.custom_agents)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/custom-agent/add` — append a custom agent and persist (covers
/// `CustomAgentBridge.addCustomAgent`).
pub async fn add_agent(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: AgentBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let dir = data_dir(&state, input.data_dir);
    let agent = input.agent;
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let mut config = adl_kernel::config::load(&dir)?;
        config.custom_agents.push(agent);
        adl_kernel::config::save(&dir, &config)?;
        Ok(serde_json::to_value(config.custom_agents)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/custom-agent/delete` — remove a custom agent by name and persist
/// (covers `CustomAgentBridge.deleteCustomAgent`).
pub async fn delete_agent(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: DeleteBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let dir = data_dir(&state, input.data_dir);
    let name = input.name;
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let mut config = adl_kernel::config::load(&dir)?;
        config.custom_agents.retain(|a| a.name != name);
        adl_kernel::config::save(&dir, &config)?;
        Ok(serde_json::to_value(config.custom_agents)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/custom-agent/update` — replace a custom agent by its original name
/// (covers the Tauri `update_custom_agent`). Mutates the in-memory `state.config`
/// and persists it to disk. Unknown original name → 404.
pub async fn update_agent(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: UpdateBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let dir = data_dir(&state, input.data_dir);
    let original_name = input.original_name;
    let agent = input.agent;
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let mut config = adl_kernel::config::load(&dir)?;
        let found = config.custom_agents.iter_mut().find(|a| a.name == original_name);
        let existing = found.ok_or_else(|| {
            AppError::NotFound(format!("Custom agent '{}' not found", original_name))
        })?;
        *existing = agent;
        adl_kernel::config::save(&dir, &config)?;
        Ok(serde_json::json!(true))
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
struct AgentBody {
    #[serde(default)]
    data_dir: Option<String>,
    agent: AgentConfig,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteBody {
    #[serde(default)]
    data_dir: Option<String>,
    name: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateBody {
    #[serde(default)]
    data_dir: Option<String>,
    original_name: String,
    agent: AgentConfig,
}
