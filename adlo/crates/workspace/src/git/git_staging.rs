use std::path::Path;
use tracing::warn;

use super::git_helpers::{first_non_empty_line, run_git, run_git_required};

pub fn stage_file(root: &Path, relative_path: &str) -> Result<(), adl_errors::AppError> {
    match run_git_required(root, &["add", "--", relative_path]) {
        Ok(_) => Ok(()),
        Err(e) => {
            warn!(path = %relative_path, root = %root.display(), error = %e, "stage_file failed");
            Err(e)
        },
    }
}

pub fn unstage_file(root: &Path, relative_path: &str) -> Result<(), adl_errors::AppError> {
    match run_git_required(root, &["restore", "--staged", "--", relative_path]) {
        Ok(_) => Ok(()),
        Err(e) => {
            warn!(path = %relative_path, root = %root.display(), error = %e, "unstage_file failed");
            Err(e)
        },
    }
}

pub fn discard_file_changes(root: &Path, relative_path: &str) -> Result<(), adl_errors::AppError> {
    if run_git_required(
        root,
        &["restore", "--source=HEAD", "--staged", "--worktree", "--", relative_path],
    )
    .is_ok()
    {
        return Ok(());
    }
    let is_tracked =
        run_git(root, &["ls-files", "--", relative_path]).and_then(first_non_empty_line).is_some();
    if !is_tracked {
        run_git_required(root, &["clean", "-f", "--", relative_path])?;
    }
    Ok(())
}
