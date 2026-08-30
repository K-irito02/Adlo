use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use chrono::Utc;
use uuid::Uuid;

#[cfg(windows)]
use webview2_com::Microsoft::Web::WebView2::Win32::{
    COREWEBVIEW2_DOWNLOAD_STATE, COREWEBVIEW2_DOWNLOAD_STATE_COMPLETED,
    COREWEBVIEW2_DOWNLOAD_STATE_IN_PROGRESS, COREWEBVIEW2_DOWNLOAD_STATE_INTERRUPTED,
};

use adl_storage::Database;
use tauri::Emitter;

use super::download_range_resume::RangeResumeDownload;
use super::download_types::{
    DownloadMode, DownloadProgress, DownloadRecord, DownloadSettings, DownloadStatus, ResumeMode,
};

/// The native WebView2 download operation handle. Only available on Windows.
/// On other platforms downloads are not handled natively, so this is `()`.
#[cfg(windows)]
type DownloadOp = webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2DownloadOperation;
#[cfg(not(windows))]
type DownloadOp = ();

/// WebView2 download operations are agile (IAgileObject) and safe to use across
/// threads, but `windows`'s `IUnknown` wrapper is not auto `Send`/`Sync`. Wrap it
/// and assert the (sound, per WebView2 docs) thread-safety so we can store it in a
/// shared map.
#[cfg(windows)]
struct AgileDownloadOp(DownloadOp);
#[cfg(windows)]
unsafe impl Send for AgileDownloadOp {}
#[cfg(windows)]
unsafe impl Sync for AgileDownloadOp {}

/// Current state of the native WebView2 download operation. WebView2 has no
/// `CanPause()` API, so we query `State()` to determine whether a download can
/// actually be paused (only `InProgress` can be) and to detect the race where a
/// fast transfer completes between a user's pause click and the native call.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum NativeDownloadState {
    /// The download is actively receiving bytes and can be paused.
    InProgress,
    /// The download is interrupted (e.g. already paused, network error).
    Interrupted,
    /// The download has fully completed at the byte level.
    Completed,
    /// No native operation is captured, or `State()` could not be queried.
    Unknown,
}

/// Query a raw native WebView2 download operation's current state. Shared by
/// `native_operation_state` (a `CanPause()`-equivalent check before pausing) and
/// `register_operation` (to avoid overwriting a live operation with a
/// silent-webview duplicate).
#[cfg(windows)]
fn query_operation_state(op: &DownloadOp) -> NativeDownloadState {
    let mut state = COREWEBVIEW2_DOWNLOAD_STATE(0);
    match unsafe { op.State(&mut state) } {
        Ok(()) => match state {
            s if s == COREWEBVIEW2_DOWNLOAD_STATE_COMPLETED => NativeDownloadState::Completed,
            s if s == COREWEBVIEW2_DOWNLOAD_STATE_INTERRUPTED => NativeDownloadState::Interrupted,
            s if s == COREWEBVIEW2_DOWNLOAD_STATE_IN_PROGRESS => NativeDownloadState::InProgress,
            _ => NativeDownloadState::Unknown,
        },
        Err(e) => {
            tracing::warn!(
                error = %e,
                "[ADL-DL] query_operation_state: State() query failed"
            );
            NativeDownloadState::Unknown
        },
    }
}

#[derive(Clone)]
pub struct DownloadManager {
    db: Database,
    settings: Arc<Mutex<DownloadSettings>>,
    active_downloads: Arc<Mutex<HashMap<String, DownloadProgress>>>,
    /// Maps a download URL to the live native WebView2 download operation so we
    /// can actually pause/resume/cancel it. Without this, pause/resume/cancel
    /// only flip a DB flag while the native engine keeps downloading.
    #[cfg(windows)]
    operations: Arc<Mutex<HashMap<String, AgileDownloadOp>>>,
    #[cfg(not(windows))]
    operations: Arc<Mutex<HashMap<String, DownloadOp>>>,
    /// Cached per-URL resumability (server supports HTTP Range requests), probed
    /// on the progress-monitor thread so `pause_download` can decide without a
    /// blocking network call. A download whose server does not support Range
    /// cannot actually be paused by WebView2: calling `Pause()` corrupts the
    /// operation's lifecycle (it never reaches `Completed`, so WebView2 deletes
    /// the file when the webview/app shuts down). `None` = not probed yet.
    resumability: Arc<Mutex<HashMap<String, bool>>>,
    /// Tracks when each download was last resumed via native WebView2 Resume().
    /// Key: record ID, Value: timestamp when Resume() returned Ok(()).
    /// Used by handle_download_finished to detect post-resume failures
    /// (Resume() succeeds but download fails within seconds — indicating a
    /// broken TCP connection that WebView2 only discovers on next read).
    resume_timestamps: Arc<Mutex<HashMap<String, Instant>>>,
}

#[allow(dead_code)]
impl DownloadManager {
    pub fn new(db: Database) -> Self {
        let settings = Self::load_settings(&db).unwrap_or_default();
        Self {
            db,
            settings: Arc::new(Mutex::new(settings)),
            active_downloads: Arc::new(Mutex::new(HashMap::new())),
            operations: Arc::new(Mutex::new(HashMap::new())),
            resumability: Arc::new(Mutex::new(HashMap::new())),
            resume_timestamps: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Cache whether the download URL's server supports HTTP Range requests.
    pub fn set_resumability(&self, url: &str, resumable: bool) {
        if let Ok(mut m) = self.resumability.lock() {
            m.insert(url.to_string(), resumable);
        }
    }

    /// Return the cached resumability for a URL, if it has been probed.
    pub fn resumability(&self, url: &str) -> Option<bool> {
        self.resumability.lock().ok().and_then(|m| m.get(url).copied())
    }

    /// Record that a download was just resumed via native WebView2 Resume().
    /// Called after Resume() returns Ok(()) so handle_download_finished can
    /// detect post-resume failures within the 5-second window.
    pub fn record_resume(&self, id: &str) {
        if let Ok(mut m) = self.resume_timestamps.lock() {
            m.insert(id.to_string(), Instant::now());
            tracing::debug!(id = id, "[ADL-DL] record_resume: recorded resume timestamp");
        }
    }

    /// Check if a download was resumed within the last `window_secs` seconds.
    /// Returns true if the download failed shortly after a resume attempt.
    pub fn was_recently_resumed(&self, id: &str, window_secs: u64) -> bool {
        if let Ok(m) = self.resume_timestamps.lock() {
            if let Some(ts) = m.get(id) {
                let recently = ts.elapsed() < std::time::Duration::from_secs(window_secs);
                tracing::debug!(
                    id = id,
                    elapsed_ms = ts.elapsed().as_millis() as u64,
                    window_ms = window_secs * 1000,
                    recently,
                    "[ADL-DL] was_recently_resumed: checking resume window"
                );
                return recently;
            }
        }
        false
    }

    /// Clear the resume timestamp for a download (called after successful
    /// completion or when auto-retry gives up).
    pub fn clear_resume_timestamp(&self, id: &str) {
        if let Ok(mut m) = self.resume_timestamps.lock() {
            m.remove(id);
            // trace, not debug: this runs several times per resume lifecycle
            // (trigger, per-terminal-path, cancel, remove_record) and is pure
            // diagnostic noise at debug level.
            tracing::trace!(id = id, "[ADL-DL] clear_resume_timestamp: cleared resume timestamp");
        }
    }

    /// Trigger HTTP Range-based resume as a fallback for a failed native Resume().
    /// This is called by handle_download_finished when a post-resume failure is detected
    /// (Resume() returned Ok(()) but download failed within 5 seconds).
    pub fn trigger_range_resume(
        &self,
        id: &str,
        record: &DownloadRecord,
        app_handle: &tauri::AppHandle,
    ) -> Result<(), String> {
        tracing::info!(
            id = %id,
            url = %record.url,
            bytes_received = record.bytes_received,
            "[ADL-DL] trigger_range_resume: auto-retrying via HTTP Range after post-resume failure"
        );

        // Immediately mark the retry as in-flight: clear the resume timestamp so
        // a second `finished(success=false)` arriving within the 5s window cannot
        // spawn a concurrent retry thread appending to the same `.crdownload`
        // (which would corrupt the file). The retry thread re-clears it on exit
        // (idempotent).
        self.clear_resume_timestamp(id);

        // The native WebView2 operation already reported `finished(false)` and is
        // dead; the retry uses reqwest (RangeResumeDownload), never the native op.
        // Drop the stale handle now so it does not linger in the operations map.
        self.remove_operation(&record.url);

        // Get the current file size from the .crdownload as the true offset. If
        // the metadata call fails (e.g. temp file missing), the DB bytes_received
        // may lag the real size — falling back to it could corrupt the file with
        // an overlap. Treat a missing/unreadable temp as non-retryable instead.
        let current_offset = match std::fs::metadata(format!("{}.crdownload", record.file_path)) {
            Ok(m) => m.len(),
            Err(e) => {
                return Err(format!("Cannot determine resume offset from .crdownload: {}", e));
            },
        };

        let manager_clone = self.clone();
        let record_id = id.to_string();
        let url_clone = record.url.clone();
        let file_path = record.file_path.clone();
        let total = record.total_bytes;
        let etag = record.etag.clone();
        let lm = record.last_modified.clone();
        let source_tab_id = record.source_tab_id.clone();
        let app_handle_clone = app_handle.clone();

        std::thread::Builder::new()
            .name(format!("adl-range-resume-{id}"))
            .spawn(move || {
                let rt = tokio::runtime::Runtime::new()
                    .expect("failed to create tokio runtime for auto-retry HTTP Range resume");
                rt.block_on(async {
                    let downloader = RangeResumeDownload::new(
                        url_clone.clone(),
                        std::path::PathBuf::from(format!("{}.crdownload", file_path)),
                        current_offset,
                        total,
                        etag,
                        lm,
                    );

                    match downloader.start().await {
                        Ok(result) => {
                            // Do not report success if the transfer is not actually
                            // complete (total known but bytes fall short).
                            let truly_complete = result.completed || total.is_none();
                            tracing::info!(
                                record_id = %record_id,
                                bytes_received = result.bytes_received,
                                completed = result.completed,
                                truly_complete,
                                "[ADL-DL] auto-retry HTTP Range resume succeeded"
                            );
                            if !truly_complete {
                                tracing::warn!(
                                    record_id = %record_id,
                                    bytes_received = result.bytes_received,
                                    total = total,
                                    "[ADL-DL] auto-retry HTTP Range resume ended early (incomplete transfer); marking failed"
                                );
                                let _ = manager_clone.complete_download(
                                    &record_id,
                                    false,
                                    Some("PostResumeRetryFailed"),
                                );
                                // If the user canceled during the retry, respect
                                // that — don't surface a "failed" event on a
                                // record the user chose to cancel.
                                if !manager_clone.is_record_canceled(&record_id) {
                                    let _ = app_handle_clone.emit(
                                        "browser-download-error",
                                        &serde_json::json!({
                                            "id": record_id,
                                            "url": url_clone,
                                            "reason": "Resume retry ended before the file was complete (server closed the stream)",
                                            "canRetry": true,
                                            "source_tab_id": source_tab_id,
                                        }),
                                    );
                                }
                                return;
                            }
                            // complete_download's terminal-state guard skips a
                            // canceled record (returns Err without finalizing);
                            // only report success when finalization actually
                            // succeeded AND the record is still Completed.
                            match manager_clone.complete_download(&record_id, true, None) {
                                Ok(()) => {
                                    let _ = app_handle_clone.emit(
                                        "browser-download-finished",
                                        &serde_json::json!({
                                            "id": record_id,
                                            "url": url_clone,
                                            "filePath": file_path,
                                            "success": true,
                                            "source_tab_id": source_tab_id,
                                        }),
                                    );
                                },
                                Err(e) => {
                                    // The record was canceled during the retry
                                    // (guard refused to finalize) or finalization
                                    // failed. Do NOT emit success. Clean up the
                                    // leftover temp file a canceled retry may have
                                    // recreated. The resume timestamp must be
                                    // cleared here explicitly: complete_download's
                                    // rename-failure path returns Err early without
                                    // reaching its own cleanup.
                                    let canceled = manager_clone.is_record_canceled(&record_id);
                                    if canceled {
                                        tracing::info!(
                                            record_id = %record_id,
                                            "[ADL-DL] auto-retry finished but record was canceled; skipping completion and removing temp"
                                        );
                                        let _ = std::fs::remove_file(
                                            format!("{}.crdownload", file_path),
                                        );
                                    } else {
                                        tracing::warn!(
                                            record_id = %record_id,
                                            error = %e,
                                            "[ADL-DL] auto-retry finalization failed; progress monitor will retry"
                                        );
                                    }
                                    manager_clone.clear_resume_timestamp(&record_id);
                                },
                            }
                        }
                        Err(e) => {
                            tracing::error!(
                                record_id = %record_id,
                                error = %e,
                                "[ADL-DL] auto-retry HTTP Range resume also failed"
                            );
                            let _ = manager_clone.complete_download(
                                &record_id,
                                false,
                                Some("PostResumeRetryFailed"),
                            );
                            // If the user canceled during the retry, respect that —
                            // don't surface a "failed" event on a record the user
                            // chose to cancel.
                            if !manager_clone.is_record_canceled(&record_id) {
                                let _ = app_handle_clone.emit(
                                    "browser-download-error",
                                    &serde_json::json!({
                                        "id": record_id,
                                        "url": url_clone,
                                        "reason": format!("Resume retry failed: {}", e),
                                        "canRetry": true,
                                        "source_tab_id": source_tab_id,
                                    }),
                                );
                            }
                        }
                    }
                });
            })
            .map_err(|e| format!("Failed to spawn auto-retry thread: {}", e))?;

        Ok(())
    }

    /// Register the live native download operation so it can later be paused /
    /// resumed / canceled. Keyed by the download URL.
    #[cfg(windows)]
    pub fn register_operation(&self, url: &str, op: DownloadOp) {
        if let Ok(mut m) = self.operations.lock() {
            // Never replace a still-downloading operation. The metadata-preload
            // "silent webview" also fires DownloadStarting for the same URL, and
            // its (cancelled) operation would otherwise overwrite the real
            // download's handle — leaving pause/resume/cancel pointing at a dead
            // operation that always reports INTERRUPTED.
            if let Some(existing) = m.get(url) {
                if query_operation_state(&existing.0) == NativeDownloadState::InProgress {
                    tracing::debug!(
                        url = url,
                        "[ADL-DL] register_operation: keeping existing IN_PROGRESS operation (silent/duplicate DownloadStarting ignored)"
                    );
                    return;
                }
            }
            m.insert(url.to_string(), AgileDownloadOp(op));
            tracing::debug!(
                url = url,
                "[ADL-DL] register_operation: captured native download operation for pause/resume/cancel"
            );
        }
    }

    /// No-op on non-Windows platforms.
    #[cfg(not(windows))]
    pub fn register_operation(&self, _url: &str, _op: ()) {}

    /// Take a clone of the live native download operation for a URL, if captured.
    #[cfg(windows)]
    pub fn get_operation(&self, url: &str) -> Option<DownloadOp> {
        self.operations.lock().ok().and_then(|m| m.get(url).map(|o| o.0.clone()))
    }

    /// No-op on non-Windows platforms.
    #[cfg(not(windows))]
    pub fn get_operation(&self, _url: &str) -> Option<()> {
        None
    }

    /// Drop the native operation handle (e.g. once the download finished/canceled).
    #[cfg(windows)]
    pub fn remove_operation(&self, url: &str) {
        if let Ok(mut m) = self.operations.lock() {
            m.remove(url);
        }
    }

    /// No-op on non-Windows platforms.
    #[cfg(not(windows))]
    pub fn remove_operation(&self, _url: &str) {}

    /// Query the live native WebView2 download operation's current state.
    ///
    /// Used as a `CanPause()`-equivalent check before pausing (only `InProgress`
    /// downloads can be paused) and to verify a "finished" event really reflects
    /// a completed transfer before flipping a paused/canceled record.
    #[cfg(windows)]
    pub fn native_operation_state(&self, url: &str) -> NativeDownloadState {
        let Some(op) = self.get_operation(url) else {
            return NativeDownloadState::Unknown;
        };
        query_operation_state(&op)
    }

    /// No native operation exists on non-Windows platforms.
    #[cfg(not(windows))]
    pub fn native_operation_state(&self, _url: &str) -> NativeDownloadState {
        NativeDownloadState::Unknown
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

    /// Resolve an **absolute** download target path from the URL and WebView2's
    /// suggested destination.
    ///
    /// The target is always anchored into the user-configured default download
    /// directory (falling back to the OS default). WebView2's `destination`
    /// points at the system Downloads folder for every download, so we only use
    /// its **file name** and never its directory — otherwise the user's custom
    /// default path would be ignored and downloads would keep landing in the
    /// C-drive Downloads folder. The directory is created if missing.
    pub fn resolve_download_target(&self, url: &str, suggested_path: &str) -> String {
        let settings = self.get_settings();
        let default_dir = if settings.default_path.is_empty() {
            get_default_download_path()
        } else {
            PathBuf::from(&settings.default_path)
        };

        // Take the file name from the suggestion (or URL), but always place it
        // in the configured default directory.
        let target = default_dir.join(derive_file_name(url, suggested_path));

        let _ = fs::create_dir_all(target.parent().unwrap_or(&default_dir));
        self.resolve_conflict_path(target.to_string_lossy().as_ref())
    }

    pub fn create_download(
        &self,
        url: &str,
        file_path: &str,
        source_tab_id: Option<String>,
    ) -> Result<DownloadRecord, String> {
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
            source_tab_id,
            auto_resume_count: 0,
            etag: None,
            last_modified: None,
            resumable: None,
        };

        let conn = self.db.conn().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO download_history (id, url, file_name, file_path, total_bytes, bytes_received, mime_type, status, interrupt_reason, created_at, completed_at, source_tab_id, auto_resume_count, etag, last_modified) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
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
                record.auto_resume_count as i64,
                record.etag,
                record.last_modified,
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

    pub fn update_total_bytes(&self, id: &str, total: u64) -> Result<(), String> {
        let conn = self.db.conn().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE download_history SET total_bytes = ?1 WHERE id = ?2",
            rusqlite::params![total as i64, id],
        )
        .map_err(|e| format!("Failed to update total bytes: {}", e))?;
        Ok(())
    }

    pub fn pause_download(&self, id: &str) -> Result<DownloadStatus, String> {
        let record = self.get_record(id)?;

        tracing::info!(
            id = %id,
            url = %record.url,
            status = record.status.as_str(),
            interrupt_reason = record.interrupt_reason.as_deref().unwrap_or("none"),
            "[ADL-DL] pause_download: ENTRY — attempting to pause"
        );

        // Check if download is in a terminal state (already completed/failed/canceled)
        if record.status.is_terminal() {
            tracing::warn!(
                id = %id,
                status = record.status.as_str(),
                "[ADL-DL] pause_download: REJECTED — download is in terminal state"
            );
            return Err(format!(
                "Download is already {} and cannot be paused",
                record.status.as_str()
            ));
        }

        let url = record.url.clone();

        // Check if native operation handle exists
        let has_native_op = self.get_operation(&url).is_some();
        tracing::info!(
            id = %id,
            url = %url,
            has_native_op,
            resumability_cached = self.resumability(&url).map(|r| r.to_string()).unwrap_or_else(|| "not_probed".to_string()),
            "[ADL-DL] pause_download: pre-pause state snapshot"
        );

        // Query the native operation state FIRST (a CanPause()-equivalent check —
        // WebView2 has no CanPause() API). Never report "paused" for a transfer
        // that has already completed: mark it completed instead, matching
        // Chrome/Edge which transition a just-finished download straight to
        // "Complete".
        match self.native_operation_state(&url) {
            NativeDownloadState::Completed => {
                tracing::info!(
                    id = %id,
                    url = %url,
                    "[ADL-DL] pause_download: native operation already COMPLETED; marking download completed (pause is a no-op)"
                );
                self.complete_download(id, true, None).map_err(|e| e.to_string())?;
                return Ok(DownloadStatus::Completed);
            },
            NativeDownloadState::Interrupted => {
                tracing::warn!(
                    id = %id,
                    url = %url,
                    "[ADL-DL] pause_download: native operation already INTERRUPTED; cannot pause"
                );
                return Err("Download is already interrupted and cannot be paused".to_string());
            },
            NativeDownloadState::InProgress => {
                // Proceed to native Pause() below.
            },
            NativeDownloadState::Unknown => {
                tracing::warn!(
                    id = %id,
                    url = %url,
                    "[ADL-DL] pause_download: native operation state unknown; attempting native Pause()"
                );
            },
        }

        // A download whose server does not support HTTP Range requests cannot
        // actually be paused by WebView2: calling Pause() corrupts the operation
        // (the transfer keeps running but the op never reaches `Completed`, and
        // WebView2 deletes the file when the webview/app shuts down — the "file
        // vanished after close" bug). When the server is confirmed non-resumable
        // (resumability == Some(false)), cancel the download and clean up the temp
        // file so the user can restart cleanly. If resumability has not been probed
        // yet (None), fall back to a cosmetic pause — the transfer continues and
        // completes normally, preserving the file.
        if self.resumability(&url) == Some(false) {
            tracing::info!(
                id = %id,
                url = %url,
                "[ADL-DL] pause_download: server does not support Range — canceling download for clean restart"
            );

            // Mark the DB as paused BEFORE canceling the native download: the
            // native Cancel() fires a spurious `finished(success=false)` interrupt,
            // and if that event is dispatched before the `paused` write lands, the
            // finished handler would see `InProgress` and misclassify the download
            // as failed (the NonResumablePaused pseudo-pause guard in
            // handle_download_finished would not match). Mirrors the DB-first order
            // used by the UserPaused path below.
            let conn = self.db.conn().map_err(|e| e.to_string())?;
            conn.execute(
                "UPDATE download_history SET status = ?1, interrupt_reason = ?2, bytes_received = 0 WHERE id = ?3",
                rusqlite::params![DownloadStatus::Paused.as_str(), "NonResumablePaused", id],
            )
            .map_err(|e| format!("Failed to pause download: {}", e))?;

            // Cancel the native WebView2 download
            #[cfg(windows)]
            if let Some(op) = self.get_operation(&url) {
                let _ = unsafe { op.Cancel() };
            }

            // Remove the .crdownload temp file
            let crdownload_path = format!("{}.crdownload", record.file_path);
            let _ = std::fs::remove_file(&crdownload_path);

            // Remove native operation handle
            self.remove_operation(&url);

            return Ok(DownloadStatus::Paused);
        }

        // Resumability not yet probed (None) — cosmetic pause: transfer continues
        // but UI shows paused. Conservative: losing real pause is harmless;
        // corrupting the op loses the file.
        if self.resumability(&url) != Some(true) {
            tracing::info!(
                id = %id,
                url = %url,
                "[ADL-DL] pause_download: server does not support Range (non-resumable); skipping native Pause (cosmetic pause, transfer continues)"
            );
            let conn = self.db.conn().map_err(|e| e.to_string())?;
            conn.execute(
                "UPDATE download_history SET status = ?1, interrupt_reason = ?2 WHERE id = ?3",
                rusqlite::params![DownloadStatus::Paused.as_str(), "CosmeticPaused", id],
            )
            .map_err(|e| format!("Failed to pause download: {}", e))?;
            return Ok(DownloadStatus::Paused);
        }

        // Mark the DB as paused BEFORE calling native Pause(): the native
        // Pause() fires a spurious `finished(success=false)` state change, and if
        // that event is dispatched before we write `paused` here, the download
        // would be misclassified as failed and its resume handle dropped. With
        // the DB written first, the finished handler always sees `Paused` and
        // ignores the spurious interrupt (mirrors cancel_download's DB-first
        // order).
        let conn = self.db.conn().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE download_history SET status = ?1, interrupt_reason = ?2 WHERE id = ?3",
            rusqlite::params![DownloadStatus::Paused.as_str(), "UserPaused", id],
        )
        .map_err(|e| format!("Failed to pause download: {}", e))?;

        // Now pause the native WebView2 download (fast path). On failure, revert
        // the DB status so the record doesn't stay "paused" falsely.
        #[cfg(windows)]
        {
            match self.get_operation(&url) {
                Some(op) => match unsafe { op.Pause() } {
                    Ok(()) => {
                        tracing::debug!(
                            id = %id,
                            url = %url,
                            "[ADL-DL] pause_download: native WebView2 download PAUSED"
                        );
                    },
                    Err(e) => {
                        let code = e.code();
                        let hresult = code.0 as u32;
                        tracing::warn!(
                            id = %id,
                            url = %url,
                            error = %e,
                            hresult = format!("0x{hresult:08X}"),
                            "[ADL-DL] pause_download: native Pause() failed, reverting DB status"
                        );
                        let _ = conn.execute(
                            "UPDATE download_history SET status = ?1, interrupt_reason = NULL WHERE id = ?2",
                            rusqlite::params![DownloadStatus::InProgress.as_str(), id],
                        );
                        return Err(format!("Failed to pause native download: 0x{hresult:08X}"));
                    },
                },
                None => {
                    tracing::warn!(
                        id = %id,
                        url = %url,
                        "[ADL-DL] pause_download: no native download operation captured; reverting DB status"
                    );
                    let _ = conn.execute(
                        "UPDATE download_history SET status = ?1, interrupt_reason = NULL WHERE id = ?2",
                        rusqlite::params![DownloadStatus::InProgress.as_str(), id],
                    );
                    return Err("No native download operation captured; cannot pause".to_string());
                },
            }
        }

        // Native Pause() succeeded. Double-check the native state again: a very
        // fast transfer can finish between the state check above and Pause()
        // returning Ok, in which case WebView2 still reports Completed — reflect
        // that truth instead of lying with "paused".
        match self.native_operation_state(&url) {
            NativeDownloadState::Completed => {
                tracing::info!(
                    id = %id,
                    url = %url,
                    "[ADL-DL] pause_download: transfer completed during pause (native state=completed); marking download completed"
                );
                self.complete_download(id, true, None).map_err(|e| e.to_string())?;
                return Ok(DownloadStatus::Completed);
            },
            _ => {
                // Interrupted/InProgress/Unknown after Pause() → user intent is a pause.
            },
        }

        Ok(DownloadStatus::Paused)
    }

    /// Resume an interrupted download. Follows Chrome/Edge's design:
    /// 1. Check ResumeMode to determine if resume is possible
    /// 2. Try WebView2's native Resume() first
    /// 3. If that fails, fall back to HTTP Range-based resume using reqwest
    /// 4. Enforce auto-resume limit (max 5 attempts)
    pub fn resume_download(&self, id: &str, app_handle: &tauri::AppHandle) -> Result<(), String> {
        let record = self.get_record(id)?;
        let url = record.url.clone();

        tracing::info!(
            id = %id,
            url = %url,
            status = record.status.as_str(),
            interrupt_reason = record.interrupt_reason.as_deref().unwrap_or("none"),
            auto_resume_count = record.auto_resume_count,
            etag = record.etag.as_deref().unwrap_or("none"),
            last_modified = record.last_modified.as_deref().unwrap_or("none"),
            "[ADL-DL] resume_download: ENTRY — attempting to resume"
        );

        // Check if download is in a state that can be resumed
        if record.status.is_terminal() {
            tracing::warn!(
                id = %id,
                status = record.status.as_str(),
                "[ADL-DL] resume_download: REJECTED — download is in terminal state"
            );
            return Err(format!(
                "Download is already {} and cannot be resumed",
                record.status.as_str()
            ));
        }

        // Check native operation handle availability
        let has_native_op = self.get_operation(&url).is_some();
        let native_state = self.native_operation_state(&url);
        tracing::info!(
            id = %id,
            url = %url,
            has_native_op,
            native_state = ?native_state,
            resumability_cached = self.resumability(&url).map(|r| r.to_string()).unwrap_or_else(|| "not_probed".to_string()),
            "[ADL-DL] resume_download: pre-resume state snapshot"
        );

        // A download the user explicitly paused is resumed directly via the
        // still-alive native WebView2 operation, which continues from the
        // current byte offset. It needs no ETag/Last-Modified validator (those
        // only matter for the unimplemented HTTP Range fallback) and is never
        // subject to the auto-resume limit (which guards *automatic* retries,
        // not explicit user actions).
        let user_paused = record.status == DownloadStatus::Paused;

        // A NonResumablePaused download was paused by canceling the native
        // WebView2 operation and deleting the temp file (Task 6). Resuming
        // requires starting a fresh reqwest download from offset 0. Update the
        // DB to InProgress (clearing interrupt_reason and resetting
        // bytes_received) and let the progress monitor detect the transition to
        // spawn the new download thread.
        if record.interrupt_reason.as_deref() == Some("NonResumablePaused") {
            tracing::info!(
                id = %id,
                url = %url,
                "[ADL-DL] resume_download: non-resumable server — starting fresh download from offset 0"
            );
            let conn = self.db.conn().map_err(|e| e.to_string())?;
            conn.execute(
                "UPDATE download_history SET status = ?1, interrupt_reason = NULL, bytes_received = 0 WHERE id = ?2",
                rusqlite::params![DownloadStatus::InProgress.as_str(), id],
            )
            .map_err(|e| format!("Failed to resume download: {}", e))?;
            return Ok(());
        }

        // A cosmetic pause (non-resumable server) never paused the native engine:
        // the transfer kept running. If it's still in progress there is nothing
        // to resume — just restore the DB status and let it complete naturally.
        // Calling native Resume() on a still-running op would only error. The
        // decision is persisted in interrupt_reason so we don't re-derive it from
        // the mutable resumability cache (which can flip after the probe).
        if record.interrupt_reason.as_deref() == Some("CosmeticPaused")
            && self.native_operation_state(&url) == NativeDownloadState::InProgress
        {
            tracing::info!(
                id = %id,
                url = %url,
                "[ADL-DL] resume_download: cosmetic pause, native transfer still in progress — restoring in_progress"
            );
            let conn = self.db.conn().map_err(|e| e.to_string())?;
            conn.execute(
                "UPDATE download_history SET status = ?1, interrupt_reason = NULL WHERE id = ?2",
                rusqlite::params![DownloadStatus::InProgress.as_str(), id],
            )
            .map_err(|e| format!("Failed to resume download: {}", e))?;
            return Ok(());
        }

        // Determine resume mode based on interrupt reason and state
        let restart_required = if user_paused {
            false
        } else {
            record.file_path.is_empty() || (record.etag.is_none() && record.last_modified.is_none())
        };
        let user_action_required =
            !user_paused && record.auto_resume_count >= MAX_AUTO_RESUME_ATTEMPTS;

        let resume_mode = get_download_resume_mode(
            &url,
            record.interrupt_reason.as_deref(),
            restart_required,
            user_action_required,
        );

        tracing::debug!(
            id = %id,
            url = %url,
            resume_mode = ?resume_mode,
            auto_resume_count = record.auto_resume_count,
            user_paused = user_paused,
            "[ADL-DL] resume_download: determined resume mode"
        );

        // Only `Invalid` changes the control flow — every other mode falls through
        // to the native Resume() fast path. `resume_download` is only ever invoked
        // by an explicit user action (the "Resume" button), which satisfies any
        // "needs user action" mode. (Previously the User* branches wrongly
        // reported "Auto-resume limit reached" for a user-paused download even
        // when auto_resume_count was 0.)
        if resume_mode == ResumeMode::Invalid {
            return Err(
                "Download cannot be resumed — the server may not support range requests, or the download was cancelled"
                    .to_string(),
            );
        }

        // Try WebView2's native Resume() first (fast path)
        #[cfg(windows)]
        {
            match self.get_operation(&url) {
                Some(op) => {
                    tracing::info!(
                        id = %id,
                        url = %url,
                        "[ADL-DL] resume_download: calling native WebView2 op.Resume()..."
                    );
                    match unsafe { op.Resume() } {
                        Ok(()) => {
                            tracing::info!(
                                id = %id,
                                url = %url,
                                "[ADL-DL] resume_download: native WebView2 download RESUMED successfully — recording resume timestamp"
                            );
                            // Record resume timestamp so handle_download_finished
                            // can detect post-resume failures within the 5-second window.
                            self.record_resume(id);
                            // auto_resume_count only counts *automatic* recoveries
                            // of interrupted downloads; a user-initiated
                            // pause/resume cycle must not consume the limit.
                            let new_auto_resume_count = if user_paused {
                                record.auto_resume_count
                            } else {
                                record.auto_resume_count + 1
                            };
                            {
                                let conn = self.db.conn().map_err(|e| e.to_string())?;
                                conn.execute(
                                "UPDATE download_history SET auto_resume_count = ?1, status = ?2, interrupt_reason = NULL WHERE id = ?3",
                                rusqlite::params![new_auto_resume_count as i64, DownloadStatus::InProgress.as_str(), id],
                            )
                            .map_err(|e| format!("Failed to resume download: {}", e))?;
                            }
                            return Ok(());
                        },
                        Err(e) => {
                            let code = e.code();
                            let hresult = code.0 as u32;
                            tracing::warn!(
                                id = %id,
                                url = %url,
                                error = %e,
                                hresult = format!("0x{hresult:08X}"),
                                "[ADL-DL] resume_download: native Resume() FAILED — falling through to HTTP Range resume"
                            );
                            // Fall through to HTTP Range-based resume
                        },
                    }
                },
                None => {
                    tracing::warn!(
                        id = %id,
                        url = %url,
                        "[ADL-DL] resume_download: NO native download operation captured (handle may have been dropped by WebView2); falling through to HTTP Range resume"
                    );
                    // Fall through to HTTP Range-based resume
                },
            }
        }

        // HTTP Range-based resume (Chrome/Edge fallback)
        // When the native WebView2 Resume() fails (e.g. operation handle lost)
        // or is unavailable, fall back to reqwest-based HTTP Range resume.
        tracing::info!(
            id = %id,
            url = %url,
            bytes_received = record.bytes_received,
            "[ADL-DL] resume_download: falling back to HTTP Range resume"
        );

        // Get the current file size from the .crdownload as the true offset. If
        // the metadata call fails (e.g. temp file missing), the DB bytes_received
        // may lag the real size — falling back to it could corrupt the file with
        // an overlap. Treat a missing/unreadable temp as non-retryable instead
        // (mirrors trigger_range_resume).
        let current_offset = match std::fs::metadata(format!("{}.crdownload", record.file_path)) {
            Ok(m) => m.len(),
            Err(e) => {
                return Err(format!("Cannot determine resume offset from .crdownload: {}", e));
            },
        };

        let manager_clone = self.clone();
        let record_id = id.to_string();
        let url_clone = url.clone();
        let file_path = record.file_path.clone();
        let total = record.total_bytes;
        let etag = record.etag.clone();
        let lm = record.last_modified.clone();
        let source_tab_id = record.source_tab_id.clone();
        let app_handle_clone = app_handle.clone();

        std::thread::spawn(move || {
            let rt = tokio::runtime::Runtime::new()
                .expect("failed to create tokio runtime for HTTP Range resume");
            rt.block_on(async {
                let downloader = RangeResumeDownload::new(
                    url_clone.clone(),
                    PathBuf::from(format!("{}.crdownload", file_path)),
                    current_offset,
                    total,
                    etag,
                    lm,
                );

                match downloader.start().await {
                    Ok(result) => {
                        let truly_complete = result.completed || total.is_none();
                        tracing::info!(
                            record_id = %record_id,
                            bytes_received = result.bytes_received,
                            completed = result.completed,
                            truly_complete,
                            "[ADL-DL] HTTP Range resume succeeded"
                        );
                        if !truly_complete {
                            tracing::warn!(
                                record_id = %record_id,
                                bytes_received = result.bytes_received,
                                total = total,
                                "[ADL-DL] HTTP Range resume ended early (incomplete transfer); marking failed"
                            );
                            let _ = manager_clone.complete_download(
                                &record_id,
                                false,
                                Some("DownloadFailed"),
                            );
                            // If the user canceled during the resume, respect
                            // that — don't surface a "failed" event on a record
                            // the user chose to cancel.
                            if !manager_clone.is_record_canceled(&record_id) {
                                let _ = app_handle_clone.emit(
                                    "browser-download-error",
                                    &serde_json::json!({
                                        "id": record_id,
                                        "url": url_clone,
                                        "reason": "Resume ended before the file was complete (server closed the stream)",
                                        "canRetry": true,
                                        "source_tab_id": source_tab_id,
                                    }),
                                );
                            }
                            return;
                        }
                        // complete_download's terminal-state guard skips a canceled
                        // record (returns Err without finalizing); only report
                        // success when finalization actually succeeded.
                        match manager_clone.complete_download(&record_id, true, None) {
                            Ok(()) => {
                                let _ = app_handle_clone.emit(
                                    "browser-download-finished",
                                    &serde_json::json!({
                                        "id": record_id,
                                        "url": url_clone,
                                        "filePath": file_path,
                                        "success": true,
                                        "source_tab_id": source_tab_id,
                                    }),
                                );
                            },
                            Err(e) => {
                                let canceled = manager_clone.is_record_canceled(&record_id);
                                if canceled {
                                    tracing::info!(
                                        record_id = %record_id,
                                        "[ADL-DL] HTTP Range resume finished but record was canceled; skipping completion and removing temp"
                                    );
                                    let _ = std::fs::remove_file(
                                        format!("{}.crdownload", file_path),
                                    );
                                } else {
                                    tracing::warn!(
                                        record_id = %record_id,
                                        error = %e,
                                        "[ADL-DL] HTTP Range resume finalization failed; progress monitor will retry"
                                    );
                                }
                            },
                        }
                    }
                    Err(e) => {
                        tracing::error!(
                            error = %e,
                            "[ADL-DL] HTTP Range resume failed"
                        );
                        let _ = manager_clone.complete_download(
                            &record_id,
                            false,
                            Some("DownloadFailed"),
                        );
                        // If the user canceled during the resume, respect that —
                        // don't surface a "failed" event on a record the user
                        // chose to cancel.
                        if !manager_clone.is_record_canceled(&record_id) {
                            let _ = app_handle_clone.emit(
                                "browser-download-error",
                                &serde_json::json!({
                                    "id": record_id,
                                    "url": url_clone,
                                    "reason": format!("Resume failed: {}", e),
                                    "canRetry": true,
                                    "source_tab_id": source_tab_id,
                                }),
                            );
                        }
                    }
                }
            });
        });

        // Update DB status to InProgress
        let conn = self.db.conn().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE download_history SET status = ?1, interrupt_reason = NULL WHERE id = ?2",
            rusqlite::params![DownloadStatus::InProgress.as_str(), id],
        )
        .map_err(|e| format!("Failed to resume download: {}", e))?;

        Ok(())
    }

    pub fn cancel_download(&self, id: &str) -> Result<(), String> {
        let record = self.get_record(id).ok();
        let url = record.as_ref().map(|r| r.url.clone()).unwrap_or_default();

        let conn = self.db.conn().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE download_history SET status = ?1, interrupt_reason = ?2 WHERE id = ?3",
            rusqlite::params![DownloadStatus::Canceled.as_str(), "UserCanceled", id],
        )
        .map_err(|e| format!("Failed to cancel download: {}", e))?;

        // Actually cancel the native WebView2 download, then drop the handle.
        #[cfg(windows)]
        {
            if let Some(op) = self.get_operation(&url) {
                if let Err(e) = unsafe { op.Cancel() } {
                    tracing::warn!(
                        id = %id,
                        url = %url,
                        error = %e,
                        "[ADL-DL] cancel_download: native Cancel() failed"
                    );
                } else {
                    tracing::debug!(
                        id = %id,
                        url = %url,
                        "[ADL-DL] cancel_download: native WebView2 download CANCELED"
                    );
                }
            }
            self.remove_operation(&url);
        }

        self.active_downloads
            .lock()
            .expect("active_downloads mutex should not be poisoned")
            .remove(id);

        // A canceled download can't be resumed (HTTP Range resume is not
        // implemented and the native op is gone), so remove the Chrome/Edge-style
        // `.crdownload` temp to avoid garbage accumulation.
        if let Some(record) = &record {
            let temp = format!("{}.crdownload", record.file_path);
            if Path::new(&temp).exists() {
                if let Err(e) = fs::remove_file(&temp) {
                    tracing::warn!(
                        id = %id,
                        error = %e,
                        temp = temp,
                        "[ADL-DL] cancel_download: failed to remove .crdownload temp"
                    );
                }
            }
            self.resumability.lock().ok().map(|mut m| m.remove(&record.url));
        }

        // Clear the post-resume tracking entry — the download is now canceled,
        // so a stale timestamp would otherwise linger forever.
        self.clear_resume_timestamp(id);

        Ok(())
    }

    pub fn get_record_by_url(&self, url: &str) -> Option<DownloadRecord> {
        let conn = self.db.conn().ok()?;
        let mut record = conn.query_row(
            "SELECT id, url, file_name, file_path, total_bytes, bytes_received, mime_type, status, interrupt_reason, created_at, completed_at, source_tab_id, auto_resume_count, etag, last_modified FROM download_history WHERE url = ?1 ORDER BY created_at DESC LIMIT 1",
            rusqlite::params![url],
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
                    auto_resume_count: row.get::<_, i64>(12)? as u32,
                    etag: row.get(13)?,
                    last_modified: row.get(14)?,
                    resumable: None,
                })
            },
        )
        .ok()?;

        record.resumable = self.resumability(&record.url);

        Some(record)
    }

    pub fn complete_download(
        &self,
        id: &str,
        success: bool,
        reason: Option<&str>,
    ) -> Result<(), String> {
        let status = if success { DownloadStatus::Completed } else { DownloadStatus::Failed };

        // Terminal-state guard: once a download has been canceled, no background
        // worker — in particular the HTTP Range auto-retry thread — may flip it to
        // a different state. Otherwise a user's cancel during a retry would be
        // silently overridden (Canceled → Completed), re-materializing a file the
        // user deleted. Returns Err so callers can distinguish "not finalized"
        // (skip emitting success) from a real completion.
        if let Ok(current) = self.get_record(id) {
            if current.status == DownloadStatus::Canceled {
                tracing::info!(
                    record_id = %id,
                    current_status = current.status.as_str(),
                    requested_status = status.as_str(),
                    "[ADL-DL] complete_download: SKIPPED — record was canceled; not overriding user intent"
                );
                self.clear_resume_timestamp(id);
                return Err(format!(
                    "download was canceled; not finalizing as {}",
                    status.as_str()
                ));
            }
        }

        // Chrome/Edge-style: WebView2 writes to `<final>.crdownload`. Only when
        // the transfer is confirmed complete do we atomically rename it to the
        // final name. This guarantees the final file never appears half-written,
        // and a byte-complete-but-unfinalized transfer stays a clearly-incomplete
        // `.crdownload` (which WebView2 may clean up at shutdown) instead of a
        // "final file that vanished". If the rename fails we return an error and
        // do NOT mark the record completed — otherwise the record would claim
        // "completed" while only a temp file exists, and the later spurious
        // finished(false) guard would hide the missing file.
        if success {
            if let Ok(record) = self.get_record(id) {
                let temp = format!("{}.crdownload", record.file_path);
                let temp_path = Path::new(&temp);
                let final_path = Path::new(&record.file_path);
                if temp_path.exists() {
                    if final_path.exists() {
                        // Already finalized (e.g. re-finalize / duplicate) — drop
                        // the stale temp file.
                        if let Err(e) = fs::remove_file(temp_path) {
                            tracing::warn!(
                                record_id = %id,
                                error = %e,
                                temp = temp,
                                "[ADL-DL] complete_download: failed to remove stale .crdownload"
                            );
                        }
                    } else if let Err(e) = fs::rename(temp_path, final_path) {
                        tracing::error!(
                            record_id = %id,
                            error = %e,
                            temp = temp,
                            final_path = %record.file_path,
                            "[ADL-DL] complete_download: FAILED to rename .crdownload to final path; not marking completed"
                        );
                        return Err(format!(
                            "Failed to finalize download file '{}': {}",
                            record.file_path, e
                        ));
                    } else {
                        tracing::debug!(
                            record_id = %id,
                            file_path = %record.file_path,
                            "[ADL-DL] complete_download: renamed .crdownload to final path"
                        );
                    }
                }
            }
        }

        let conn = self.db.conn().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE download_history SET status = ?1, interrupt_reason = ?2, completed_at = ?3 WHERE id = ?4",
            rusqlite::params![status.as_str(), reason, Utc::now().timestamp(), id],
        )
        .map_err(|e| format!("Failed to complete download: {}", e))?;

        // Evict the resumability cache entry once the download has ended (its
        // URL won't be probed again; keeps the map bounded).
        if let Ok(record) = self.get_record(id) {
            self.resumability.lock().ok().map(|mut m| m.remove(&record.url));
        }

        self.active_downloads
            .lock()
            .expect("active_downloads mutex should not be poisoned")
            .remove(id);

        // Clear the post-resume tracking entry — the download has reached a
        // terminal state (completed or failed), so a stale timestamp would
        // otherwise linger forever (unbounded map growth across many resumes).
        self.clear_resume_timestamp(id);

        Ok(())
    }

    pub fn list_downloads(&self) -> Result<Vec<DownloadRecord>, String> {
        let conn = self.db.conn().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, url, file_name, file_path, total_bytes, bytes_received, mime_type, status, interrupt_reason, created_at, completed_at, source_tab_id, auto_resume_count, etag, last_modified FROM download_history ORDER BY created_at DESC")
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let mut records = stmt
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
                    auto_resume_count: row.get::<_, i64>(12)? as u32,
                    etag: row.get(13)?,
                    last_modified: row.get(14)?,
                    resumable: None,
                })
            })
            .map_err(|e| format!("Failed to query downloads: {}", e))?
            .filter_map(|r| r.ok())
            .collect::<Vec<_>>();

        // Populate `resumable` from the in-memory cache for each record.
        let resumability = self.resumability.lock().ok();
        for record in &mut records {
            record.resumable = resumability.as_ref().and_then(|m| m.get(&record.url).copied());
        }

        Ok(records)
    }

    pub fn clear_history(&self) -> Result<(), String> {
        let conn = self.db.conn().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM download_history", [])
            .map_err(|e| format!("Failed to clear history: {}", e))?;
        self.resume_timestamps
            .lock()
            .map_err(|_| "resume_timestamps mutex poisoned".to_string())?
            .clear();
        Ok(())
    }

    pub fn delete_file_and_record(&self, id: &str) -> Result<(), String> {
        let record = self.get_record(id)?;
        // Remove both the final file and any Chrome/Edge-style `.crdownload` temp.
        for candidate in [&record.file_path, &format!("{}.crdownload", record.file_path)] {
            let p = Path::new(candidate);
            if p.exists() {
                fs::remove_file(p).map_err(|e| format!("Failed to delete file: {}", e))?;
            }
        }
        self.remove_record(id)
    }

    pub fn remove_record(&self, id: &str) -> Result<(), String> {
        let conn = self.db.conn().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM download_history WHERE id = ?1", rusqlite::params![id])
            .map_err(|e| format!("Failed to remove record: {}", e))?;
        self.clear_resume_timestamp(id);
        Ok(())
    }

    /// Returns true if the download record exists and is currently canceled.
    /// Used by background resume workers (which live outside this crate) to
    /// decide whether finalizing a retry would override a user's cancel.
    pub fn is_record_canceled(&self, id: &str) -> bool {
        self.get_record(id).ok().map(|r| r.status == DownloadStatus::Canceled).unwrap_or(false)
    }

    pub(crate) fn get_record(&self, id: &str) -> Result<DownloadRecord, String> {
        let conn = self.db.conn().map_err(|e| e.to_string())?;
        let mut record = conn.query_row(
            "SELECT id, url, file_name, file_path, total_bytes, bytes_received, mime_type, status, interrupt_reason, created_at, completed_at, source_tab_id, auto_resume_count, etag, last_modified FROM download_history WHERE id = ?1",
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
                    auto_resume_count: row.get::<_, i64>(12)? as u32,
                    etag: row.get(13)?,
                    last_modified: row.get(14)?,
                    resumable: None,
                })
            },
        )
        .map_err(|e| format!("Record not found: {}", e))?;

        // Populate resumable from the in-memory cache
        record.resumable = self.resumability(&record.url);

        Ok(record)
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

/// Maximum number of automatic resume attempts before requiring user action.
/// Matches Chromium's `kMaxAutoResumeAttempts = 5`.
const MAX_AUTO_RESUME_ATTEMPTS: u32 = 5;

/// Determine the resume mode for an interrupted download.
/// Mirrors Chromium's `GetDownloadResumeMode()` from `download_utils.cc`.
///
/// # Arguments
/// * `url` - The download URL
/// * `interrupt_reason` - The reason the download was interrupted
/// * `restart_required` - Whether a full restart is needed (no file path, no validators)
/// * `user_action_required` - Whether user action is required (too many auto-resumes, paused)
pub(crate) fn get_download_resume_mode(
    url: &str,
    interrupt_reason: Option<&str>,
    restart_required: bool,
    user_action_required: bool,
) -> super::download_types::ResumeMode {
    // Only support resumption for HTTP(S).
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return ResumeMode::Invalid;
    }

    let mut restart = restart_required;
    let mut user_action = user_action_required;

    match interrupt_reason {
        // Network errors - can auto-resume (no restart needed)
        Some("NetworkTimeout") | Some("NetworkDisconnected") | Some("NetworkFailed") => {
            // On Android, these can auto-resume; on desktop, require user action
            user_action = true;
        },
        Some("FileTransientError") | Some("ServerContentLengthMismatch") => {
            // Transient errors - can auto-resume
        },
        // Server doesn't support range - need restart
        Some("ServerNoRange") => {
            restart = true;
        },
        // File issues - need restart
        Some("FileTooShort") | Some("FileHashMismatch") => {
            restart = true;
        },
        // Serious errors - need user action
        Some("NetworkServerDown") | Some("ServerFailed") | Some("ServerUnreachable") => {
            user_action = true;
        },
        // File system errors - need user action and restart
        Some("FileFailed") | Some("FileAccessDenied") | Some("FileNoSpace") => {
            user_action = true;
            restart = true;
        },
        // Fatal errors - cannot resume
        Some("UserCanceled") | Some("UserShutdown") | Some("FileMalicious") => {
            return ResumeMode::Invalid;
        },
        // WebView2 internal error (0x8007139F) - can try HTTP Range resume
        Some("ResumeFailed") | Some("WebView2InternalError") => {
            // Can attempt HTTP Range-based resume
        },
        // User-initiated pause — the native operation is still alive, so it is
        // immediately continuable unless the caller passed other flags.
        Some("UserPaused") => {},
        // Unknown or no reason - be conservative
        _ => {
            user_action = true;
        },
    }

    if user_action && restart {
        ResumeMode::UserRestart
    } else if restart {
        ResumeMode::ImmediateRestart
    } else if user_action {
        ResumeMode::UserContinue
    } else {
        ResumeMode::ImmediateContinue
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
            if let Some(segment) =
                url_path.rsplit('/').find(|s| !s.is_empty() && *s != "." && *s != "..")
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
    use crate::download_types::ResumeMode;

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
            .create_download("https://example.com/file.zip", "/tmp/file.zip", None)
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
            .create_download("https://example.com/file.zip", "/tmp/file.zip", None)
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
            .create_download("https://example.com/file.zip", "/tmp/file.zip", None)
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
            .create_download("https://example.com/file.zip", "/tmp/file.zip", None)
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
        mgr.create_download("https://example.com/a.zip", "/tmp/a.zip", None).expect("create a");
        mgr.create_download("https://example.com/b.zip", "/tmp/b.zip", None).expect("create b");

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
        assert_eq!(s.mode, DownloadMode::Ask);

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
        mgr.create_download("https://example.com/first.zip", "/tmp/first.zip", None)
            .expect("create first");
        // Small delay to ensure different timestamp
        std::thread::sleep(std::time::Duration::from_millis(10));
        mgr.create_download("https://example.com/second.zip", "/tmp/second.zip", None)
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
    fn resolve_download_target_empty_suggestion_uses_default_dir() {
        let db = temp_db("target-empty");
        let mgr = DownloadManager::new(db.clone());
        let target = mgr.resolve_download_target("https://example.com/installer.exe", "");
        let p = Path::new(&target);
        assert!(p.is_absolute(), "target must be absolute: {target}");
        assert_eq!(p.file_name().unwrap().to_str().unwrap(), "installer.exe");
        assert!(p.parent().unwrap().exists(), "default dir should be created");
        let _ = std::fs::remove_file(std::env::temp_dir().join("adl-download-mgr-target-empty.db"));
    }

    #[test]
    fn resolve_download_target_relative_suggestion_uses_default_dir() {
        let db = temp_db("target-rel");
        let mgr = DownloadManager::new(db);
        let target = mgr.resolve_download_target("https://example.com/app.zip", "app.zip");
        let p = Path::new(&target);
        assert!(p.is_absolute(), "target must be absolute: {target}");
        assert_eq!(p.file_name().unwrap().to_str().unwrap(), "app.zip");
        let _ = std::fs::remove_file(std::env::temp_dir().join("adl-download-mgr-target-rel.db"));
    }

    #[test]
    fn resolve_download_target_absolute_suggestion_keeps_name_uses_default_dir() {
        let db = temp_db("target-abs");
        let mgr = DownloadManager::new(db);
        let abs = std::env::temp_dir().join("some-other-dir").join("adl-target-abs.bin");
        let target = mgr.resolve_download_target(
            "https://example.com/data.bin",
            abs.to_str().expect("temp path must be valid UTF-8"),
        );
        let p = Path::new(&target);
        // The file name is preserved, but the directory is always the default
        // download dir — not the suggested (C-drive) directory.
        assert_eq!(p.file_name().unwrap().to_str().unwrap(), "adl-target-abs.bin");
        assert_ne!(
            p.parent().unwrap(),
            abs.parent().unwrap(),
            "download must not use the suggested (system) directory"
        );
        let _ = std::fs::remove_file(std::env::temp_dir().join("adl-download-mgr-target-abs.db"));
    }

    #[test]
    fn resolve_download_target_uses_configured_default_path() {
        let db = temp_db("target-custom");
        let mgr = DownloadManager::new(db.clone());
        let custom_dir = std::env::temp_dir().join("adl-custom-downloads");
        let _ = std::fs::create_dir_all(&custom_dir);
        mgr.update_settings(None, Some(custom_dir.to_string_lossy().to_string()))
            .expect("update settings");

        // WebView2 suggests a C-drive path; the configured default must win.
        let suggested =
            std::env::temp_dir().join("Downloads").join("report.pdf").to_string_lossy().to_string();
        let target = mgr.resolve_download_target("https://example.com/report.pdf", &suggested);
        let p = Path::new(&target);
        assert_eq!(p.file_name().unwrap().to_str().unwrap(), "report.pdf");
        assert_eq!(p.parent().unwrap(), custom_dir.as_path(), "must use configured default dir");
        let _ =
            std::fs::remove_file(std::env::temp_dir().join("adl-download-mgr-target-custom.db"));
        let _ = std::fs::remove_dir_all(&custom_dir);
    }

    #[test]
    fn non_c_drive_path_preference() {
        let path = get_default_download_path();
        assert!(!path.as_os_str().is_empty());
    }

    #[test]
    fn resume_mode_user_paused_is_immediate_continue() {
        // Regression: a download the user explicitly paused must be immediately
        // resumable (ImmediateContinue), not gated behind a User* mode that the
        // caller blocks on. Previously resume_download forced
        // user_action_required=true for Paused status (and restart_required=true
        // for missing ETag/Last-Modified validators), which mislabeled a manual
        // pause/resume as "Auto-resume limit reached (5 attempts)" even when
        // auto_resume_count was 0.
        let mode = get_download_resume_mode(
            "https://example.com/file.zip",
            Some("UserPaused"),
            false, // restart_required
            false, // user_action_required
        );
        assert_eq!(mode, ResumeMode::ImmediateContinue);
    }

    #[test]
    fn resume_mode_user_paused_passes_flags_through() {
        // UserPaused alone must not force user_action; the caller's flags pass
        // through unchanged (e.g. a restart needed for a paused download).
        let mode = get_download_resume_mode(
            "https://example.com/file.zip",
            Some("UserPaused"),
            true,  // restart_required
            false, // user_action_required
        );
        assert_eq!(mode, ResumeMode::ImmediateRestart);
    }

    #[test]
    fn resume_timestamp_recently_resumed_within_window() {
        let db = temp_db("ts-recent");
        let mgr = DownloadManager::new(db);
        mgr.record_resume("rec-1");
        assert!(mgr.was_recently_resumed("rec-1", 5), "resume just recorded must be recent");
        let _ = std::fs::remove_file(std::env::temp_dir().join("adl-download-mgr-ts-recent.db"));
    }

    #[test]
    fn resume_timestamp_not_recent_for_unknown_id() {
        let db = temp_db("ts-unknown");
        let mgr = DownloadManager::new(db);
        assert!(
            !mgr.was_recently_resumed("missing-id", 5),
            "unknown id must not be reported as recently resumed"
        );
        let _ = std::fs::remove_file(std::env::temp_dir().join("adl-download-mgr-ts-unknown.db"));
    }

    #[test]
    fn resume_timestamp_not_recent_after_clear() {
        let db = temp_db("ts-clear");
        let mgr = DownloadManager::new(db);
        mgr.record_resume("rec-1");
        assert!(mgr.was_recently_resumed("rec-1", 5));
        mgr.clear_resume_timestamp("rec-1");
        assert!(
            !mgr.was_recently_resumed("rec-1", 5),
            "cleared timestamp must not be reported as recent"
        );
        let _ = std::fs::remove_file(std::env::temp_dir().join("adl-download-mgr-ts-clear.db"));
    }

    #[test]
    fn complete_download_skips_when_record_canceled() {
        // Regression: the HTTP Range auto-retry thread must not override a user's
        // cancel during retry. A Canceled record must stay Canceled even if a
        // background worker calls complete_download(true) — and the call must
        // return Err so the caller can distinguish "not finalized" from success
        // and refrain from emitting a fake success event.
        let db = temp_db("complete-cancel");
        let mgr = DownloadManager::new(db.clone());
        let record = mgr
            .create_download("https://example.com/file.zip", "/tmp/file.zip", None)
            .expect("create should succeed");
        mgr.cancel_download(&record.id).expect("cancel should succeed");

        let result = mgr.complete_download(&record.id, true, None);
        assert!(
            result.is_err(),
            "complete_download on a canceled record must return Err (skipped), not Ok"
        );
        let list = mgr.list_downloads().expect("list should succeed");
        assert_eq!(
            list[0].status,
            DownloadStatus::Canceled,
            "canceled download must not be flipped to completed"
        );
        let _ =
            std::fs::remove_file(std::env::temp_dir().join("adl-download-mgr-complete-cancel.db"));
    }

    #[test]
    fn complete_download_clears_resume_timestamp() {
        let db = temp_db("complete-ts");
        let mgr = DownloadManager::new(db.clone());
        let record = mgr
            .create_download("https://example.com/file.zip", "/tmp/file.zip", None)
            .expect("create should succeed");
        mgr.record_resume(&record.id);
        assert!(mgr.was_recently_resumed(&record.id, 5));
        mgr.complete_download(&record.id, true, None).expect("complete should succeed");
        assert!(
            !mgr.was_recently_resumed(&record.id, 5),
            "complete_download must clear the resume timestamp (no leak)"
        );
        let _ = std::fs::remove_file(std::env::temp_dir().join("adl-download-mgr-complete-ts.db"));
    }

    #[test]
    fn cancel_download_clears_resume_timestamp() {
        let db = temp_db("cancel-ts");
        let mgr = DownloadManager::new(db.clone());
        let record = mgr
            .create_download("https://example.com/file.zip", "/tmp/file.zip", None)
            .expect("create should succeed");
        mgr.record_resume(&record.id);
        assert!(mgr.was_recently_resumed(&record.id, 5));
        mgr.cancel_download(&record.id).expect("cancel should succeed");
        assert!(
            !mgr.was_recently_resumed(&record.id, 5),
            "cancel_download must clear the resume timestamp (no leak)"
        );
        let _ = std::fs::remove_file(std::env::temp_dir().join("adl-download-mgr-cancel-ts.db"));
    }

    #[test]
    fn remove_record_clears_resume_timestamp() {
        let db = temp_db("remove-ts");
        let mgr = DownloadManager::new(db.clone());
        let record = mgr
            .create_download("https://example.com/file.zip", "/tmp/file.zip", None)
            .expect("create should succeed");
        mgr.record_resume(&record.id);
        assert!(mgr.was_recently_resumed(&record.id, 5));
        mgr.remove_record(&record.id).expect("remove should succeed");
        assert!(
            !mgr.was_recently_resumed(&record.id, 5),
            "remove_record must clear the resume timestamp (no leak)"
        );
        let _ = std::fs::remove_file(std::env::temp_dir().join("adl-download-mgr-remove-ts.db"));
    }
}
