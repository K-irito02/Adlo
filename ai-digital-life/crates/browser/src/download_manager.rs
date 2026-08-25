use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use chrono::Utc;
use uuid::Uuid;

use adl_storage::Database;

use super::download_types::{
    DownloadMode, DownloadProgress, DownloadRecord, DownloadSettings, DownloadStatus,
};

#[allow(dead_code)]
#[derive(Clone)]
pub struct DownloadManager {
    db: Database,
    settings: Arc<Mutex<DownloadSettings>>,
    active_downloads: Arc<Mutex<HashMap<String, DownloadProgress>>>,
}

#[allow(dead_code)]
impl DownloadManager {
    pub fn new(db: Database) -> Self {
        let settings = Self::load_settings(&db).unwrap_or_default();
        Self {
            db,
            settings: Arc::new(Mutex::new(settings)),
            active_downloads: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn get_settings(&self) -> DownloadSettings {
        self.settings.lock().expect("settings mutex should not be poisoned").clone()
    }

    pub fn update_settings(
        &self,
        mode: Option<DownloadMode>,
        default_path: Option<String>,
    ) -> Result<(), String> {
        let mut settings = self.settings.lock().expect("settings mutex should not be poisoned");
        if let Some(m) = mode {
            settings.mode = m;
        }
        if let Some(p) = default_path {
            settings.default_path = p;
        }
        self.save_settings(&settings)?;
        Ok(())
    }

    pub fn check_disk_space(&self, path: &str) -> Result<(), String> {
        let path = Path::new(path);
        let dir = if path.as_os_str().is_empty() {
            // Empty/root destination (e.g. WebView2 reports no location yet) —
            // fall back to the default download directory so the check doesn't
            // fail on an invalid path.
            &get_default_download_path()
        } else {
            path.parent().unwrap_or(Path::new("/"))
        };
        let stat = fs2::available_space(dir).map_err(|e| format!("Disk check failed: {}", e))?;
        if stat < 10 * 1024 * 1024 {
            return Err("FileNoSpace".to_string());
        }
        Ok(())
    }

    pub fn resolve_conflict_path(&self, suggested_path: &str) -> String {
        let path = Path::new(suggested_path);
        if !path.exists() {
            return suggested_path.to_string();
        }

        let stem = path
            .file_stem()
            .expect("path must have a file name")
            .to_str()
            .expect("file name must be valid UTF-8");
        let ext = path
            .extension()
            .map(|e| format!(".{}", e.to_str().expect("extension must be valid UTF-8")))
            .unwrap_or_default();
        let dir = path.parent().expect("path must have a parent directory");

        for i in 1.. {
            let new_name = format!("{} ({}){}", stem, i, ext);
            let new_path = dir.join(&new_name);
            if !new_path.exists() {
                return new_path.to_str().expect("new path must be valid UTF-8").to_string();
            }
        }
        unreachable!()
    }

    pub fn create_download(&self, url: &str, file_path: &str) -> Result<DownloadRecord, String> {
        let file_name = derive_file_name(url, file_path);
        let record = DownloadRecord {
            id: Uuid::new_v4().to_string(),
            url: url.to_string(),
            file_name,
            file_path: file_path.to_string(),
            total_bytes: None,
            bytes_received: 0,
            mime_type: None,
            status: DownloadStatus::InProgress,
            interrupt_reason: None,
            created_at: Utc::now().timestamp(),
            completed_at: None,
            source_tab_id: None,
        };

        let conn = self.db.conn().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO download_history (id, url, file_name, file_path, total_bytes, bytes_received, mime_type, status, interrupt_reason, created_at, completed_at, source_tab_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            rusqlite::params![
                record.id,
                record.url,
                record.file_name,
                record.file_path,
                record.total_bytes.map(|v| v as i64),
                record.bytes_received as i64,
                record.mime_type,
                record.status.as_str(),
                record.interrupt_reason,
                record.created_at,
                record.completed_at,
                record.source_tab_id,
            ],
        )
        .map_err(|e| format!("Failed to insert download record: {}", e))?;

        Ok(record)
    }

    pub fn update_progress(&self, id: &str, bytes: u64, speed: u64) -> Result<(), String> {
        {
            let mut active = self
                .active_downloads
                .lock()
                .expect("active_downloads mutex should not be poisoned");
            active.insert(
                id.to_string(),
                DownloadProgress {
                    id: id.to_string(),
                    bytes_received: bytes,
                    speed,
                    estimated_end_time: None,
                },
            );
        }

        let conn = self.db.conn().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE download_history SET bytes_received = ?1 WHERE id = ?2",
            rusqlite::params![bytes as i64, id],
        )
        .map_err(|e| format!("Failed to update progress: {}", e))?;
        Ok(())
    }

    pub fn complete_download(
        &self,
        id: &str,
        success: bool,
        reason: Option<&str>,
    ) -> Result<(), String> {
        let status = if success { DownloadStatus::Completed } else { DownloadStatus::Failed };

        let conn = self.db.conn().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE download_history SET status = ?1, interrupt_reason = ?2, completed_at = ?3 WHERE id = ?4",
            rusqlite::params![status.as_str(), reason, Utc::now().timestamp(), id],
        )
        .map_err(|e| format!("Failed to complete download: {}", e))?;

        self.active_downloads
            .lock()
            .expect("active_downloads mutex should not be poisoned")
            .remove(id);
        Ok(())
    }

    pub fn list_downloads(&self) -> Result<Vec<DownloadRecord>, String> {
        let conn = self.db.conn().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, url, file_name, file_path, total_bytes, bytes_received, mime_type, status, interrupt_reason, created_at, completed_at, source_tab_id FROM download_history ORDER BY created_at DESC")
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let records = stmt
            .query_map([], |row| {
                Ok(DownloadRecord {
                    id: row.get(0)?,
                    url: row.get(1)?,
                    file_name: row.get(2)?,
                    file_path: row.get(3)?,
                    total_bytes: row.get::<_, Option<i64>>(4)?.map(|v| v as u64),
                    bytes_received: row.get::<_, i64>(5)? as u64,
                    mime_type: row.get(6)?,
                    status: DownloadStatus::from_str(&row.get::<_, String>(7)?),
                    interrupt_reason: row.get(8)?,
                    created_at: row.get(9)?,
                    completed_at: row.get(10)?,
                    source_tab_id: row.get(11)?,
                })
            })
            .map_err(|e| format!("Failed to query downloads: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(records)
    }

    pub fn clear_history(&self) -> Result<(), String> {
        let conn = self.db.conn().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM download_history", [])
            .map_err(|e| format!("Failed to clear history: {}", e))?;
        Ok(())
    }

    pub fn delete_file_and_record(&self, id: &str) -> Result<(), String> {
        let record = self.get_record(id)?;
        if Path::new(&record.file_path).exists() {
            fs::remove_file(&record.file_path)
                .map_err(|e| format!("Failed to delete file: {}", e))?;
        }
        self.remove_record(id)
    }

    pub fn remove_record(&self, id: &str) -> Result<(), String> {
        let conn = self.db.conn().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM download_history WHERE id = ?1", rusqlite::params![id])
            .map_err(|e| format!("Failed to remove record: {}", e))?;
        Ok(())
    }

    fn get_record(&self, id: &str) -> Result<DownloadRecord, String> {
        let conn = self.db.conn().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT id, url, file_name, file_path, total_bytes, bytes_received, mime_type, status, interrupt_reason, created_at, completed_at, source_tab_id FROM download_history WHERE id = ?1",
            rusqlite::params![id],
            |row| {
                Ok(DownloadRecord {
                    id: row.get(0)?,
                    url: row.get(1)?,
                    file_name: row.get(2)?,
                    file_path: row.get(3)?,
                    total_bytes: row.get::<_, Option<i64>>(4)?.map(|v| v as u64),
                    bytes_received: row.get::<_, i64>(5)? as u64,
                    mime_type: row.get(6)?,
                    status: DownloadStatus::from_str(&row.get::<_, String>(7)?),
                    interrupt_reason: row.get(8)?,
                    created_at: row.get(9)?,
                    completed_at: row.get(10)?,
                    source_tab_id: row.get(11)?,
                })
            },
        )
        .map_err(|e| format!("Record not found: {}", e))
    }

    fn load_settings(db: &Database) -> Result<DownloadSettings, String> {
        let conn = db.conn().map_err(|e| e.to_string())?;
        conn.query_row("SELECT value FROM app_state WHERE key = 'download_settings'", [], |row| {
            row.get::<_, String>(0)
        })
        .map(|v| serde_json::from_str(&v).unwrap_or_default())
        .map_err(|_| "No settings found".to_string())
    }

    fn save_settings(&self, settings: &DownloadSettings) -> Result<(), String> {
        let json = serde_json::to_string(settings).map_err(|e| e.to_string())?;
        let conn = self.db.conn().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO app_state (key, value) VALUES ('download_settings', ?1)",
            rusqlite::params![json],
        )
        .map_err(|e| format!("Failed to save settings: {}", e))?;
        Ok(())
    }
}

/// Get default download path (non-C: drive preferred on Windows)
pub fn get_default_download_path() -> PathBuf {
    // 1. Try non-C: drive Downloads folder
    #[cfg(target_os = "windows")]
    {
        if let Some(downloads) = find_non_c_downloads_folder() {
            return downloads;
        }
    }

    // 2. Fallback to user Downloads directory
    if let Some(home) = dirs::home_dir() {
        let downloads = home.join("Downloads");
        if downloads.exists() {
            return downloads;
        }
        let _ = fs::create_dir_all(&downloads);
        return downloads;
    }

    // 3. Final fallback: app-specific directory
    let app_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("ai-digital-life")
        .join("downloads");
    let _ = fs::create_dir_all(&app_dir);
    app_dir
}

/// Derive a safe file name for a download record from the target path or URL.
///
/// WebView2 can report a destination path with no usable file stem (e.g. an
/// empty path, a root-relative directory, or a path ending in a separator). A
/// naive `Path::file_stem().expect(...)` would panic inside the WebView2
/// download callback thread, silently dropping the download. Instead, fall
/// back to the last non-empty path segment, then to the URL's path segment,
/// then to a generic placeholder — never panic.
fn derive_file_name(url: &str, file_path: &str) -> String {
    if let Some(name) = Path::new(file_path).file_name().and_then(|s| s.to_str()) {
        if !name.is_empty() && name != "." && name != ".." {
            return name.to_string();
        }
    }

    if let Some(url_path) = url::Url::parse(url).ok().map(|u| u.path().to_string()) {
        if !url_path.is_empty() && url_path != "/" {
            if let Some(segment) = url_path.rsplit('/').find(|s| !s.is_empty() && *s != "." && *s != "..")
            {
                return segment.to_string();
            }
        }
    }

    "download".to_string()
}

#[cfg(target_os = "windows")]
fn find_non_c_downloads_folder() -> Option<PathBuf> {
    for drive in b'D'..=b'Z' {
        let drive_path = format!("{}:\\", drive as char);
        if Path::new(&drive_path).exists() && drive != b'C' {
            if let Some(home) = dirs::home_dir() {
                let downloads = Path::new(&drive_path)
                    .join(home.file_name().unwrap_or_default())
                    .join("Downloads");
                if downloads.exists() {
                    return Some(downloads);
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db(name: &str) -> Database {
        let path = std::env::temp_dir().join(format!("adl-download-mgr-{}.db", name));
        let _ = std::fs::remove_file(&path);
        let db = Database::open(&path).expect("test db should open");
        db.init_schema().expect("schema should init");
        adl_migration::run_pending(&db).expect("migrations should apply");
        db
    }

    #[test]
    fn create_and_get_download() {
        let db = temp_db("create-get");
        let mgr = DownloadManager::new(db.clone());
        let record = mgr
            .create_download("https://example.com/file.zip", "/tmp/file.zip")
            .expect("create should succeed");
        assert_eq!(record.url, "https://example.com/file.zip");
        assert_eq!(record.file_path, "/tmp/file.zip");
        assert_eq!(record.status, DownloadStatus::InProgress);
        assert_eq!(record.bytes_received, 0);

        let list = mgr.list_downloads().expect("list should succeed");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, record.id);
        let _ = std::fs::remove_file(std::env::temp_dir().join("adl-download-mgr-create-get.db"));
    }

    #[test]
    fn update_progress_and_complete() {
        let db = temp_db("progress");
        let mgr = DownloadManager::new(db.clone());
        let record = mgr
            .create_download("https://example.com/file.zip", "/tmp/file.zip")
            .expect("create should succeed");

        mgr.update_progress(&record.id, 512, 1024).expect("update should succeed");
        let list = mgr.list_downloads().expect("list should succeed");
        assert_eq!(list[0].bytes_received, 512);

        mgr.complete_download(&record.id, true, None).expect("complete should succeed");
        let list = mgr.list_downloads().expect("list should succeed");
        assert_eq!(list[0].status, DownloadStatus::Completed);
        assert!(list[0].completed_at.is_some());
        let _ = std::fs::remove_file(std::env::temp_dir().join("adl-download-mgr-progress.db"));
    }

    #[test]
    fn complete_download_with_failure() {
        let db = temp_db("fail");
        let mgr = DownloadManager::new(db.clone());
        let record = mgr
            .create_download("https://example.com/file.zip", "/tmp/file.zip")
            .expect("create should succeed");

        mgr.complete_download(&record.id, false, Some("NetworkError"))
            .expect("complete should succeed");
        let list = mgr.list_downloads().expect("list should succeed");
        assert_eq!(list[0].status, DownloadStatus::Failed);
        assert_eq!(list[0].interrupt_reason.as_deref(), Some("NetworkError"));
        let _ = std::fs::remove_file(std::env::temp_dir().join("adl-download-mgr-fail.db"));
    }

    #[test]
    fn remove_record() {
        let db = temp_db("remove");
        let mgr = DownloadManager::new(db.clone());
        let record = mgr
            .create_download("https://example.com/file.zip", "/tmp/file.zip")
            .expect("create should succeed");

        mgr.remove_record(&record.id).expect("remove should succeed");
        let list = mgr.list_downloads().expect("list should succeed");
        assert!(list.is_empty());
        let _ = std::fs::remove_file(std::env::temp_dir().join("adl-download-mgr-remove.db"));
    }

    #[test]
    fn clear_history() {
        let db = temp_db("clear");
        let mgr = DownloadManager::new(db.clone());
        mgr.create_download("https://example.com/a.zip", "/tmp/a.zip").expect("create a");
        mgr.create_download("https://example.com/b.zip", "/tmp/b.zip").expect("create b");

        mgr.clear_history().expect("clear should succeed");
        let list = mgr.list_downloads().expect("list should succeed");
        assert!(list.is_empty());
        let _ = std::fs::remove_file(std::env::temp_dir().join("adl-download-mgr-clear.db"));
    }

    #[test]
    fn settings_persistence() {
        let db = temp_db("settings");
        let mgr = DownloadManager::new(db.clone());

        let s = mgr.get_settings();
        assert_eq!(s.mode, DownloadMode::Auto);

        mgr.update_settings(Some(DownloadMode::Ask), Some("/custom/path".to_string()))
            .expect("update should succeed");
        let s2 = mgr.get_settings();
        assert_eq!(s2.mode, DownloadMode::Ask);
        assert_eq!(s2.default_path, "/custom/path");

        // Reload from db
        let mgr2 = DownloadManager::new(db.clone());
        let s3 = mgr2.get_settings();
        assert_eq!(s3.mode, DownloadMode::Ask);
        assert_eq!(s3.default_path, "/custom/path");
        let _ = std::fs::remove_file(std::env::temp_dir().join("adl-download-mgr-settings.db"));
    }

    #[test]
    fn resolve_conflict_path_no_conflict() {
        let db = temp_db("conflict");
        let mgr = DownloadManager::new(db);
        let result = mgr.resolve_conflict_path("/tmp/nonexistent_file.txt");
        assert_eq!(result, "/tmp/nonexistent_file.txt");
    }

    #[test]
    fn resolve_conflict_path_with_conflict() {
        let db = temp_db("conflict2");
        let mgr = DownloadManager::new(db);
        let tmp = std::env::temp_dir().join("adl-conflict-test.txt");
        fs::write(&tmp, "test").expect("write test file");
        let result =
            mgr.resolve_conflict_path(tmp.to_str().expect("temp path must be valid UTF-8"));
        assert!(result.ends_with("adl-conflict-test (1).txt"));
        let _ = fs::remove_file(&tmp);
        let _ = fs::remove_file(&result);
    }

    #[test]
    fn check_disk_space_valid_path() {
        let db = temp_db("disk");
        let mgr = DownloadManager::new(db);
        let result = mgr.check_disk_space(
            std::env::temp_dir().join("test.txt").to_str().expect("temp path must be valid UTF-8"),
        );
        assert!(result.is_ok());
    }

    #[test]
    fn check_disk_space_empty_path_falls_back_to_default() {
        let db = temp_db("disk-empty");
        let mgr = DownloadManager::new(db);
        let result = mgr.check_disk_space("");
        assert!(result.is_ok(), "empty path should fall back to default dir");
    }

    #[test]
    fn download_ordering_is_desc() {
        let db = temp_db("order");
        let mgr = DownloadManager::new(db.clone());
        mgr.create_download("https://example.com/first.zip", "/tmp/first.zip")
            .expect("create first");
        // Small delay to ensure different timestamp
        std::thread::sleep(std::time::Duration::from_millis(10));
        mgr.create_download("https://example.com/second.zip", "/tmp/second.zip")
            .expect("create second");

        let list = mgr.list_downloads().expect("list should succeed");
        assert_eq!(list.len(), 2);
        // Most recent first
        assert_eq!(list[0].file_name, "second.zip");
        assert_eq!(list[1].file_name, "first.zip");
        let _ = std::fs::remove_file(std::env::temp_dir().join("adl-download-mgr-order.db"));
    }

    #[test]
    fn derive_file_name_uses_path() {
        assert_eq!(derive_file_name("https://example.com/a.zip", "C:\\tmp\\file.zip"), "file.zip");
    }

    #[test]
    fn derive_file_name_uses_url_when_path_has_no_file_name() {
        assert_eq!(derive_file_name("https://example.com/path/to/report.pdf", ""), "report.pdf");
    }

    #[test]
    fn derive_file_name_falls_back_to_placeholder() {
        assert_eq!(derive_file_name("https://example.com", ""), "download");
    }

    #[test]
    fn derive_file_name_no_panic_on_root_path() {
        assert_eq!(derive_file_name("https://example.com/a.bin", "/"), "a.bin");
    }

    #[test]
    fn non_c_drive_path_preference() {
        let path = get_default_download_path();
        assert!(!path.as_os_str().is_empty());
    }
}
