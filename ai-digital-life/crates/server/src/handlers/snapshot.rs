//! Snapshot domain HTTP handlers — migrated from `src-tauri/src/commands/
//! snapshot.rs` (message-level git snapshots + revert). All snapshot I/O is
//! blocking (git capture, file copy), so every handler runs it in
//! `spawn_blocking`.

use crate::ServerState;
use crate::ipc;
use adl_errors::AppError;
use axum::extract::State;
use axum::response::IntoResponse;
use std::path::PathBuf;

/// Run a blocking closure and collapse the `spawn_blocking` join error into an
/// `AppError::Internal`.
async fn run_blocking<T, F>(f: F) -> Result<T, AppError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, AppError> + Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))?
}

fn simple_hash(s: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    s.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

/// Build the `SnapshotManager` for a workspace root (mirrors the Tauri helper,
/// storing snapshots under `<data_dir>/ai-digital-life/snapshot/<project_hash>`).
fn get_snapshot_manager(
    _workspace_id: &str,
    workspace_root: &str,
) -> Result<adl_change_engine::snapshot::SnapshotManager, AppError> {
    let app_data = dirs::data_dir()
        .ok_or_else(|| AppError::Internal("Cannot find app data dir".to_string()))?
        .join("ai-digital-life");
    let project_hash = simple_hash(workspace_root);
    Ok(adl_change_engine::snapshot::SnapshotManager::new(&app_data, &project_hash))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateSnapshotBody {
    workspace_id: String,
    workspace_root: String,
    message_id: String,
    session_id: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceRootBody {
    workspace_id: String,
    workspace_root: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RevertBody {
    workspace_id: String,
    workspace_root: String,
    snapshot_id: String,
}

/// POST `/snapshot/create`.
pub async fn create(
    State(_state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: CreateSnapshotBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let manager = match get_snapshot_manager(&input.workspace_id, &input.workspace_root) {
        Ok(m) => m,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let root = PathBuf::from(&input.workspace_root);
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let git_snapshot = adl_workspace::capture_git_snapshot(&root);
        let record = manager.create_snapshot(
            &root,
            git_snapshot.head,
            &input.message_id,
            &input.session_id,
            &input.workspace_id,
        )?;
        Ok(serde_json::to_value(record)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/snapshot/list`.
pub async fn list(State(_state): State<ServerState>, body: axum::body::Bytes) -> impl IntoResponse {
    let input: WorkspaceRootBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let manager = match get_snapshot_manager(&input.workspace_id, &input.workspace_root) {
        Ok(m) => m,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let records = manager.list_snapshots()?;
        Ok(serde_json::to_value(records)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/snapshot/revert`.
pub async fn revert(
    State(_state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: RevertBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let manager = match get_snapshot_manager(&input.workspace_id, &input.workspace_root) {
        Ok(m) => m,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let root = PathBuf::from(&input.workspace_root);
    let root_for_invalidate = root.clone();
    let root_for_closure = root.clone();
    let snapshot_id = input.snapshot_id;
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let reverted = adl_change_engine::revert::revert_to_snapshot(
            &manager,
            &snapshot_id,
            &root_for_closure,
        )?;
        // 快照回滚会重写工作区文件：FS 变更成功后立即失效文件树缓存。
        adl_workspace::invalidate_tree_cache(&root_for_invalidate);
        Ok(serde_json::to_value(reverted)?)
    })
    .await;
    ipc::to_response(result)
}

/// POST `/snapshot/prune`.
pub async fn prune(
    State(_state): State<ServerState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let input: WorkspaceRootBody = match ipc::json_body(body).await {
        Ok(v) => v,
        Err((_, msg)) => return ipc::to_response(Err(AppError::InvalidInput(msg))),
    };
    let manager = match get_snapshot_manager(&input.workspace_id, &input.workspace_root) {
        Ok(m) => m,
        Err(e) => return ipc::to_response(Err(e)),
    };
    let result = run_blocking(move || -> Result<serde_json::Value, AppError> {
        let pruned = manager.prune_snapshots()?;
        Ok(serde_json::to_value(pruned)?)
    })
    .await;
    ipc::to_response(result)
}
