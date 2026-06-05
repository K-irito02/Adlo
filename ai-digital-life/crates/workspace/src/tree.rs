use adl_errors::AppError;
use adl_kernel::{
    now_ms, RepoMapEntry, RetrievalFileTypeCount, RetrievalSnapshot, RetrievalStatusV1,
    WorkspaceTreeNode,
};
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tracing::{debug, info};

const MAX_TREE_DEPTH: usize = 64;
const MAX_TREE_NODES: usize = 200_000;
const MAX_COLLECTED_FILES: usize = 50_000;
fn ignored_dirs() -> &'static HashSet<&'static str> {
    static IGNORED_DIRS: OnceLock<HashSet<&'static str>> = OnceLock::new();
    IGNORED_DIRS.get_or_init(|| {
        HashSet::from([
            ".git",
            "target",
            "node_modules",
            "dist",
            "build",
            ".next",
            ".cache",
            "__pycache__",
            ".venv",
            "vendor",
            ".idea",
            ".vscode",
            ".svelte-kit",
            ".turbo",
            "coverage",
            ".nyc_output",
            "out",
            ".tox",
        ])
    })
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
        let name = entry.file_name().to_string_lossy().into_owned();
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

pub fn build_retrieval_snapshot(
    workspace_id: &str,
    root: &Path,
) -> Result<RetrievalSnapshot, AppError> {
    let started = now_ms();
    let (files, extensions, repo_map) =
        collect_retrieval_data(root, crate::DEFAULT_MAX_FILE_BYTES)?;
    let mut top_extensions: Vec<_> = extensions
        .into_iter()
        .map(|(extension, count)| RetrievalFileTypeCount { extension, count })
        .collect();
    top_extensions.sort_by_key(|entry| std::cmp::Reverse(entry.count));
    top_extensions.truncate(12);
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
        root_path: root.to_string_lossy().into_owned(),
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

#[allow(clippy::type_complexity)]
fn collect_retrieval_data(
    root: &Path,
    max_file_bytes: u64,
) -> Result<(Vec<PathBuf>, BTreeMap<String, i32>, Vec<RepoMapEntry>), AppError> {
    let mut files = Vec::new();
    let mut extensions: BTreeMap<String, i32> = BTreeMap::new();
    let mut repo_map = Vec::new();
    collect_retrieval_inner(
        root,
        root,
        max_file_bytes,
        &mut files,
        &mut extensions,
        &mut repo_map,
    )?;
    repo_map.truncate(200);
    Ok((files, extensions, repo_map))
}

fn collect_retrieval_inner(
    root: &Path,
    dir: &Path,
    max_file_bytes: u64,
    files: &mut Vec<PathBuf>,
    extensions: &mut BTreeMap<String, i32>,
    repo_map: &mut Vec<RepoMapEntry>,
) -> Result<(), AppError> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if should_ignore(&name) {
            continue;
        }
        let relative = relative_path(root, &path);
        if path.is_dir() {
            repo_map.push(RepoMapEntry { path: relative, r#type: "directory".to_string() });
            collect_retrieval_inner(root, &path, max_file_bytes, files, extensions, repo_map)?;
        } else if path.is_file() {
            repo_map.push(RepoMapEntry { path: relative.clone(), r#type: "file".to_string() });
            if files.len() < MAX_COLLECTED_FILES
                && adl_fs_ops::read_text_file(root, &relative, max_file_bytes).is_ok()
            {
                let ext = path
                    .extension()
                    .and_then(|value| value.to_str())
                    .unwrap_or("[none]")
                    .to_string();
                *extensions.entry(ext).or_insert(0) += 1;
                files.push(path);
            }
        }
    }
    Ok(())
}

pub async fn build_retrieval_snapshot_async(
    workspace_id: &str,
    root: &Path,
    mut cancellation: tokio::sync::broadcast::Receiver<()>,
) -> Result<RetrievalSnapshot, AppError> {
    let started = now_ms();
    let root_owned = root.to_path_buf();

    let (files, top_extensions, repo_map) = tokio::task::spawn_blocking({
        let r = root_owned.clone();
        move || {
            let (files, extensions, repo_map) =
                collect_retrieval_data(&r, crate::DEFAULT_MAX_FILE_BYTES)?;
            let mut top_extensions: Vec<_> = extensions
                .into_iter()
                .map(|(extension, count)| RetrievalFileTypeCount { extension, count })
                .collect();
            top_extensions.sort_by_key(|entry| std::cmp::Reverse(entry.count));
            top_extensions.truncate(12);
            Ok::<(Vec<PathBuf>, Vec<RetrievalFileTypeCount>, Vec<RepoMapEntry>), AppError>((
                files,
                top_extensions,
                repo_map,
            ))
        }
    })
    .await
    .map_err(|e| AppError::Workspace(format!("task join error: {e}")))??;

    if cancellation.try_recv().is_ok() {
        return Ok(RetrievalSnapshot {
            workspace_id: workspace_id.to_string(),
            root_path: root.to_string_lossy().into_owned(),
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
        root_path: root.to_string_lossy().into_owned(),
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

pub(crate) fn collect_text_files(
    root: &Path,
    max_file_bytes: u64,
) -> Result<Vec<PathBuf>, AppError> {
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
    collect_text_files_inner_int(root, dir, max_file_bytes, files, None)
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
        let name = entry.file_name().to_string_lossy().into_owned();
        if should_ignore(&name) {
            continue;
        }
        if path.is_dir() {
            collect_text_files_inner_int(
                root,
                &path,
                max_file_bytes,
                files,
                extensions.as_deref_mut(),
            )?;
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
    ignored_dirs().contains(name)
}

pub(crate) fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root).unwrap_or(path).to_string_lossy().replace('\\', "/")
}
