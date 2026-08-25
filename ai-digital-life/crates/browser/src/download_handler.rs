use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, Emitter};

use super::download_manager::DownloadManager;

pub fn setup_download_handler(
    app_handle: AppHandle,
    download_manager: Arc<DownloadManager>,
) -> impl Fn(String, &mut PathBuf) -> bool + Send + Sync + 'static {
    let manager = download_manager;
    let handle = app_handle;

    move |url: String, destination: &mut PathBuf| {
        let suggested_path = destination.to_string_lossy().to_string();
        tracing::debug!(url = &url, suggested_path = &suggested_path, "download requested");

        // Resolve the absolute target first so we can both persist the record and
        // point WebView2 at a valid location (empty/relative destinations make
        // WebView2 silently drop binary/app downloads). Conflict resolution is
        // applied inside resolve_download_target.
        let final_path = manager.resolve_download_target(&url, &suggested_path);

        if let Err(reason) = manager.check_disk_space(&final_path) {
            tracing::warn!(url = &url, reason = &reason, "download denied: disk space check failed");
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
                    "download record created"
                );
                let _ = handle.emit("browser-download-started", &record);
                true
            },
            Err(reason) => {
                tracing::warn!(url = &url, reason = &reason, "download record creation failed");
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
    let records = match download_manager.list_downloads() {
        Ok(r) => r,
        Err(_) => return,
    };

    let record = records.iter().find(|r| r.url == url);
    let record = match record {
        Some(r) => r,
        None => return,
    };

    let actual_path =
        path.map(|p| p.to_string_lossy().to_string()).unwrap_or_else(|| record.file_path.clone());

    if success {
        let _ = download_manager.complete_download(&record.id, true, None);
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
        assert_eq!(settings.mode, DownloadMode::Auto);
        let _ =
            std::fs::remove_file(std::env::temp_dir().join("adl-download-handler-manager-arc.db"));
    }
}
