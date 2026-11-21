use crate::commands::ipc;
use adl_errors::AppError;
use adl_types::IpcResult;
use std::path::{Path, PathBuf};

pub fn reveal_in_os_file_manager(path: &str) -> Result<(), AppError> {
    let p = PathBuf::from(path);
    if !p.exists() {
        return Err(AppError::InvalidInput(format!("path does not exist: {path}")));
    }
    let canonical = p.canonicalize().unwrap_or(p);
    #[cfg(target_os = "windows")]
    {
        let display_path = canonical.to_string_lossy().replace('/', "\\");
        std::process::Command::new("explorer").arg(format!("/select,{display_path}")).spawn()?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg("-R").arg(&canonical).spawn()?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&canonical.parent().unwrap_or(&canonical))
            .spawn()?;
    }
    Ok(())
}

/// Open a directory in the OS file manager without selecting a specific entry.
/// Used for "open download folder". Creates the directory first if needed so
/// the target is always openable.
pub fn open_in_os_file_manager(path: &str) -> Result<(), AppError> {
    let p = PathBuf::from(path);
    if !p.exists() {
        std::fs::create_dir_all(&p)
            .map_err(|e| AppError::Internal(format!("failed to create directory: {e}")))?;
    }
    if !p.is_dir() {
        return Err(AppError::InvalidInput(format!("not a directory: {path}")));
    }
    let canonical = p.canonicalize().unwrap_or(p);
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer").arg(canonical.to_string_lossy().as_ref()).spawn()?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(&canonical).spawn()?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(&canonical).spawn()?;
    }
    Ok(())
}

#[tauri::command]
pub fn workspace_reveal_in_file_manager(path: String) -> IpcResult<bool> {
    ipc(reveal_in_os_file_manager(&path).map(|()| true))
}

#[tauri::command]
pub fn workspace_open_in_file_manager(path: String) -> IpcResult<bool> {
    ipc(open_in_os_file_manager(&path).map(|()| true))
}

/// 用系统默认程序打开工作区内的一个文件（事项 9 后续）。
///
/// 用途：内部预览与内置浏览器都解不了的编码（`.mkv` / `.avi` 等）交给系统播放器，
/// 而不是让用户对着「无法解码」无路可走。路径先经 `get_absolute_path` 做父目录越界
/// 校验，再对**最终文件**做 canonical + 界内校验（拒绝指向界外的 symlink，与读通道
/// `/workspace/media` 同一信任链）；不做任何内容解析。
#[tauri::command]
pub fn workspace_open_in_default_app(
    workspace_path: String,
    relative_path: String,
) -> IpcResult<bool> {
    let root = PathBuf::from(&workspace_path);
    let absolute = match adl_workspace::get_absolute_path(root.as_path(), &relative_path) {
        Ok(path) => path,
        Err(error) => return ipc(Err(error)),
    };
    let canonical = match ensure_inside_root(&root, Path::new(&absolute)) {
        Ok(path) => path,
        Err(error) => return ipc(Err(error)),
    };
    ipc(open_file(canonical.to_string_lossy().as_ref()).map(|()| true))
}

/// 最终文件 canonical 化 + 界内校验（`get_absolute_path` 只校验父目录）。
///
/// 工作区内一个指向界外的 symlink 会被 `get_absolute_path` 解析成界外绝对路径；
/// 这里与 `adl_fs_ops::resolve_workspace_file` 同口径拒绝。
fn ensure_inside_root(root: &Path, absolute: &Path) -> Result<PathBuf, AppError> {
    let canonical_root = root.canonicalize().map_err(|error| {
        AppError::Workspace(format!("failed to resolve workspace root: {error}"))
    })?;
    let canonical = absolute
        .canonicalize()
        .map_err(|error| AppError::InvalidInput(format!("path does not exist: {error}")))?;
    if !canonical.starts_with(&canonical_root) {
        return Err(AppError::Security(format!(
            "path escapes workspace boundary: {}",
            absolute.display()
        )));
    }
    Ok(canonical)
}

/// Open any directory in the OS file manager ("关于" → 日志目录).
/// Missing directories are created first so the target is always openable.
#[tauri::command]
pub fn platform_open_path(path: String) -> IpcResult<bool> {
    ipc(open_in_os_file_manager(&path).map(|()| true))
}

/// Open a file with its OS-default application.
pub fn open_file(path: &str) -> Result<(), AppError> {
    let p = PathBuf::from(path);
    if !p.exists() {
        return Err(AppError::InvalidInput(format!("path does not exist: {path}")));
    }
    let canonical = p.canonicalize().unwrap_or(p);
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer").arg(canonical.to_string_lossy().as_ref()).spawn()?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(&canonical).spawn()?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        // xdg-open with a directory/file opens via the default handler.
        std::process::Command::new("xdg-open").arg(&canonical).spawn()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::ensure_inside_root;
    use adl_errors::AppError;

    #[test]
    fn ensure_inside_root_rejects_paths_outside_the_workspace() {
        let base =
            std::env::temp_dir().join(format!("adl-platform-boundary-{}", std::process::id()));
        let root = base.join("root");
        let inside = root.join("clip.mp4");
        let outside = base.join("secret.mp4");
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(&inside, b"a").unwrap();
        std::fs::write(&outside, b"b").unwrap();

        assert!(ensure_inside_root(&root, &inside).is_ok());
        let error = ensure_inside_root(&root, &outside).unwrap_err();
        assert!(matches!(error, AppError::Security(_)), "unexpected: {error:?}");

        let _ = std::fs::remove_dir_all(&base);
    }
}
