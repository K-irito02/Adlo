//! Reference-domain HTTP handlers — migrated from `src-tauri/src/commands/
//! reference.rs` (`reference_*` tauri commands). References live in the app
//! config file (`<data_dir>/config.json`); an explicit `dataDir` body override
//! wins, otherwise the standalone server owns `state.data_dir` (matching the
//! frontend `ReferenceBridge` contract and the custom_agent domain pattern).
//! No events are emitted by the Tauri originals — faithful parity.

use crate::ServerState;
use crate::agent_loop;
use crate::ipc;
use adl_context::references::{references_prompt, validate_reference};
use adl_errors::AppError;
use adl_types::reference::ReferenceConfig;
use axum::extract::State;
use axum::response::IntoResponse;
use std::path::PathBuf;

/// POST `/reference/list` — the configured references (covers
/// `ReferenceBridge.listReferences`).
pub async fn list(State(state): State<ServerState>, body: axum::body::Bytes) -> impl IntoResponse {
    let input: DataDirBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let dir = data_dir(&state, input.data_dir);
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let config = adl_kernel::config::load(&dir)?;
        Ok(serde_json::to_value(config.references)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/reference/add` — validate and append a reference (covers
/// `ReferenceBridge.addReference`).
pub async fn add(State(state): State<ServerState>, body: axum::body::Bytes) -> impl IntoResponse {
    let input: ReferenceBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    if let Err(e) = validate_reference(&input.reference) {
        return ipc::to_response(Err(e));
    }
    let dir = data_dir(&state, input.data_dir);
    let reference = input.reference;
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let mut config = adl_kernel::config::load(&dir)?;
        config.references.push(reference);
        adl_kernel::config::save(&dir, &config)?;
        Ok(serde_json::to_value(config.references)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/reference/remove` — remove a reference by name (covers
/// `ReferenceBridge.removeReference`).
pub async fn remove(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: RemoveBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let dir = data_dir(&state, input.data_dir);
    let name = input.name;
    let result = agent_loop::run_blocking(move || -> Result<serde_json::Value, AppError> {
        let mut config = adl_kernel::config::load(&dir)?;
        config.references.retain(|r| r.name != name);
        adl_kernel::config::save(&dir, &config)?;
        Ok(serde_json::to_value(config.references)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/reference/prompt` — the combined prompt text for enabled references
/// (covers `ReferenceBridge.getReferencesPrompt`).
pub async fn prompt(
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
        let prompt = references_prompt(&config.references);
        Ok(serde_json::to_value(prompt)?)
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
struct ReferenceBody {
    #[serde(default)]
    data_dir: Option<String>,
    reference: ReferenceConfig,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoveBody {
    #[serde(default)]
    data_dir: Option<String>,
    name: String,
}
