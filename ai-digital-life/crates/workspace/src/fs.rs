use adl_errors::AppError;
use adl_types::WorkspaceFileDocument;
use std::fs;
use std::path::{Path, PathBuf};

pub fn write_file(
    root: &Path,
    relative_path: &str,
    content: &str,
) -> Result<WorkspaceFileDocument, AppError> {
    let path = adl_fs_ops::resolve_workspace_path(root, relative_path)?;
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)?;
        }
    }
    adl_fs_ops::atomic_write(root, relative_path, content)?;
    Ok(WorkspaceFileDocument {
        path: relative_path.replace('\\', "/"),
        content: content.to_string(),
        last_modified_at: file_modified_at(&path),
    })
}

pub fn create_file(
    root: &Path,
    relative_path: &str,
    content: &str,
) -> Result<WorkspaceFileDocument, AppError> {
    let path = adl_fs_ops::resolve_workspace_path(root, relative_path)?;
    if path.exists() {
        return Err(AppError::InvalidInput(format!("file already exists: {relative_path}")));
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
        return Err(AppError::InvalidInput(format!("path already exists: {relative_path}")));
    }
    fs::create_dir_all(path)?;
    Ok(true)
}

pub fn rename_entry(root: &Path, relative_path: &str, new_name: &str) -> Result<bool, AppError> {
    if new_name.trim().is_empty() {
        return Err(AppError::InvalidInput("new name is required".into()));
    }
    if new_name.contains('/') || new_name.contains('\\') {
        return Err(AppError::InvalidInput("new name must not contain path separators".into()));
    }
    let src = adl_fs_ops::resolve_workspace_path(root, relative_path)?;
    if !src.exists() {
        return Err(AppError::NotFound(format!("path not found: {relative_path}")));
    }
    let parent = src.parent().unwrap_or(root);
    let dst = parent.join(new_name);
    if dst.exists() {
        return Err(AppError::InvalidInput(format!("target already exists: {}", new_name)));
    }
    fs::rename(&src, &dst)?;
    Ok(true)
}

pub fn delete_entry(root: &Path, relative_path: &str) -> Result<bool, AppError> {
    let path = adl_fs_ops::resolve_workspace_path(root, relative_path)?;
    if !path.exists() {
        return Err(AppError::NotFound(format!("path not found: {relative_path}")));
    }
    trash::delete(&path)
        .map_err(|e| AppError::InvalidInput(format!("failed to move to trash: {e}")))?;
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
    let stem = dst.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let ext = dst.extension().map(|s| format!(".{}", s.to_string_lossy())).unwrap_or_default();
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
        return Err(AppError::NotFound(format!("source not found: {src_relative_path}")));
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
        return Err(AppError::NotFound(format!("source not found: {src_relative_path}")));
    }
    let dst = adl_fs_ops::resolve_workspace_path(root, dst_relative_path)?;
    if dst.exists() {
        return Err(AppError::InvalidInput(format!("target already exists: {dst_relative_path}")));
    }
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::rename(&src, &dst)?;
    Ok(true)
}

pub(crate) fn file_modified_at(path: &Path) -> i64 {
    fs::metadata(path)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_else(adl_types::now_ms)
}
