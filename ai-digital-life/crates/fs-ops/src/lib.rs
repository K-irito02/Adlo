//! File system operations: path scoping, atomic writes, and checkpoint payloads.

use adl_errors::AppError;
use adl_types::{CheckpointPayloadAsset, CheckpointPayloadPreview};
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

pub fn read_text_file(
    root: &Path,
    relative_path: &str,
    max_bytes: u64,
) -> Result<String, AppError> {
    let path = resolve_workspace_path(root, relative_path)?;
    let meta = fs::metadata(&path)?;
    if meta.len() > max_bytes {
        return Err(AppError::InvalidInput(format!(
            "file exceeds configured read limit: {relative_path}"
        )));
    }
    let bytes = fs::read(&path)?;
    if looks_binary(&bytes) {
        return Err(AppError::InvalidInput(format!(
            "binary files are not readable as context: {relative_path}"
        )));
    }
    String::from_utf8(bytes).map_err(|e| AppError::InvalidInput(e.to_string()))
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

pub fn file_hash(root: &Path, relative_path: &str) -> Result<String, AppError> {
    let content = read_text_file(root, relative_path, u64::MAX)?;
    Ok(content_hash(&content))
}

pub fn looks_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(4096).any(|byte| *byte == 0)
}

pub fn create_checkpoint_payload(
    checkpoints_dir: &Path,
    checkpoint_id: &str,
    root: &Path,
    relative_paths: &[String],
) -> Result<CheckpointPayloadPreview, AppError> {
    let checkpoint_dir = checkpoints_dir.join(checkpoint_id);
    let files_dir = checkpoint_dir.join("files");
    fs::create_dir_all(&files_dir)?;

    let mut assets = Vec::new();
    for relative_path in relative_paths {
        let source = resolve_workspace_path(root, relative_path)?;
        let snapshot_path = files_dir.join(relative_path.replace(['\\', '/'], "__"));
        if source.exists() && source.is_file() {
            fs::copy(&source, &snapshot_path)?;
            let size = fs::metadata(&source).ok().map(|meta| meta.len());
            assets.push(CheckpointPayloadAsset {
                path: relative_path.clone(),
                kind: "file".into(),
                status: "captured".into(),
                size,
                snapshot_path: Some(snapshot_path.to_string_lossy().to_string()),
            });
        } else {
            assets.push(CheckpointPayloadAsset {
                path: relative_path.clone(),
                kind: "file".into(),
                status: "missing".into(),
                size: None,
                snapshot_path: None,
            });
        }
    }

    let preview = CheckpointPayloadPreview {
        checkpoint_id: checkpoint_id.to_string(),
        manifest_path: checkpoint_dir.join("manifest.json").to_string_lossy().to_string(),
        root_path: Some(root.to_string_lossy().to_string()),
        asset_count: assets.len(),
        assets,
    };
    fs::write(&preview.manifest_path, serde_json::to_string_pretty(&preview)?)?;
    Ok(preview)
}

pub fn read_checkpoint_preview(
    checkpoints_dir: &Path,
    checkpoint_id: &str,
) -> Result<Option<CheckpointPayloadPreview>, AppError> {
    let path = checkpoints_dir.join(checkpoint_id).join("manifest.json");
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(path)?;
    serde_json::from_str(&content).map_err(AppError::from).map(Some)
}

pub fn restore_checkpoint_payload(
    checkpoints_dir: &Path,
    checkpoint_id: &str,
) -> Result<CheckpointPayloadPreview, AppError> {
    let preview = read_checkpoint_preview(checkpoints_dir, checkpoint_id)?
        .ok_or_else(|| AppError::NotFound(format!("checkpoint payload {checkpoint_id}")))?;
    let root = preview
        .root_path
        .as_ref()
        .ok_or_else(|| AppError::InvalidInput("checkpoint has no root path".into()))?;
    let root = Path::new(root);
    for asset in preview.assets.iter().filter(|asset| asset.status == "captured") {
        if let Some(snapshot_path) = &asset.snapshot_path {
            let target = resolve_workspace_path(root, &asset.path)?;
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(snapshot_path, target)?;
        }
    }
    Ok(preview)
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
}
