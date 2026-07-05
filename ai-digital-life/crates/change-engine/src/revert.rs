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

/// Revert workspace to a previous snapshot.
/// This uses git to restore the file state captured in the snapshot.
pub fn revert_to_snapshot(
    manager: &SnapshotManager,
    snapshot_id: &str,
    workspace_root: &Path,
) -> Result<RevertResult, adl_errors::AppError> {
    let snapshot = manager.get_snapshot(snapshot_id)?.ok_or_else(|| {
        adl_errors::AppError::NotFound(format!("Snapshot {} not found", snapshot_id))
    })?;

    // If snapshot has a git commit, restore via git
    if let Some(ref commit) = snapshot.git_commit {
        match revert_via_git(workspace_root, commit) {
            Ok(files) => {
                return Ok(RevertResult {
                    success: true,
                    snapshot_id: snapshot_id.to_string(),
                    message_id: snapshot.message_id.clone(),
                    files_restored: files,
                    error: None,
                });
            },
            Err(e) => {
                return Ok(RevertResult {
                    success: false,
                    snapshot_id: snapshot_id.to_string(),
                    message_id: snapshot.message_id.clone(),
                    files_restored: 0,
                    error: Some(format!("Git revert failed: {}", e)),
                });
            },
        }
    }

    // No git commit available
    Ok(RevertResult {
        success: false,
        snapshot_id: snapshot_id.to_string(),
        message_id: snapshot.message_id.clone(),
        files_restored: 0,
        error: Some("Snapshot has no git commit to revert to".to_string()),
    })
}

/// Revert workspace to a git commit.
fn revert_via_git(workspace_root: &Path, commit: &str) -> Result<usize, String> {
    use std::process::Command;

    // git checkout <commit> -- .
    let output = Command::new("git")
        .arg("checkout")
        .arg(commit)
        .arg("--")
        .arg(".")
        .current_dir(workspace_root)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    // Count restored files from git diff
    let diff_output = Command::new("git")
        .arg("diff")
        .arg("--name-only")
        .arg("HEAD")
        .current_dir(workspace_root)
        .output()
        .map_err(|e| format!("Failed to count restored files: {}", e))?;

    let count =
        String::from_utf8_lossy(&diff_output.stdout).lines().filter(|l| !l.is_empty()).count();

    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
