use adl_errors::AppError;
use adl_types::{WorkspaceChangeKind, WorkspaceChangePreview, WorkspaceChangeStatus};
use std::path::Path;

pub fn read_change_preview(
    root: &Path,
    relative_path: &str,
) -> Result<WorkspaceChangePreview, AppError> {
    let snapshot = crate::git::capture_git_snapshot(root);
    if !snapshot.is_repo {
        return Err(AppError::Workspace("active workspace is not a Git repository".into()));
    }

    let normalized_path = relative_path.replace('\\', "/");
    let status = if snapshot.conflicts.iter().any(|path| path == &normalized_path) {
        WorkspaceChangeStatus::Conflicted
    } else if snapshot.untracked.iter().any(|path| path == &normalized_path) {
        WorkspaceChangeStatus::Untracked
    } else if snapshot.unstaged.iter().any(|path| path == &normalized_path) {
        WorkspaceChangeStatus::Modified
    } else if snapshot.staged.iter().any(|path| path == &normalized_path) {
        WorkspaceChangeStatus::Staged
    } else {
        return Err(AppError::NotFound(format!("change preview for {normalized_path}")));
    };

    let absolute_path = adl_fs_ops::resolve_workspace_path(root, &normalized_path)?;
    if absolute_path.is_dir() {
        return Err(AppError::InvalidInput(format!(
            "change preview requires a file path: {normalized_path}"
        )));
    }

    let current_exists = absolute_path.is_file();
    let current_content = if current_exists {
        adl_fs_ops::read_text_file(root, &normalized_path, crate::DEFAULT_MAX_FILE_BYTES)?
    } else {
        String::new()
    };

    let base_content = crate::git::git_show_file(root, &normalized_path)?.unwrap_or_default();
    let base_exists =
        !base_content.is_empty() || crate::git::git_file_exists(root, &normalized_path)?;
    let change_kind = match (base_exists, current_exists) {
        (false, true) => WorkspaceChangeKind::Added,
        (true, false) => WorkspaceChangeKind::Deleted,
        _ => WorkspaceChangeKind::Modified,
    };

    if !base_exists && !current_exists {
        return Err(AppError::NotFound(format!(
            "change preview source is unavailable: {normalized_path}"
        )));
    }

    Ok(WorkspaceChangePreview {
        path: normalized_path,
        change_kind,
        status,
        base_exists,
        current_exists,
        base_content,
        current_content,
    })
}
