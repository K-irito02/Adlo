//! Workspace detection, lightweight indexing, search, and git snapshots.

use adl_errors::AppError;
use adl_kernel::{
    now_ms, FileOutlineItem, GitSnapshot, RecentWorkspaceEntry, RepoMapEntry,
    RetrievalFileTypeCount, RetrievalSnapshot, RetrievalStatusV1, WorkspaceFileDocument,
    WorkspaceMeta, WorkspaceSearchHit, WorkspaceStatus, WorkspaceTreeNode, WorkspaceType,
};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tracing::{debug, info};

const DEFAULT_MAX_FILE_BYTES: u64 = 1024 * 1024;
const MAX_SEARCH_RESULTS: usize = 200;
const MAX_TREE_DEPTH: usize = 64;
const MAX_TREE_NODES: usize = 200_000;
const IGNORED_DIRS: &[&str] = &[
    ".git",
    "target",
    "node_modules",
    "dist",
    "build",
    ".next",
    ".cache",
];

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
        .and_then(|value| value.to_str())
        .unwrap_or("workspace")
        .to_string();
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
    let porcelain = run_git(root, &["status", "--porcelain"]).unwrap_or_default();
    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();
    let mut conflicts = Vec::new();
    for line in porcelain.lines() {
        if line.len() < 3 {
            continue;
        }
        let status = &line[0..2];
        let path = line[3..].to_string();
        if status == "??" {
            untracked.push(path);
        } else if status.contains('U') || matches!(status, "AA" | "DD") {
            conflicts.push(path);
        } else {
            if !status[0..1].trim().is_empty() {
                staged.push(path.clone());
            }
            if !status[1..2].trim().is_empty() {
                unstaged.push(path);
            }
        }
    }
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

fn first_non_empty_line(value: String) -> Option<String> {
    value
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(ToOwned::to_owned)
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
                children: list_tree_inner(root, &path, depth + 1, remaining).unwrap_or_else(|err| {
                    debug!(
                        dir = %path.to_string_lossy(),
                        error = %err,
                        "failed to read child directory for workspace tree"
                    );
                    vec![]
                }),
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

pub fn search_text(root: &Path, query: &str) -> Result<Vec<WorkspaceSearchHit>, AppError> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let mut hits = Vec::new();
    for file in collect_text_files(root, DEFAULT_MAX_FILE_BYTES)? {
        let relative = relative_path(root, &file);
        let content = fs::read_to_string(&file).unwrap_or_default();
        for (index, line) in content.lines().enumerate() {
            if line.to_lowercase().contains(&query.to_lowercase()) {
                hits.push(WorkspaceSearchHit {
                    path: relative.clone(),
                    line: index + 1,
                    preview: line.trim().chars().take(240).collect(),
                });
                if hits.len() >= MAX_SEARCH_RESULTS {
                    return Ok(hits);
                }
            }
        }
    }
    Ok(hits)
}

pub fn outline(root: &Path, relative_path: &str) -> Result<Vec<FileOutlineItem>, AppError> {
    let doc = read_file(root, relative_path)?;
    let mut items = Vec::new();
    for (index, line) in doc.content.lines().enumerate() {
        let trimmed = line.trim_start();
        let candidates = [
            ("function ", "function"),
            ("fn ", "function"),
            ("class ", "class"),
            ("interface ", "interface"),
            ("type ", "type"),
            ("const ", "const"),
            ("pub fn ", "function"),
            ("struct ", "class"),
            ("enum ", "type"),
            ("# ", "heading"),
            ("## ", "heading"),
        ];
        for (prefix, kind) in candidates {
            let label = trimmed
                .strip_prefix("export ")
                .unwrap_or(trimmed)
                .strip_prefix(prefix);
            if let Some(label) = label {
                let label = label
                    .split(|ch: char| ch == '(' || ch == '{' || ch == ':' || ch.is_whitespace())
                    .next()
                    .unwrap_or("")
                    .trim_matches('#')
                    .trim();
                if !label.is_empty() {
                    items.push(FileOutlineItem {
                        id: format!("{}:{}", relative_path.replace('\\', "/"), index + 1),
                        label: label.to_string(),
                        kind: kind.to_string(),
                        line: index + 1,
                    });
                }
                break;
            }
        }
    }
    Ok(items)
}

pub fn build_retrieval_snapshot(
    workspace_id: &str,
    root: &Path,
) -> Result<RetrievalSnapshot, AppError> {
    let started = now_ms();
    let files = collect_text_files(root, DEFAULT_MAX_FILE_BYTES)?;
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

fn collect_text_files_inner(
    root: &Path,
    dir: &Path,
    max_file_bytes: u64,
    files: &mut Vec<PathBuf>,
) -> Result<(), AppError> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if should_ignore(&name) {
            continue;
        }
        if path.is_dir() {
            collect_text_files_inner(root, &path, max_file_bytes, files)?;
        } else if path.is_file() {
            let meta = fs::metadata(&path)?;
            if meta.len() <= max_file_bytes {
                let relative = relative_path(root, &path);
                if adl_fs_ops::read_text_file(root, &relative, max_file_bytes).is_ok() {
                    files.push(path);
                }
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
        let dir = std::env::temp_dir().join(format!("adl-workspace-create-{}", uuid::Uuid::new_v4()));
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
}
