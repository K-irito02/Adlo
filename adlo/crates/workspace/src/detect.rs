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

/// 默认工作区根：`<Documents>/Adlo Workspaces`（无文档目录时回退主目录）。
pub(crate) fn default_workspace_root() -> Result<PathBuf, AppError> {
    let base = dirs::document_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| AppError::Workspace("no document or home directory available".into()))?;
    Ok(base.join("Adlo Workspaces"))
}

/// 确保「创建文件夹」模式的目标目录存在，并返回可用于 `open_workspace` 的绝对路径。
///
/// - 绝对路径：不存在则递归创建；
/// - 相对路径：只接受单段名称，解析到 [`default_workspace_root`] 下；
/// - 已存在但不是目录：报错。
pub fn ensure_workspace_dir(input: &Path) -> Result<PathBuf, AppError> {
    if input.is_absolute() {
        return ensure_dir_target(input.to_path_buf());
    }
    let default_root = default_workspace_root()?;
    ensure_workspace_dir_with_root(input, &default_root)
}

fn ensure_workspace_dir_with_root(input: &Path, default_root: &Path) -> Result<PathBuf, AppError> {
    let mut components = input.components();
    let first = components.next();
    let single_component = components.next().is_none();
    let target = match first {
        Some(std::path::Component::Normal(name)) if single_component => default_root.join(name),
        _ => {
            return Err(AppError::InvalidInput(
                "workspace name must be a single folder name or an absolute path".into(),
            ));
        },
    };

    ensure_dir_target(target)
}

fn ensure_dir_target(target: PathBuf) -> Result<PathBuf, AppError> {
    if target.exists() {
        if !target.is_dir() {
            return Err(AppError::InvalidInput(format!(
                "path is not a directory: {}",
                target.display()
            )));
        }
    } else {
        std::fs::create_dir_all(&target).map_err(|e| {
            AppError::Io(format!("failed to create workspace directory {}: {e}", target.display()))
        })?;
    }

    target.canonicalize().map_err(|e| AppError::Workspace(format!("invalid workspace path: {e}")))
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

#[cfg(test)]
mod ensure_dir_tests {
    use super::*;
    use std::fs;

    fn temp_root(tag: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("adl-ws-ensure-{tag}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn default_workspace_root_is_documents_adlo_workspaces() {
        let root = default_workspace_root().expect("default root");
        assert_eq!(root.file_name().unwrap(), "Adlo Workspaces");
        let base = dirs::document_dir().or_else(dirs::home_dir).expect("base dir");
        assert!(root.starts_with(&base));
    }

    #[test]
    fn creates_an_absolute_missing_directory_recursively() {
        let root = temp_root("abs");
        let target = root.join("a").join("b").join("c");

        let ensured = ensure_workspace_dir(&target).unwrap();

        assert!(ensured.is_dir());
        assert_eq!(ensured, target.canonicalize().unwrap());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn accepts_an_existing_directory() {
        let root = temp_root("existing");
        let target = root.join("plain");
        fs::create_dir_all(&target).unwrap();

        let ensured = ensure_workspace_dir(&target).unwrap();

        assert_eq!(ensured, target.canonicalize().unwrap());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn rejects_an_existing_file() {
        let root = temp_root("file");
        let target = root.join("a.txt");
        fs::write(&target, "x").unwrap();

        assert!(ensure_workspace_dir(&target).is_err());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn resolves_a_single_name_under_the_default_root() {
        let default_root = temp_root("name");

        let ensured =
            ensure_workspace_dir_with_root(Path::new("my-project"), &default_root).unwrap();

        assert_eq!(ensured, default_root.join("my-project").canonicalize().unwrap());
        assert!(ensured.is_dir());
        let _ = fs::remove_dir_all(&default_root);
    }

    #[test]
    fn rejects_parent_and_nested_relative_paths() {
        let default_root = temp_root("relative");
        let must_err = |input: &str| {
            assert!(ensure_workspace_dir_with_root(Path::new(input), &default_root).is_err())
        };

        must_err("..");
        must_err("../escape");
        must_err("a/b");

        let _ = fs::remove_dir_all(&default_root);
    }
}
