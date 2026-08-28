use crate::commands::ipc;
use crate::commands::platform::{open_file, open_in_os_file_manager, reveal_in_os_file_manager};
use crate::error::CommandError;
use crate::state::AppState;
use adl_browser::download_manager::get_default_download_path;
use adl_browser::download_types::{DownloadMode, DownloadRecord, DownloadSettings};
use adl_errors::AppError;
use adl_types::IpcResult;
use std::path::PathBuf;
use tauri::{Emitter, State};

fn map_download_err(e: String) -> AppError {
    if e.contains("NoSpace") {
        AppError::Internal("Insufficient disk space".to_string())
    } else if e.contains("not found") || e.contains("Record not found") {
        AppError::NotFound(e)
    } else {
        AppError::Internal(e)
    }
}

/// 防路径穿越 + 平台健壮性：仅接受不含路径分隔符的单一安全文件名。
/// 拒绝空名、`.`、`..`、含 `/`、`\`、控制字符或 Windows 非法字符/保留设备名的文件名，
/// 杜绝下载落到下载目录之外或落盘失败。
fn sanitize_download_file_name(file_name: &str) -> Result<String, AppError> {
    let reject = |reason: &str| {
        Err(AppError::InvalidInput(format!("illegal download file name '{file_name}': {reason}")))
    };
    let name = file_name.trim().trim_end_matches([' ', '.']);
    if name.is_empty() {
        return reject("empty");
    }
    if name == "." || name == ".." {
        return reject("dot entry");
    }
    // 路径分隔符会造成穿越；无分隔符时 ".." 无法跳出下载目录，故仅精确拒绝 "." / ".."
    if name.contains('/') || name.contains('\\') {
        return reject("path separator");
    }
    // 控制字符会污染日志/错误事件回显
    if name.chars().any(|c| c.is_control()) {
        return reject("control character");
    }
    #[cfg(windows)]
    if is_windows_illegal(name) {
        return reject("windows reserved/invalid name");
    }
    Ok(name.to_string())
}

/// Windows 保留设备名与非法字符校验（仅在文件名净化后的单一 basename 上执行）。
#[cfg(windows)]
fn is_windows_illegal(name: &str) -> bool {
    const INVALID_CHARS: &[char] = &[':', '*', '?', '"', '<', '>', '|'];
    if name.chars().any(|c| INVALID_CHARS.contains(&c)) {
        return true;
    }
    // 不带扩展名的保留设备名：CON、PRN、AUX、NUL、COM1-9、LPT1-9
    let stem = name.split('.').next().unwrap_or("");
    if stem.is_empty() {
        return false;
    }
    const RESERVED: &[&str] = &[
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    let upper = stem.to_ascii_uppercase();
    RESERVED.contains(&upper.as_str())
}

#[tauri::command]
pub fn download_list(
    state: State<'_, AppState>,
) -> Result<IpcResult<Vec<DownloadRecord>>, CommandError> {
    tracing::debug!("[ADL-DL] download_list called");
    let records = state.download_manager.list_downloads().map_err(map_download_err)?;
    tracing::debug!("[ADL-DL] download_list returned {} records", records.len());
    Ok(ipc(Ok(records)))
}

#[tauri::command]
pub fn download_get_settings(
    state: State<'_, AppState>,
) -> Result<IpcResult<DownloadSettings>, CommandError> {
    tracing::debug!("[ADL-DL] download_get_settings called");
    Ok(ipc(Ok(state.download_manager.get_settings())))
}

#[tauri::command]
pub fn download_update_settings(
    state: State<'_, AppState>,
    mode: Option<String>,
    default_path: Option<String>,
) -> Result<IpcResult<()>, CommandError> {
    tracing::debug!(
        mode = mode.as_deref(),
        default_path = default_path.as_deref(),
        "[ADL-DL] download_update_settings called"
    );
    let mode_enum = mode.as_deref().map(DownloadMode::from_str);
    state.download_manager.update_settings(mode_enum, default_path).map_err(map_download_err)?;
    Ok(ipc(Ok(())))
}

#[tauri::command]
pub fn download_clear_history(state: State<'_, AppState>) -> Result<IpcResult<()>, CommandError> {
    tracing::debug!("[ADL-DL] download_clear_history called");
    state.download_manager.clear_history().map_err(map_download_err)?;
    Ok(ipc(Ok(())))
}

#[tauri::command]
pub fn download_delete_file_and_record(
    state: State<'_, AppState>,
    id: String,
) -> Result<IpcResult<()>, CommandError> {
    tracing::debug!(id = %id, "[ADL-DL] download_delete_file_and_record called");
    state.download_manager.delete_file_and_record(&id).map_err(map_download_err)?;
    Ok(ipc(Ok(())))
}

#[tauri::command]
pub fn download_remove_record(
    state: State<'_, AppState>,
    id: String,
) -> Result<IpcResult<()>, CommandError> {
    tracing::debug!(id = %id, "[ADL-DL] download_remove_record called");
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
    let target = if path.is_empty() {
        get_default_download_path().to_string_lossy().to_string()
    } else {
        path
    };
    open_in_os_file_manager(&target).map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(ipc(Ok(())))
}

#[tauri::command]
pub fn download_open_file(file_path: String) -> Result<IpcResult<()>, CommandError> {
    open_file(&file_path).map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(ipc(Ok(())))
}

#[tauri::command]
pub fn download_show_in_folder(
    state: State<'_, AppState>,
    file_path: String,
) -> Result<IpcResult<()>, CommandError> {
    tracing::debug!(file_path = %file_path, "[ADL-DL] download_show_in_folder called");
    let trimmed = file_path.trim();
    if !trimmed.is_empty() {
        let p = std::path::Path::new(trimmed);
        if p.exists() {
            reveal_in_os_file_manager(trimmed).map_err(|e| AppError::Internal(e.to_string()))?;
            return Ok(ipc(Ok(())));
        }
    }
    let default_path = state.download_manager.get_settings().default_path;
    let target = if default_path.is_empty() {
        get_default_download_path().to_string_lossy().to_string()
    } else {
        default_path
    };
    tracing::debug!(
        target = %target,
        "[ADL-DL] file not found or empty, opening default download folder"
    );
    open_in_os_file_manager(&target).map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(ipc(Ok(())))
}

#[tauri::command]
pub fn download_pause(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    id: String,
) -> Result<IpcResult<()>, CommandError> {
    tracing::debug!(id = %id, "[ADL-DL] download_pause called");

    state.download_manager.pause_download(&id).map_err(map_download_err)?;

    let _ = app_handle.emit("browser-download-paused", &serde_json::json!({ "id": id }));
    Ok(ipc(Ok(())))
}

#[tauri::command]
pub fn download_resume(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    id: String,
) -> Result<IpcResult<()>, CommandError> {
    tracing::debug!(id = %id, "[ADL-DL] download_resume called");
    state.download_manager.resume_download(&id).map_err(map_download_err)?;
    let _ = app_handle.emit("browser-download-resumed", &serde_json::json!({ "id": id }));
    Ok(ipc(Ok(())))
}

#[tauri::command]
pub fn download_cancel(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    id: String,
) -> Result<IpcResult<()>, CommandError> {
    tracing::debug!(id = %id, "[ADL-DL] download_cancel called");
    state.download_manager.cancel_download(&id).map_err(map_download_err)?;
    let _ = app_handle.emit("browser-download-canceled", &serde_json::json!({ "id": id }));
    Ok(ipc(Ok(())))
}

#[tauri::command]
pub async fn download_save_blob(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    file_name: String,
    data_base64: String,
) -> Result<IpcResult<DownloadRecord>, CommandError> {
    tracing::debug!(
        file_name = %file_name,
        data_len = data_base64.len(),
        "[ADL-DL] download_save_blob called"
    );

    // 净化文件名（轻量）在此先做，拒绝路径穿越/非法名；随后在 spawn_blocking
    // 中执行 base64 解码 + 全量落盘，避免大 blob 阻塞主线程（窗口卡顿/未响应）。
    // file_name 在闭包外保留一份（供日志/错误事件回显），另 clone 一份随闭包 move，
    // 避免闭包 move 后外层借用失效（E0382）。
    let file_name = sanitize_download_file_name(&file_name)?;
    let blob_url = format!("blob://local/{}", file_name);
    let blob_url_spawn = blob_url.clone();
    let mgr = state.download_manager.clone();
    let file_name_spawn = file_name.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<DownloadRecord, AppError> {
        let decoded =
            base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &data_base64)
                .map_err(|e| AppError::Internal(format!("base64 decode failed: {e}")))?;

        let default_path = mgr.get_settings().default_path;
        let target_dir = if default_path.is_empty() {
            get_default_download_path()
        } else {
            PathBuf::from(&default_path)
        };
        let _ = std::fs::create_dir_all(&target_dir);

        let mut final_path = target_dir.join(&file_name_spawn);
        let resolved = mgr.resolve_conflict_path(final_path.to_string_lossy().as_ref());
        final_path = PathBuf::from(resolved);

        std::fs::write(&final_path, &decoded)
            .map_err(|e| AppError::Internal(format!("failed to write file: {e}")))?;

        let record = mgr
            .create_download(&blob_url_spawn, final_path.to_string_lossy().as_ref())
            .map_err(map_download_err)?;
        Ok(record)
    })
    .await
    .map_err(|e| map_download_err(format!("download_save_blob spawn_blocking join failed: {e}")))?;

    let record = match result {
        Ok(record) => record,
        Err(err) => {
            tracing::warn!(
                file_name = %file_name,
                error = %err,
                "[ADL-DL] download_save_blob FAILED"
            );
            let _ = app_handle.emit(
                "browser-download-error",
                &serde_json::json!({
                    "id": "",
                    "url": blob_url,
                    "reason": err.to_string(),
                    "canRetry": false,
                }),
            );
            return Err(err.into());
        },
    };

    let _ = app_handle.emit("browser-download-started", &record);

    let _ = state.download_manager.complete_download(&record.id, true, None);

    tracing::debug!(
        record_id = &record.id,
        file_path = %record.file_path,
        "[ADL-DL] blob download saved successfully"
    );

    let _ = app_handle.emit(
        "browser-download-finished",
        &serde_json::json!({
            "id": record.id,
            "url": record.url,
            "filePath": record.file_path,
            "success": true,
        }),
    );
    Ok(ipc(Ok(record)))
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

    #[test]
    fn sanitize_download_file_name_accepts_plain_name() {
        let result = sanitize_download_file_name("report.pdf");
        assert_eq!(result.unwrap(), "report.pdf");
    }

    #[test]
    fn sanitize_download_file_name_rejects_path_traversal() {
        for bad in
            ["../../etc/passwd", "..\\..\\Windows\\system.ini", "/abs/path/file.exe", "..", "."]
        {
            let result = sanitize_download_file_name(bad);
            assert!(result.is_err(), "expected reject for {bad:?}");
        }
    }

    #[test]
    fn sanitize_download_file_name_rejects_directory_prefix() {
        // 含目录前缀的文件名同样一律拒绝（严格契约：仅允许单一文件名）
        let result = sanitize_download_file_name("downloads/demo.zip");
        assert!(result.is_err());
    }

    #[test]
    fn sanitize_download_file_name_accepts_double_dot_in_name() {
        // F4：文件名中的 ".."（无路径分隔符）不构成穿越，应接受
        let result = sanitize_download_file_name("report..final.pdf");
        assert_eq!(result.unwrap(), "report..final.pdf");
    }

    #[test]
    fn sanitize_download_file_name_rejects_control_chars() {
        for bad in ["evil\u{0007}.exe", "a\u{001f}b"] {
            let result = sanitize_download_file_name(bad);
            assert!(result.is_err(), "expected reject for {bad:?}");
        }
    }

    #[cfg(windows)]
    #[test]
    fn sanitize_download_file_name_rejects_windows_illegal_names() {
        for bad in ["CON", "NUL.txt", "COM1", "LPT3.log", "a?b", "x<y", "a:b"] {
            let result = sanitize_download_file_name(bad);
            assert!(result.is_err(), "expected reject for {bad:?}");
        }
    }
}
