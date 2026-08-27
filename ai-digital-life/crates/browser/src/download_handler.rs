use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter};

use super::download_manager::DownloadManager;

pub fn setup_download_handler(
    app_handle: AppHandle,
    download_manager: Arc<DownloadManager>,
    last_record_id: Arc<Mutex<Option<String>>>,
    is_silent: bool,
) -> impl Fn(String, &mut PathBuf) -> bool + Send + Sync + 'static {
    let manager = download_manager;
    let handle = app_handle;

    move |url: String, destination: &mut PathBuf| {
        // Silent webviews (warmup/meta fetch): cancel ALL downloads unconditionally.
        // Matches Chrome/Edge behavior where background pages never auto-download.
        if is_silent {
            tracing::warn!(
                url = &url,
                "[ADL-DL] download_requested: CANCELLED (silent webview)"
            );
            return false;
        }

        let suggested_path = destination.to_string_lossy().to_string();
        tracing::debug!(url = &url, suggested_path = &suggested_path, "[ADL-DL] download requested");

        // Check if this URL is already being downloaded (prevent duplicates)
        if let Some(existing) = manager.get_record_by_url(&url) {
            match existing.status {
                super::download_types::DownloadStatus::InProgress => {
                    tracing::debug!(
                        url = &url,
                        existing_id = &existing.id,
                        "[ADL-DL] duplicate download detected, allowing WebView2 to handle"
                    );
                    // Still allow the download but don't create a new record
                    *destination = PathBuf::from(&existing.file_path);
                    return true;
                }
                super::download_types::DownloadStatus::Paused => {
                    tracing::warn!(
                        url = &url,
                        existing_id = &existing.id,
                        "[ADL-DL] download is paused by user, denying auto-resume"
                    );
                    let _ = handle.emit(
                        "browser-download-paused-blocked",
                        &serde_json::json!({
                            "id": existing.id,
                            "url": url,
                        }),
                    );
                    return false;
                }
                _ => {}
            }
        }

        // Resolve the absolute target first so we can both persist the record and
        // point WebView2 at a valid location (empty/relative destinations make
        // WebView2 silently drop binary/app downloads). Conflict resolution is
        // applied inside resolve_download_target.
        let final_path = manager.resolve_download_target(&url, &suggested_path);

        if let Err(reason) = manager.check_disk_space(&final_path) {
            tracing::warn!(url = &url, reason = &reason, "[ADL-DL] download denied: disk space check failed");
            let _ = handle.emit(
                "browser-download-error",
                &serde_json::json!({
                    "id": "",
                    "url": url,
                    "reason": reason,
                    "canRetry": false,
                }),
            );
            return false;
        }

        // Point WebView2 at our resolved absolute target so it actually downloads
        // there (the assigned path must be absolute).
        *destination = PathBuf::from(&final_path);

        match manager.create_download(&url, &final_path) {
            Ok(record) => {
                tracing::debug!(
                    url = &url,
                    final_path = &final_path,
                    record_id = &record.id,
                    "[ADL-DL] download record created"
                );
                // Store record ID for progress monitor
                if let Ok(mut last) = last_record_id.lock() {
                    *last = Some(record.id.clone());
                }
                let _ = handle.emit("browser-download-started", &record);
                true
            },
            Err(reason) => {
                tracing::warn!(url = &url, reason = &reason, "[ADL-DL] download record creation failed");
                let _ = handle.emit(
                    "browser-download-error",
                    &serde_json::json!({
                        "id": "",
                        "url": url,
                        "reason": reason,
                        "canRetry": false,
                    }),
                );
                false
            },
        }
    }
}

pub fn handle_download_finished(
    app_handle: &AppHandle,
    download_manager: &DownloadManager,
    url: &str,
    path: Option<&std::path::Path>,
    success: bool,
) {
    tracing::debug!(
        url = url,
        success,
        path = path.map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
        "[ADL-DL] download finished event received"
    );

    let records = match download_manager.list_downloads() {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!(error = %e, "[ADL-DL] failed to list downloads for finished event");
            return;
        },
    };

    let record = records.iter().find(|r| r.url == url);
    let record = match record {
        Some(r) => r,
        None => {
            tracing::warn!(url = url, "[ADL-DL] no download record found for finished URL");
            return;
        },
    };

    let actual_path =
        path.map(|p| p.to_string_lossy().to_string()).unwrap_or_else(|| record.file_path.clone());

    if success {
        let _ = download_manager.complete_download(&record.id, true, None);
        tracing::debug!(record_id = &record.id, "[ADL-DL] download completed successfully");
        let _ = app_handle.emit(
            "browser-download-finished",
            &serde_json::json!({
                "id": record.id,
                "url": url,
                "filePath": actual_path,
                "success": true,
            }),
        );
    } else {
        let _ = download_manager.complete_download(&record.id, false, Some("DownloadFailed"));
        tracing::warn!(record_id = &record.id, "[ADL-DL] download failed");
        let _ = app_handle.emit(
            "browser-download-finished",
            &serde_json::json!({
                "id": record.id,
                "url": url,
                "filePath": actual_path,
                "success": false,
            }),
        );
    }
}

pub fn handle_download_progress(
    app_handle: &AppHandle,
    download_manager: &DownloadManager,
    url: &str,
    bytes_received: u64,
    total_bytes: Option<u64>,
) {
    let records = match download_manager.list_downloads() {
        Ok(r) => r,
        Err(_) => return,
    };

    let record = records.iter().find(|r| r.url == url);
    let record = match record {
        Some(r) => r,
        None => return,
    };

    // Update total bytes if we now know it
    if let Some(total) = total_bytes {
        let _ = download_manager.update_total_bytes(&record.id, total);
    }

    // Calculate speed (simple: bytes since last update)
    let speed = bytes_received.saturating_sub(record.bytes_received);

    // Update progress in manager
    if let Err(e) = download_manager.update_progress(&record.id, bytes_received, speed) {
        tracing::warn!(error = %e, record_id = &record.id, "[ADL-DL] failed to update progress");
        return;
    }

    tracing::debug!(
        record_id = &record.id,
        bytes_received,
        total_bytes = total_bytes.unwrap_or(0),
        "[ADL-DL] progress updated"
    );

    let _ = app_handle.emit(
        "browser-download-progress",
        &serde_json::json!({
            "id": record.id,
            "bytes_received": bytes_received,
            "total_bytes": total_bytes,
            "speed": speed,
        }),
    );
}

pub fn handle_download_pause(
    app_handle: &AppHandle,
    download_manager: &DownloadManager,
    id: &str,
) {
    tracing::debug!(record_id = id, "[ADL-DL] pausing download");
    if let Err(e) = download_manager.pause_download(id) {
        tracing::warn!(error = %e, record_id = id, "[ADL-DL] failed to pause download");
    }
    let _ = app_handle.emit(
        "browser-download-paused",
        &serde_json::json!({ "id": id }),
    );
}

pub fn handle_download_resume(
    app_handle: &AppHandle,
    download_manager: &DownloadManager,
    id: &str,
) {
    tracing::debug!(record_id = id, "[ADL-DL] resuming download");
    if let Err(e) = download_manager.resume_download(id) {
        tracing::warn!(error = %e, record_id = id, "[ADL-DL] failed to resume download");
    }
    let _ = app_handle.emit(
        "browser-download-resumed",
        &serde_json::json!({ "id": id }),
    );
}

pub fn handle_download_cancel(
    app_handle: &AppHandle,
    download_manager: &DownloadManager,
    id: &str,
) {
    tracing::debug!(record_id = id, "[ADL-DL] canceling download");
    if let Err(e) = download_manager.cancel_download(id) {
        tracing::warn!(error = %e, record_id = id, "[ADL-DL] failed to cancel download");
    }
    let _ = app_handle.emit(
        "browser-download-canceled",
        &serde_json::json!({ "id": id }),
    );
}

pub fn create_download_manager(db: adl_storage::Database) -> Arc<DownloadManager> {
    Arc::new(DownloadManager::new(db))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::download_types::DownloadMode;

    fn temp_db(name: &str) -> adl_storage::Database {
        let path = std::env::temp_dir().join(format!("adl-download-handler-{}.db", name));
        let _ = std::fs::remove_file(&path);
        let db = adl_storage::Database::open(&path).expect("test db should open");
        db.init_schema().expect("schema should init");
        adl_migration::run_pending(&db).expect("migrations should apply");
        db
    }

    #[test]
    fn create_download_manager_returns_arc() {
        let db = temp_db("manager-arc");
        let manager = create_download_manager(db);
        let settings = manager.get_settings();
        assert_eq!(settings.mode, DownloadMode::Ask);
        let _ =
            std::fs::remove_file(std::env::temp_dir().join("adl-download-handler-manager-arc.db"));
    }
}
