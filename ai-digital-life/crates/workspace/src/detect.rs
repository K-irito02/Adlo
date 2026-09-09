use adl_errors::AppError;
use adl_types::{RecentWorkspaceEntry, WorkspaceMeta, WorkspaceStatus, WorkspaceType, now_ms};
use std::path::{Path, PathBuf};

pub fn strip_verbatim_prefix(s: &str) -> String {
    if cfg!(windows) {
        if let Some(stripped) = s.strip_prefix(r"\\?\") {
            if let Some(unc) = stripped.strip_prefix("UNC\\") {
                return format!("\\{}", unc);
            }
            return stripped.to_string();
        }
    }
    s.to_string()
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

    input.canonicalize().map_err(|e| AppError::Workspace(format!("invalid workspace path: {e}")))
}

fn is_project_root(path: &Path) -> bool {
    [".git", "Cargo.toml", "package.json", "pyproject.toml", "go.mod", "pom.xml"]
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
    let root_path = strip_verbatim_prefix(&root.to_string_lossy());
    let root = Path::new(&root_path);
    let now = now_ms();
    let name = root
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "workspace".to_string());
    let id = stable_workspace_id(root);
    let meta = WorkspaceMeta {
        id: id.clone(),
        path: root_path.clone(),
        root_path: root_path.clone(),
        name: name.clone(),
        r#type: workspace_type(root),
        status: WorkspaceStatus::Ready,
        git_snapshot: Some(crate::git::capture_git_snapshot(root)),
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
    use std::hash::{Hash, Hasher};
    let normalized = root.to_string_lossy().replace('\\', "/").to_lowercase();
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    normalized.hash(&mut hasher);
    let hash = hasher.finish() as u32;
    format!("workspace_{hash:08x}")
}
