use adl_errors::AppError;
use adl_types::WorkspaceFileDocument;
use std::fs;
use std::path::{Path, PathBuf};

/// Returns true when both paths refer to the same filesystem entry.
/// On case-insensitive filesystems (e.g. Windows NTFS, macOS APFS) a case-only
/// rename target canonicalizes to the same file as the source, which must not be
/// reported as "target already exists".
fn same_file(a: &Path, b: &Path) -> bool {
    match (fs::canonicalize(a), fs::canonicalize(b)) {
        (Ok(ca), Ok(cb)) => ca == cb,
        _ => false,
    }
}

pub fn create_file(
    root: &Path,
    relative_path: &str,
    content: &str,
) -> Result<WorkspaceFileDocument, AppError> {
    let path = adl_fs_ops::resolve_workspace_path(root, relative_path)?;
    if path.exists() {
        // 区分冲突项是目录还是文件：当新建文件与同路径目录同名时，前端据此提示检查文件类型后缀。
        let kind = if path.is_dir() { "directory" } else { "file" };
        return Err(AppError::InvalidInput(format!(
            "file already exists ({kind}): {relative_path}"
        )));
    }
    adl_fs_ops::atomic_write(root, relative_path, content)?;
    crate::tree::invalidate_tree_cache(root);
    Ok(WorkspaceFileDocument {
        path: relative_path.replace('\\', "/"),
        content: content.to_string(),
        last_modified_at: file_modified_at(&path),
    })
}

/// Overwrite an existing workspace file with new text content (the save path
/// for Ctrl+S / autosave). Path traversal guarded by the same resolver as
/// reads; writes above the 8MB text limit are rejected like reads.
pub fn update_file(
    root: &Path,
    relative_path: &str,
    content: &str,
) -> Result<WorkspaceFileDocument, AppError> {
    // 与读通道同级：最终文件 canonicalize + 界内校验，拒绝指向界外的 symlink；
    // mtime 同样走 canonical 路径，与 read_file 同信任链（P4 R1/R11）。
    let path =
        adl_fs_ops::resolve_workspace_file(root, relative_path).map_err(|error| match error {
            AppError::Io(_) => AppError::NotFound(format!("file not found: {relative_path}")),
            other => other,
        })?;
    if !path.is_file() {
        return Err(AppError::InvalidInput(format!("not a file: {relative_path}")));
    }
    if content.len() as u64 > crate::DEFAULT_MAX_TEXT_FILE_BYTES {
        return Err(AppError::InvalidInput(format!(
            "file exceeds configured write limit: {relative_path}"
        )));
    }
    adl_fs_ops::atomic_write(root, relative_path, content)?;
    crate::tree::invalidate_tree_cache(root);
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
    crate::tree::invalidate_tree_cache(root);
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
    if dst.exists() && !same_file(&src, &dst) {
        return Err(AppError::InvalidInput(format!("target already exists: {}", new_name)));
    }
    fs::rename(&src, &dst)?;
    crate::tree::invalidate_tree_cache(root);
    Ok(true)
}

pub fn delete_entry(root: &Path, relative_path: &str) -> Result<bool, AppError> {
    let path = adl_fs_ops::resolve_workspace_path(root, relative_path)?;
    if !path.exists() {
        return Err(AppError::NotFound(format!("path not found: {relative_path}")));
    }
    trash::delete(&path)
        .map_err(|e| AppError::InvalidInput(format!("failed to move to trash: {e}")))?;
    crate::tree::invalidate_tree_cache(root);
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
    crate::tree::invalidate_tree_cache(root);
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
    if dst.exists() && !same_file(&src, &dst) {
        return Err(AppError::InvalidInput(format!("target already exists: {dst_relative_path}")));
    }
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::rename(&src, &dst)?;
    crate::tree::invalidate_tree_cache(root);
    Ok(true)
}

/// 跨工作区移动：源与目标分属不同的工作区根。
///
/// 同卷优先 `rename`；跨卷（`rename` 失败）退化为「复制 → 删除源」。
/// 复制成功后删除源失败时，回滚已复制的目标，避免同一份内容在两处各留一份。
pub fn move_entry_across(
    source_root: &Path,
    src_relative_path: &str,
    target_root: &Path,
    dst_relative_path: &str,
) -> Result<bool, AppError> {
    let src = adl_fs_ops::resolve_workspace_path(source_root, src_relative_path)?;
    if !src.exists() {
        return Err(AppError::NotFound(format!("source not found: {src_relative_path}")));
    }
    let dst = adl_fs_ops::resolve_workspace_path(target_root, dst_relative_path)?;
    if dst.exists() && !same_file(&src, &dst) {
        return Err(AppError::InvalidInput(format!("target already exists: {dst_relative_path}")));
    }
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)?;
    }

    if fs::rename(&src, &dst).is_err() {
        let copied = if src.is_dir() {
            copy_dir_recursive(&src, &dst)
        } else {
            fs::copy(&src, &dst).map(|_| ()).map_err(AppError::from)
        };
        if let Err(err) = copied {
            remove_entry_best_effort(&dst);
            return Err(err);
        }
        let removed = if src.is_dir() { fs::remove_dir_all(&src) } else { fs::remove_file(&src) };
        if let Err(err) = removed {
            remove_entry_best_effort(&dst);
            return Err(AppError::from(err));
        }
    }

    crate::tree::invalidate_tree_cache(source_root);
    if source_root != target_root {
        crate::tree::invalidate_tree_cache(target_root);
    }
    Ok(true)
}

fn remove_entry_best_effort(path: &Path) {
    let _ = if path.is_dir() { fs::remove_dir_all(path) } else { fs::remove_file(path) };
}

/// 跨工作区复制：源/目标分属不同工作区根，目标已存在即拒绝（不自动改名）。
pub fn copy_entry_across(
    source_root: &Path,
    src_relative_path: &str,
    target_root: &Path,
    dst_relative_path: &str,
) -> Result<bool, AppError> {
    let src = adl_fs_ops::resolve_workspace_path(source_root, src_relative_path)?;
    if !src.exists() {
        return Err(AppError::NotFound(format!("source not found: {src_relative_path}")));
    }
    let dst = adl_fs_ops::resolve_workspace_path(target_root, dst_relative_path)?;
    if dst.exists() && !same_file(&src, &dst) {
        return Err(AppError::InvalidInput(format!("target already exists: {dst_relative_path}")));
    }
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)?;
    }
    if src.is_dir() {
        copy_dir_recursive(&src, &dst)?;
    } else {
        fs::copy(&src, &dst)?;
    }
    if source_root != target_root {
        crate::tree::invalidate_tree_cache(source_root);
    }
    crate::tree::invalidate_tree_cache(target_root);
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

#[cfg(test)]
mod tests {
    use super::*;

    // 并行测试同 tick 拿到相同 nanos 会共名同一目录，结尾 remove_dir_all
    // 抽走他人目录 → 路径边界误报 flake；单调计数保证每次调用唯一
    //（同 `adl-server` test_util.rs 的 COUNTER 范式）。
    static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

    fn temp_root() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "adl-ws-fs-test-{}-{}-{:?}-{}",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos(),
            std::thread::current().id(),
            SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(root: &Path, relative: &str, content: &str) {
        let path = adl_fs_ops::resolve_workspace_path(root, relative).unwrap();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, content).unwrap();
    }

    fn read(root: &Path, relative: &str) -> String {
        let path = adl_fs_ops::resolve_workspace_path(root, relative).unwrap();
        fs::read_to_string(path).unwrap()
    }

    #[test]
    fn rename_entry_accepts_case_only_change() {
        let root = temp_root();
        write(&root, "AGENTS.md", "content");
        let result = rename_entry(&root, "AGENTS.md", "AGENTs.md");
        assert!(result.is_ok(), "case-only rename should be allowed, got {result:?}");
        assert_eq!(read(&root, "AGENTs.md"), "content");
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn rename_entry_rejects_existing_different_target() {
        let root = temp_root();
        write(&root, "a.txt", "a");
        write(&root, "b.txt", "b");
        let err = rename_entry(&root, "a.txt", "b.txt").unwrap_err();
        assert!(err.to_string().contains("target already exists"));
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn move_entry_accepts_case_only_change() {
        let root = temp_root();
        write(&root, "a.txt", "content");
        let result = move_entry(&root, "a.txt", "A.txt");
        assert!(result.is_ok(), "case-only move should be allowed, got {result:?}");
        assert_eq!(read(&root, "A.txt"), "content");
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn move_entry_rejects_existing_different_target() {
        let root = temp_root();
        write(&root, "a.txt", "a");
        write(&root, "b.txt", "b");
        let err = move_entry(&root, "a.txt", "b.txt").unwrap_err();
        assert!(err.to_string().contains("target already exists"));
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn create_file_marks_conflict_with_file_when_target_is_a_file() {
        let root = temp_root();
        write(&root, "a.txt", "existing");
        let err = create_file(&root, "a.txt", "new").unwrap_err();
        assert!(err.to_string().contains("file already exists (file)"), "got {err}");
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn create_file_marks_conflict_with_directory_when_target_is_a_dir() {
        let root = temp_root();
        fs::create_dir_all(root.join("src")).unwrap();
        let err = create_file(&root, "src", "new").unwrap_err();
        assert!(err.to_string().contains("file already exists (directory)"), "got {err}");
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn move_entry_across_moves_file_between_roots() {
        let source = temp_root();
        let target = temp_root();
        write(&source, "notes/a.txt", "content");

        let result = move_entry_across(&source, "notes/a.txt", &target, "moved/a.txt");

        assert!(result.is_ok(), "cross-workspace move should succeed, got {result:?}");
        assert!(!source.join("notes/a.txt").exists());
        assert_eq!(read(&target, "moved/a.txt"), "content");
        fs::remove_dir_all(&source).unwrap();
        fs::remove_dir_all(&target).unwrap();
    }

    #[test]
    fn move_entry_across_moves_directory_tree_between_roots() {
        let source = temp_root();
        let target = temp_root();
        write(&source, "pkg/src/main.rs", "fn main() {}");

        move_entry_across(&source, "pkg", &target, "pkg-copy").unwrap();

        assert!(!source.join("pkg").exists());
        assert_eq!(read(&target, "pkg-copy/src/main.rs"), "fn main() {}");
        fs::remove_dir_all(&source).unwrap();
        fs::remove_dir_all(&target).unwrap();
    }

    #[test]
    fn move_entry_across_rejects_existing_target() {
        let source = temp_root();
        let target = temp_root();
        write(&source, "a.txt", "a");
        write(&target, "a.txt", "b");

        let err = move_entry_across(&source, "a.txt", &target, "a.txt").unwrap_err();

        assert!(err.to_string().contains("target already exists"));
        assert_eq!(read(&source, "a.txt"), "a");
        assert_eq!(read(&target, "a.txt"), "b");
        fs::remove_dir_all(&source).unwrap();
        fs::remove_dir_all(&target).unwrap();
    }

    #[test]
    fn move_entry_across_rejects_missing_source() {
        let source = temp_root();
        let target = temp_root();

        let err = move_entry_across(&source, "missing.txt", &target, "missing.txt").unwrap_err();

        assert!(err.to_string().contains("source not found"));
        fs::remove_dir_all(&source).unwrap();
        fs::remove_dir_all(&target).unwrap();
    }

    #[test]
    fn copy_entry_across_keeps_source_and_rejects_conflicts() {
        let source = temp_root();
        let target = temp_root();
        write(&source, "a.txt", "content");
        write(&target, "a.txt", "existing");

        let err = copy_entry_across(&source, "a.txt", &target, "a.txt").unwrap_err();
        assert!(err.to_string().contains("target already exists"));
        assert_eq!(read(&source, "a.txt"), "content");

        copy_entry_across(&source, "a.txt", &target, "b.txt").unwrap();
        assert_eq!(read(&source, "a.txt"), "content");
        assert_eq!(read(&target, "b.txt"), "content");
        fs::remove_dir_all(&source).unwrap();
        fs::remove_dir_all(&target).unwrap();
    }
}
