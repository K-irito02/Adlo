use crate::commands::ipc;
use crate::commands::platform::{open_file, open_in_os_file_manager, reveal_in_os_file_manager};
use crate::error::CommandError;
use crate::state::AppState;
use adl_browser::download_manager::get_default_download_path;
use adl_browser::download_types::{DownloadMode, DownloadRecord, DownloadSettings};
use adl_errors::AppError;
use adl_types::IpcResult;
use tauri::State;

fn map_download_err(e: String) -> AppError {
    if e.contains("NoSpace") {
        AppError::Internal("Insufficient disk space".to_string())
    } else if e.contains("not found") || e.contains("Record not found") {
        AppError::NotFound(e)
    } else {
        AppError::Internal(e)
    }
}

#[tauri::command]
pub fn download_list(
    state: State<'_, AppState>,
) -> Result<IpcResult<Vec<DownloadRecord>>, CommandError> {
    let records = state.download_manager.list_downloads().map_err(map_download_err)?;
    Ok(ipc(Ok(records)))
}

#[tauri::command]
pub fn download_get_settings(
    state: State<'_, AppState>,
) -> Result<IpcResult<DownloadSettings>, CommandError> {
    Ok(ipc(Ok(state.download_manager.get_settings())))
}

#[tauri::command]
pub fn download_update_settings(
    state: State<'_, AppState>,
    mode: Option<String>,
    default_path: Option<String>,
) -> Result<IpcResult<()>, CommandError> {
    let mode_enum = mode.as_deref().map(DownloadMode::from_str);
    state.download_manager.update_settings(mode_enum, default_path).map_err(map_download_err)?;
    Ok(ipc(Ok(())))
}

#[tauri::command]
pub fn download_clear_history(state: State<'_, AppState>) -> Result<IpcResult<()>, CommandError> {
    state.download_manager.clear_history().map_err(map_download_err)?;
    Ok(ipc(Ok(())))
}

#[tauri::command]
pub fn download_delete_file_and_record(
    state: State<'_, AppState>,
    id: String,
) -> Result<IpcResult<()>, CommandError> {
    state.download_manager.delete_file_and_record(&id).map_err(map_download_err)?;
    Ok(ipc(Ok(())))
}

#[tauri::command]
pub fn download_remove_record(
    state: State<'_, AppState>,
    id: String,
) -> Result<IpcResult<()>, CommandError> {
    state.download_manager.remove_record(&id).map_err(map_download_err)?;
    Ok(ipc(Ok(())))
}

#[tauri::command]
pub fn download_resolve_conflict_path(
    state: State<'_, AppState>,
    suggested_path: String,
) -> Result<IpcResult<String>, CommandError> {
    Ok(ipc(Ok(state.download_manager.resolve_conflict_path(&suggested_path))))
}

#[tauri::command]
pub fn download_check_disk_space(
    state: State<'_, AppState>,
    path: String,
) -> Result<IpcResult<()>, CommandError> {
    state.download_manager.check_disk_space(&path).map_err(map_download_err)?;
    Ok(ipc(Ok(())))
}

#[tauri::command]
pub fn download_get_default_path() -> Result<IpcResult<String>, CommandError> {
    Ok(ipc(Ok(get_default_download_path().to_string_lossy().to_string())))
}

#[tauri::command]
pub fn download_open_default_folder(
    state: State<'_, AppState>,
) -> Result<IpcResult<()>, CommandError> {
    let path = state.download_manager.get_settings().default_path;
    open_in_os_file_manager(&path).map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(ipc(Ok(())))
}

#[tauri::command]
pub fn download_open_file(file_path: String) -> Result<IpcResult<()>, CommandError> {
    open_file(&file_path).map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(ipc(Ok(())))
}

#[tauri::command]
pub fn download_show_in_folder(file_path: String) -> Result<IpcResult<()>, CommandError> {
    reveal_in_os_file_manager(&file_path).map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(ipc(Ok(())))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn map_download_err_no_space() {
        let err = map_download_err("FileNoSpace".to_string());
        assert!(err.to_string().contains("disk space"));
    }

    #[test]
    fn map_download_err_not_found() {
        let err = map_download_err("Record not found: xyz".to_string());
        match err {
            AppError::NotFound(_) => {},
            other => panic!("expected NotFound, got {other:?}"),
        }
    }

    #[test]
    fn map_download_err_generic() {
        let err = map_download_err("something broke".to_string());
        match err {
            AppError::Internal(_) => {},
            other => panic!("expected Internal, got {other:?}"),
        }
    }
}
