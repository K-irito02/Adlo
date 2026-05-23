//! Workspace detection, lightweight indexing, search, and git snapshots.

use adl_errors::AppError;
use adl_kernel::{
    now_ms, FileOutlineItem, GitBranchSummary, GitSnapshot, RecentWorkspaceEntry, RepoMapEntry,
    RetrievalFileTypeCount, RetrievalSnapshot, RetrievalStatusV1, WorkspaceChangeKind,
    WorkspaceChangePreview, WorkspaceChangeStatus, WorkspaceFileDocument, WorkspaceMeta,
    WorkspaceSearchHit, WorkspaceStatus, WorkspaceTreeNode, WorkspaceType,
};
use regex::Regex;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;
use std::time::Duration;
use tokio::time::timeout as tokio_timeout;
use tracing::{debug, info};

const DEFAULT_MAX_FILE_BYTES: u64 = 1024 * 1024;
const MAX_SEARCH_RESULTS: usize = 200;
const MAX_TREE_DEPTH: usize = 64;
const MAX_TREE_NODES: usize = 200_000;
const MAX_COLLECTED_FILES: usize = 50_000;
const GIT_TIMEOUT_SECS: u64 = 30;
const CANCEL_CHECK_INTERVAL: usize = 100;
const IGNORED_DIRS: &[&str] = &[
    ".git", "target", "node_modules", "dist", "build",
    ".next", ".cache", "__pycache__", ".venv", "vendor",
    ".idea", ".vscode", ".svelte-kit", ".turbo",
    "coverage", ".nyc_output", "out", ".tox",
];
const BLOCK_KEYWORDS: &[&str] = &[
    "if", "else", "for", "while", "switch", "case", "catch", "try", "finally", "match", "do",
    "with", "except", "elif", "foreach",
];

#[derive(Clone)]
struct OutlineDraft {
    label: String,
    kind: String,
    line: usize,
    depth: usize,
}

pub fn detect_root(input: &Path) -> Result<PathBuf, AppError> {
    let start = input
        .canonicalize()
        .map_err(|e| AppError::Workspace(format!("invalid workspace path: {e}")))?;
    let mut current = if start.is_file() {
        start
            .parent()
            .ok_or_else(|| AppError::Workspace("file has no parent".into()))?
            .to_path_buf()
    } else {
        start
    };

    loop {
        if is_project_root(&current) {
            return Ok(current);
        }
        if !current.pop() {
            break;
        }
    }

    input
        .canonicalize()
        .map_err(|e| AppError::Workspace(format!("invalid workspace path: {e}")))
}

fn is_project_root(path: &Path) -> bool {
    [
        ".git",
        "Cargo.toml",
        "package.json",
        "pyproject.toml",
        "go.mod",
        "pom.xml",
    ]
    .iter()
    .any(|marker| path.join(marker).exists())
}

pub fn workspace_type(root: &Path) -> WorkspaceType {
    if root.join("Cargo.toml").exists() {
        WorkspaceType::Rust
    } else if root.join("package.json").exists() {
        WorkspaceType::Node
    } else if root.join("pyproject.toml").exists() || root.join("requirements.txt").exists() {
        WorkspaceType::Python
    } else if root.join("go.mod").exists() {
        WorkspaceType::Go
    } else if root.join("pom.xml").exists() || root.join("build.gradle").exists() {
        WorkspaceType::Java
    } else {
        WorkspaceType::Unknown
    }
}

pub fn open_workspace(input: &Path) -> Result<(WorkspaceMeta, RecentWorkspaceEntry), AppError> {
    let root = detect_root(input)?;
    let now = now_ms();
    let name = root
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "workspace".to_string());
    let id = stable_workspace_id(&root);
    let root_path = root.to_string_lossy().to_string();
    let meta = WorkspaceMeta {
        id: id.clone(),
        path: root_path.clone(),
        root_path: root_path.clone(),
        name: name.clone(),
        r#type: workspace_type(&root),
        status: WorkspaceStatus::Ready,
        git_snapshot: Some(capture_git_snapshot(&root)),
        created_at: now,
        updated_at: now,
        last_opened_at: now,
    };
    let recent = RecentWorkspaceEntry {
        id,
        path: root_path.clone(),
        root_path,
        name,
        last_opened_at: now,
        is_pinned: false,
        pinned_order: 0,
        unpinned_order: 0,
        removed_from_sidebar: false,
        available: true,
        hidden_from_right_panels: false,
    };
    Ok((meta, recent))
}

pub fn stable_workspace_id(root: &Path) -> String {
    let normalized = root.to_string_lossy().replace('\\', "/").to_lowercase();
    let mut hash: u32 = 0;
    for byte in normalized.bytes() {
        hash = hash.wrapping_mul(31).wrapping_add(byte as u32);
    }
    format!("workspace_{hash:08x}")
}

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
        capture_git_paths_with_fallback_async(root, &["ls-files", "--others", "--exclude-standard", "-z"]),
        capture_git_paths_with_fallback_async(root, &["diff", "--name-only", "--diff-filter=U", "-z"]),
    );
    let branch = branch_raw.and_then(|s| first_non_empty_line(s));
    let head = head_raw.and_then(|s| first_non_empty_line(s));
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

pub fn read_change_preview(
    root: &Path,
    relative_path: &str,
) -> Result<WorkspaceChangePreview, AppError> {
    let snapshot = capture_git_snapshot(root);
    if !snapshot.is_repo {
        return Err(AppError::Workspace(
            "active workspace is not a Git repository".into(),
        ));
    }

    let normalized_path = relative_path.replace('\\', "/");
    let status = if snapshot
        .conflicts
        .iter()
        .any(|path| path == &normalized_path)
    {
        WorkspaceChangeStatus::Conflicted
    } else if snapshot
        .untracked
        .iter()
        .any(|path| path == &normalized_path)
    {
        WorkspaceChangeStatus::Untracked
    } else if snapshot
        .unstaged
        .iter()
        .any(|path| path == &normalized_path)
    {
        WorkspaceChangeStatus::Modified
    } else if snapshot.staged.iter().any(|path| path == &normalized_path) {
        WorkspaceChangeStatus::Staged
    } else {
        return Err(AppError::NotFound(format!(
            "change preview for {normalized_path}"
        )));
    };

    let absolute_path = adl_fs_ops::resolve_workspace_path(root, &normalized_path)?;
    if absolute_path.is_dir() {
        return Err(AppError::InvalidInput(format!(
            "change preview requires a file path: {normalized_path}"
        )));
    }

    let current_exists = absolute_path.is_file();
    let current_content = if current_exists {
        adl_fs_ops::read_text_file(root, &normalized_path, DEFAULT_MAX_FILE_BYTES)?
    } else {
        String::new()
    };

    let base_content = git_show_file(root, &normalized_path)?.unwrap_or_default();
    let base_exists = !base_content.is_empty() || git_file_exists(root, &normalized_path)?;
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
        .map(|name| GitBranchSummary {
            name: name.to_string(),
            is_current: name == current_branch,
        })
        .collect();
    if branches.is_empty() {
        return Err(AppError::Workspace("no local branches found".into()));
    }
    branches.sort_by(|left, right| {
        right
            .is_current
            .cmp(&left.is_current)
            .then_with(|| left.name.cmp(&right.name))
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
        return Err(AppError::Workspace(
            "active workspace is not a Git repository".into(),
        ));
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
        return Err(AppError::Workspace(
            "active workspace is not a Git repository".into(),
        ));
    }
    let previous_branch = snapshot.branch.clone();
    let current_branch = previous_branch
        .clone()
        .ok_or_else(|| AppError::Workspace("failed to resolve current branch".into()))?;
    let base_branch = base_branch
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(&current_branch);
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
    let output = Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .ok()?;
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
            let output = Command::new("git")
                .args(&args_owned)
                .current_dir(&root_owned)
                .output()
                .ok()?;
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
    let output = Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .ok()?;
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

fn git_show_file(root: &Path, relative_path: &str) -> Result<Option<String>, AppError> {
    let object_path = format!("HEAD:{relative_path}");
    let output = Command::new("git")
        .args(["show", &object_path])
        .current_dir(root)
        .output()
        .map_err(|error| AppError::Workspace(format!("failed to execute git: {error}")))?;
    if output.status.success() {
        if output.stdout.len() as u64 > DEFAULT_MAX_FILE_BYTES {
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

fn git_file_exists(root: &Path, relative_path: &str) -> Result<bool, AppError> {
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
    run_git_required(
        root,
        &[
            "stash",
            "push",
            "--include-untracked",
            "--message",
            &message,
        ],
    )?;
    Ok(())
}

fn first_non_empty_line(value: String) -> Option<String> {
    value
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(ToOwned::to_owned)
}

async fn capture_git_paths_with_fallback_async(root: &Path, args: &[&str]) -> Vec<String> {
    let root_owned = root.to_path_buf();
    let args_owned: Vec<String> = args.iter().map(|s| s.to_string()).collect();
    tokio_timeout(Duration::from_secs(GIT_TIMEOUT_SECS), async move {
        tokio::task::spawn_blocking(move || {
            capture_git_paths_with_fallback(&root_owned, &args_owned.iter().map(|s| s.as_str()).collect::<Vec<&str>>(), &args_owned.join(" "))
        })
        .await
        .unwrap_or_default()
    })
    .await
    .unwrap_or_default()
}

pub fn list_tree(root: &Path) -> Result<Vec<WorkspaceTreeNode>, AppError> {
    let mut remaining = MAX_TREE_NODES;
    list_tree_inner(root, root, 0, &mut remaining)
}

fn list_tree_inner(
    root: &Path,
    dir: &Path,
    depth: usize,
    remaining: &mut usize,
) -> Result<Vec<WorkspaceTreeNode>, AppError> {
    if *remaining == 0 {
        return Ok(vec![]);
    }
    if depth > MAX_TREE_DEPTH {
        return Ok(vec![]);
    }
    let mut nodes = Vec::new();
    let entries = match fs::read_dir(dir) {
        Ok(value) => value,
        Err(err) => {
            debug!(
                dir = %dir.to_string_lossy(),
                error = %err,
                "failed to read directory for workspace tree"
            );
            return Ok(vec![]);
        }
    };
    for entry in entries {
        let entry = match entry {
            Ok(value) => value,
            Err(err) => {
                debug!(
                    dir = %dir.to_string_lossy(),
                    error = %err,
                    "failed to read directory entry for workspace tree"
                );
                continue;
            }
        };
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if should_ignore(&name) {
            continue;
        }
        if let Ok(file_type) = entry.file_type() {
            if file_type.is_symlink() {
                debug!(
                    path = %path.to_string_lossy(),
                    "skipping symlink in workspace tree"
                );
                continue;
            }
        }
        let relative = relative_path(root, &path);
        if path.is_dir() {
            if *remaining == 0 {
                break;
            }
            *remaining = remaining.saturating_sub(1);
            nodes.push(WorkspaceTreeNode {
                path: relative,
                name,
                kind: "directory".into(),
                children: list_tree_inner(root, &path, depth + 1, remaining).unwrap_or_else(
                    |err| {
                        debug!(
                            dir = %path.to_string_lossy(),
                            error = %err,
                            "failed to read child directory for workspace tree"
                        );
                        vec![]
                    },
                ),
            });
        } else if path.is_file() {
            if *remaining == 0 {
                break;
            }
            *remaining = remaining.saturating_sub(1);
            nodes.push(WorkspaceTreeNode {
                path: relative,
                name,
                kind: "file".into(),
                children: vec![],
            });
        }
    }
    nodes.sort_by(|a, b| a.kind.cmp(&b.kind).then_with(|| a.name.cmp(&b.name)));
    Ok(nodes)
}

pub fn read_file(root: &Path, relative_path: &str) -> Result<WorkspaceFileDocument, AppError> {
    let path = adl_fs_ops::resolve_workspace_path(root, relative_path)?;
    let content = adl_fs_ops::read_text_file(root, relative_path, DEFAULT_MAX_FILE_BYTES)?;
    let modified = file_modified_at(&path);
    Ok(WorkspaceFileDocument {
        path: relative_path.replace('\\', "/"),
        content,
        last_modified_at: modified,
    })
}

pub fn create_file(
    root: &Path,
    relative_path: &str,
    content: &str,
) -> Result<WorkspaceFileDocument, AppError> {
    let path = adl_fs_ops::resolve_workspace_path(root, relative_path)?;
    if path.exists() {
        return Err(AppError::InvalidInput(format!(
            "file already exists: {relative_path}"
        )));
    }
    adl_fs_ops::atomic_write(root, relative_path, content)?;
    Ok(WorkspaceFileDocument {
        path: relative_path.replace('\\', "/"),
        content: content.to_string(),
        last_modified_at: file_modified_at(&path),
    })
}

pub fn create_folder(root: &Path, relative_path: &str) -> Result<bool, AppError> {
    let path = adl_fs_ops::resolve_workspace_path(root, relative_path)?;
    if path.exists() {
        return Err(AppError::InvalidInput(format!(
            "path already exists: {relative_path}"
        )));
    }
    fs::create_dir_all(path)?;
    Ok(true)
}

pub fn rename_entry(root: &Path, relative_path: &str, new_name: &str) -> Result<bool, AppError> {
    if new_name.trim().is_empty() {
        return Err(AppError::InvalidInput("new name is required".into()));
    }
    if new_name.contains('/') || new_name.contains('\\') {
        return Err(AppError::InvalidInput(
            "new name must not contain path separators".into(),
        ));
    }
    let src = adl_fs_ops::resolve_workspace_path(root, relative_path)?;
    if !src.exists() {
        return Err(AppError::NotFound(format!(
            "path not found: {relative_path}"
        )));
    }
    let parent = src.parent().unwrap_or(root);
    let dst = parent.join(new_name);
    if dst.exists() {
        return Err(AppError::InvalidInput(format!(
            "target already exists: {}",
            new_name
        )));
    }
    fs::rename(&src, &dst)?;
    Ok(true)
}

pub fn delete_entry(root: &Path, relative_path: &str) -> Result<bool, AppError> {
    let path = adl_fs_ops::resolve_workspace_path(root, relative_path)?;
    if !path.exists() {
        return Err(AppError::NotFound(format!(
            "path not found: {relative_path}"
        )));
    }
    trash::delete(&path).map_err(|e| {
        AppError::InvalidInput(format!("failed to move to trash: {e}"))
    })?;
    Ok(true)
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), AppError> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let src_child = entry.path();
        let dst_child = dst.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_recursive(&src_child, &dst_child)?;
        } else {
            fs::copy(&src_child, &dst_child)?;
        }
    }
    Ok(())
}

fn resolve_conflict_path(dst: &Path) -> PathBuf {
    if !dst.exists() {
        return dst.to_path_buf();
    }
    let parent = dst.parent().unwrap_or(Path::new(""));
    let stem = dst
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let ext = dst
        .extension()
        .map(|s| format!(".{}", s.to_string_lossy()))
        .unwrap_or_default();
    for i in 1..100 {
        let candidate = parent.join(format!("{stem}-copy{i}{ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    dst.to_path_buf()
}

pub fn duplicate_entry(
    root: &Path,
    src_relative_path: &str,
    dst_relative_path: &str,
) -> Result<bool, AppError> {
    let src = adl_fs_ops::resolve_workspace_path(root, src_relative_path)?;
    if !src.exists() {
        return Err(AppError::NotFound(format!(
            "source not found: {src_relative_path}"
        )));
    }
    let dst = resolve_conflict_path(&adl_fs_ops::resolve_workspace_path(root, dst_relative_path)?);
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)?;
    }
    if src.is_dir() {
        copy_dir_recursive(&src, &dst)?;
    } else {
        fs::copy(&src, &dst)?;
    }
    Ok(true)
}

pub fn move_entry(
    root: &Path,
    src_relative_path: &str,
    dst_relative_path: &str,
) -> Result<bool, AppError> {
    let src = adl_fs_ops::resolve_workspace_path(root, src_relative_path)?;
    if !src.exists() {
        return Err(AppError::NotFound(format!(
            "source not found: {src_relative_path}"
        )));
    }
    let dst = adl_fs_ops::resolve_workspace_path(root, dst_relative_path)?;
    if dst.exists() {
        return Err(AppError::InvalidInput(format!(
            "target already exists: {dst_relative_path}"
        )));
    }
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::rename(&src, &dst)?;
    Ok(true)
}

pub fn get_absolute_path(root: &Path, relative_path: &str) -> Result<String, AppError> {
    let path = adl_fs_ops::resolve_workspace_path(root, relative_path)?;
    let absolute = path
        .canonicalize()
        .map_err(|e| AppError::Workspace(format!("failed to resolve path: {e}")))?;
    Ok(absolute.to_string_lossy().replace('\\', "/"))
}

pub fn search_text(root: &Path, query: &str) -> Result<Vec<WorkspaceSearchHit>, AppError> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let files = collect_text_files(root, DEFAULT_MAX_FILE_BYTES)?;
    search_text_in_files(&files, root, query, None)
}

pub async fn search_text_async(
    root: &Path,
    query: &str,
    mut cancellation: tokio::sync::broadcast::Receiver<()>,
) -> Result<Vec<WorkspaceSearchHit>, AppError> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }

    let query_lower = query.to_lowercase();
    let root_owned = root.to_path_buf();
    let files = collect_text_files(root, DEFAULT_MAX_FILE_BYTES)?;

    let mut hits = Vec::new();
    let max_results = MAX_SEARCH_RESULTS;

    for file in files {
        if cancellation.try_recv().is_ok() {
            break;
        }

        let relative = relative_path(&root_owned, &file);
        let content = tokio::fs::read_to_string(&file).await.unwrap_or_default();

        if cancellation.try_recv().is_ok() {
            break;
        }

        for (index, line) in content.lines().enumerate() {
            if line.to_lowercase().contains(&query_lower) {
                hits.push(WorkspaceSearchHit {
                    path: relative.clone(),
                    line: index + 1,
                    preview: line.trim().chars().take(240).collect(),
                });
                if hits.len() >= max_results {
                    return Ok(hits);
                }
            }
            if index % CANCEL_CHECK_INTERVAL == 0 && cancellation.try_recv().is_ok() {
                return Ok(hits);
            }
        }
    }
    Ok(hits)
}

fn search_text_in_files(
    files: &[PathBuf],
    root: &Path,
    query: &str,
    mut cancel: Option<&mut tokio::sync::broadcast::Receiver<()>>,
) -> Result<Vec<WorkspaceSearchHit>, AppError> {
    let query_lower = query.to_lowercase();
    let mut hits = Vec::new();
    let max_results = MAX_SEARCH_RESULTS;

    for file in files {
        if let Some(ch) = &mut cancel {
            if ch.try_recv().is_ok() { break; }
        }

        let relative = relative_path(root, file);
        let content = fs::read_to_string(file).unwrap_or_default();

        for (index, line) in content.lines().enumerate() {
            if line.to_lowercase().contains(&query_lower) {
                hits.push(WorkspaceSearchHit {
                    path: relative.clone(),
                    line: index + 1,
                    preview: line.trim().chars().take(240).collect(),
                });
                if hits.len() >= max_results {
                    return Ok(hits);
                }
            }
            if let Some(ch) = &mut cancel {
                if index % CANCEL_CHECK_INTERVAL == 0 && ch.try_recv().is_ok() {
                    return Ok(hits);
                }
            }
        }
    }
    Ok(hits)
}

pub fn outline(root: &Path, relative_path: &str) -> Result<Vec<FileOutlineItem>, AppError> {
    let doc = read_file(root, relative_path)?;
    let total_lines = doc.content.lines().count().max(1);
    let drafts = match detect_outline_family(relative_path) {
        "markdown" => parse_markdown_outline(&doc.content),
        "python" => parse_python_outline(&doc.content),
        "yaml" => parse_yaml_outline(&doc.content),
        "config" => parse_config_outline(&doc.content),
        "json" => parse_json_outline(&doc.content),
        "html" => parse_html_outline(&doc.content),
        "css" => parse_css_outline(&doc.content),
        "vue" => parse_vue_outline(&doc.content),
        "shell" => parse_shell_outline(&doc.content, false),
        "powershell" => parse_shell_outline(&doc.content, true),
        "sql" => parse_sql_outline(&doc.content),
        "none" => Vec::new(),
        _ => parse_brace_outline(&doc.content),
    };
    Ok(finalize_outline_items(
        drafts,
        &relative_path.replace('\\', "/"),
        total_lines,
    ))
}

fn clean_markdown_heading_label(value: &str) -> &str {
    let trimmed = value.trim();
    let without_closing_hashes = trimmed.trim_end_matches('#').trim_end();
    without_closing_hashes.trim()
}

fn detect_outline_family(relative_path: &str) -> &'static str {
    let normalized = relative_path.replace('\\', "/");
    let file_name = normalized
        .rsplit('/')
        .next()
        .unwrap_or(&normalized)
        .to_ascii_lowercase();
    let extension = file_name
        .rsplit_once('.')
        .map(|(_, ext)| ext)
        .unwrap_or(file_name.as_str());

    match extension {
        "md" | "markdown" => "markdown",
        "py" => "python",
        "yaml" | "yml" => "yaml",
        "toml" | "ini" | "cfg" | "conf" => "config",
        "json" => "json",
        "html" | "htm" | "xml" | "svg" => "html",
        "css" | "scss" | "less" => "css",
        "vue" => "vue",
        "sh" | "bash" | "zsh" | "fish" => "shell",
        "ps1" => "powershell",
        "sql" => "sql",
        "db" | "sqlite" | "sqlite3" => "none",
        _ if file_name == "dockerfile" => "shell",
        _ => "brace",
    }
}

fn finalize_outline_items(
    drafts: Vec<OutlineDraft>,
    relative_path: &str,
    total_lines: usize,
) -> Vec<FileOutlineItem> {
    let mut sorted = drafts;
    sorted.sort_by(|left, right| {
        left.line
            .cmp(&right.line)
            .then(left.depth.cmp(&right.depth))
            .then(left.label.cmp(&right.label))
    });

    let mut line_occurrences: BTreeMap<usize, usize> = BTreeMap::new();
    sorted
        .iter()
        .enumerate()
        .map(|(index, item)| {
            let mut end_line = total_lines;
            for next in sorted.iter().skip(index + 1) {
                if next.depth <= item.depth {
                    end_line = std::cmp::max(item.line, next.line.saturating_sub(1));
                    break;
                }
            }
            let occurrence = line_occurrences.entry(item.line).or_insert(0);
            *occurrence += 1;
            let id = if *occurrence == 1 {
                format!("{relative_path}:{}", item.line)
            } else {
                format!("{relative_path}:{}:{}", item.line, *occurrence)
            };
            FileOutlineItem {
                id,
                label: item.label.clone(),
                kind: item.kind.clone(),
                line: item.line,
                end_line: Some(end_line),
                depth: Some(item.depth),
            }
        })
        .collect()
}

fn parse_markdown_outline(content: &str) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let mut in_fence = false;
    for (index, line_text) in content.lines().enumerate() {
        let trimmed = line_text.trim_start();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence || !trimmed.starts_with('#') {
            continue;
        }
        let depth = trimmed.chars().take_while(|ch| *ch == '#').count().min(6);
        let has_required_space = trimmed
            .chars()
            .nth(depth)
            .map(|ch| ch.is_whitespace())
            .unwrap_or(false);
        if !has_required_space {
            continue;
        }
        let label = clean_markdown_heading_label(&trimmed[depth..]);
        if label.is_empty() {
            continue;
        }
        drafts.push(OutlineDraft {
            label: label.to_string(),
            kind: "heading".to_string(),
            line: index + 1,
            depth,
        });
    }
    drafts
}

fn brace_matchers() -> &'static Vec<(Regex, &'static str)> {
    static MATCHERS: OnceLock<Vec<(Regex, &'static str)>> = OnceLock::new();
    MATCHERS.get_or_init(|| {
        vec![
            (Regex::new(r"^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)").unwrap(), "class"),
            (Regex::new(r"^(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)").unwrap(), "interface"),
            (Regex::new(r"^(?:export\s+)?type\s+([A-Za-z_$][\w$]*)").unwrap(), "type"),
            (Regex::new(r"^(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)").unwrap(), "enum"),
            (Regex::new(r"^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)").unwrap(), "function"),
            (Regex::new(r"^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\{|\[|async\b|function\b|\(?[\w\s,]*\)?\s*=>)").unwrap(), "const"),
            (Regex::new(r"^(?:export\s+)?(?:let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\{|\[|async\b|function\b|\(?[\w\s,]*\)?\s*=>)").unwrap(), "variable"),
            (Regex::new(r"^(?:pub\s+)?fn\s+([A-Za-z_][\w]*)").unwrap(), "function"),
            (Regex::new(r"^(?:pub\s+)?struct\s+([A-Za-z_][\w]*)").unwrap(), "class"),
            (Regex::new(r"^(?:pub\s+)?enum\s+([A-Za-z_][\w]*)").unwrap(), "enum"),
            (Regex::new(r"^(?:pub\s+)?trait\s+([A-Za-z_][\w]*)").unwrap(), "interface"),
            (Regex::new(r"^(?:pub\s+)?impl(?:<[^>]+>)?\s+([A-Za-z_][\w:]*)").unwrap(), "heading"),
            (Regex::new(r"^(?:pub\s+)?type\s+([A-Za-z_][\w]*)").unwrap(), "type"),
            (Regex::new(r"^(?:pub\s+)?const\s+([A-Za-z_][\w]*)").unwrap(), "const"),
            (Regex::new(r"^func(?:\s*\([^)]*\))?\s+([A-Za-z_][\w]*)").unwrap(), "function"),
            (Regex::new(r"^type\s+([A-Za-z_][\w]*)\s+(?:struct|interface)\b").unwrap(), "class"),
            (Regex::new(r"(?i)^(?:public|private|protected|internal|abstract|sealed|static|partial|final|\s)*class\s+([A-Za-z_][\w]*)").unwrap(), "class"),
            (Regex::new(r"(?i)^(?:public|private|protected|internal|abstract|sealed|static|partial|final|\s)*interface\s+([A-Za-z_][\w]*)").unwrap(), "interface"),
            (Regex::new(r"(?i)^(?:public|private|protected|internal|abstract|sealed|static|partial|final|\s)*enum\s+([A-Za-z_][\w]*)").unwrap(), "enum"),
            (Regex::new(r"(?i)^(?:public|private|protected|internal|abstract|sealed|static|partial|final|\s)*record\s+([A-Za-z_][\w]*)").unwrap(), "class"),
            (Regex::new(r"(?i)^(?:public|private|protected|internal|\s)*namespace\s+([A-Za-z_][\w.]*)").unwrap(), "heading"),
            (Regex::new(r"^(?:template\s*<[^>]+>\s*)?(?:class|struct)\s+([A-Za-z_~][\w:]*)").unwrap(), "class"),
            (Regex::new(r"^enum\s+(?:class\s+)?([A-Za-z_][\w]*)").unwrap(), "enum"),
            (Regex::new(r"^(?:module|mod)\s+([A-Za-z_][\w]*)").unwrap(), "heading"),
            (Regex::new(r"^(?:public|private|protected|internal|static|async|virtual|override|abstract|readonly|get|set|\s)+([A-Za-z_$][\w$]*)\s*\([^;=]*\)\s*(?::[^{=]+)?\s*(?:\{|=>)").unwrap(), "method"),
            (Regex::new(r"^(?:public|private|protected|internal|readonly|static|\s)+([A-Za-z_$][\w$]*)\s*[:=]").unwrap(), "property"),
            (Regex::new(r"^(?:[\w:<>,~*&\[\]\s]+)\s+([A-Za-z_~][\w:]*)\s*\([^;]*\)\s*(?:const\b)?\s*(?:\{|$)").unwrap(), "function"),
        ]
    })
}

fn sanitize_brace_line(line_text: &str) -> String {
    static STRING_REGEX: OnceLock<Regex> = OnceLock::new();
    static COMMENT_REGEX: OnceLock<Regex> = OnceLock::new();
    let string_regex = STRING_REGEX.get_or_init(|| {
        Regex::new(r#""(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`"#).unwrap()
    });
    let comment_regex = COMMENT_REGEX.get_or_init(|| {
        Regex::new(r"//.*$|/\*.*?\*/").unwrap()
    });
    let without_strings = string_regex.replace_all(line_text, "\"\"");
    comment_regex.replace_all(&without_strings, "").into_owned()
}

fn count_leading_closers(value: &str, closers: &[char]) -> usize {
    value
        .trim_start()
        .chars()
        .take_while(|ch| closers.contains(ch))
        .count()
}

fn count_chars(value: &str, chars: &[char]) -> usize {
    value.chars().filter(|ch| chars.contains(ch)).count()
}

fn parse_brace_outline(content: &str) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let mut brace_depth = 0usize;
    for (index, line_text) in content.lines().enumerate() {
        let trimmed = line_text.trim();
        if trimmed.is_empty() || trimmed.starts_with("//") || trimmed.starts_with('*') {
            continue;
        }
        let sanitized = sanitize_brace_line(line_text);
        let effective_depth =
            brace_depth.saturating_sub(count_leading_closers(&sanitized, &['}', ']']));
        for (regex, kind) in brace_matchers().iter() {
            if let Some(captures) = regex.captures(trimmed) {
                let label = captures
                    .get(1)
                    .map(|value| value.as_str().trim())
                    .unwrap_or("");
                if label.is_empty() {
                    continue;
                }
                let lowered = label
                    .rsplit("::")
                    .next()
                    .unwrap_or(label)
                    .to_ascii_lowercase();
                if (*kind == "function" || *kind == "method")
                    && BLOCK_KEYWORDS.contains(&lowered.as_str())
                {
                    continue;
                }
                if (*kind == "function" || *kind == "method")
                    && trimmed.ends_with(';')
                    && !trimmed.contains('{')
                {
                    continue;
                }
                drafts.push(OutlineDraft {
                    label: label.to_string(),
                    kind: (*kind).to_string(),
                    line: index + 1,
                    depth: effective_depth + 1,
                });
                break;
            }
        }
        brace_depth = brace_depth
            .saturating_add(count_chars(&sanitized, &['{', '[']))
            .saturating_sub(count_chars(&sanitized, &['}', ']']));
    }
    drafts
}

fn parse_python_outline(content: &str) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let mut indent_stack: Vec<usize> = Vec::new();
    let class_regex = Regex::new(r"^class\s+([A-Za-z_][\w]*)").unwrap();
    let fn_regex = Regex::new(r"^(?:async\s+)?def\s+([A-Za-z_][\w]*)").unwrap();
    for (index, line_text) in content.lines().enumerate() {
        let trimmed = line_text.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let indent = line_text
            .chars()
            .take_while(|ch| ch.is_whitespace())
            .map(|ch| if ch == '\t' { 4 } else { 1 })
            .sum();
        while indent_stack
            .last()
            .copied()
            .is_some_and(|value| indent <= value)
        {
            indent_stack.pop();
        }
        if let Some(captures) = class_regex.captures(trimmed) {
            indent_stack.push(indent);
            drafts.push(OutlineDraft {
                label: captures[1].to_string(),
                kind: "class".to_string(),
                line: index + 1,
                depth: indent_stack.len(),
            });
            continue;
        }
        if let Some(captures) = fn_regex.captures(trimmed) {
            indent_stack.push(indent);
            drafts.push(OutlineDraft {
                label: captures[1].to_string(),
                kind: "function".to_string(),
                line: index + 1,
                depth: indent_stack.len(),
            });
        }
    }
    drafts
}

fn parse_yaml_outline(content: &str) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let mut indent_stack: Vec<usize> = Vec::new();
    let list_key_regex = Regex::new(r"^-+\s*([^:#]+)\s*:\s*(.*)$").unwrap();
    let key_regex = Regex::new(r"^([^:#][^:]*?)\s*:\s*(.*)$").unwrap();
    let list_regex = Regex::new(r"^-+\s*(?:\{|\[)?\s*$").unwrap();
    for (index, line_text) in content.lines().enumerate() {
        let trimmed = line_text.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let indent = line_text
            .chars()
            .take_while(|ch| ch.is_whitespace())
            .map(|ch| if ch == '\t' { 2 } else { 1 })
            .sum();
        while indent_stack
            .last()
            .copied()
            .is_some_and(|value| indent <= value)
        {
            indent_stack.pop();
        }
        if let Some(captures) = list_key_regex.captures(trimmed) {
            indent_stack.push(indent);
            drafts.push(OutlineDraft {
                label: format!("- {}", captures[1].trim()),
                kind: "heading".to_string(),
                line: index + 1,
                depth: indent_stack.len(),
            });
            continue;
        }
        if let Some(captures) = key_regex.captures(trimmed) {
            let suffix = captures
                .get(2)
                .map(|value| value.as_str().trim())
                .unwrap_or("");
            if !suffix.is_empty()
                && suffix != "|"
                && suffix != ">"
                && !suffix.starts_with('{')
                && !suffix.starts_with('[')
            {
                continue;
            }
            indent_stack.push(indent);
            drafts.push(OutlineDraft {
                label: captures[1]
                    .trim()
                    .trim_matches('"')
                    .trim_matches('\'')
                    .to_string(),
                kind: "heading".to_string(),
                line: index + 1,
                depth: indent_stack.len(),
            });
            continue;
        }
        if list_regex.is_match(trimmed) {
            indent_stack.push(indent);
            drafts.push(OutlineDraft {
                label: "- item".to_string(),
                kind: "heading".to_string(),
                line: index + 1,
                depth: indent_stack.len(),
            });
        }
    }
    drafts
}

fn parse_config_outline(content: &str) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let section_regex = Regex::new(r"^\[([^\]]+)\]$").unwrap();
    let entry_regex = Regex::new(r"^([A-Za-z0-9_.-]+)\s*=\s*(.+)$").unwrap();
    let mut current_section_depth = 0usize;
    for (index, line_text) in content.lines().enumerate() {
        let trimmed = line_text.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with(';') {
            continue;
        }
        if let Some(captures) = section_regex.captures(trimmed) {
            let label = captures[1].trim().to_string();
            current_section_depth = label
                .split('.')
                .filter(|part| !part.is_empty())
                .count()
                .max(1);
            drafts.push(OutlineDraft {
                label,
                kind: "heading".to_string(),
                line: index + 1,
                depth: current_section_depth,
            });
            continue;
        }
        if let Some(captures) = entry_regex.captures(trimmed) {
            let value = captures[2].trim();
            if value.starts_with('{') || value.starts_with('[') || value.is_empty() {
                drafts.push(OutlineDraft {
                    label: captures[1].to_string(),
                    kind: "heading".to_string(),
                    line: index + 1,
                    depth: current_section_depth + 1,
                });
            }
        }
    }
    drafts
}

fn parse_json_outline(content: &str) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let mut brace_depth = 0usize;
    let key_regex = Regex::new(r#"^"([^"]+)"\s*:\s*(.*)$"#).unwrap();
    for (index, line_text) in content.lines().enumerate() {
        let trimmed = line_text.trim();
        if trimmed.is_empty() {
            continue;
        }
        let sanitized = line_text.replace('"', "");
        let effective_depth =
            brace_depth.saturating_sub(count_leading_closers(&sanitized, &['}', ']']));
        if let Some(captures) = key_regex.captures(trimmed) {
            let value = captures
                .get(2)
                .map(|capture| capture.as_str().trim())
                .unwrap_or("");
            if value.is_empty() || value.starts_with('{') || value.starts_with('[') {
                drafts.push(OutlineDraft {
                    label: captures[1].to_string(),
                    kind: "heading".to_string(),
                    line: index + 1,
                    depth: effective_depth + 1,
                });
            }
        }
        brace_depth = brace_depth
            .saturating_add(count_chars(&sanitized, &['{', '[']))
            .saturating_sub(count_chars(&sanitized, &['}', ']']));
    }
    drafts
}

fn should_outline_html_tag(tag: &str, attrs: &str) -> bool {
    const STRUCTURAL: &[&str] = &[
        "html",
        "head",
        "body",
        "main",
        "header",
        "footer",
        "section",
        "article",
        "aside",
        "nav",
        "details",
        "summary",
        "dialog",
        "form",
        "fieldset",
        "div",
        "template",
        "script",
        "style",
        "table",
        "thead",
        "tbody",
        "tfoot",
        "tr",
        "td",
        "th",
        "ul",
        "ol",
        "li",
        "dl",
        "dt",
        "dd",
        "svg",
        "g",
        "path",
        "symbol",
        "defs",
        "slot",
        "component",
    ];
    STRUCTURAL.contains(&tag)
        || tag.contains('-')
        || attrs.contains(" id=")
        || attrs.contains(" class=")
        || attrs.contains(" name=")
        || attrs.contains(" role=")
}

fn format_html_tag_label(tag: &str, attrs: &str) -> String {
    let id_regex = Regex::new(r#"id=["']([^"']+)["']"#).unwrap();
    let class_regex = Regex::new(r#"class=["']([^"']+)["']"#).unwrap();
    let name_regex = Regex::new(r#"(?:name|role)=["']([^"']+)["']"#).unwrap();
    if let Some(captures) = id_regex.captures(attrs) {
        return format!("{tag}#{}", &captures[1]);
    }
    if let Some(captures) = class_regex.captures(attrs) {
        let first_class = captures[1].split_whitespace().next().unwrap_or("");
        if !first_class.is_empty() {
            return format!("{tag}.{first_class}");
        }
    }
    if let Some(captures) = name_regex.captures(attrs) {
        return format!("{tag}[{}]", &captures[1]);
    }
    tag.to_string()
}

fn parse_html_outline(content: &str) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let mut tag_stack: Vec<String> = Vec::new();
    let tag_regex = Regex::new(r#"</?([A-Za-z][\w:-]*)([^>]*?)(/?)>"#).unwrap();
    for (index, line_text) in content.lines().enumerate() {
        for captures in tag_regex.captures_iter(line_text) {
            let raw = captures.get(0).map(|value| value.as_str()).unwrap_or("");
            let tag = captures
                .get(1)
                .map(|value| value.as_str().to_ascii_lowercase())
                .unwrap_or_default();
            let attrs = captures.get(2).map(|value| value.as_str()).unwrap_or("");
            let self_closing = captures
                .get(3)
                .map(|value| !value.as_str().is_empty())
                .unwrap_or(false)
                || matches!(
                    tag.as_str(),
                    "area"
                        | "base"
                        | "br"
                        | "col"
                        | "embed"
                        | "hr"
                        | "img"
                        | "input"
                        | "link"
                        | "meta"
                        | "param"
                        | "source"
                        | "track"
                        | "wbr"
                );
            let is_closing = raw.starts_with("</");
            if is_closing {
                while let Some(current) = tag_stack.pop() {
                    if current == tag {
                        break;
                    }
                }
                continue;
            }
            if should_outline_html_tag(&tag, attrs) {
                drafts.push(OutlineDraft {
                    label: format_html_tag_label(&tag, attrs),
                    kind: "heading".to_string(),
                    line: index + 1,
                    depth: tag_stack.len() + 1,
                });
            }
            if !self_closing {
                tag_stack.push(tag);
            }
        }
    }
    drafts
}

fn parse_css_outline(content: &str) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let mut brace_depth = 0usize;
    for (index, line_text) in content.lines().enumerate() {
        let trimmed = line_text.trim();
        if trimmed.is_empty() || trimmed.starts_with("/*") || trimmed.starts_with('*') {
            continue;
        }
        if let Some(open_index) = line_text.find('{') {
            let label = line_text[..open_index].trim();
            if !label.is_empty() && !label.contains(':') {
                drafts.push(OutlineDraft {
                    label: label.to_string(),
                    kind: "heading".to_string(),
                    line: index + 1,
                    depth: brace_depth + 1,
                });
            }
        }
        brace_depth = brace_depth
            .saturating_add(count_chars(line_text, &['{']))
            .saturating_sub(count_chars(line_text, &['}']));
    }
    drafts
}

fn parse_vue_outline(content: &str) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let lines: Vec<&str> = content.lines().collect();
    let open_regex = Regex::new(r"^\s*<(template|script|style)([^>]*)>").unwrap();
    let mut index = 0usize;
    while index < lines.len() {
        let line = lines[index];
        let Some(captures) = open_regex.captures(line) else {
            index += 1;
            continue;
        };
        let section = captures
            .get(1)
            .map(|value| value.as_str().to_ascii_lowercase())
            .unwrap_or_else(|| "script".to_string());
        let start_line = index + 1;
        let end_tag = format!("</{section}>");
        let mut end_index = index + 1;
        while end_index < lines.len() && !lines[end_index].to_ascii_lowercase().contains(&end_tag) {
            end_index += 1;
        }
        drafts.push(OutlineDraft {
            label: section.clone(),
            kind: "heading".to_string(),
            line: start_line,
            depth: 1,
        });
        let inner_content = lines[index + 1..end_index].join("\n");
        let inner_drafts = if section == "template" {
            parse_html_outline(&inner_content)
        } else if section == "style" {
            parse_css_outline(&inner_content)
        } else {
            parse_brace_outline(&inner_content)
        };
        drafts.extend(inner_drafts.into_iter().map(|draft| OutlineDraft {
            line: draft.line + start_line,
            depth: draft.depth + 1,
            ..draft
        }));
        index = end_index + 1;
    }
    drafts
}

fn parse_shell_outline(content: &str, powershell: bool) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let mut depth = 0usize;
    let ps_function_regex = Regex::new(r"(?i)^function\s+([A-Za-z_][\w-]*)").unwrap();
    let sh_function_regex = Regex::new(r"^(?:function\s+)?([A-Za-z_][\w-]*)\s*\(\)\s*\{").unwrap();
    let ps_block_regex =
        Regex::new(r"(?i)^(if|foreach|for|while|switch|try|catch|finally|class|enum)\b").unwrap();
    let sh_block_regex = Regex::new(r"^(if|for|while|until|case|select)\b").unwrap();
    let shell_close_regex = Regex::new(r"^(fi|done|esac)\b").unwrap();
    for (index, line_text) in content.lines().enumerate() {
        let trimmed = line_text.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if trimmed.starts_with('}') || shell_close_regex.is_match(trimmed) {
            depth = depth.saturating_sub(1);
        }
        let line = index + 1;
        if let Some(captures) = if powershell {
            ps_function_regex.captures(trimmed)
        } else {
            sh_function_regex.captures(trimmed)
        } {
            drafts.push(OutlineDraft {
                label: captures[1].to_string(),
                kind: "function".to_string(),
                line,
                depth: depth + 1,
            });
        } else if let Some(captures) = if powershell {
            ps_block_regex.captures(trimmed)
        } else {
            sh_block_regex.captures(trimmed)
        } {
            drafts.push(OutlineDraft {
                label: captures[1].to_ascii_lowercase(),
                kind: "heading".to_string(),
                line,
                depth: depth + 1,
            });
        }
        let opens_block = if powershell {
            trimmed.ends_with('{')
        } else {
            trimmed.ends_with('{')
                || trimmed.ends_with(" do")
                || trimmed.ends_with(" then")
                || trimmed.starts_with("case ")
        };
        if opens_block {
            depth += 1;
        }
    }
    drafts
}

fn parse_sql_outline(content: &str) -> Vec<OutlineDraft> {
    let mut drafts = Vec::new();
    let mut inside_create_table = false;
    let create_table_regex = Regex::new(r#"(?i)^create\s+table\s+([A-Za-z0-9_."]+)"#).unwrap();
    let create_other_regex =
        Regex::new(r#"(?i)^create\s+(view|index|function|procedure)\s+([A-Za-z0-9_."]+)"#).unwrap();
    let alter_table_regex = Regex::new(r#"(?i)^alter\s+table\s+([A-Za-z0-9_."]+)"#).unwrap();
    let column_regex = Regex::new(r#"^([A-Za-z_"][\w"]*)\s+[A-Za-z_]"#).unwrap();
    for (index, line_text) in content.lines().enumerate() {
        let trimmed = line_text.trim();
        if trimmed.is_empty() || trimmed.starts_with("--") {
            continue;
        }
        let line = index + 1;
        if let Some(captures) = create_table_regex.captures(trimmed) {
            drafts.push(OutlineDraft {
                label: format!("table {}", captures[1].replace('"', "")),
                kind: "type".to_string(),
                line,
                depth: 1,
            });
            inside_create_table = true;
            continue;
        }
        if let Some(captures) = create_other_regex.captures(trimmed) {
            let category = captures[1].to_ascii_lowercase();
            drafts.push(OutlineDraft {
                label: format!("{category} {}", captures[2].replace('"', "")),
                kind: if category == "function" {
                    "function".to_string()
                } else {
                    "heading".to_string()
                },
                line,
                depth: 1,
            });
            inside_create_table = false;
            continue;
        }
        if let Some(captures) = alter_table_regex.captures(trimmed) {
            drafts.push(OutlineDraft {
                label: format!("alter {}", captures[1].replace('"', "")),
                kind: "heading".to_string(),
                line,
                depth: 1,
            });
            inside_create_table = false;
            continue;
        }
        if inside_create_table {
            if trimmed == ")" || trimmed == ");" {
                inside_create_table = false;
                continue;
            }
            if let Some(captures) = column_regex.captures(trimmed) {
                drafts.push(OutlineDraft {
                    label: captures[1].replace('"', ""),
                    kind: "property".to_string(),
                    line,
                    depth: 2,
                });
            }
        }
    }
    drafts
}

pub fn build_retrieval_snapshot(
    workspace_id: &str,
    root: &Path,
) -> Result<RetrievalSnapshot, AppError> {
    let started = now_ms();
    let (files, extensions) = collect_text_files_with_stats(root, DEFAULT_MAX_FILE_BYTES)?;
    let mut top_extensions: Vec<_> = extensions
        .into_iter()
        .map(|(extension, count)| RetrievalFileTypeCount { extension, count })
        .collect();
    top_extensions.sort_by_key(|entry| std::cmp::Reverse(entry.count));
    top_extensions.truncate(12);
    let repo_map: Vec<RepoMapEntry> = list_tree(root)?
        .into_iter()
        .flat_map(flatten_tree)
        .take(200)
        .collect();
    info!(
        workspace_id = workspace_id,
        scanned_files = files.len(),
        indexed_text_files = files.len(),
        repo_map_entries = repo_map.len(),
        top_extensions = ?top_extensions,
        "retrieval snapshot built"
    );
    debug!(
        workspace_id = workspace_id,
        repo_map_preview = ?repo_map
            .iter()
            .take(40)
            .map(|entry| format!("{} ({})", entry.path, entry.r#type))
            .collect::<Vec<_>>(),
        "repo-map preview (first 40 entries)"
    );
    Ok(RetrievalSnapshot {
        workspace_id: workspace_id.to_string(),
        root_path: root.to_string_lossy().to_string(),
        status: RetrievalStatusV1::Completed,
        scanned_files: files.len(),
        indexed_text_files: files.len(),
        started_at: Some(started),
        updated_at: now_ms(),
        completed_at: Some(now_ms()),
        last_error: None,
        top_extensions,
        repo_map,
    })
}

pub async fn build_retrieval_snapshot_async(
    workspace_id: &str,
    root: &Path,
    mut cancellation: tokio::sync::broadcast::Receiver<()>,
) -> Result<RetrievalSnapshot, AppError> {
    let started = now_ms();
    let root_owned = root.to_path_buf();

    let files = tokio::task::spawn_blocking({
        let r = root_owned.clone();
        let max_files = MAX_COLLECTED_FILES;
        move || {
            let mut all = collect_text_files(&r, DEFAULT_MAX_FILE_BYTES)?;
            all.truncate(max_files);
            Ok::<Vec<PathBuf>, AppError>(all)
        }
    })
    .await
    .map_err(|e| AppError::Workspace(format!("task join error: {e}")))??;

    if cancellation.try_recv().is_ok() {
        return Ok(RetrievalSnapshot {
            workspace_id: workspace_id.to_string(),
            root_path: root.to_string_lossy().to_string(),
            status: RetrievalStatusV1::Cancelled,
            scanned_files: files.len(),
            indexed_text_files: files.len(),
            started_at: Some(started),
            updated_at: now_ms(),
            completed_at: Some(now_ms()),
            last_error: Some("cancelled".to_string()),
            top_extensions: vec![],
            repo_map: vec![],
        });
    }

    let mut extensions: BTreeMap<String, i32> = BTreeMap::new();
    for file in &files {
        let ext = file
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("[none]")
            .to_string();
        *extensions.entry(ext).or_insert(0) += 1;
    }
    let mut top_extensions: Vec<_> = extensions
        .into_iter()
        .map(|(extension, count)| RetrievalFileTypeCount { extension, count })
        .collect();
    top_extensions.sort_by_key(|entry| std::cmp::Reverse(entry.count));
    top_extensions.truncate(12);

    if cancellation.try_recv().is_ok() {
        return Ok(RetrievalSnapshot {
            workspace_id: workspace_id.to_string(),
            root_path: root.to_string_lossy().to_string(),
            status: RetrievalStatusV1::Cancelled,
            scanned_files: files.len(),
            indexed_text_files: files.len(),
            started_at: Some(started),
            updated_at: now_ms(),
            completed_at: Some(now_ms()),
            last_error: Some("cancelled".to_string()),
            top_extensions,
            repo_map: vec![],
        });
    }

    let repo_map: Vec<RepoMapEntry> = tokio::task::spawn_blocking({
        let r = root_owned.clone();
        move || list_tree(&r)
    })
    .await
    .map_err(|e| AppError::Workspace(format!("task join error: {e}")))?
    .unwrap_or_default()
    .into_iter()
    .flat_map(flatten_tree)
    .take(200)
    .collect();

    info!(
        workspace_id = workspace_id,
        scanned_files = files.len(),
        indexed_text_files = files.len(),
        repo_map_entries = repo_map.len(),
        top_extensions = ?top_extensions,
        "retrieval snapshot built (async)"
    );

    Ok(RetrievalSnapshot {
        workspace_id: workspace_id.to_string(),
        root_path: root.to_string_lossy().to_string(),
        status: RetrievalStatusV1::Completed,
        scanned_files: files.len(),
        indexed_text_files: files.len(),
        started_at: Some(started),
        updated_at: now_ms(),
        completed_at: Some(now_ms()),
        last_error: None,
        top_extensions,
        repo_map,
    })
}

fn flatten_tree(node: WorkspaceTreeNode) -> Vec<RepoMapEntry> {
    let mut entries = vec![RepoMapEntry {
        path: node.path.clone(),
        r#type: node.kind.clone(),
    }];
    for child in node.children {
        entries.extend(flatten_tree(child));
    }
    entries
}

fn collect_text_files(root: &Path, max_file_bytes: u64) -> Result<Vec<PathBuf>, AppError> {
    let mut files = Vec::new();
    collect_text_files_inner(root, root, max_file_bytes, &mut files)?;
    Ok(files)
}

fn collect_text_files_with_stats(
    root: &Path,
    max_file_bytes: u64,
) -> Result<(Vec<PathBuf>, BTreeMap<String, i32>), AppError> {
    let mut files = Vec::new();
    let mut extensions: BTreeMap<String, i32> = BTreeMap::new();
    collect_text_files_inner_ext(root, root, max_file_bytes, &mut files, &mut extensions)?;
    Ok((files, extensions))
}

fn collect_text_files_inner(
    root: &Path,
    dir: &Path,
    max_file_bytes: u64,
    files: &mut Vec<PathBuf>,
) -> Result<(), AppError> {
    collect_text_files_inner_int(root, dir, max_file_bytes, files, None)
}

fn collect_text_files_inner_ext(
    root: &Path,
    dir: &Path,
    max_file_bytes: u64,
    files: &mut Vec<PathBuf>,
    extensions: &mut BTreeMap<String, i32>,
) -> Result<(), AppError> {
    collect_text_files_inner_int(root, dir, max_file_bytes, files, Some(extensions))
}

fn collect_text_files_inner_int(
    root: &Path,
    dir: &Path,
    max_file_bytes: u64,
    files: &mut Vec<PathBuf>,
    mut extensions: Option<&mut BTreeMap<String, i32>>,
) -> Result<(), AppError> {
    for entry in fs::read_dir(dir)? {
        if files.len() >= MAX_COLLECTED_FILES {
            return Ok(());
        }
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if should_ignore(&name) {
            continue;
        }
        if path.is_dir() {
            collect_text_files_inner_int(root, &path, max_file_bytes, files, extensions.as_deref_mut())?;
        } else if path.is_file() {
            let relative = relative_path(root, &path);
            if adl_fs_ops::read_text_file(root, &relative, max_file_bytes).is_ok() {
                if let Some(ref mut ext_map) = extensions {
                    let ext = path
                        .extension()
                        .and_then(|value| value.to_str())
                        .unwrap_or("[none]")
                        .to_string();
                    *ext_map.entry(ext).or_insert(0) += 1;
                }
                files.push(path);
            }
        }
    }
    Ok(())
}

fn should_ignore(name: &str) -> bool {
    IGNORED_DIRS.iter().any(|ignored| ignored == &name)
}

fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn file_modified_at(path: &Path) -> i64 {
    fs::metadata(path)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_else(now_ms)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    fn run_git_test(dir: &Path, args: &[&str]) {
        let status = Command::new("git")
            .args(args)
            .current_dir(dir)
            .status()
            .expect("git should be available for workspace tests");
        assert!(
            status.success(),
            "git command failed: git {}",
            args.join(" ")
        );
    }

    fn init_git_repo(dir: &Path) {
        run_git_test(dir, &["init"]);
        run_git_test(dir, &["config", "user.email", "adl-tests@example.com"]);
        run_git_test(dir, &["config", "user.name", "ADL Tests"]);
    }

    #[test]
    fn detects_workspace_type_from_cargo() {
        let dir = std::env::temp_dir().join(format!("adl-workspace-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("Cargo.toml"), "[package]\nname='x'").unwrap();
        assert_eq!(workspace_type(&dir), WorkspaceType::Rust);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn creates_file_and_folder_in_workspace() {
        let dir =
            std::env::temp_dir().join(format!("adl-workspace-create-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        let created = create_file(&dir, "docs/spec.md", "# spec\n").unwrap();
        assert_eq!(created.path, "docs/spec.md");
        assert!(dir.join("docs/spec.md").exists());

        create_folder(&dir, "empty-dir").unwrap();
        let tree = list_tree(&dir).unwrap();
        assert!(tree.iter().any(|node| node.path == "docs"));
        assert!(tree.iter().any(|node| node.path == "empty-dir"));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    #[ignore = "requires git in PATH"]
    fn captures_git_snapshot_for_untracked_and_unstaged_files() {
        let dir = std::env::temp_dir().join(format!("adl-workspace-git-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        init_git_repo(&dir);
        std::fs::write(dir.join("tracked.txt"), "hello\n").unwrap();
        run_git_test(&dir, &["add", "tracked.txt"]);
        run_git_test(&dir, &["commit", "-m", "init"]);

        std::fs::write(dir.join("tracked.txt"), "hello again\n").unwrap();
        std::fs::write(dir.join("new file.txt"), "new\n").unwrap();

        let snapshot = capture_git_snapshot(&dir);
        assert!(snapshot.unstaged.iter().any(|path| path == "tracked.txt"));
        assert!(snapshot.untracked.iter().any(|path| path == "new file.txt"));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn markdown_outline_keeps_full_heading_text_and_depth() {
        let dir =
            std::env::temp_dir().join(format!("adl-workspace-outline-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("AGENTS.md"),
            "# AI 数字生命 - 项目治理规则\n\n## 当前阶段\n\n### 已实现功能\n",
        )
        .unwrap();

        let items = outline(&dir, "AGENTS.md").unwrap();

        assert_eq!(items.len(), 3);
        assert_eq!(items[0].label, "AI 数字生命 - 项目治理规则");
        assert_eq!(items[0].depth, Some(1));
        assert_eq!(items[1].label, "当前阶段");
        assert_eq!(items[1].depth, Some(2));
        assert_eq!(items[2].label, "已实现功能");
        assert_eq!(items[2].depth, Some(3));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn markdown_outline_ignores_fenced_headings_and_closing_hashes() {
        let dir = std::env::temp_dir().join(format!(
            "adl-workspace-outline-fence-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("README.md"),
            "# Visible Heading ###\n\n```md\n# Hidden Heading\n```\n\n## Second Heading\n",
        )
        .unwrap();

        let items = outline(&dir, "README.md").unwrap();

        assert_eq!(items.len(), 2);
        assert_eq!(items[0].label, "Visible Heading");
        assert_eq!(items[0].depth, Some(1));
        assert_eq!(items[1].label, "Second Heading");
        assert_eq!(items[1].depth, Some(2));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn code_outline_builds_nested_brace_symbols() {
        let dir = std::env::temp_dir().join(format!(
            "adl-workspace-outline-brace-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(dir.join("src")).unwrap();
        std::fs::write(
            dir.join("src/runtime.ts"),
            "export class Runtime {\n  public boot() {\n    const state = {\n      ready: true\n    };\n  }\n}\n",
        )
        .unwrap();

        let items = outline(&dir, "src/runtime.ts").unwrap();

        assert_eq!(items.len(), 3);
        assert_eq!(items[0].label, "Runtime");
        assert_eq!(items[0].kind, "class");
        assert_eq!(items[0].depth, Some(1));
        assert_eq!(items[1].label, "boot");
        assert_eq!(items[1].kind, "method");
        assert_eq!(items[1].depth, Some(2));
        assert_eq!(items[2].label, "state");
        assert_eq!(items[2].kind, "const");
        assert_eq!(items[2].depth, Some(3));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn code_outline_supports_python_yaml_and_vue_structures() {
        let dir = std::env::temp_dir().join(format!(
            "adl-workspace-outline-structured-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(dir.join("app")).unwrap();
        std::fs::write(
            dir.join("app/main.py"),
            "class App:\n    def run(self):\n        def inner():\n            return True\n",
        )
        .unwrap();
        std::fs::write(
            dir.join("app/config.yaml"),
            "server:\n  http:\n    routes:\n      - path:\n          secure: true\n",
        )
        .unwrap();
        std::fs::write(
            dir.join("app/HeroCard.vue"),
            "<template>\n  <section id=\"hero\">\n    <div class=\"panel\"></div>\n  </section>\n</template>\n<script>\nexport class HeroCard {\n  public render() {\n  }\n}\n</script>\n<style>\n.hero-card {\n  color: red;\n}\n</style>\n",
        )
        .unwrap();

        let py_items = outline(&dir, "app/main.py").unwrap();
        let yaml_items = outline(&dir, "app/config.yaml").unwrap();
        let vue_items = outline(&dir, "app/HeroCard.vue").unwrap();

        assert_eq!(
            py_items
                .iter()
                .map(|item| (item.label.as_str(), item.depth))
                .collect::<Vec<_>>(),
            vec![("App", Some(1)), ("run", Some(2)), ("inner", Some(3))]
        );
        assert_eq!(
            yaml_items
                .iter()
                .map(|item| (item.label.as_str(), item.depth))
                .collect::<Vec<_>>(),
            vec![
                ("server", Some(1)),
                ("http", Some(2)),
                ("routes", Some(3)),
                ("- path", Some(4))
            ]
        );
        assert_eq!(
            vue_items
                .iter()
                .map(|item| (item.label.as_str(), item.depth))
                .collect::<Vec<_>>(),
            vec![
                ("template", Some(1)),
                ("section#hero", Some(2)),
                ("div.panel", Some(3)),
                ("script", Some(1)),
                ("HeroCard", Some(2)),
                ("render", Some(3)),
                ("style", Some(1)),
                (".hero-card", Some(2))
            ]
        );

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    #[ignore = "requires git in PATH"]
    fn reads_deleted_change_preview_from_head() {
        let dir = std::env::temp_dir().join(format!(
            "adl-workspace-change-preview-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(dir.join("resume")).unwrap();
        init_git_repo(&dir);
        std::fs::write(dir.join("resume/index.html"), "<h1>resume</h1>\n").unwrap();
        run_git_test(&dir, &["add", "resume/index.html"]);
        run_git_test(&dir, &["commit", "-m", "init"]);

        std::fs::remove_file(dir.join("resume/index.html")).unwrap();

        let preview = read_change_preview(&dir, "resume/index.html").unwrap();
        assert_eq!(preview.change_kind, WorkspaceChangeKind::Deleted);
        assert_eq!(preview.status, WorkspaceChangeStatus::Modified);
        assert!(preview.base_exists);
        assert!(!preview.current_exists);
        assert!(preview.base_content.contains("resume"));
        assert!(preview.current_content.is_empty());

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn stable_workspace_id_normalizes_path_separators() {
        let path1 = Path::new("C:\\Users\\test\\workspace");
        let path2 = Path::new("C:/Users/test/workspace");
        let id1 = stable_workspace_id(path1);
        let id2 = stable_workspace_id(path2);
        assert_eq!(id1, id2);
    }

    #[test]
    fn stable_workspace_id_is_case_insensitive() {
        let path1 = Path::new("C:/Users/TEST/workspace");
        let path2 = Path::new("C:/Users/test/workspace");
        let id1 = stable_workspace_id(path1);
        let id2 = stable_workspace_id(path2);
        assert_eq!(id1, id2);
    }

    #[test]
    fn stable_workspace_id_produces_consistent_format() {
        let path = Path::new("C:/Users/test/workspace");
        let id = stable_workspace_id(path);
        assert!(id.starts_with("workspace_"));
        assert_eq!(id.len(), "workspace_".len() + 8);
    }

    #[test]
    fn workspace_type_detection_rust() {
        let dir = std::env::temp_dir().join(format!("adl-ws-type-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("Cargo.toml"), "[package]\nname='x'").unwrap();
        assert_eq!(workspace_type(&dir), WorkspaceType::Rust);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn workspace_type_detection_node() {
        let dir = std::env::temp_dir().join(format!("adl-ws-type-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("package.json"), "{}").unwrap();
        assert_eq!(workspace_type(&dir), WorkspaceType::Node);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn workspace_type_detection_python() {
        let dir = std::env::temp_dir().join(format!("adl-ws-type-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("pyproject.toml"), "[project]").unwrap();
        assert_eq!(workspace_type(&dir), WorkspaceType::Python);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn workspace_type_detection_go() {
        let dir = std::env::temp_dir().join(format!("adl-ws-type-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("go.mod"), "module example").unwrap();
        assert_eq!(workspace_type(&dir), WorkspaceType::Go);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn workspace_type_detection_java() {
        let dir = std::env::temp_dir().join(format!("adl-ws-type-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("pom.xml"), "<project>").unwrap();
        assert_eq!(workspace_type(&dir), WorkspaceType::Java);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn workspace_type_detection_unknown() {
        let dir = std::env::temp_dir().join(format!("adl-ws-type-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(workspace_type(&dir), WorkspaceType::Unknown);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    #[ignore = "requires git in PATH"]
    fn git_has_local_changes_returns_false_for_clean_repo() {
        let dir = std::env::temp_dir().join(format!("adl-ws-clean-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        init_git_repo(&dir);
        std::fs::write(dir.join("README.md"), "# Test").unwrap();
        run_git_test(&dir, &["add", "README.md"]);
        run_git_test(&dir, &["commit", "-m", "init"]);

        let snapshot = capture_git_snapshot(&dir);
        assert!(!git_has_local_changes(&snapshot));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    #[ignore = "requires git in PATH"]
    fn git_has_local_changes_returns_true_with_unstaged() {
        let dir = std::env::temp_dir().join(format!("adl-ws-unstaged-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        init_git_repo(&dir);
        std::fs::write(dir.join("README.md"), "# Test").unwrap();
        run_git_test(&dir, &["add", "README.md"]);
        run_git_test(&dir, &["commit", "-m", "init"]);
        std::fs::write(dir.join("README.md"), "# Test Updated").unwrap();

        let snapshot = capture_git_snapshot(&dir);
        assert!(git_has_local_changes(&snapshot));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    #[ignore = "requires git in PATH"]
    fn git_has_local_changes_returns_true_with_untracked() {
        let dir = std::env::temp_dir().join(format!("adl-ws-untracked-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        init_git_repo(&dir);
        std::fs::write(dir.join("README.md"), "# Test").unwrap();
        run_git_test(&dir, &["add", "README.md"]);
        run_git_test(&dir, &["commit", "-m", "init"]);
        std::fs::write(dir.join("new.txt"), "new file").unwrap();

        let snapshot = capture_git_snapshot(&dir);
        assert!(git_has_local_changes(&snapshot));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    #[ignore = "requires git in PATH"]
    fn list_git_branches_returns_current_branch() {
        let dir = std::env::temp_dir().join(format!("adl-ws-branches-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        init_git_repo(&dir);

        let branches = list_git_branches(&dir).unwrap();
        assert!(!branches.is_empty());
        let current = branches.iter().find(|b| b.is_current);
        assert!(current.is_some());

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn search_text_returns_matches() {
        let dir = std::env::temp_dir().join(format!("adl-ws-search-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("test.txt"), "hello world\nfoo bar\nhello again").unwrap();

        let hits = search_text(&dir, "hello").unwrap();
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].path, "test.txt");
        assert_eq!(hits[0].line, 1);
        assert_eq!(hits[1].line, 3);

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn search_text_is_case_insensitive() {
        let dir = std::env::temp_dir().join(format!("adl-ws-search-case-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("test.txt"), "Hello World").unwrap();

        let hits = search_text(&dir, "hello").unwrap();
        assert_eq!(hits.len(), 1);

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn search_text_returns_empty_for_no_matches() {
        let dir = std::env::temp_dir().join(format!("adl-ws-search-empty-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("test.txt"), "hello world").unwrap();

        let hits = search_text(&dir, "xyz").unwrap();
        assert!(hits.is_empty());

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn search_text_ignores_empty_query() {
        let dir = std::env::temp_dir().join(format!("adl-ws-search-empty-q-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("test.txt"), "hello world").unwrap();

        let hits = search_text(&dir, "").unwrap();
        assert!(hits.is_empty());

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn search_text_limits_results() {
        let dir = std::env::temp_dir().join(format!("adl-ws-search-limit-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        for i in 0..300 {
            std::fs::write(dir.join(format!("file{}.txt", i)), "hello world").unwrap();
        }

        let hits = search_text(&dir, "hello").unwrap();
        assert!(hits.len() <= 200);

        let _ = std::fs::remove_dir_all(dir);
    }
}
