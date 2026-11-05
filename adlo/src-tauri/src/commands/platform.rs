use crate::commands::ipc;
use adl_errors::AppError;
use adl_types::IpcResult;
use std::path::PathBuf;

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
