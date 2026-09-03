use crate::ipc;
use adl_errors::AppError;
use adl_types::reference::ReferenceConfig;
use axum::response::IntoResponse;
use std::path::PathBuf;

pub async fn list(body: axum::body::Bytes) -> impl IntoResponse {
    let input: DataDirBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let dir = data_dir(input.data_dir);
    let result = tokio::task::spawn_blocking(move || -> Result<serde_json::Value, AppError> {
        let config = adl_kernel::config::load(&dir)?;
        Ok(serde_json::to_value(config.references)?)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")));
    match result {
        Ok(inner) => ipc::to_response(inner),
        Err(e) => ipc::to_response(Err(e)),
    }
}

pub async fn add(body: axum::body::Bytes) -> impl IntoResponse {
    let input: ReferenceBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let dir = data_dir(input.data_dir);
    let reference = input.reference;
    let result = tokio::task::spawn_blocking(move || -> Result<serde_json::Value, AppError> {
        let mut config = adl_kernel::config::load(&dir)?;
        config.references.push(reference);
        adl_kernel::config::save(&dir, &config)?;
        Ok(serde_json::to_value(config.references)?)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")));
    match result {
        Ok(inner) => ipc::to_response(inner),
        Err(e) => ipc::to_response(Err(e)),
    }
}

pub async fn remove(body: axum::body::Bytes) -> impl IntoResponse {
    let input: RemoveBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let dir = data_dir(input.data_dir);
    let name = input.name;
    let result = tokio::task::spawn_blocking(move || -> Result<serde_json::Value, AppError> {
        let mut config = adl_kernel::config::load(&dir)?;
        config.references.retain(|r| r.name != name);
        adl_kernel::config::save(&dir, &config)?;
        Ok(serde_json::to_value(config.references)?)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")));
    match result {
        Ok(inner) => ipc::to_response(inner),
        Err(e) => ipc::to_response(Err(e)),
    }
}

fn data_dir(explicit: Option<String>) -> PathBuf {
    explicit.map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."))
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
