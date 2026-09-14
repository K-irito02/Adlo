use crate::ServerState;
use crate::ipc;
use adl_errors::AppError;
use adl_types::reference::ReferenceConfig;
use axum::extract::State;
use axum::response::IntoResponse;
use std::path::PathBuf;

pub async fn list(State(state): State<ServerState>, body: axum::body::Bytes) -> impl IntoResponse {
    let input: DataDirBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let dir = config_dir(&state, input.data_dir);
    let result = tokio::task::spawn_blocking(move || -> Result<serde_json::Value, AppError> {
        let config = adl_kernel::config::load_from(&dir)?;
        Ok(serde_json::to_value(config.references)?)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")));
    match result {
        Ok(inner) => ipc::to_response(inner),
        Err(e) => ipc::to_response(Err(e)),
    }
}

pub async fn add(State(state): State<ServerState>, body: axum::body::Bytes) -> impl IntoResponse {
    let input: ReferenceBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let dir = config_dir(&state, input.data_dir);
    let reference = input.reference;
    let result = tokio::task::spawn_blocking(move || -> Result<serde_json::Value, AppError> {
        let mut config = adl_kernel::config::load_from(&dir)?;
        config.references.push(reference);
        adl_kernel::config::save_to(&dir, &config)?;
        Ok(serde_json::to_value(config.references)?)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")));
    match result {
        Ok(inner) => ipc::to_response(inner),
        Err(e) => ipc::to_response(Err(e)),
    }
}

pub async fn remove(
    State(state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: RemoveBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let dir = config_dir(&state, input.data_dir);
    let name = input.name;
    let result = tokio::task::spawn_blocking(move || -> Result<serde_json::Value, AppError> {
        let mut config = adl_kernel::config::load_from(&dir)?;
        config.references.retain(|r| r.name != name);
        adl_kernel::config::save_to(&dir, &config)?;
        Ok(serde_json::to_value(config.references)?)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")));
    match result {
        Ok(inner) => ipc::to_response(inner),
        Err(e) => ipc::to_response(Err(e)),
    }
}

fn config_dir(state: &ServerState, explicit: Option<String>) -> PathBuf {
    explicit.map(PathBuf::from).unwrap_or_else(|| state.storage.paths().config_dir.clone())
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
