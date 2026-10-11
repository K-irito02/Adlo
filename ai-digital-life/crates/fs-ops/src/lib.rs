//! File system operations: path scoping and atomic writes.

use adl_errors::AppError;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Component, Path, PathBuf};

pub fn normalize_relative_path(path: &str) -> Result<PathBuf, AppError> {
    if path.trim().is_empty() {
        return Err(AppError::InvalidInput("path is required".into()));
    }
    // Normalize backslash to forward slash for cross-platform consistency
    let normalized = path.replace('\\', "/");
    let candidate = Path::new(&normalized);
    if candidate.is_absolute() {
        return Err(AppError::Security("absolute paths are not accepted here".into()));
    }
    let mut clean = PathBuf::new();
    for component in candidate.components() {
        match component {
            Component::Normal(part) => clean.push(part),
            Component::CurDir => {},
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(AppError::Security(format!("path escapes workspace boundary: {path}")));
            },
        }
    }
    Ok(clean)
}

pub fn resolve_workspace_path(root: &Path, relative_path: &str) -> Result<PathBuf, AppError> {
    let root = root
        .canonicalize()
        .map_err(|e| AppError::Workspace(format!("failed to resolve workspace root: {e}")))?;
    let relative = normalize_relative_path(relative_path)?;
    let joined = root.join(relative);
    let parent = joined.parent().unwrap_or(&root);
    let canonical_parent =
        if parent.exists() { parent.canonicalize()? } else { resolve_existing_parent(parent)? };
    if !canonical_parent.starts_with(&root) {
        return Err(AppError::Security(format!(
            "path escapes workspace boundary: {relative_path}"
        )));
    }
    Ok(joined)
}

fn resolve_existing_parent(path: &Path) -> Result<PathBuf, AppError> {
    let mut current = path;
    while !current.exists() {
        current = current.parent().ok_or_else(|| {
            AppError::Security(format!("cannot resolve parent for {}", path.display()))
        })?;
    }
    current.canonicalize().map_err(AppError::from)
}

/// 解析工作区内必须已存在的文件：除父目录校验外，对最终文件本身做
/// canonicalize + 界内校验，拒绝指向界外的 symlink（Phase 4 审查 R1）。
/// 写通道（目标可不存在）继续走 `resolve_workspace_path`，不受影响。
pub fn resolve_workspace_file(root: &Path, relative_path: &str) -> Result<PathBuf, AppError> {
    let root_canonical = root
        .canonicalize()
        .map_err(|e| AppError::Workspace(format!("failed to resolve workspace root: {e}")))?;
    let path = resolve_workspace_path(root, relative_path)?;
    let canonical = path.canonicalize().map_err(AppError::from)?;
    if !canonical.starts_with(&root_canonical) {
        return Err(AppError::Security(format!(
            "path escapes workspace boundary: {relative_path}"
        )));
    }
    Ok(canonical)
}

pub fn read_text_file(
    root: &Path,
    relative_path: &str,
    max_bytes: u64,
) -> Result<String, AppError> {
    let path = resolve_workspace_file(root, relative_path)?;
    let meta = fs::metadata(&path)?;
    if !meta.is_file() {
        return Err(AppError::InvalidInput(format!("not a file: {relative_path}")));
    }
    if meta.len() > max_bytes {
        return Err(AppError::InvalidInput(format!(
            "file exceeds configured read limit: {relative_path}"
        )));
    }
    let bytes = fs::read(&path)?;
    // TOCTOU 二次守门（Phase 4 审查 R2）：metadata 与 read 之间文件可被替换，
    // 读后按实际长度再校验一次，上限只剩内存峰值本身。
    if bytes.len() as u64 > max_bytes {
        return Err(AppError::InvalidInput(format!(
            "file exceeds configured read limit: {relative_path}"
        )));
    }
    if looks_binary(&bytes) {
        return Err(AppError::InvalidInput(format!(
            "binary files are not readable as context: {relative_path}"
        )));
    }
    String::from_utf8(bytes).map_err(|e| AppError::InvalidInput(e.to_string()))
}

pub fn read_binary_file(
    root: &Path,
    relative_path: &str,
    max_bytes: u64,
) -> Result<Vec<u8>, AppError> {
    let path = resolve_workspace_file(root, relative_path)?;
    let meta = fs::metadata(&path)?;
    if !meta.is_file() {
        return Err(AppError::InvalidInput(format!("not a file: {relative_path}")));
    }
    if meta.len() > max_bytes {
        return Err(AppError::InvalidInput(format!(
            "file exceeds configured media read limit ({max_bytes} bytes): {relative_path}"
        )));
    }
    let bytes = fs::read(&path).map_err(AppError::from)?;
    // TOCTOU 二次守门（Phase 4 审查 R2），同 read_text_file。
    if bytes.len() as u64 > max_bytes {
        return Err(AppError::InvalidInput(format!(
            "file exceeds configured media read limit ({max_bytes} bytes): {relative_path}"
        )));
    }
    Ok(bytes)
}

pub fn atomic_write(root: &Path, relative_path: &str, content: &str) -> Result<(), AppError> {
    let path = resolve_workspace_path(root, relative_path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension(format!(
        "{}.tmp",
        path.extension().and_then(|value| value.to_str()).unwrap_or("adl")
    ));
    fs::write(&tmp, content.as_bytes())?;
    fs::rename(&tmp, &path)?;
    Ok(())
}

pub fn content_hash(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

// 注：已删除无界 `file_hash`（Phase 4 审查 P2）：它以 u64::MAX 读全文件且零调用方，
// 属于死代码 + OOM 面；需要文件哈希时应走流式实现并重建调用点。

pub fn looks_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(4096).any(|byte| *byte == 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_parent_path_escape() {
        let err = normalize_relative_path("../secret.txt").unwrap_err();
        assert!(matches!(err, AppError::Security(_)));
    }

    #[test]
    fn content_hash_is_stable() {
        assert_eq!(content_hash("abc"), content_hash("abc"));
        assert_ne!(content_hash("abc"), content_hash("abcd"));
    }

    #[test]
    fn rejects_empty_path() {
        let err = normalize_relative_path("").unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[test]
    fn rejects_whitespace_only_path() {
        let err = normalize_relative_path("   ").unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[test]
    fn rejects_absolute_path() {
        let err = normalize_relative_path("/etc/passwd").unwrap_err();
        assert!(matches!(err, AppError::Security(_)));
    }

    #[test]
    fn accepts_simple_relative_path() {
        let result = normalize_relative_path("src/main.rs").unwrap();
        assert_eq!(result, PathBuf::from("src").join("main.rs"));
    }

    #[test]
    fn accepts_nested_relative_path() {
        let result = normalize_relative_path("packages/core/src/lib.ts").unwrap();
        assert_eq!(result, PathBuf::from("packages").join("core").join("src").join("lib.ts"));
    }

    #[test]
    fn ignores_curdir_components() {
        let result = normalize_relative_path("src/./main.rs").unwrap();
        assert_eq!(result, PathBuf::from("src").join("main.rs"));
    }

    #[test]
    fn rejects_root_path_component() {
        let err = normalize_relative_path("src/../../etc/passwd").unwrap_err();
        assert!(matches!(err, AppError::Security(_)));
    }

    #[test]
    fn looks_binary_detects_null_bytes() {
        assert!(looks_binary(b"hello\x00world"));
    }

    #[test]
    fn looks_binary_allows_text_content() {
        assert!(!looks_binary(b"hello world this is text"));
    }

    #[test]
    fn looks_binary_handles_empty_bytes() {
        assert!(!looks_binary(b""));
    }

    #[test]
    fn looks_binary_checks_only_first_bytes() {
        let mut large = vec![b'x'; 5000];
        large[100] = 0;
        assert!(looks_binary(&large));
    }

    #[test]
    fn read_binary_file_rejects_over_limit() {
        let dir = std::env::temp_dir().join(format!("adl-fs-ops-media-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("clip.mp4"), vec![0u8; 16]).unwrap();
        let err = read_binary_file(dir.as_path(), "clip.mp4", 8).unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn read_binary_file_returns_bytes_within_limit() {
        let dir =
            std::env::temp_dir().join(format!("adl-fs-ops-media-ok-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.bin"), [1u8, 2u8, 3u8]).unwrap();
        let bytes = read_binary_file(dir.as_path(), "a.bin", 1024).unwrap();
        assert_eq!(bytes, vec![1u8, 2u8, 3u8]);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn read_binary_file_rejects_directories() {
        let dir =
            std::env::temp_dir().join(format!("adl-fs-ops-media-dir-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        let err = read_binary_file(dir.as_path(), "sub", 1024).unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn read_binary_file_returns_empty_for_empty_file() {
        let dir =
            std::env::temp_dir().join(format!("adl-fs-ops-media-empty-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("empty.bin"), []).unwrap();
        let bytes = read_binary_file(dir.as_path(), "empty.bin", 1024).unwrap();
        assert!(bytes.is_empty());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    #[cfg(unix)]
    fn read_binary_file_rejects_symlink_escape() {
        use std::os::unix::fs::symlink;
        let outside =
            std::env::temp_dir().join(format!("adl-fs-ops-outside-{}", uuid::Uuid::new_v4()));
        let inside =
            std::env::temp_dir().join(format!("adl-fs-ops-inside-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::create_dir_all(&inside).unwrap();
        std::fs::write(outside.join("secret.bin"), [9u8; 8]).unwrap();
        symlink(outside.join("secret.bin"), inside.join("evil-link")).unwrap();
        let err = read_binary_file(inside.as_path(), "evil-link", 1024).unwrap_err();
        assert!(matches!(err, AppError::Security(_)));
        let _ = std::fs::remove_dir_all(outside);
        let _ = std::fs::remove_dir_all(inside);
    }
}
