use crate::commands::ipc;
use adl_errors::AppError;
use adl_kernel::IpcResult;
use std::path::PathBuf;

fn reveal_in_os_file_manager(path: &str) -> Result<(), AppError> {
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

#[tauri::command]
pub fn workspace_reveal_in_file_manager(path: String) -> IpcResult<bool> {
    ipc(reveal_in_os_file_manager(&path).map(|()| true))
}
