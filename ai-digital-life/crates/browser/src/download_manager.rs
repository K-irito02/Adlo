use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Instant, SystemTime};

use chrono::Utc;
use uuid::Uuid;

#[cfg(windows)]
use webview2_com::Microsoft::Web::WebView2::Win32::{
    COREWEBVIEW2_DOWNLOAD_STATE, COREWEBVIEW2_DOWNLOAD_STATE_COMPLETED,
    COREWEBVIEW2_DOWNLOAD_STATE_IN_PROGRESS, COREWEBVIEW2_DOWNLOAD_STATE_INTERRUPTED,
};

use adl_errors::AppError;
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

/// Remove orphaned WebView2 staging files (`{GUID}.tmp`) that the browser
/// engine leaves in the destination folder when a transfer ends before it can
/// rename its staging file to the final target (see
/// MicrosoftEdge/WebView2Feedback#3356). These are invisible to our own code
/// (we only ever write `.crdownload`), but a non-technical user can be confused
/// by the leftover GUID-named `.tmp` files sitting next to their downloads.
///
/// Safety: only files whose name matches WebView2's `{GUID}.tmp` staging shape
/// AND whose modification time is at least `grace_secs` old are removed — an
/// arbitrary `.tmp` file from another application is never touched, and a
/// staging file actively being written by an in-progress download in the same
/// directory is not deleted within the grace window (on Windows a still-locked
/// file fails to delete anyway, leaving a warn log).
const TMP_ORPHAN_GRACE_SECS: u64 = 30;

/// 迁移复排上限：1 主轮 + 3 并发复排。耗尽仍有残留即报错不切换，
/// 由调用方 toast 告知用户重试（H4，不再静默保留）。
const MAX_DRAIN_PASSES: usize = 4;

/// Whether `name` matches WebView2's download staging shape `{GUID}.tmp`
/// (`GUID` = 8-4-4-4-12 hex digits). The `.tmp` extension is matched
/// case-insensitively because the destination folder may live on a
/// case-insensitive filesystem (Windows/macOS).
fn is_webview2_staging_tmp(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    let Some(inner) = lower
        .strip_prefix('{')
        .and_then(|n| n.strip_suffix(".tmp"))
        .and_then(|n| n.strip_suffix('}'))
    else {
        return false;
    };
    if inner.len() != 36 {
        return false;
    }
    inner.as_bytes().iter().enumerate().all(|(i, b)| {
        if matches!(i, 8 | 13 | 18 | 23) { *b == b'-' } else { b.is_ascii_hexdigit() }
    })
}

fn cleanup_orphaned_tmp_files(file_path: &str, grace_secs: u64) {
    let Some(dir) = Path::new(file_path).parent() else { return };
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) => {
            tracing::debug!(
                dir = %dir.display(),
                error = %e,
                "[ADL-DL] cleanup_orphaned_tmp_files: cannot list directory; skipping"
            );
            return;
        },
    };
    let now = SystemTime::now();
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if !is_webview2_staging_tmp(&name) {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(meta) => meta,
            Err(e) => {
                // The file can vanish between read_dir and metadata (a sibling
                // cleanup or the user deleting it) — benign, log at debug.
                // modified()/duration_since() failures are rarer clock-skew
                // races and intentionally left silent in this best-effort sweep.
                tracing::debug!(
                    file = %name,
                    dir = %dir.display(),
                    error = %e,
                    "[ADL-DL] cleanup_orphaned_tmp_files: cannot stat candidate; skipping"
                );
                continue;
            },
        };
        // A file-like name could still be a directory; never attempt to remove it.
        if !meta.is_file() {
            continue;
        }
        let Ok(modified) = meta.modified() else { continue };
        let Ok(age) = now.duration_since(modified) else { continue };
        if age.as_secs() < grace_secs {
            continue;
        }
        match fs::remove_file(entry.path()) {
            Ok(()) => tracing::debug!(
                file = %name,
                dir = %dir.display(),
                "[ADL-DL] cleanup_orphaned_tmp_files: removed orphaned WebView2 staging temp"
            ),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                // A concurrent sweep (another download in the same directory) may
                // have already removed the file — benign, log at debug to avoid
                // misleading "in use" noise. (Directories can't reach here: the
                // is_file() guard above already skipped them.)
                tracing::debug!(
                    file = %name,
                    dir = %dir.display(),
                    error = %e,
                    "[ADL-DL] cleanup_orphaned_tmp_files: remove_file returned NotFound (concurrent cleanup)"
                );
            },
            Err(e) => tracing::warn!(
                file = %name,
                dir = %dir.display(),
                error = %e,
                "[ADL-DL] cleanup_orphaned_tmp_files: failed to remove staging temp (probably in use)"
            ),
        }
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
    /// Record IDs for which a fresh reqwest restart download (from offset 0) is
    /// currently in flight. Guards against spawning two concurrent restart
    /// threads appending to the same `.crdownload` (e.g. a fast pause→resume
    /// cycle observed by both `resume_download` and the progress monitor).
    non_resumable_restarting: Arc<Mutex<std::collections::HashSet<String>>>,
    /// Record IDs for which a user-initiated HTTP Range resume thread is
    /// currently in flight. A dedicated guard (NOT the resume_timestamps map,
    /// which also feeds post-resume auto-retry detection) so that a
    /// `finished(false)` arriving during a manual Range resume cannot trigger a
    /// second concurrent append thread.
    range_resume_inflight: Arc<Mutex<std::collections::HashSet<String>>>,
    /// 覆盖默认下载目录（来自 StoragePaths.downloads_default_dir）。`Some`
    /// 时替代 [`get_default_download_path`] 启发式；用户在设置中显式配置的
    /// `default_path` 仍优先。
    default_dir_override: Arc<Mutex<Option<PathBuf>>>,
    /// 路径变更串行锁：`change_default_path` 读-迁-写三步非原子，并发调用会交错
    ///（A 读旧 A → B/C 同迁）；UI 侧 busy 互斥承担主要串行化，此处再加实例锁兜底。
    migration_lock: Arc<Mutex<()>>,
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
            non_resumable_restarting: Arc::new(Mutex::new(std::collections::HashSet::new())),
            range_resume_inflight: Arc::new(Mutex::new(std::collections::HashSet::new())),
            default_dir_override: Arc::new(Mutex::new(None)),
            migration_lock: Arc::new(Mutex::new(())),
        }
    }

    /// 覆盖默认下载目录（来自 StoragePaths.downloads_default_dir）。
    pub fn set_default_dir_override(&self, dir: Option<PathBuf>) {
        if let Ok(mut guard) = self.default_dir_override.lock() {
            *guard = dir;
        }
    }

    /// 生效的默认下载目录。
    ///
    /// 优先级：用户显式配置（`settings.default_path`）＞ storage 覆盖
    /// （`StoragePaths.downloads_default_dir`）＞ 原启发式。构造时
    /// `default_path` 即按启发式预填，因此"仍等于启发式"视为未定制，此时
    /// storage 覆盖生效（统一模式下三者相同，行为与当前完全一致）。
    fn effective_default_dir(&self, configured: &str) -> PathBuf {
        let override_dir = self.default_dir_override.lock().ok().and_then(|g| g.clone());
        if !configured.is_empty() {
            let customized =
                override_dir.is_none() || Path::new(configured) != get_default_download_path();
            if customized {
                return PathBuf::from(configured);
            }
        }
        override_dir.unwrap_or_else(get_default_download_path)
    }

    /// Atomically claim the non-resumable restart slot for a record. Returns
    /// `true` if THIS call won the claim (the record was not already in flight);
    /// returns `false` if a restart for this record is already running. Used by
    /// both `resume_download` and the progress monitor so only one restart
    /// thread is ever spawned per record.
    pub fn try_claim_non_resumable_restart(&self, id: &str) -> bool {
        self.non_resumable_restarting.lock().map(|mut m| m.insert(id.to_string())).unwrap_or(false)
    }

    /// Releases the restart-claim for a record (called when the restart thread
    /// finishes, so a later resume can restart it again).
    pub fn release_non_resumable_restart(&self, id: &str) {
        if let Ok(mut m) = self.non_resumable_restarting.lock() {
            m.remove(id);
        }
    }

    /// Atomically claim the manual HTTP Range resume slot for a record. Returns
    /// `true` if THIS call won (no manual Range thread already running).
    pub fn try_claim_range_resume_inflight(&self, id: &str) -> bool {
        self.range_resume_inflight.lock().map(|mut m| m.insert(id.to_string())).unwrap_or(false)
    }

    /// Release the manual HTTP Range resume slot (called when the Range thread
    /// finishes).
    pub fn release_range_resume_inflight(&self, id: &str) {
        if let Ok(mut m) = self.range_resume_inflight.lock() {
            m.remove(id);
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
    ///
    /// Note: this automatic retry deliberately does NOT increment
    /// `auto_resume_count` / consult `MAX_AUTO_RESUME_ATTEMPTS`. That limit
    /// governs Chromium-style *automatic* recovery of interrupted downloads in
    /// `resume_download`'s native path; the post-resume retry here is already
    /// rate-limited to at most once per resume (the 5-second resume-timestamp
    /// window), so a retry storm cannot occur. Incrementing the shared counter
    /// here would wrongly make a *user-initiated* resume hit the "auto-resume
    /// limit reached" gate after a few retries.
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

    /// Spawn a fresh reqwest download from offset 0 for a NonResumablePaused
    /// record (the server does not support Range, so a restart is the only
    /// option). Claims the in-flight slot via `try_claim_non_resumable_restart`
    /// so both `resume_download` and the progress monitor can race safely
    /// without spawning two concurrent threads appending to the same temp file.
    /// The claim is released when the thread terminates.
    pub fn spawn_non_resumable_restart(
        &self,
        record: &DownloadRecord,
        app_handle: &tauri::AppHandle,
        total_bytes: Option<u64>,
    ) -> Result<(), String> {
        if !self.try_claim_non_resumable_restart(&record.id) {
            tracing::info!(
                record_id = %record.id,
                "[ADL-DL] spawn_non_resumable_restart: already restarting — skipping duplicate"
            );
            return Ok(());
        }

        tracing::info!(
            record_id = %record.id,
            url = %record.url,
            file_path = %record.file_path,
            "[ADL-DL] spawn_non_resumable_restart: spawning fresh reqwest download from offset 0"
        );

        let manager_clone = self.clone();
        let record_id = record.id.clone();
        let url_clone = record.url.clone();
        let path_clone = std::path::PathBuf::from(format!("{}.crdownload", record.file_path));
        let final_path_clone = record.file_path.clone();
        let source_tab_id = record.source_tab_id.clone();
        let app_handle_clone = app_handle.clone();
        let total_for_thread = total_bytes;

        std::thread::Builder::new()
            .name(format!("adl-restart-{record_id}"))
            .spawn(move || {
                let rt = tokio::runtime::Runtime::new()
                    .expect("failed to create tokio runtime for reqwest re-download");
                rt.block_on(async {
                    let downloader = RangeResumeDownload::new(
                        url_clone.clone(),
                        path_clone.clone(),
                        0,
                        total_for_thread,
                        None,
                        None,
                    );

                    let result = downloader.start().await;
                    // Release the in-flight claim once the transfer is done so a
                    // later resume can restart again.
                    manager_clone.release_non_resumable_restart(&record_id);

                    match result {
                        Ok(download_result) => {
                            let truly_complete =
                                download_result.completed || total_for_thread.is_none();
                            tracing::info!(
                                record_id = %record_id,
                                bytes_received = download_result.bytes_received,
                                completed = download_result.completed,
                                truly_complete,
                                "[ADL-DL] reqwest re-download completed"
                            );
                            if !truly_complete {
                                tracing::warn!(
                                    record_id = %record_id,
                                    bytes_received = download_result.bytes_received,
                                    total = total_for_thread,
                                    "[ADL-DL] reqwest re-download ended early (incomplete transfer); marking failed"
                                );
                                let _ = manager_clone.complete_download(
                                    &record_id,
                                    false,
                                    Some("DownloadFailed"),
                                );
                                if !manager_clone.is_record_canceled(&record_id) {
                                    let _ = app_handle_clone.emit(
                                        "browser-download-error",
                                        &serde_json::json!({
                                            "id": record_id,
                                            "url": url_clone,
                                            "reason": "Download ended before the file was complete (server closed the stream)",
                                            "canRetry": true,
                                            "source_tab_id": source_tab_id,
                                        }),
                                    );
                                }
                                return;
                            }
                            match manager_clone.complete_download(&record_id, true, None) {
                                Ok(()) => {
                                    let _ = app_handle_clone.emit(
                                        "browser-download-finished",
                                        &serde_json::json!({
                                            "id": record_id,
                                            "url": url_clone,
                                            "filePath": final_path_clone,
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
                                            "[ADL-DL] re-download finished but record was canceled; skipping completion and removing temp"
                                        );
                                        let _ = std::fs::remove_file(&path_clone);
                                    } else {
                                        tracing::warn!(
                                            record_id = %record_id,
                                            error = %e,
                                            "[ADL-DL] re-download finalization failed; progress monitor will retry"
                                        );
                                    }
                                },
                            }
                        }
                        Err(e) => {
                            tracing::error!(
                                record_id = %record_id,
                                error = %e,
                                "[ADL-DL] reqwest re-download failed"
                            );
                            let _ = manager_clone.complete_download(
                                &record_id,
                                false,
                                Some("DownloadFailed"),
                            );
                            if !manager_clone.is_record_canceled(&record_id) {
                                let _ = app_handle_clone.emit(
                                    "browser-download-error",
                                    &serde_json::json!({
                                        "id": record_id,
                                        "url": url_clone,
                                        "reason": format!("Download failed: {}", e),
                                        "canRetry": true,
                                        "source_tab_id": source_tab_id,
                                    }),
                                );
                            }
                        }
                    }
                });
            })
            .map_err(|e| {
                // Spawn failed: release the claim so a later resume can retry.
                self.release_non_resumable_restart(&record.id);
                format!("Failed to spawn restart download thread: {}", e)
            })?;

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
        auto_migrate: Option<bool>,
    ) -> Result<(), String> {
        let mut settings = self.settings.lock().expect("settings mutex should not be poisoned");
        if let Some(m) = mode {
            settings.mode = m;
        }
        if let Some(p) = default_path {
            settings.default_path = p;
        }
        if let Some(a) = auto_migrate {
            settings.auto_migrate_on_path_change = a;
        }
        self.save_settings(&settings)?;
        Ok(())
    }

    /// 更改默认下载路径；`migrate` 为 true 时先把旧生效目录下**全部**文件/子目录
    /// 搬到新生效目录（同名冲突按 `resolve_conflict_path` 改名），全部成功后才删除
    /// 旧目录并落盘新路径。任一步失败即中止且不更新设置，旧数据尽量保持可恢复。
    /// 系统自带目录（见 `is_system_protected_dir`）只迁出文件、永不删除目录本体。
    pub fn change_default_path(&self, new_path: &str, migrate: bool) -> Result<(), String> {
        // 读-迁-写串行化（见 migration_lock 注释）。
        let _migration_guard =
            self.migration_lock.lock().map_err(|_| "migration lock poisoned".to_string())?;
        // 非绝对路径会随进程 cwd 漂移（迁移更会"真的搬走"文件）；空串=系统默认仍允许。
        // 校验与落盘统一用同一规范化结果：trim 两端（纯空白 trim 后即 ""，自然归一为默认）。
        let normalized = new_path.trim();
        if !normalized.is_empty() && !Path::new(normalized).is_absolute() {
            return Err(format!("download path must be absolute: {new_path}"));
        }
        let settings = self.get_settings();
        let old_effective = self.effective_default_dir(&settings.default_path);
        let new_effective = self.effective_default_dir(normalized);

        // H1：搬迁目标落在系统管理整棵子树内时拒绝（防向系统树内建目录 +
        // 整树写入）。仅搬迁时检查：migrate=false 只改设置字符串，不碰文件系统。
        if migrate && !normalized.is_empty() && is_inside_deep_protected_dir(&new_effective) {
            return Err(format!(
                "download path must not point inside a system-managed tree: {}",
                new_effective.display()
            ));
        }

        // 规范化后比较：大小写/分隔符/`..` 别名指向同一目录时不搬（防自迁移自删）。
        if migrate
            && old_effective.exists()
            && normalize_path_key(&old_effective) != normalize_path_key(&new_effective)
        {
            let remove_old = !is_system_protected_dir(&old_effective);
            if !remove_old {
                tracing::info!(
                    old = %old_effective.display(),
                    "download default path is a system directory: migrating files out, keeping the directory itself"
                );
            }
            self.migrate_dir(&old_effective, &new_effective, remove_old)?;
        }

        self.update_settings(None, Some(normalized.to_string()), None)
    }

    /// 把 `old` 目录下全部条目搬到 `new`；`remove_old` 为 true 时成功后删除 `old`
    ///（系统自带目录传 false，只迁出文件、不删目录，防误删 Windows 系统目录）。
    ///
    /// 并发兜底（H4）：主轮结束后若旧目录仍有残留（迁移期间写入的新文件），
    /// 有限次复排（`MAX_DRAIN_PASSES`）继续搬运；耗尽仍非空则报错、设置不切换，
    /// 由调用方 toast 告知用户重试——不再静默保留。
    fn migrate_dir(&self, old: &Path, new: &Path, remove_old: bool) -> Result<(), String> {
        // 规范化后双向包含才拒绝：词法 starts_with 会被大小写/`..`/分隔符别名绕过，
        // 绕过后 dest 落在源内部会触发递归自复制。
        let old_key = normalize_path_key(old);
        let new_key = normalize_path_key(new);
        if new_key == old_key
            || Path::new(&new_key).starts_with(&old_key)
            || Path::new(&old_key).starts_with(&new_key)
        {
            return Err(format!(
                "cannot migrate: paths overlap ({} vs {})",
                old.display(),
                new.display()
            ));
        }

        fs::create_dir_all(new).map_err(|e| format!("create target dir failed: {e}"))?;

        // enumerate 下标 = 已成功搬运数（前序条目全部成功才会走到当前条目）。
        let mut moved = 0usize;
        // 1 主轮 + 有限复排：每轮至少搬走 1 个条目才继续，避免并发写入下空转。
        for _ in 0..MAX_DRAIN_PASSES {
            let mut progressed = false;
            for entry in fs::read_dir(old).map_err(|e| format!("read old dir failed: {e}"))? {
                let entry = entry.map_err(|e| format!("read old dir entry failed: {e}"))?;
                let src = entry.path();
                let mut dest = new.join(entry.file_name());
                // 目标已存在（并发/历史残留）：改名后再搬，沿用主流程冲突语义。
                // 注意改名后的 dest 一定是新建；预先存在的 dest 碰都不碰（见下）。
                let dest_existed = dest.exists();
                if dest_existed {
                    dest =
                        PathBuf::from(self.resolve_conflict_path(dest.to_string_lossy().as_ref()));
                }
                if let Err(e) = move_path(&src, &dest) {
                    // H2 半拷贝清理（跨盘回退中途失败时 dest 内已有部分内容）：
                    // dest 为本轮新建才删（冲突改名的一定是新建），保证目录级
                    // "非旧即新"，不留新旧双份；清理失败忽略，保留原始错误。
                    cleanup_partial_dest(&dest, dest_existed);
                    // 无 journal 全局回滚（Phase 4 F4 判定：两阶段复制需双倍磁盘且违背搬迁语义）：
                    // 失败时条目级完整性仍保证（每文件非旧即新、无丢失），错误串携带进度供
                    // 人工对账；i18n 文案同口径（已搬留新路径/其余留旧路径/设置未切换）。
                    return Err(format!(
                        "migrate failed after moving {moved} entries ({e}); files already moved stay in the new path, the rest remain in the old path, and settings were not updated"
                    ));
                }
                moved += 1;
                progressed = true;
            }
            if !progressed {
                break;
            }
        }

        if !remove_old {
            return Ok(());
        }
        // 全部已枚举条目搬完才尝试删旧目录；复排耗尽仍非空说明并发写入持续发生，
        // 报错不切换（调用方 toast），而非静默保留。删除侧异常（复检失败/ACL）仍
        // 降级为告警并保留目录——文件已全部搬完，让设置照常落盘，避免"已搬未落盘"。
        match fs::read_dir(old) {
            Ok(mut entries) => {
                if entries.next().is_none() {
                    if let Err(e) = fs::remove_dir(old) {
                        tracing::warn!(
                            old = %old.display(),
                            error = %e,
                            "old dir was empty but remove failed (concurrent write?); keeping the directory"
                        );
                    }
                    Ok(())
                } else {
                    Err("concurrent writes during migrate: old dir still has entries after bounded redrain; settings were not updated"
                        .to_string())
                }
            },
            Err(e) => {
                tracing::warn!(
                    old = %old.display(),
                    error = %e,
                    "re-check old dir failed after migrate; keeping the directory"
                );
                Ok(())
            },
        }
    }

    pub fn check_disk_space(&self, path: &str) -> Result<(), String> {
        let path = Path::new(path);
        let dir = if path.as_os_str().is_empty() {
            // Empty/root destination (e.g. WebView2 reports no location yet) —
            // fall back to the default download directory so the check doesn't
            // fail on an invalid path.
            &self.effective_default_dir("")
        } else {
            path.parent().unwrap_or(Path::new("/"))
        };
        let stat = fs2::available_space(dir).map_err(|e| format!("Disk check failed: {}", e))?;
        if stat < 10 * 1024 * 1024 {
            return Err("FileNoSpace".to_string());
        }
        Ok(())
    }

    /// Free space (bytes) on the volume containing `dir`.
    ///
    /// Used by the storage settings preflight (Plan C) to reject a move that
    /// would not fit on the target volume. Reuses the same `fs2` syscall as
    /// `check_disk_space` — no new dependency.
    pub fn available_space_bytes(&self, dir: &Path) -> Result<u64, String> {
        fs2::available_space(dir).map_err(|e| format!("Disk check failed: {}", e))
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
        let default_dir = self.effective_default_dir(&settings.default_path);

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

        tracing::debug!(
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
        tracing::debug!(
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

        tracing::debug!(
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
        tracing::debug!(
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
        // bytes_received) and spawn the restart thread DIRECTLY here — not via
        // the progress monitor — so a fast pause→resume cycle (< one monitor
        // poll) cannot leave the record stuck InProgress with no download
        // thread (the monitor only detects the transition when it happened to
        // observe the Paused state).
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
            // total_bytes from the record (may be None if not yet resolved).
            let total = record.total_bytes;
            self.spawn_non_resumable_restart(&record, app_handle, total)?;
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

        // In-flight guard: reject a duplicate Range thread when one is already
        // running for this record. A rapid double-click on "Resume" would
        // otherwise spawn two threads appending to the same `.crdownload` (the
        // second sees the record already InProgress and re-enters this Range
        // fallback with an overlapping offset → corrupt file). This uses a
        // DEDICATED in-flight set, NOT the resume_timestamps map — that map also
        // feeds post-resume auto-retry detection, so stamping it here would arm
        // `trigger_range_resume` if a `finished(false)` arrived during the
        // manual Range download, spawning a second concurrent append thread.
        if !self.try_claim_range_resume_inflight(id) {
            tracing::warn!(
                id = %id,
                url = %url,
                "[ADL-DL] resume_download: HTTP Range resume already in flight — rejecting duplicate thread"
            );
            return Ok(());
        }

        // Get the current file size from the .crdownload as the true offset. If
        // the metadata call fails (e.g. temp file missing), the DB bytes_received
        // may lag the real size — falling back to it could corrupt the file with
        // an overlap. Treat a missing/unreadable temp as non-retryable instead
        // (mirrors trigger_range_resume).
        let current_offset = match std::fs::metadata(format!("{}.crdownload", record.file_path)) {
            Ok(m) => m.len(),
            Err(e) => {
                self.release_range_resume_inflight(id);
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

        std::thread::Builder::new()
            .name(format!("adl-range-resume-{id}"))
            .spawn(move || {
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

                    let result = downloader.start().await;
                    // Release the in-flight guard now that this Range thread is
                    // done (covers all terminal paths).
                    manager_clone.release_range_resume_inflight(&record_id);

                    match result {
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
        })
        .map_err(|e| {
            // Spawn failed: release the in-flight guard so a later resume can retry.
            self.release_range_resume_inflight(id);
            format!("Failed to spawn HTTP Range resume thread: {}", e)
        })?;

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
            // WebView2's native Cancel() may leave its staging `{GUID}.tmp`
            // file in the destination folder; clean it up like the `.crdownload`
            // above so no confusing temp garbage remains.
            cleanup_orphaned_tmp_files(&record.file_path, TMP_ORPHAN_GRACE_SECS);
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

        // Capture the actual on-disk size for a successful transfer so the
        // history list shows the real file size. A fast transfer can reach the
        // terminal state between two progress polls, leaving the DB at 0 or a
        // stale value ("0 B" / size mismatch vs. the file explorer in the UI).
        let final_size = if success {
            match self.get_record(id) {
                Ok(record) => match fs::metadata(&record.file_path) {
                    Ok(meta) => Some(meta.len() as i64),
                    Err(e) => {
                        // A successful transfer whose final file is missing/unreadable
                        // is a strong anomaly — surface it instead of silently recording
                        // "Completed + 0 B" with no trace.
                        tracing::warn!(
                            record_id = %id,
                            file_path = %record.file_path,
                            error = %e,
                            "[ADL-DL] complete_download: cannot stat final file; size sync skipped"
                        );
                        None
                    },
                },
                Err(e) => {
                    // A read failure on a record this call is already operating on
                    // is unexpected — log it rather than silently skipping the sync.
                    tracing::debug!(
                        record_id = %id,
                        error = %e,
                        "[ADL-DL] complete_download: record lookup failed; size sync skipped"
                    );
                    None
                },
            }
        } else {
            None
        };

        // Atomically persist the terminal status and, for a successful
        // transfer, the real on-disk size in a single transaction so the record
        // can never end up half-updated (e.g. Completed with bytes_received
        // still 0). A size-sync failure is surfaced (DB write → transaction
        // error; missing/unreadable final file → warn log), never silently
        // swallowed, so a stale "0 B" does not linger undetected.
        self.db
            .transaction(|conn| {
                conn.execute(
                    "UPDATE download_history SET status = ?1, interrupt_reason = ?2, completed_at = ?3 WHERE id = ?4",
                    rusqlite::params![status.as_str(), reason, Utc::now().timestamp(), id],
                )
                .map_err(|e| AppError::Storage(format!("Failed to complete download: {e}")))?;
                if let Some(final_size) = final_size {
                    conn.execute(
                        "UPDATE download_history SET bytes_received = ?1, total_bytes = ?1 WHERE id = ?2",
                        rusqlite::params![final_size, id],
                    )
                    .map_err(|e| AppError::Storage(format!("Failed to sync actual file size: {e}")))?;
                    tracing::debug!(
                        record_id = %id,
                        bytes_received = final_size,
                        "[ADL-DL] complete_download: synced bytes_received/total_bytes to actual file size"
                    );
                }
                Ok(())
            })
            .map_err(|e| e.to_string())?;

        // Evict the resumability cache entry once the download has ended (its
        // URL won't be probed again; keeps the map bounded).
        if let Ok(record) = self.get_record(id) {
            self.resumability.lock().ok().map(|mut m| m.remove(&record.url));
            // WebView2 may leave its staging `{GUID}.tmp` in the destination
            // folder when a transfer ends without renaming it; clean it up so
            // non-technical users don't see confusing temp files.
            cleanup_orphaned_tmp_files(&record.file_path, TMP_ORPHAN_GRACE_SECS);
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

/// Single entry move: rename first (atomic, same volume); fall back to
/// copy + remove for cross-device moves (e.g. different drives).
fn move_path(src: &Path, dest: &Path) -> Result<(), String> {
    match fs::rename(src, dest) {
        Ok(()) => Ok(()),
        Err(e) if is_cross_device_error(&e) => {
            // 仅跨设备（同盘 rename 失败的其它原因：权限/目标占用等）才回退复制，
            // 避免把真实错误降级掩盖、并在竞态下静默覆盖。
            if src.is_dir() {
                copy_dir_all(src, dest)?;
                remove_dir_all_cleared(src)
                    .map_err(|e| format!("remove source dir failed: {e}"))?;
            } else {
                fs::copy(src, dest).map_err(|e| format!("copy file failed: {e}"))?;
                clear_readonly_best_effort(src);
                fs::remove_file(src).map_err(|e| format!("remove source file failed: {e}"))?;
            }
            Ok(())
        },
        Err(e) => Err(format!("move failed ({} -> {}): {e}", src.display(), dest.display())),
    }
}

/// rename 的「跨设备」错误：Windows `ERROR_NOT_SAME_DEVICE`(17) / Unix `EXDEV`(18)。
fn is_cross_device_error(err: &std::io::Error) -> bool {
    match err.raw_os_error() {
        #[cfg(windows)]
        Some(17) => true,
        #[cfg(unix)]
        Some(18) => true,
        _ => false,
    }
}

/// Windows 只读文件删除会失败：删除前尽力清只读位（失败忽略，由后续删除报真实错误）。
/// 仅 Windows 编译（`set_readonly(false)` 的 Unix 世界可写陷阱不适用；Windows 只认该位）。
#[cfg(windows)]
#[allow(clippy::permissions_set_readonly_false)] // Windows 上 readonly 位即 FILE_ATTRIBUTE_READONLY，无 world-writable 语义
fn clear_readonly_best_effort(path: &Path) {
    if let Ok(md) = fs::metadata(path) {
        let mut perm = md.permissions();
        if perm.readonly() {
            perm.set_readonly(false);
            let _ = fs::set_permissions(path, perm);
        }
    }
}

#[cfg(not(windows))]
fn clear_readonly_best_effort(_path: &Path) {}

/// 递归清只读位后删除目录树（跨盘回退删源用）。
fn remove_dir_all_cleared(dir: &Path) -> std::io::Result<()> {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && !path.is_symlink() {
                remove_dir_all_cleared(&path)?;
            } else {
                clear_readonly_best_effort(&path);
            }
        }
    }
    clear_readonly_best_effort(dir);
    fs::remove_dir_all(dir)
}

fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| format!("create dir failed: {e}"))?;
    for entry in fs::read_dir(src).map_err(|e| format!("read dir failed: {e}"))? {
        let entry = entry.map_err(|e| format!("read dir entry failed: {e}"))?;
        let dest = dst.join(entry.file_name());
        let file_type = entry.file_type().map_err(|e| format!("stat failed: {e}"))?;
        // 符号链接不跟随摊平（保留链接本体是 rename 路径语义；复制回退路径明确拒绝，
        // 防止语义悄悄改变或链接目标不可读导致中途分裂）。
        if file_type.is_symlink() {
            return Err(format!(
                "symlink not supported in cross-device copy fallback: {}",
                entry.path().display()
            ));
        }
        if file_type.is_dir() {
            copy_dir_all(&entry.path(), &dest)?;
        } else {
            fs::copy(entry.path(), &dest).map_err(|e| format!("copy file failed: {e}"))?;
        }
    }
    Ok(())
}

/// 路径比较键：优先 canonicalize（消 `..`/符号链接/相对），失败回退词法原样。
/// Windows 关键点：
/// 1. canonicalize 返回 `\\?\C:\...`（UNC 为 `\\?\UNC\...`），词法回退路径没有该前缀——
///    不剥则同一目录产生两种键，相等/前缀比较必失败，故统一剥离；
/// 2. 统一分隔符并小写折叠——大小写/分隔符别名必须得到同一键，
///    否则 overlap/相等判断可被绕过（Windows 大小写不敏感）。
fn normalize_path_key(path: &Path) -> String {
    let resolved = path.canonicalize().unwrap_or_else(|_| lexical_normalize(path));
    let mut s = resolved.to_string_lossy().into_owned();
    #[cfg(windows)]
    {
        if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
            s = format!(r"\\{rest}");
        } else if let Some(rest) = s.strip_prefix(r"\\?\") {
            s = rest.to_string();
        }
        s = s.replace('/', "\\").to_lowercase();
    }
    s
}

/// 纯词法归一（不依赖文件系统存在性）：消解 `.`/`..` 分量。
/// canonicalize 失败（目标尚不存在——迁移前恰是常态）时用它，否则
/// `A\B\..\A\inner` 之类 `..` 别名可绕过 overlap 检查（Phase 4 rev2 N1）。
fn lexical_normalize(path: &Path) -> PathBuf {
    use std::path::Component;
    let mut out = PathBuf::new();
    for c in path.components() {
        match c {
            Component::CurDir => {},
            Component::ParentDir => {
                out.pop();
            },
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// H2：目录跨盘半拷贝清理。`dest_existed` 为本轮搬运前 `dest` 是否已存在：
/// 新建的才删（冲突改名的一定是新建），预先存在的碰都不碰。
/// 跨盘回退（`copy_dir_all` 中途失败）是唯一能产生"部分目标"的路径，
/// 同卷 rename 要么整体成功要么整体失败，走不到这里——本函数单测覆盖判定逻辑，
/// 调用点由 code review 锁定。
fn cleanup_partial_dest(dest: &Path, dest_existed: bool) {
    if !dest_existed {
        let _ = fs::remove_dir_all(dest);
    }
}

/// `path` 是否落在深保护整棵子树内部（不含精确相等本身）：
/// 系统树内新建目录 + 整树写入均拒绝（H1）；精确命中的已知文件夹
///（如 Downloads 本身）仍允许——只有"内部"被拦。
fn is_inside_deep_protected_dir(path: &Path) -> bool {
    if path.as_os_str().is_empty() {
        return false;
    }
    let key = normalize_path_key(path);
    for (prot, deep) in system_protected_dirs() {
        if !deep {
            continue;
        }
        let prot_key = normalize_path_key(&prot);
        if key != prot_key && Path::new(&key).starts_with(&prot_key) {
            return true;
        }
    }
    false
}

// 系统自带目录清单（dir, 是否前缀保护整棵子树）：
// - 系统树（SystemRoot/ProgramFiles/ProgramData）整棵子树受保护（防误删
//   `Windows\System32`、`Program Files\Vendor\...` 等系统子目录）；
// - 用户已知文件夹/家目录仅精确匹配——用户自建的子目录不是"系统自带"，
//   迁移成功后仍按产品决策删除，不扩大保护面。
// 测试覆盖（M8）：`#[cfg(test)]` 下优先读线程内覆盖表；迁移类测试把工作区建在
// `temp`（Windows 上位于 AppData 深保护树内）并经 `test_workspace()` 置空覆盖表，
// 保护单测从不设置覆盖、读真实表。线程内覆盖保证并行测试互不影响。
#[cfg(test)]
thread_local! {
    static TEST_PROTECTED_TABLE: std::cell::RefCell<Option<Vec<(std::path::PathBuf, bool)>>> =
        const { std::cell::RefCell::new(None) };
}

fn system_protected_dirs() -> Vec<(PathBuf, bool)> {
    #[cfg(test)]
    if let Some(table) = TEST_PROTECTED_TABLE.try_with(|c| c.borrow().clone()).unwrap_or(None) {
        return table;
    }
    system_protected_dirs_inner()
}

/// 见 `system_protected_dirs`（测试覆盖表优先的薄包装）：真实表构造在此。
/// - 系统树（SystemRoot/ProgramFiles/ProgramData）整棵子树受保护（防误删
///   `Windows\System32`、`Program Files\Vendor\...` 等系统子目录）；
/// - 用户已知文件夹/家目录仅精确匹配——用户自建的子目录不是"系统自带"，
///   迁移成功后仍按产品决策删除，不扩大保护面。
fn system_protected_dirs_inner() -> Vec<(PathBuf, bool)> {
    let mut out: Vec<(PathBuf, bool)> = Vec::new();
    #[cfg(windows)]
    for var in ["SystemRoot", "ProgramFiles", "ProgramFiles(x86)", "ProgramData"] {
        if let Ok(v) = std::env::var(var) {
            let p = PathBuf::from(v);
            if !p.as_os_str().is_empty() {
                out.push((p, true));
            }
        }
    }
    // AppData 属系统管理树（非纯用户内容）：整棵子树深保护。
    #[cfg(windows)]
    for var in ["APPDATA", "LOCALAPPDATA"] {
        if let Ok(v) = std::env::var(var) {
            let p = PathBuf::from(v);
            if !p.as_os_str().is_empty() {
                out.push((p, true));
            }
        }
    }
    if let Some(home) = dirs::home_dir() {
        out.push((home.join("AppData"), true));
    }
    // USERPROFILE 与 dirs 已知文件夹：仅精确匹配（见函数文档）。
    #[cfg(windows)]
    if let Ok(v) = std::env::var("USERPROFILE") {
        let p = PathBuf::from(v);
        if !p.as_os_str().is_empty() {
            out.push((p, false));
        }
    }
    for p in [
        dirs::home_dir(),
        dirs::download_dir(),
        dirs::document_dir(),
        dirs::desktop_dir(),
        dirs::picture_dir(),
        dirs::video_dir(),
        dirs::audio_dir(),
    ]
    .into_iter()
    .flatten()
    {
        out.push((p, false));
    }
    out
}

/// `path` 是否为系统自带目录：是则迁移只搬文件、不删目录。
/// 盘符根/无父目录（如 `C:\`、`/`）永远视为受保护；
/// 系统树子目录（如 `C:\Windows\...`）按前缀保护；用户已知文件夹仅精确匹配。
fn is_system_protected_dir(path: &Path) -> bool {
    if path.parent().is_none() {
        return true;
    }
    let key = normalize_path_key(path);
    for (prot, deep) in system_protected_dirs() {
        let prot_key = normalize_path_key(&prot);
        if key == prot_key {
            return true;
        }
        if deep && Path::new(&key).starts_with(&prot_key) {
            return true;
        }
    }
    false
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
pub(crate) fn derive_file_name(url: &str, file_path: &str) -> String {
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
    fn available_space_bytes_reports_volume_free_space() {
        let db = temp_db("available-space");
        let mgr = DownloadManager::new(db);
        let bytes = mgr
            .available_space_bytes(&std::env::temp_dir())
            .expect("temp dir volume should report free space");
        assert!(bytes > 0, "free space should be positive, got {bytes}");
        let _ =
            std::fs::remove_file(std::env::temp_dir().join("adl-download-mgr-available-space.db"));
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
        assert!(!s.auto_migrate_on_path_change, "auto-migrate defaults to off");

        mgr.update_settings(Some(DownloadMode::Ask), Some("/custom/path".to_string()), None)
            .expect("update should succeed");
        let s2 = mgr.get_settings();
        assert_eq!(s2.mode, DownloadMode::Ask);
        assert_eq!(s2.default_path, "/custom/path");
        assert!(!s2.auto_migrate_on_path_change);

        mgr.update_settings(None, None, Some(true)).expect("auto-migrate update");
        assert!(mgr.get_settings().auto_migrate_on_path_change);

        // Reload from db
        let mgr2 = DownloadManager::new(db.clone());
        let s3 = mgr2.get_settings();
        assert_eq!(s3.mode, DownloadMode::Ask);
        assert_eq!(s3.default_path, "/custom/path");
        assert!(s3.auto_migrate_on_path_change, "auto-migrate persists across reload");
        let _ = std::fs::remove_file(std::env::temp_dir().join("adl-download-mgr-settings.db"));
    }

    /// 测试用目录基座：`temp` 下隐藏测试树 + 测试保护表覆盖（见
    /// `TEST_PROTECTED_TABLE`），不污染真实家目录；保护单测不受影响
    /// （它们从不调用本函数，读真实表）。
    fn test_workspace(name: &str) -> std::path::PathBuf {
        TEST_PROTECTED_TABLE.with(|c| *c.borrow_mut() = Some(Vec::new()));
        std::env::temp_dir().join(".adl-dl-tests").join(name)
    }

    /// 非 workspace 系的迁移测试（如直接拼 temp 路径的用例）：同样置空保护表，
    /// 否则 temp（Windows 位于 AppData 深保护树内）会被 H1/旧目录删除逻辑干扰。
    fn allow_test_paths_unprotected() {
        TEST_PROTECTED_TABLE.with(|c| *c.borrow_mut() = Some(Vec::new()));
    }

    #[test]
    fn change_default_path_migrates_then_removes_old() {
        let db = temp_db("change-path-migrate");
        let mgr = DownloadManager::new(db.clone());
        let old = test_workspace("migrate-old");
        let new = test_workspace("migrate-new");
        let _ = std::fs::remove_dir_all(&old);
        let _ = std::fs::remove_dir_all(&new);
        std::fs::create_dir_all(old.join("sub")).unwrap();
        std::fs::create_dir_all(&new).unwrap();
        std::fs::write(old.join("a.txt"), b"a").unwrap();
        std::fs::write(old.join("sub").join("c.txt"), b"c").unwrap();
        std::fs::write(new.join("b.txt"), b"b").unwrap();

        mgr.change_default_path(old.to_string_lossy().as_ref(), false)
            .expect("point path at old without migrate");
        mgr.change_default_path(new.to_string_lossy().as_ref(), true)
            .expect("migrate should succeed");

        assert_eq!(mgr.get_settings().default_path, new.to_string_lossy());
        assert!(!old.exists(), "old dir must be removed after successful migrate");
        assert!(new.join("a.txt").exists());
        assert!(new.join("sub").join("c.txt").exists());
        assert!(new.join("b.txt").exists());

        let _ = std::fs::remove_dir_all(&new);
        // 不清理共享基座 `.adl-dl-tests`：与并行执行的其它迁移测试互删会 flaky（rev3 R2）。
        let _ = std::fs::remove_file(
            std::env::temp_dir().join("adl-download-mgr-change-path-migrate.db"),
        );
    }

    #[test]
    fn change_default_path_without_migrate_keeps_files() {
        let db = temp_db("change-path-keep");
        let mgr = DownloadManager::new(db.clone());
        let old = std::env::temp_dir().join("adl-dl-keep-old");
        let new = std::env::temp_dir().join("adl-dl-keep-new");
        let _ = std::fs::remove_dir_all(&old);
        let _ = std::fs::remove_dir_all(&new);
        std::fs::create_dir_all(&old).unwrap();
        std::fs::write(old.join("a.txt"), b"a").unwrap();

        mgr.change_default_path(old.to_string_lossy().as_ref(), false).expect("set old");
        mgr.change_default_path(new.to_string_lossy().as_ref(), false).expect("set new");

        assert_eq!(mgr.get_settings().default_path, new.to_string_lossy());
        assert!(old.join("a.txt").exists(), "no-migrate must not move or delete");
        assert!(!new.join("a.txt").exists());

        let _ = std::fs::remove_dir_all(&old);
        let _ = std::fs::remove_dir_all(&new);
        let _ =
            std::fs::remove_file(std::env::temp_dir().join("adl-download-mgr-change-path-keep.db"));
    }

    #[test]
    fn change_default_path_migrate_rejects_overlap() {
        // temp 直拼路径：先置空保护表，否则 H1（深保护树内拒绝）抢在 overlap 检查前触发。
        allow_test_paths_unprotected();
        let db = temp_db("change-path-overlap");
        let mgr = DownloadManager::new(db.clone());
        let old = std::env::temp_dir().join("adl-dl-overlap-old");
        let nested = old.join("inner");
        let _ = std::fs::remove_dir_all(&old);
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(old.join("a.txt"), b"a").unwrap();

        mgr.change_default_path(old.to_string_lossy().as_ref(), false).expect("set old");
        let err = mgr
            .change_default_path(nested.to_string_lossy().as_ref(), true)
            .expect_err("overlapping migrate must fail");
        assert!(err.contains("overlap"), "unexpected error: {err}");
        assert_eq!(mgr.get_settings().default_path, old.to_string_lossy());
        assert!(old.join("a.txt").exists());

        let _ = std::fs::remove_dir_all(&old);
        let _ = std::fs::remove_file(
            std::env::temp_dir().join("adl-download-mgr-change-path-overlap.db"),
        );
    }

    #[test]
    fn inside_deep_protected_dir_marks_strict_subtree_only() {
        use std::path::Path;
        // 空串与无关路径永不命中。
        assert!(!is_inside_deep_protected_dir(Path::new("")));
        assert!(!is_inside_deep_protected_dir(Path::new("D:/data")));
        #[cfg(windows)]
        {
            let sys = std::env::var("SystemRoot")
                .map(std::path::PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from(r"C:\Windows"));
            // 精确相等不算 inside（已知文件夹本身仍可作为下载目录）。
            assert!(!is_inside_deep_protected_dir(&sys));
            assert!(
                is_inside_deep_protected_dir(&sys.join("Temp").join("adl-never-create")),
                "system subtree must be rejected"
            );
        }
    }

    #[test]
    #[cfg(windows)]
    fn change_default_path_rejects_new_path_inside_protected_tree() {
        let db = temp_db("change-path-protected");
        let mgr = DownloadManager::new(db.clone());
        let sys = std::env::var("SystemRoot")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from(r"C:\Windows"));
        let target = sys.join("ADL-NEVER-CREATE-SUBDIR");
        // H1 只守搬迁：migrate=true 拒绝。
        let err = mgr
            .change_default_path(target.to_string_lossy().as_ref(), true)
            .expect_err("protected subtree must be rejected");
        assert!(err.contains("system-managed"), "unexpected error: {err}");
        // migrate=false 只改设置字符串，不碰文件系统 → 允许。
        mgr.change_default_path(target.to_string_lossy().as_ref(), false)
            .expect("settings-only set stays allowed");
        assert_eq!(mgr.get_settings().default_path, target.to_string_lossy());
        let _ = std::fs::remove_file(
            std::env::temp_dir().join("adl-download-mgr-change-path-protected.db"),
        );
    }

    #[test]
    fn cleanup_partial_dest_removes_only_fresh_dest() {
        let base = test_workspace("cleanup-guard");
        let fresh = base.join("fresh");
        let kept = base.join("kept");
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(fresh.join("sub")).unwrap();
        std::fs::write(fresh.join("sub").join("f.txt"), b"x").unwrap();
        std::fs::create_dir_all(&kept).unwrap();
        std::fs::write(kept.join("k.txt"), b"k").unwrap();

        cleanup_partial_dest(&fresh, false);
        assert!(!fresh.exists(), "fresh partial dest must be removed");
        cleanup_partial_dest(&kept, true);
        assert!(kept.join("k.txt").exists(), "pre-existing dest must be kept");

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn change_default_path_reports_concurrent_writes_without_switching() {
        // 后台写线程持续加文件：复排耗尽 → 报错且设置不切换；若写线程先停则成功。
        // 两种结局都合法，断言按分支收敛（设置与目录状态一致）。
        let db = temp_db("change-path-concurrent");
        let mgr = DownloadManager::new(db.clone());
        let old = test_workspace("concurrent-old");
        let new = test_workspace("concurrent-new");
        let _ = std::fs::remove_dir_all(&old);
        let _ = std::fs::remove_dir_all(&new);
        std::fs::create_dir_all(&old).unwrap();
        for i in 0..20 {
            std::fs::write(old.join(format!("base-{i}.txt")), b"x").unwrap();
        }
        mgr.change_default_path(old.to_string_lossy().as_ref(), false).expect("set old");
        let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let stop_w = stop.clone();
        let old_w = old.clone();
        // 节流写（1ms/个、上限 300 个）：既保证复排耗尽时大概率仍有残留（走 Err 分支），
        // 又把用例耗时压在半秒内；提前写完则走 Ok 分支——两分支断言各自收敛。
        let writer = std::thread::spawn(move || {
            for n in 0..300 {
                if stop_w.load(std::sync::atomic::Ordering::Relaxed) {
                    break;
                }
                let _ = std::fs::write(old_w.join(format!("live-{n}.txt")), b"y");
                std::thread::sleep(std::time::Duration::from_millis(1));
            }
        });
        let result = mgr.change_default_path(new.to_string_lossy().as_ref(), true);
        stop.store(true, std::sync::atomic::Ordering::Relaxed);
        let _ = writer.join();
        match result {
            Ok(()) => {
                assert_eq!(mgr.get_settings().default_path, new.to_string_lossy());
            },
            Err(e) => {
                assert!(e.contains("concurrent"), "unexpected error: {e}");
                assert_eq!(mgr.get_settings().default_path, old.to_string_lossy());
            },
        }
        let _ = std::fs::remove_dir_all(&old);
        let _ = std::fs::remove_dir_all(&new);
        let _ = std::fs::remove_file(
            std::env::temp_dir().join("adl-download-mgr-change-path-concurrent.db"),
        );
    }

    #[test]
    fn change_default_path_migrate_resolves_name_conflicts() {
        let db = temp_db("change-path-conflict");
        let mgr = DownloadManager::new(db.clone());
        let old = test_workspace("conflict-old");
        let new = test_workspace("conflict-new");
        let _ = std::fs::remove_dir_all(&old);
        let _ = std::fs::remove_dir_all(&new);
        std::fs::create_dir_all(&old).unwrap();
        std::fs::create_dir_all(&new).unwrap();
        std::fs::write(old.join("same.txt"), b"from-old").unwrap();
        std::fs::write(new.join("same.txt"), b"from-new").unwrap();

        mgr.change_default_path(old.to_string_lossy().as_ref(), false).expect("set old");
        mgr.change_default_path(new.to_string_lossy().as_ref(), true).expect("migrate");

        assert!(!old.exists());
        assert_eq!(std::fs::read(new.join("same.txt")).unwrap(), b"from-new");
        assert_eq!(std::fs::read(new.join("same (1).txt")).unwrap(), b"from-old");

        let _ = std::fs::remove_dir_all(&old);
        let _ = std::fs::remove_dir_all(&new);
        let _ = std::fs::remove_file(
            std::env::temp_dir().join("adl-download-mgr-change-path-conflict.db"),
        );
    }

    #[test]
    fn migrate_dir_resolves_double_collision_without_overwrite() {
        // 双重冲突：目标已有 same.txt 与 same (1).txt 时，搬运必须落到 same (2).txt，
        // 不得静默覆盖（H1 回归：resolve_conflict_path 内循环至空闲名）。
        let db = temp_db("change-path-double-conflict");
        let mgr = DownloadManager::new(db.clone());
        let old = test_workspace("double-conflict-old");
        let new = test_workspace("double-conflict-new");
        let _ = std::fs::remove_dir_all(&old);
        let _ = std::fs::remove_dir_all(&new);
        std::fs::create_dir_all(&old).unwrap();
        std::fs::create_dir_all(&new).unwrap();
        std::fs::write(old.join("same.txt"), b"from-old").unwrap();
        std::fs::write(new.join("same.txt"), b"from-new").unwrap();
        std::fs::write(new.join("same (1).txt"), b"from-new-1").unwrap();

        mgr.migrate_dir(&old, &new, true).expect("migrate with double collision");

        assert_eq!(std::fs::read(new.join("same.txt")).unwrap(), b"from-new");
        assert_eq!(std::fs::read(new.join("same (1).txt")).unwrap(), b"from-new-1");
        assert_eq!(std::fs::read(new.join("same (2).txt")).unwrap(), b"from-old");
        assert!(!old.exists(), "old dir removed after successful migrate");

        let _ = std::fs::remove_dir_all(&new);
        let _ = std::fs::remove_file(
            std::env::temp_dir().join("adl-download-mgr-change-path-double-conflict.db"),
        );
    }

    #[test]
    fn is_system_protected_dir_marks_roots_home_and_known_folders() {
        use std::path::Path;
        // 盘符根/文件系统根永远受保护（只读断言，不触碰文件系统）。
        #[cfg(windows)]
        assert!(is_system_protected_dir(Path::new("C:\\")));
        #[cfg(not(windows))]
        assert!(is_system_protected_dir(Path::new("/")));
        if let Some(home) = dirs::home_dir() {
            assert!(is_system_protected_dir(&home), "home dir must be protected");
        }
        if let Some(downloads) = dirs::download_dir() {
            assert!(is_system_protected_dir(&downloads), "downloads dir must be protected");
        }
        // 普通业务子目录不受保护（家目录用户子目录按产品决策可删；
        // 注意 temp 在 Windows 位于 AppData 下，属受保护树，不能用作"普通"探针）。
        let ordinary =
            dirs::home_dir().unwrap_or_else(std::env::temp_dir).join("adl-ordinary-subdir-probe");
        assert!(!is_system_protected_dir(&ordinary));
    }

    #[test]
    fn is_system_protected_dir_covers_system_tree_subdirectories() {
        // 系统树（SystemRoot/ProgramFiles/ProgramData）前缀保护：
        // `Windows\System32` 之类的系统子目录绝不能被当作"可删除的旧目录"。
        #[cfg(windows)]
        {
            let system_root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
            let sub = std::path::PathBuf::from(&system_root).join("System32");
            assert!(is_system_protected_dir(&sub), "SystemRoot subdirectory must be protected");
            let pf = std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".into());
            let vendor = std::path::PathBuf::from(&pf).join("Vendor").join("data");
            assert!(is_system_protected_dir(&vendor), "ProgramFiles subtree must be protected");
        }
        // 用户已知文件夹的用户自建子目录不扩大保护（迁移成功后按产品决策可删）。
        if let Some(downloads) = dirs::download_dir() {
            let user_sub = downloads.join("adl-user-subdir-probe");
            assert!(!is_system_protected_dir(&user_sub), "user subfolder stays deletable");
        }
    }

    #[test]
    fn migrate_dir_rejects_case_variant_overlap() {
        // 大小写别名（Windows 不敏感）指向同一目录树时必须拒绝，否则 dest 落在源内部
        // 触发递归自复制。
        #[cfg(windows)]
        {
            let db = temp_db("migrate-case-overlap");
            let mgr = DownloadManager::new(db.clone());
            let old = std::env::temp_dir().join("Adl-Dl-Case-Overlap");
            let _ = std::fs::remove_dir_all(&old);
            std::fs::create_dir_all(&old).unwrap();
            std::fs::write(old.join("a.txt"), b"a").unwrap();
            let alt = std::path::PathBuf::from(old.to_string_lossy().to_lowercase());
            let err = mgr
                .migrate_dir(&old, &alt.join("inner"), true)
                .expect_err("case-variant overlap must fail");
            assert!(err.contains("overlap"), "unexpected error: {err}");
            assert!(old.join("a.txt").exists());
            let _ = std::fs::remove_dir_all(&old);
            let _ = std::fs::remove_file(
                std::env::temp_dir().join("adl-download-mgr-migrate-case-overlap.db"),
            );
        }
    }

    #[test]
    fn move_path_missing_source_returns_error_instead_of_copy() {
        // 非跨设备 rename 失败（源不存在）不得降级走复制路径（旧行为会掩盖真实错误）。
        let missing = std::env::temp_dir().join("adl-move-path-missing-src-probe.txt");
        let dest = std::env::temp_dir().join("adl-move-path-missing-dest-probe.txt");
        let _ = std::fs::remove_file(&missing);
        let _ = std::fs::remove_file(&dest);
        let err = move_path(&missing, &dest).expect_err("missing source must fail");
        assert!(!dest.exists(), "must not create dest via copy fallback");
        assert!(err.contains("move failed"), "unexpected error: {err}");
    }

    #[test]
    fn migrate_dir_rejects_dotdot_alias_overlap() {
        // 目标尚不存在（canonicalize 失败）时 `..` 别名必须经词法归一后参与比较，
        // 否则 `old\x\..\inner` 词法不重叠、真实重叠 → 条目被搬进旧目录内部（rev2 N1）。
        let db = temp_db("migrate-dotdot-overlap");
        let mgr = DownloadManager::new(db.clone());
        let old = std::env::temp_dir().join("adl-dl-dotdot-old");
        let _ = std::fs::remove_dir_all(&old);
        std::fs::create_dir_all(&old).unwrap();
        std::fs::write(old.join("a.txt"), b"a").unwrap();
        // old\does-not-exist\..\inner —— 词法归一后 = old\inner，落在源内部。
        let new = old.join("does-not-exist").join("..").join("inner");
        let err = mgr.migrate_dir(&old, &new, true).expect_err("dotdot alias overlap must fail");
        assert!(err.contains("overlap"), "unexpected error: {err}");
        assert!(old.join("a.txt").exists());

        let _ = std::fs::remove_dir_all(&old);
        let _ = std::fs::remove_file(
            std::env::temp_dir().join("adl-download-mgr-migrate-dotdot-overlap.db"),
        );
    }

    #[test]
    fn change_default_path_rejects_relative_path() {
        let db = temp_db("change-path-relative");
        let mgr = DownloadManager::new(db.clone());
        let err = mgr
            .change_default_path("relative/foo", true)
            .expect_err("relative path must be rejected");
        assert!(err.contains("absolute"), "unexpected error: {err}");
        // 空串（系统默认）仍然允许。
        mgr.change_default_path("", false).expect("empty path stays allowed");
        // 纯空白归一为 ''（校验与落盘同源，不落盘空白串——rev4 A2）。
        mgr.change_default_path("   ", false).expect("whitespace-only becomes default");
        assert_eq!(mgr.get_settings().default_path, "");
        let _ = std::fs::remove_file(
            std::env::temp_dir().join("adl-download-mgr-change-path-relative.db"),
        );
    }

    #[test]
    fn is_system_protected_dir_covers_appdata_subtree() {
        // AppData 属系统管理树：整棵子树深保护（rev2 I2-N1）。
        if let Some(home) = dirs::home_dir() {
            let probe = home.join("AppData").join("Local").join("adl-protected-probe");
            assert!(is_system_protected_dir(&probe), "AppData subtree must be protected");
        }
    }

    #[test]
    fn migrate_dir_without_remove_old_moves_files_but_keeps_old_dir() {
        let db = temp_db("migrate-keep-dir");
        let mgr = DownloadManager::new(db.clone());
        let old = std::env::temp_dir().join("adl-dl-keepdir-old");
        let new = std::env::temp_dir().join("adl-dl-keepdir-new");
        let _ = std::fs::remove_dir_all(&old);
        let _ = std::fs::remove_dir_all(&new);
        std::fs::create_dir_all(old.join("sub")).unwrap();
        std::fs::write(old.join("a.txt"), b"a").unwrap();
        std::fs::write(old.join("sub").join("c.txt"), b"c").unwrap();

        // 系统目录语义：只迁出文件、不删目录（change_default_path 对受保护目录即走此分支）。
        mgr.migrate_dir(&old, &new, false).expect("migrate without remove");

        assert!(new.join("a.txt").exists());
        assert!(new.join("sub").join("c.txt").exists());
        assert!(old.exists(), "protected old dir must be kept");
        assert!(std::fs::read_dir(&old).unwrap().next().is_none(), "old dir must be emptied");

        let _ = std::fs::remove_dir_all(&old);
        let _ = std::fs::remove_dir_all(&new);
        let _ =
            std::fs::remove_file(std::env::temp_dir().join("adl-download-mgr-migrate-keep-dir.db"));
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
        mgr.update_settings(None, Some(custom_dir.to_string_lossy().to_string()), None)
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
    fn resolve_download_target_prefers_storage_override_over_heuristic() {
        let db = temp_db("target-override");
        let mgr = DownloadManager::new(db);
        let override_dir = std::env::temp_dir().join("adl-override-downloads");
        let _ = std::fs::create_dir_all(&override_dir);
        mgr.set_default_dir_override(Some(override_dir.clone()));

        let target = mgr.resolve_download_target("https://example.com/file.bin", "");
        let p = Path::new(&target);
        assert_eq!(p.file_name().unwrap().to_str().unwrap(), "file.bin");
        assert_eq!(p.parent().unwrap(), override_dir.as_path(), "must use storage override dir");

        // 用户显式配置仍优先于 storage override。
        mgr.update_settings(None, Some(override_dir.to_string_lossy().to_string()), None)
            .expect("update settings");
        mgr.set_default_dir_override(Some(std::env::temp_dir().join("adl-other-downloads")));
        let target = mgr.resolve_download_target("https://example.com/file.bin", "");
        assert_eq!(Path::new(&target).parent().unwrap(), override_dir.as_path());

        // 清除 override 后回退到启发式（不断言具体目录，只要求可用）。
        mgr.set_default_dir_override(None);
        let target = mgr.resolve_download_target("https://example.com/file.bin", "");
        assert!(Path::new(&target).is_absolute());

        let _ =
            std::fs::remove_file(std::env::temp_dir().join("adl-download-mgr-target-override.db"));
        let _ = std::fs::remove_dir_all(&override_dir);
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

    #[test]
    fn complete_download_syncs_bytes_to_actual_file_size() {
        // Regression: a fast transfer can reach the terminal state between two
        // progress polls, leaving the DB at 0 / a stale value while the on-disk
        // file is already complete ("0 B" / size mismatch in the UI). The final
        // bytes_received/total_bytes must reflect the real file size.
        let db = temp_db("complete-size");
        let mgr = DownloadManager::new(db.clone());
        let dir = std::env::temp_dir().join("adl-dl-size-sync");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create dir");

        let final_path = dir.join("artifact.bin");
        std::fs::write(&final_path, vec![0u8; 4096]).expect("write final file");

        let record = mgr
            .create_download("https://example.com/artifact.bin", final_path.to_str().unwrap(), None)
            .expect("create should succeed");

        mgr.complete_download(&record.id, true, None).expect("complete should succeed");

        let list = mgr.list_downloads().expect("list should succeed");
        assert_eq!(list[0].status, DownloadStatus::Completed);
        assert_eq!(list[0].bytes_received, 4096, "bytes_received must sync to actual on-disk size");
        assert_eq!(list[0].total_bytes, Some(4096), "total_bytes must sync to actual on-disk size");
        let _ = std::fs::remove_dir_all(&dir);
        let _ =
            std::fs::remove_file(std::env::temp_dir().join("adl-download-mgr-complete-size.db"));
    }

    #[test]
    fn cleanup_orphaned_tmp_files_removes_stale_and_keeps_others() {
        // WebView2 can leave `{GUID}.tmp` staging files in the destination folder
        // after a canceled/interrupted download. Cleanup must remove only stale
        // WebView2 `{GUID}.tmp` files (age >= grace) while never touching recent
        // staging files (age < grace, i.e. an in-progress download), arbitrary
        // `.tmp` files from other applications, or non-`.tmp` files.
        let dir = std::env::temp_dir().join("adl-dl-tmp-cleanup");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create dir");

        let recent = dir.join("{11111111-1111-1111-1111-111111111111}.tmp");
        let stale = dir.join("{22222222-2222-2222-2222-222222222222}.tmp");
        let other_tmp = dir.join("notes.tmp");
        let normal = dir.join("final.exe");
        std::fs::write(&recent, b"recent").expect("write recent");
        std::fs::write(&stale, b"stale").expect("write stale");
        std::fs::write(&other_tmp, b"other").expect("write other");
        std::fs::write(&normal, b"final").expect("write final");

        let file_path = dir.join("final.exe");

        // A freshly created `{GUID}.tmp` file (age ~0) is within a large grace
        // period and must be preserved.
        cleanup_orphaned_tmp_files(file_path.to_str().unwrap(), 3600);
        assert!(recent.exists(), "fresh WebView2 staging tmp must be kept when within grace");
        assert!(stale.exists(), "fresh WebView2 staging tmp must be kept when within grace");
        assert!(other_tmp.exists(), "arbitrary .tmp must never be removed");
        assert!(normal.exists(), "non-.tmp file must never be removed");

        // grace = 0: every `{GUID}.tmp` file is stale and must be removed, but
        // arbitrary `.tmp` and non-`.tmp` files are still untouched.
        cleanup_orphaned_tmp_files(file_path.to_str().unwrap(), 0);
        assert!(!recent.exists(), "stale WebView2 staging tmp must be removed when grace is 0");
        assert!(!stale.exists(), "stale WebView2 staging tmp must be removed when grace is 0");
        assert!(other_tmp.exists(), "arbitrary .tmp must never be removed");
        assert!(normal.exists(), "non-.tmp file must never be removed");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn is_webview2_staging_tmp_matches_only_guid_shape() {
        // Guard against H1 regression: the matcher must accept only WebView2's
        // `{8-4-4-4-12 hex}.tmp` staging shape (case-insensitive) and reject every
        // other naming form, so unrelated user `.tmp` files are never deleted.
        let accept = [
            "{11111111-1111-1111-1111-111111111111}.tmp",
            "{22222222-2222-2222-2222-222222222222}.TMP",
            "{abcdef12-3456-7890-abcd-ef1234567890}.tmp",
            "{ABCDEF12-3456-7890-ABCD-EF1234567890}.tmp",
        ];
        for name in accept {
            assert!(is_webview2_staging_tmp(name), "should accept {name}");
        }

        let reject = [
            "notes.tmp",
            "download.tmp",
            "{11111111-1111-1111-1111-111111111111}",
            "11111111-1111-1111-1111-111111111111.tmp",
            "{11111111-1111-1111-1111-11111111111}.tmp",
            "{11111111-1111-1111-1111-1111111111111}.tmp",
            "{gggggggg-1111-1111-1111-111111111111}.tmp",
            "{11111111-1111-1111-1111-11111111111g}.tmp",
            "{11111111-1111_1111-1111-111111111111}.tmp",
            "{11111111-1111-1111-1111-111111111111}.tmp.bak",
            "{11111111-1111-1111-1111-111111111111}.tmp ",
            "x{11111111-1111-1111-1111-111111111111}.tmp",
        ];
        for name in reject {
            assert!(!is_webview2_staging_tmp(name), "should reject {name}");
        }
    }
}
