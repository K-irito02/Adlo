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

/// Resolve the config directory: an explicit body `dataDir` is a DATA ROOT
/// (old semantics — `config::load` joined `"config"` internally), so append
/// `"config"`; `None` falls back to `StoragePaths::config_dir`.
fn config_dir(state: &ServerState, explicit: Option<String>) -> PathBuf {
    explicit
        .map(|v| PathBuf::from(v).join("config"))
        .unwrap_or_else(|| state.storage.paths().config_dir.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn test_state(tag: &str) -> (ServerState, PathBuf) {
        let dir = std::env::temp_dir().join(format!("adl-ref-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let state = crate::engine::init_server_state(
            &dir,
            crate::engine::storage_from_locator(
                &adl_kernel::storage::StorageLocator::default(),
                &dir,
            ),
        )
        .await
        .expect("test server state");
        (state, dir)
    }

    /// `None` → storage config dir; `Some(root)` → `<root>/config` (old data-root semantics).
    #[tokio::test]
    async fn config_dir_resolution_preserves_data_root_semantics() {
        let (state, dir) = test_state("resolve").await;
        assert_eq!(config_dir(&state, None), state.storage.paths().config_dir);
        assert_eq!(config_dir(&state, Some(dir.to_string_lossy().into())), dir.join("config"));
        // End-to-end through the new API: explicit root lands at `<root>/config/config.json`,
        // exactly where the old `load(&root)` / `save(&root, …)` read and wrote.
        let resolved = config_dir(&state, Some(dir.to_string_lossy().into()));
        let cfg = adl_kernel::config::AppConfig::default();
        adl_kernel::config::save_to(&resolved, &cfg).expect("save via resolved dir");
        assert!(dir.join("config").join("config.json").exists());
        let loaded = adl_kernel::config::load_from(&resolved).expect("load via resolved dir");
        assert_eq!(loaded.language, cfg.language);
        let _ = std::fs::remove_dir_all(&dir);
    }
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
