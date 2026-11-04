use crate::snapshot::SnapshotManager;
use std::path::Path;

/// Result of a revert operation.
#[derive(Debug, Clone, serde::Serialize)]
pub struct RevertResult {
    pub success: bool,
    pub snapshot_id: String,
    pub message_id: String,
    pub files_restored: usize,
    pub error: Option<String>,
}

/// Revert workspace to a previous snapshot by restoring file copies.
pub fn revert_to_snapshot(
    manager: &SnapshotManager,
    snapshot_id: &str,
    workspace_root: &Path,
) -> Result<RevertResult, adl_errors::AppError> {
    let snapshot = manager.get_snapshot(snapshot_id)?.ok_or_else(|| {
        adl_errors::AppError::NotFound(format!("Snapshot {} not found", snapshot_id))
    })?;

    let owned_snapshot_id = snapshot_id.to_string();
    let owned_message_id = snapshot.message_id.clone();

    let snapshot_dir = manager.snapshot_root.join(&snapshot.id);
    let files_dir = snapshot_dir.join("files");

    let (files_restored, error) = if !files_dir.exists() {
        (0, Some("Snapshot files directory not found".to_string()))
    } else {
        let mut restored = 0;
        let mut errors = Vec::new();
        restore_directory(&files_dir, workspace_root, &mut restored, &mut errors);

        if !errors.is_empty() {
            (restored, Some(format!("Failed to restore some files: {}", errors.join("; "))))
        } else {
            (restored, None)
        }
    };

    Ok(RevertResult {
        success: error.is_none(),
        snapshot_id: owned_snapshot_id,
        message_id: owned_message_id,
        files_restored,
        error,
    })
}

/// Recursively restore files from src directory to dst directory.
fn restore_directory(src: &Path, dst: &Path, restored: &mut usize, errors: &mut Vec<String>) {
    if let Ok(entries) = std::fs::read_dir(src) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                restore_directory(&path, dst, restored, errors);
            } else if let Ok(relative) = path.strip_prefix(src) {
                let target = dst.join(relative);
                if let Some(parent) = target.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                match std::fs::copy(&path, &target) {
                    Ok(_) => *restored += 1,
                    Err(e) => errors.push(format!("{}: {}", relative.display(), e)),
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::snapshot::SnapshotManager;
    use std::fs;

    #[test]
    fn revert_result_serializes() {
        let result = RevertResult {
            success: true,
            snapshot_id: "snap123".to_string(),
            message_id: "msg456".to_string(),
            files_restored: 5,
            error: None,
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("snap123"));
        assert!(json.contains("true"));
    }

    #[test]
    fn revert_result_with_error() {
        let result = RevertResult {
            success: false,
            snapshot_id: "snap123".to_string(),
            message_id: "msg456".to_string(),
            files_restored: 0,
            error: Some("Git revert failed".to_string()),
        };
        assert!(!result.success);
        assert!(result.error.is_some());
    }

    #[test]
    fn revert_restores_files_from_snapshot() {
        let tmp_root =
            std::env::temp_dir().join(format!("revert-integration-test-{}", std::process::id()));
        let workspace_root = tmp_root.join("workspace");
        let snap_root = tmp_root.join("snapshots");

        fs::create_dir_all(&workspace_root).unwrap();
        fs::write(workspace_root.join("readme.md"), b"original content").unwrap();

        let manager = SnapshotManager::new(&snap_root, "integtest");
        let record =
            manager.create_snapshot(&workspace_root, None, "msg_1", "sess_1", "ws_1").unwrap();
        assert_eq!(record.file_count, 1);

        fs::write(workspace_root.join("readme.md"), b"modified content").unwrap();

        let result = revert_to_snapshot(&manager, &record.id, &workspace_root).unwrap();
        assert!(result.success);
        assert_eq!(result.files_restored, 1);

        let restored = fs::read_to_string(workspace_root.join("readme.md")).unwrap();
        assert_eq!(restored, "original content");

        fs::remove_dir_all(&tmp_root).unwrap_or(());
    }
}
