use crate::commands::ipc;
use adl_change_engine::revert::{revert_to_snapshot, RevertResult};
use adl_change_engine::snapshot::{SnapshotManager, SnapshotRecord};
use adl_errors::AppError;
use adl_kernel::IpcResult;
use std::path::PathBuf;

fn get_snapshot_manager(
    _workspace_id: &str,
    workspace_root: &str,
) -> Result<SnapshotManager, AppError> {
    let app_data = dirs::data_dir()
        .ok_or_else(|| AppError::Internal("Cannot find app data dir".to_string()))?
        .join("ai-digital-life");
    let project_hash = simple_hash(workspace_root);
    Ok(SnapshotManager::new(&app_data, &project_hash))
}

fn simple_hash(s: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    s.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

#[tauri::command]
pub async fn create_snapshot(
    workspace_id: String,
    workspace_root: String,
    message_id: String,
    session_id: String,
) -> Result<IpcResult<SnapshotRecord>, AppError> {
    Ok(ipc({
        let manager = get_snapshot_manager(&workspace_id, &workspace_root)?;
        let root = PathBuf::from(&workspace_root);
        tokio::task::spawn_blocking(move || {
            manager.create_snapshot(&root, &message_id, &session_id, &workspace_id)
        })
        .await
        .map_err(|e| AppError::Internal(format!("Snapshot task failed: {}", e)))?
    }))
}

#[tauri::command]
pub async fn list_snapshots(
    workspace_id: String,
    workspace_root: String,
) -> Result<IpcResult<Vec<SnapshotRecord>>, AppError> {
    Ok(ipc({
        let manager = get_snapshot_manager(&workspace_id, &workspace_root)?;
        manager.list_snapshots()
    }))
}

#[tauri::command]
pub async fn revert_to_snapshot_cmd(
    workspace_id: String,
    workspace_root: String,
    snapshot_id: String,
) -> Result<IpcResult<RevertResult>, AppError> {
    Ok(ipc({
        let manager = get_snapshot_manager(&workspace_id, &workspace_root)?;
        let root = PathBuf::from(&workspace_root);
        tokio::task::spawn_blocking(move || revert_to_snapshot(&manager, &snapshot_id, &root))
            .await
            .map_err(|e| AppError::Internal(format!("Revert task failed: {}", e)))?
    }))
}

#[tauri::command]
pub async fn prune_snapshots(
    workspace_id: String,
    workspace_root: String,
) -> Result<IpcResult<usize>, AppError> {
    Ok(ipc({
        let manager = get_snapshot_manager(&workspace_id, &workspace_root)?;
        manager.prune_snapshots()
    }))
}
