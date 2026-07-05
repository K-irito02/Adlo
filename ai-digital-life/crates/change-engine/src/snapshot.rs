use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Maximum snapshot age in days before pruning.
pub const SNAPSHOT_MAX_AGE_DAYS: u64 = 7;
/// Maximum total snapshot size in bytes before pruning.
pub const SNAPSHOT_MAX_TOTAL_BYTES: u64 = 2 * 1024 * 1024; // 2MB

/// Record of a single snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotRecord {
    pub id: String,
    pub message_id: String,
    pub session_id: String,
    pub workspace_id: String,
    pub created_at: u64,
    pub git_commit: Option<String>,
    pub file_count: usize,
    pub total_bytes: u64,
}

/// Manages message-level snapshots in an independent gitdir.
#[derive(Debug, Clone)]
pub struct SnapshotManager {
    snapshot_root: PathBuf,
}

impl SnapshotManager {
    pub fn new(app_data_dir: &Path, project_hash: &str) -> Self {
        let snapshot_root = app_data_dir.join("snapshot").join(project_hash);
        Self { snapshot_root }
    }

    /// Create a snapshot of the current workspace state.
    /// This captures the git HEAD commit hash and file list.
    pub fn create_snapshot(
        &self,
        workspace_root: &Path,
        message_id: &str,
        session_id: &str,
        workspace_id: &str,
    ) -> Result<SnapshotRecord, adl_errors::AppError> {
        let snapshot_id = adl_kernel::create_id("snap");
        let snapshot_dir = self.snapshot_root.join(&snapshot_id);
        std::fs::create_dir_all(&snapshot_dir).map_err(|e| {
            adl_errors::AppError::Io(format!("Failed to create snapshot dir: {}", e))
        })?;

        // Capture git state
        let git_snapshot = adl_workspace::capture_git_snapshot(workspace_root);
        let git_commit = git_snapshot.head;

        // List files (skip large files >2MB)
        let (file_count, total_bytes) = count_workspace_files(workspace_root)?;

        let record = SnapshotRecord {
            id: snapshot_id,
            message_id: message_id.to_string(),
            session_id: session_id.to_string(),
            workspace_id: workspace_id.to_string(),
            created_at: adl_kernel::now_ms() as u64,
            git_commit,
            file_count,
            total_bytes,
        };

        // Save record metadata
        let record_path = snapshot_dir.join("snapshot.json");
        let record_json = serde_json::to_string_pretty(&record).map_err(|e| {
            adl_errors::AppError::Internal(format!("Failed to serialize snapshot: {}", e))
        })?;
        std::fs::write(&record_path, record_json).map_err(|e| {
            adl_errors::AppError::Io(format!("Failed to write snapshot record: {}", e))
        })?;

        Ok(record)
    }

    /// List all snapshots for this project.
    pub fn list_snapshots(&self) -> Result<Vec<SnapshotRecord>, adl_errors::AppError> {
        if !self.snapshot_root.exists() {
            return Ok(vec![]);
        }

        let mut snapshots = Vec::new();
        let entries = std::fs::read_dir(&self.snapshot_root)
            .map_err(|e| adl_errors::AppError::Io(format!("Failed to read snapshot dir: {}", e)))?;

        for entry in entries {
            let entry =
                entry.map_err(|e| adl_errors::AppError::Io(format!("Dir entry error: {}", e)))?;
            let record_path = entry.path().join("snapshot.json");
            if record_path.exists() {
                let content = std::fs::read_to_string(&record_path).map_err(|e| {
                    adl_errors::AppError::Io(format!("Failed to read snapshot: {}", e))
                })?;
                let record: SnapshotRecord = serde_json::from_str(&content).map_err(|e| {
                    adl_errors::AppError::Internal(format!("Failed to parse snapshot: {}", e))
                })?;
                snapshots.push(record);
            }
        }

        snapshots.sort_by_key(|s| s.created_at);
        Ok(snapshots)
    }

    /// Get a specific snapshot by ID.
    pub fn get_snapshot(
        &self,
        snapshot_id: &str,
    ) -> Result<Option<SnapshotRecord>, adl_errors::AppError> {
        let record_path = self.snapshot_root.join(snapshot_id).join("snapshot.json");
        if !record_path.exists() {
            return Ok(None);
        }
        let content = std::fs::read_to_string(&record_path)
            .map_err(|e| adl_errors::AppError::Io(format!("Failed to read snapshot: {}", e)))?;
        let record: SnapshotRecord = serde_json::from_str(&content).map_err(|e| {
            adl_errors::AppError::Internal(format!("Failed to parse snapshot: {}", e))
        })?;
        Ok(Some(record))
    }

    /// Delete a snapshot.
    pub fn delete_snapshot(&self, snapshot_id: &str) -> Result<(), adl_errors::AppError> {
        let snapshot_dir = self.snapshot_root.join(snapshot_id);
        if snapshot_dir.exists() {
            std::fs::remove_dir_all(&snapshot_dir).map_err(|e| {
                adl_errors::AppError::Io(format!("Failed to delete snapshot: {}", e))
            })?;
        }
        Ok(())
    }

    /// Prune old snapshots (older than SNAPSHOT_MAX_AGE_DAYS) or when total exceeds
    /// SNAPSHOT_MAX_TOTAL_BYTES.
    pub fn prune_snapshots(&self) -> Result<usize, adl_errors::AppError> {
        let snapshots = self.list_snapshots()?;
        let now = adl_kernel::now_ms() as u64;
        let max_age_ms = SNAPSHOT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
        let mut pruned = 0;
        let mut total_bytes: u64 = snapshots.iter().map(|s| s.total_bytes).sum();

        for snapshot in &snapshots {
            let age = now.saturating_sub(snapshot.created_at);
            if age > max_age_ms || total_bytes > SNAPSHOT_MAX_TOTAL_BYTES {
                self.delete_snapshot(&snapshot.id)?;
                total_bytes = total_bytes.saturating_sub(snapshot.total_bytes);
                pruned += 1;
            }
        }

        Ok(pruned)
    }
}

/// Count files in workspace, skipping files >2MB.
fn count_workspace_files(root: &Path) -> Result<(usize, u64), adl_errors::AppError> {
    let mut count = 0;
    let mut total_bytes = 0u64;

    fn walk(
        dir: &Path,
        count: &mut usize,
        total_bytes: &mut u64,
    ) -> Result<(), adl_errors::AppError> {
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if matches!(name, ".git" | "node_modules" | "target" | ".next" | "dist" | "build") {
                    continue;
                }
                walk(&path, count, total_bytes)?;
            } else {
                let metadata = entry.metadata()?;
                if metadata.len() <= 2 * 1024 * 1024 {
                    *count += 1;
                    *total_bytes += metadata.len();
                }
            }
        }
        Ok(())
    }

    walk(root, &mut count, &mut total_bytes)?;
    Ok((count, total_bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_manager_creates_root() {
        let tmp = std::env::temp_dir().join(format!("snapshot-test-{}", std::process::id()));
        let manager = SnapshotManager::new(&tmp, "testproject");
        assert!(manager.snapshot_root.ends_with("snapshot/testproject"));
    }

    #[test]
    fn list_snapshots_empty_when_none_exist() {
        let tmp = std::env::temp_dir().join(format!("snapshot-empty-{}", std::process::id()));
        let manager = SnapshotManager::new(&tmp, "emptyproject");
        let snapshots = manager.list_snapshots().unwrap();
        assert!(snapshots.is_empty());
    }

    #[test]
    fn snapshot_constants() {
        assert_eq!(SNAPSHOT_MAX_AGE_DAYS, 7);
        assert_eq!(SNAPSHOT_MAX_TOTAL_BYTES, 2 * 1024 * 1024);
    }
}
