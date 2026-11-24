use crate::commands::ipc;
use crate::commands::platform::{open_file, open_in_os_file_manager, reveal_in_os_file_manager};
use crate::error::CommandError;
use crate::state::AppState;
use adl_browser::download_manager::get_default_download_path;
use adl_browser::download_types::{
    DownloadMode, DownloadPauseResult, DownloadRecord, DownloadSettings, DownloadStatus,
};
use adl_errors::AppError;
use adl_types::IpcResult;
use std::path::PathBuf;
use tauri::{Emitter, State};

/// 页面 blob 下载的原始字节上限，与 `init_script.js` 的
/// `__ADL_BLOB_MAX_BYTES`（64 MiB）保持一致；WebView2 `save-blob` postMessage
/// 桥接在 base64 解码后按原始字节大小兜底写盘（解码分配由 base64 长度上限约束）。
const MAX_BLOB_BYTES: usize = 64 * 1024 * 1024;

/// 解码后的 blob 是否超过上限（`==` 放行，与 JS 侧 `>` 判定同界）。
fn blob_exceeds_limit(len: usize) -> bool {
    len > MAX_BLOB_BYTES
}

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
    auto_migrate: Option<bool>,
) -> Result<IpcResult<()>, CommandError> {
    tracing::debug!(
        mode = mode.as_deref(),
        default_path = default_path.as_deref(),
        auto_migrate = ?auto_migrate,
        "[ADL-DL] download_update_settings called"
    );
    let mode_enum = mode.as_deref().map(DownloadMode::from_str);
    state
        .download_manager
        .update_settings(mode_enum, default_path, auto_migrate)
        .map_err(map_download_err)?;
    Ok(ipc(Ok(())))
}

/// 更改默认下载路径；`migrate` 为 true 时先把旧路径全部文件搬到新路径，
/// 全部成功后才删除旧目录并落盘。搬运用 `spawn_blocking` 避免阻塞主线程。
#[tauri::command]
pub async fn download_change_default_path(
    state: State<'_, AppState>,
    new_path: String,
    migrate: bool,
) -> Result<IpcResult<()>, CommandError> {
    tracing::debug!(
        new_path = %new_path,
        migrate,
        "[ADL-DL] download_change_default_path called"
    );
    let mgr = state.download_manager.clone();
    tokio::task::spawn_blocking(move || mgr.change_default_path(&new_path, migrate))
        .await
        .map_err(|e| map_download_err(format!("download_change_default_path join failed: {e}")))?
        .map_err(map_download_err)?;
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
) -> Result<IpcResult<DownloadPauseResult>, CommandError> {
    tracing::info!(id = %id, "[ADL-DL] download_pause called");

    let status = match state.download_manager.pause_download(&id) {
        Ok(status) => status,
        Err(e) => {
            tracing::error!(id = %id, error = %e, "[ADL-DL] download_pause: FAILED");
            // Fetch the record to include proper url and source_tab_id in the error event
            let record = state
                .download_manager
                .list_downloads()
                .ok()
                .and_then(|rs| rs.into_iter().find(|r| r.id == id));
            let url = record.as_ref().map(|r| r.url.clone()).unwrap_or_default();
            let source_tab_id = record.as_ref().and_then(|r| r.source_tab_id.clone());
            let _ = app_handle.emit(
                "browser-download-error",
                &serde_json::json!({
                    "id": id,
                    "url": url,
                    "reason": format!("Pause failed: {}", e),
                    "canRetry": true,
                    "source_tab_id": source_tab_id,
                }),
            );
            return Err(map_download_err(e).into());
        },
    };

    // Emit the event matching the actual outcome so the UI reflects the true
    // state (matches Chrome/Edge: a just-finished download goes straight to
    // "Complete" instead of showing a misleading "paused").
    match status {
        DownloadStatus::Paused => {
            tracing::info!(id = %id, "[ADL-DL] download_pause: download paused");
            let record = state
                .download_manager
                .list_downloads()
                .ok()
                .and_then(|rs| rs.into_iter().find(|r| r.id == id));
            let source_tab_id = record.as_ref().and_then(|r| r.source_tab_id.clone());
            // Carry the backend's interrupt_reason (UserPaused / NonResumablePaused
            // / CosmeticPaused) so the frontend reflects the true pause kind
            // instead of defaulting to UserPaused.
            let interrupt_reason = record.as_ref().and_then(|r| r.interrupt_reason.clone());
            let _ = app_handle.emit(
                "browser-download-paused",
                &serde_json::json!({
                    "id": id,
                    "source_tab_id": source_tab_id,
                    "interrupt_reason": interrupt_reason,
                }),
            );
        },
        DownloadStatus::Completed => {
            // The transfer had already finished when the user clicked pause.
            let record = state
                .download_manager
                .list_downloads()
                .ok()
                .and_then(|rs| rs.into_iter().find(|r| r.id == id));
            let url = record.as_ref().map(|r| r.url.clone()).unwrap_or_default();
            let file_path = record.as_ref().map(|r| r.file_path.clone()).unwrap_or_default();
            let source_tab_id = record.as_ref().and_then(|r| r.source_tab_id.clone());
            tracing::info!(
                id = %id,
                url = %url,
                file_path = %file_path,
                "[ADL-DL] download_pause: transfer already completed; emitting finished(true)"
            );
            let _ = app_handle.emit(
                "browser-download-finished",
                &serde_json::json!({
                    "id": id,
                    "url": url,
                    "filePath": file_path,
                    "success": true,
                    "source_tab_id": source_tab_id,
                }),
            );
        },
        _ => {
            tracing::warn!(id = %id, "[ADL-DL] download_pause: unexpected resulting status");
        },
    }

    Ok(ipc(Ok(DownloadPauseResult { status })))
}

#[tauri::command]
pub fn download_resume(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    id: String,
) -> Result<IpcResult<()>, CommandError> {
    tracing::info!(id = %id, "[ADL-DL] download_resume called");
    // Resolve the record once so both the resumed and error events carry the
    // same source_tab_id (consistent with the pause/finished event contract).
    let record = state
        .download_manager
        .list_downloads()
        .ok()
        .and_then(|rs| rs.into_iter().find(|r| r.id == id));
    let source_tab_id = record.as_ref().and_then(|r| r.source_tab_id.clone());
    match state.download_manager.resume_download(&id, &app_handle) {
        Ok(()) => {
            tracing::info!(id = %id, "[ADL-DL] download_resume: resumed successfully");
            let _ = app_handle.emit(
                "browser-download-resumed",
                &serde_json::json!({
                    "id": id,
                    "source_tab_id": source_tab_id,
                }),
            );
            Ok(ipc(Ok(())))
        },
        Err(e) => {
            tracing::error!(id = %id, error = %e, "[ADL-DL] download_resume: FAILED");
            // Emit an error event with the record id so the frontend marks the
            // existing record failed (the toast path requires a missing record).
            let url = record.as_ref().map(|r| r.url.clone()).unwrap_or_default();
            let _ = app_handle.emit(
                "browser-download-error",
                &serde_json::json!({
                    "id": id,
                    "url": url,
                    "reason": format!("Resume failed: {}", e),
                    "canRetry": true,
                    "source_tab_id": source_tab_id,
                }),
            );
            Err(map_download_err(e).into())
        },
    }
}

#[tauri::command]
pub fn download_cancel(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    id: String,
) -> Result<IpcResult<()>, CommandError> {
    tracing::debug!(id = %id, "[ADL-DL] download_cancel called");
    state.download_manager.cancel_download(&id).map_err(map_download_err)?;
    let record = state
        .download_manager
        .list_downloads()
        .ok()
        .and_then(|rs| rs.into_iter().find(|r| r.id == id));
    let source_tab_id = record.as_ref().and_then(|r| r.source_tab_id.clone());
    let _ = app_handle.emit(
        "browser-download-canceled",
        &serde_json::json!({
            "id": id,
            "source_tab_id": source_tab_id,
        }),
    );
    Ok(ipc(Ok(())))
}

/// 保存页面 blob 下载（WebView2 `save-blob` postMessage 桥接的落盘入口）。
/// 文件名净化、base64 解码、冲突路径解析与下载记录生命周期都在这里。
///
/// `source_tab_id` 为发起下载的标签页，写入下载记录的 `source_tab_id`；该标签
/// 在下载期间由挂起调度器保护（`useBrowserSuspendScheduler`）。
pub(crate) async fn save_blob_download(
    app_handle: &tauri::AppHandle,
    state: &AppState,
    file_name: String,
    data_base64: String,
    source_tab_id: Option<String>,
) -> Result<DownloadRecord, AppError> {
    tracing::debug!(
        file_name = %file_name,
        data_len = data_base64.len(),
        source_tab_id = source_tab_id.as_deref().unwrap_or("<none>"),
        "[ADL-DL] save_blob_download called"
    );

    // 净化文件名（轻量）在此先做，拒绝路径穿越/非法名；失败也发同一条错误
    // 事件（带 fileName），让前端能提示，而不是只剩日志。随后在 spawn_blocking
    // 中执行 base64 解码 + 全量落盘，避免大 blob 阻塞主线程（窗口卡顿/未响应）。
    let raw_file_name = file_name;
    let file_name = match sanitize_download_file_name(&raw_file_name) {
        Ok(name) => name,
        Err(err) => {
            tracing::warn!(
                file_name = %raw_file_name,
                error = %err,
                "[ADL-DL] save_blob_download rejected file name"
            );
            let _ = app_handle.emit(
                "browser-download-error",
                &serde_json::json!({
                    "id": "",
                    "url": format!("blob://local/{}", raw_file_name),
                    "fileName": raw_file_name,
                    "reason": err.to_string(),
                    "canRetry": false,
                }),
            );
            return Err(err);
        },
    };
    let blob_url = format!("blob://local/{}", file_name);
    let blob_url_spawn = blob_url.clone();
    let mgr = state.download_manager.clone();
    let file_name_spawn = file_name.clone();
    let source_tab_id_spawn = source_tab_id.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<DownloadRecord, AppError> {
        let decoded =
            base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &data_base64)
                .map_err(|e| AppError::Internal(format!("base64 decode failed: {e}")))?;
        if blob_exceeds_limit(decoded.len()) {
            return Err(AppError::InvalidInput(format!(
                "blob download too large: {} bytes (max {} bytes)",
                decoded.len(),
                MAX_BLOB_BYTES
            )));
        }

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
            .create_download(
                &blob_url_spawn,
                final_path.to_string_lossy().as_ref(),
                source_tab_id_spawn,
            )
            .map_err(map_download_err)?;
        Ok(record)
    })
    .await
    .map_err(|e| map_download_err(format!("save_blob_download spawn_blocking join failed: {e}")))?;

    let record = match result {
        Ok(record) => record,
        Err(err) => {
            tracing::warn!(
                file_name = %file_name,
                error = %err,
                "[ADL-DL] save_blob_download FAILED"
            );
            let _ = app_handle.emit(
                "browser-download-error",
                &serde_json::json!({
                    "id": "",
                    "url": blob_url,
                    "fileName": file_name,
                    "reason": err.to_string(),
                    "canRetry": false,
                }),
            );
            return Err(err);
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
            "source_tab_id": record.source_tab_id,
        }),
    );
    Ok(record)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blob_limit_allows_exactly_64_mib_and_rejects_one_more_byte() {
        assert!(!blob_exceeds_limit(MAX_BLOB_BYTES));
        assert!(blob_exceeds_limit(MAX_BLOB_BYTES + 1));
        assert!(!blob_exceeds_limit(0));
    }

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
