use std::sync::Arc;

use tauri::{AppHandle, Emitter};

use super::download_manager::DownloadManager;
use super::download_types::DownloadMode;

pub fn setup_download_handler(
    app_handle: AppHandle,
    download_manager: Arc<DownloadManager>,
) -> impl Fn(String, String) -> bool + Send + Sync + 'static {
    let manager = download_manager;
    let handle = app_handle;

    move |url: String, suggested_path: String| {
        let settings = manager.get_settings();

        if let Err(reason) = manager.check_disk_space(&suggested_path) {
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

        let final_path = match settings.mode {
            DownloadMode::Auto => manager.resolve_conflict_path(&suggested_path),
            DownloadMode::Ask => manager.resolve_conflict_path(&suggested_path),
        };

        match manager.create_download(&url, &final_path) {
            Ok(record) => {
                let _ = handle.emit("browser-download-started", &record);
                true
            }
            Err(reason) => {
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
            }
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

    let actual_path = path
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| record.file_path.clone());

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
        let _ = std::fs::remove_file(
            std::env::temp_dir().join("adl-download-handler-manager-arc.db"),
        );
    }
}
