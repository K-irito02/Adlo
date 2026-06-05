use adl_errors::AppError;
use adl_kernel::{now_ms, GitBranchSummary, GitSnapshot};
use std::path::Path;
use std::process::Command;
use std::time::Duration;
use tokio::time::timeout as tokio_timeout;
use tracing::debug;

const GIT_TIMEOUT_SECS: u64 = 30;

pub fn capture_git_snapshot(root: &Path) -> GitSnapshot {
    let branch = run_git(root, &["branch", "--show-current"]).and_then(first_non_empty_line);
    let head = run_git(root, &["rev-parse", "--short", "HEAD"]).and_then(first_non_empty_line);
    let staged = capture_git_paths_with_fallback(
        root,
        &["diff", "--name-only", "--cached", "-z"],
        "diff --cached",
    );
    let unstaged = capture_git_paths_with_fallback(root, &["diff", "--name-only", "-z"], "diff");
    let untracked = capture_git_paths_with_fallback(
        root,
        &["ls-files", "--others", "--exclude-standard", "-z"],
        "ls-files --others",
    );
    let conflicts = capture_git_paths_with_fallback(
        root,
        &["diff", "--name-only", "--diff-filter=U", "-z"],
        "diff --diff-filter=U",
    );
    GitSnapshot {
        is_repo: root.join(".git").exists() || branch.is_some() || head.is_some(),
        branch,
        head,
        ahead: None,
        behind: None,
        staged,
        unstaged,
        untracked,
        conflicts,
        captured_at: now_ms(),
    }
}

pub async fn capture_git_snapshot_async(root: &Path) -> GitSnapshot {
    let is_repo_check = root.join(".git").exists();
    let (branch_raw, head_raw, staged, unstaged, untracked, conflicts) = tokio::join!(
        run_git_with_timeout(root, &["branch", "--show-current"]),
        run_git_with_timeout(root, &["rev-parse", "--short", "HEAD"]),
        capture_git_paths_with_fallback_async(root, &["diff", "--name-only", "--cached", "-z"]),
        capture_git_paths_with_fallback_async(root, &["diff", "--name-only", "-z"]),
        capture_git_paths_with_fallback_async(
            root,
            &["ls-files", "--others", "--exclude-standard", "-z"]
        ),
        capture_git_paths_with_fallback_async(
            root,
            &["diff", "--name-only", "--diff-filter=U", "-z"]
        ),
    );
    let branch = branch_raw.and_then(first_non_empty_line);
    let head = head_raw.and_then(first_non_empty_line);
    GitSnapshot {
        is_repo: is_repo_check || branch.is_some() || head.is_some(),
        branch,
        head,
        ahead: None,
        behind: None,
        staged,
        unstaged,
        untracked,
        conflicts,
        captured_at: now_ms(),
    }
}

pub fn git_has_local_changes(snapshot: &GitSnapshot) -> bool {
    !snapshot.staged.is_empty() || !snapshot.unstaged.is_empty() || !snapshot.untracked.is_empty()
}

pub fn list_git_branches(root: &Path) -> Result<Vec<GitBranchSummary>, AppError> {
    let current_branch =
        run_git_required(root, &["branch", "--show-current"]).and_then(|value| {
            first_non_empty_line(value)
                .ok_or_else(|| AppError::Workspace("failed to resolve current branch".into()))
        })?;
    let output = run_git_required(root, &["branch", "--format=%(refname:short)"])?;
    let mut branches: Vec<GitBranchSummary> = output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|name| GitBranchSummary { name: name.to_string(), is_current: name == current_branch })
        .collect();
    if branches.is_empty() {
        return Err(AppError::Workspace("no local branches found".into()));
    }
    branches.sort_by(|left, right| {
        right.is_current.cmp(&left.is_current).then_with(|| left.name.cmp(&right.name))
    });
    Ok(branches)
}

pub fn switch_git_branch(
    root: &Path,
    branch_name: &str,
    allow_stash: bool,
) -> Result<(GitSnapshot, bool, Option<String>), AppError> {
    let snapshot = capture_git_snapshot(root);
    if !snapshot.is_repo {
        return Err(AppError::Workspace("active workspace is not a Git repository".into()));
    }
    let previous_branch = snapshot.branch.clone();
    let should_stash = git_has_local_changes(&snapshot);
    if should_stash && !allow_stash {
        return Err(AppError::InvalidInput(
            "Dirty worktree requires explicit stash confirmation.".into(),
        ));
    }
    if should_stash {
        stash_workspace_changes(root)?;
    }
    run_git_required(root, &["switch", branch_name])?;
    Ok((capture_git_snapshot(root), should_stash, previous_branch))
}

pub fn create_git_branch(
    root: &Path,
    branch_name: &str,
    base_branch: Option<&str>,
    allow_stash: bool,
) -> Result<(GitSnapshot, bool, Option<String>), AppError> {
    let snapshot = capture_git_snapshot(root);
    if !snapshot.is_repo {
        return Err(AppError::Workspace("active workspace is not a Git repository".into()));
    }
    let previous_branch = snapshot.branch.clone();
    let current_branch = previous_branch
        .clone()
        .ok_or_else(|| AppError::Workspace("failed to resolve current branch".into()))?;
    let base_branch =
        base_branch.map(str::trim).filter(|value| !value.is_empty()).unwrap_or(&current_branch);
    let should_stash = base_branch != current_branch && git_has_local_changes(&snapshot);
    if should_stash && !allow_stash {
        return Err(AppError::InvalidInput(
            "Dirty worktree requires explicit stash confirmation.".into(),
        ));
    }
    if should_stash {
        stash_workspace_changes(root)?;
    }
    if base_branch != current_branch {
        run_git_required(root, &["switch", base_branch])?;
    }
    run_git_required(root, &["switch", "-c", branch_name])?;
    Ok((capture_git_snapshot(root), should_stash, previous_branch))
}

fn run_git(root: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new("git").args(args).current_dir(root).output().ok()?;
    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        None
    }
}

async fn run_git_with_timeout(root: &Path, args: &[&str]) -> Option<String> {
    let root_owned = root.to_path_buf();
    let args_owned: Vec<String> = args.iter().map(|s| s.to_string()).collect();
    let result = tokio_timeout(Duration::from_secs(GIT_TIMEOUT_SECS), async move {
        tokio::task::spawn_blocking(move || {
            let output =
                Command::new("git").args(&args_owned).current_dir(&root_owned).output().ok()?;
            if output.status.success() {
                Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
            } else {
                None
            }
        })
        .await
        .ok()?
    })
    .await;
    result.ok().flatten()
}

fn run_git_bytes(root: &Path, args: &[&str]) -> Option<Vec<u8>> {
    let output = Command::new("git").args(args).current_dir(root).output().ok()?;
    if output.status.success() {
        Some(output.stdout)
    } else {
        None
    }
}

fn run_git_paths(root: &Path, args: &[&str]) -> Option<Vec<String>> {
    let stdout = run_git_bytes(root, args)?;
    Some(
        stdout
            .split(|byte| *byte == 0)
            .filter(|chunk| !chunk.is_empty())
            .map(|chunk| String::from_utf8_lossy(chunk).replace('\\', "/"))
            .collect(),
    )
}

fn capture_git_paths_with_fallback(root: &Path, args: &[&str], command_name: &str) -> Vec<String> {
    run_git_paths(root, args).unwrap_or_else(|| {
        debug!(root = %root.to_string_lossy(), "git {} failed, defaulting to empty list", command_name);
        Vec::new()
    })
}

fn run_git_required(root: &Path, args: &[&str]) -> Result<String, AppError> {
    let output = Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .map_err(|error| AppError::Workspace(format!("failed to execute git: {error}")))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(AppError::Workspace(if stderr.is_empty() {
            format!("git command failed: git {}", args.join(" "))
        } else {
            stderr
        }))
    }
}

pub(crate) fn git_show_file(root: &Path, relative_path: &str) -> Result<Option<String>, AppError> {
    let object_path = format!("HEAD:{relative_path}");
    let output = Command::new("git")
        .args(["show", &object_path])
        .current_dir(root)
        .output()
        .map_err(|error| AppError::Workspace(format!("failed to execute git: {error}")))?;
    if output.status.success() {
        if output.stdout.len() as u64 > crate::DEFAULT_MAX_FILE_BYTES {
            return Err(AppError::Workspace(format!(
                "git blob is too large to preview: {relative_path}"
            )));
        }
        String::from_utf8(output.stdout)
            .map(Some)
            .map_err(|error| AppError::Workspace(format!("file is not valid UTF-8: {error}")))
    } else {
        Ok(None)
    }
}

pub(crate) fn git_file_exists(root: &Path, relative_path: &str) -> Result<bool, AppError> {
    let object_path = format!("HEAD:{relative_path}");
    let output = Command::new("git")
        .args(["cat-file", "-e", &object_path])
        .current_dir(root)
        .output()
        .map_err(|error| AppError::Workspace(format!("failed to execute git: {error}")))?;
    Ok(output.status.success())
}

fn stash_workspace_changes(root: &Path) -> Result<(), AppError> {
    let message = format!("adl-auto-stash-{}", now_ms());
    run_git_required(root, &["stash", "push", "--include-untracked", "--message", &message])?;
    Ok(())
}

fn first_non_empty_line(value: String) -> Option<String> {
    value.lines().map(str::trim).find(|line| !line.is_empty()).map(ToOwned::to_owned)
}

async fn capture_git_paths_with_fallback_async(root: &Path, args: &[&str]) -> Vec<String> {
    let root_owned = root.to_path_buf();
    let args_owned: Vec<String> = args.iter().map(|s| s.to_string()).collect();
    let command_name = args_owned.join(" ");
    tokio_timeout(Duration::from_secs(GIT_TIMEOUT_SECS), async move {
        tokio::task::spawn_blocking(move || {
            capture_git_paths_with_fallback(
                &root_owned,
                &args_owned.iter().map(String::as_str).collect::<Vec<&str>>(),
                &command_name,
            )
        })
        .await
        .unwrap_or_default()
    })
    .await
    .unwrap_or_default()
}
