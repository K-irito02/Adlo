use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter};
use tauri_plugin_dialog::DialogExt;

use super::download_manager::{DownloadManager, derive_file_name, get_default_download_path};

pub fn setup_download_handler(
    app_handle: AppHandle,
    download_manager: Arc<DownloadManager>,
    last_record_id: Arc<Mutex<Option<String>>>,
    is_silent: bool,
    source_tab_id: Option<String>,
) -> impl Fn(String, &mut PathBuf) -> bool + Send + Sync + 'static {
    let manager = download_manager;
    let handle = app_handle;

    move |url: String, destination: &mut PathBuf| {
        // Silent webviews (warmup/meta fetch): cancel ALL downloads unconditionally.
        // Matches Chrome/Edge behavior where background pages never auto-download.
        if is_silent {
            tracing::warn!(url = &url, "[ADL-DL] download_requested: CANCELLED (silent webview)");
            return false;
        }

        let suggested_path = destination.to_string_lossy().to_string();
        let settings = manager.get_settings();
        tracing::debug!(
            url = &url,
            suggested_path = &suggested_path,
            mode = settings.mode.as_str(),
            "[ADL-DL] download requested"
        );

        // Check if this URL is already being downloaded (prevent duplicates)
        if let Some(existing) = manager.get_record_by_url(&url) {
            match existing.status {
                super::download_types::DownloadStatus::InProgress => {
                    tracing::debug!(
                        url = &url,
                        existing_id = &existing.id,
                        "[ADL-DL] duplicate download detected, allowing WebView2 to handle"
                    );
                    // Still allow the download but don't create a new record.
                    // Point WebView2 at the same `.crdownload` temp file.
                    *destination = PathBuf::from(format!("{}.crdownload", existing.file_path));
                    return true;
                },
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
                },
                _ => {},
            }
        }

        // Resolve the absolute target first so we can both persist the record and
        // point WebView2 at a valid location (empty/relative destinations make
        // WebView2 silently drop binary/app downloads). Conflict resolution is
        // applied inside resolve_download_target.
        //
        // In Ask mode the user picks the save location through the native OS save
        // dialog; only Auto mode resolves the path to the configured default
        // directory automatically. A cancelled dialog denies the download.
        let final_path = if settings.mode == super::download_types::DownloadMode::Ask {
            let file_name = derive_file_name(&url, &suggested_path);
            let default_dir = if settings.default_path.is_empty() {
                get_default_download_path()
            } else {
                PathBuf::from(&settings.default_path)
            };
            // The dialog's initial directory must exist, otherwise Windows may
            // fall back to an arbitrary folder. Mirror the Auto branch's
            // create_dir_all so both modes behave identically.
            let _ = std::fs::create_dir_all(&default_dir);
            // NOTE: blocking_save_file intentionally blocks the WebView2
            // DownloadStarting callback (main thread) until the dialog closes,
            // freezing the app UI while the native save dialog is open. This
            // relies on the patched tauri-runtime-wry's send_user_message
            // running the dialog task inline on the main thread (no deadlock) —
            // keep this in mind before upgrading Tauri or switching runtimes.
            tracing::info!(
                url = &url,
                file_name = &file_name,
                default_dir = %default_dir.display(),
                "[ADL-DL] ask mode: showing native save dialog"
            );
            let picked = handle
                .dialog()
                .file()
                .set_file_name(file_name)
                .set_directory(&default_dir)
                .blocking_save_file();
            match picked {
                None => {
                    tracing::info!(
                        url = &url,
                        "[ADL-DL] ask mode: save dialog cancelled, download denied"
                    );
                    return false;
                },
                Some(fp) => match fp.into_path() {
                    Ok(p) => {
                        let picked_str = p.to_string_lossy().to_string();
                        tracing::info!(
                            url = &url,
                            picked_path = &picked_str,
                            "[ADL-DL] ask mode: user selected save path"
                        );
                        picked_str
                    },
                    Err(e) => {
                        tracing::warn!(
                            url = &url,
                            error = %e,
                            "[ADL-DL] ask mode: could not resolve picked path, download denied"
                        );
                        return false;
                    },
                },
            }
        } else {
            manager.resolve_download_target(&url, &suggested_path)
        };

        if let Err(reason) = manager.check_disk_space(&final_path) {
            tracing::warn!(
                url = &url,
                reason = &reason,
                "[ADL-DL] download denied: disk space check failed"
            );
            let _ = handle.emit(
                "browser-download-error",
                &serde_json::json!({
                    "id": "",
                    "url": url,
                    "reason": reason,
                    "canRetry": false,
                    "source_tab_id": source_tab_id,
                }),
            );
            return false;
        }

        // Point WebView2 at the Chrome/Edge-style `.crdownload` temp path (the
        // final name is only produced by an atomic rename in complete_download).
        // This guarantees a half-written download is never visible under its
        // final name, and a download still in flight at shutdown is only ever
        // cleaned up as a clearly-incomplete temp file.
        *destination = PathBuf::from(format!("{final_path}.crdownload"));

        match manager.create_download(&url, &final_path, source_tab_id.clone()) {
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
                tracing::warn!(
                    url = &url,
                    reason = &reason,
                    "[ADL-DL] download record creation failed"
                );
                let _ = handle.emit(
                    "browser-download-error",
                    &serde_json::json!({
                        "id": "",
                        "url": url,
                        "reason": reason,
                        "canRetry": false,
                        "source_tab_id": source_tab_id,
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
        "[ADL-DL] handle_download_finished: ENTRY"
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
            // No record usually means the download was denied before a record was
            // created — e.g. the user cancelled the native save dialog in Ask
            // mode, or a silent-webview metadata fetch was cancelled. WebView2
            // still fires DownloadCompleted(false) for those, and the capture
            // handler may have registered a now-dead operation handle that we
            // must drop. A record is always created before a transfer proceeds,
            // so "no record" implies no legitimate in-progress download for this
            // URL — removing the operation is safe. This also relies on
            // register_operation never overwriting an IN_PROGRESS handle: if a
            // dead operation ever replaced a live one for the same URL, this
            // cleanup could drop the live handle and break pause/resume/cancel.
            download_manager.remove_operation(url);
            if success {
                tracing::warn!(
                    url = url,
                    "[ADL-DL] no download record found for a successful finished URL (download completed but record is missing)"
                );
            } else {
                tracing::debug!(
                    url = url,
                    "[ADL-DL] no download record for finished URL (denied/cancelled download, expected)"
                );
            }
            return;
        },
    };

    // A download paused/canceled via the native WebView2 operation fires a
    // spurious `finished(success=false)` interrupt that must not overwrite the
    // user-initiated Paused/Canceled status, and its operation handle must be
    // preserved for a later Resume(). Two pause kinds trigger this spurious
    // event:
    //   * Range-capable pauses — native Pause() call (interrupt_reason="UserPaused")
    //   * non-Range pauses — native cancel() call (interrupt_reason="NonResumablePaused")
    // A cosmetic pause (interrupt_reason="CosmeticPaused", resumability not yet
    // probed) NEVER calls native Pause()/Cancel() — the transfer keeps running —
    // so its finished(false) is a REAL failure and must fall through to the
    // failure path below (otherwise the record is stuck as Paused and the
    // progress monitor thread leaks). The pause kind is read from the persisted
    // interrupt_reason (set at pause time), not re-derived from the mutable
    // resumability cache.
    let is_native_pseudo_pause = record.status == super::download_types::DownloadStatus::Paused
        && matches!(
            record.interrupt_reason.as_deref(),
            Some("UserPaused") | Some("NonResumablePaused")
        );
    if !success
        && (record.status == super::download_types::DownloadStatus::Canceled
            || is_native_pseudo_pause)
    {
        tracing::debug!(
            record_id = %record.id,
            status = record.status.as_str(),
            interrupt_reason = record.interrupt_reason.as_deref().unwrap_or("none"),
            "[ADL-DL] handle_download_finished: ignoring spurious finished(false) for a paused/canceled download (native interrupt)"
        );
        return;
    }

    // A download we already finalized (progress monitor marked it complete once
    // the file was byte-complete and stable) may still get a late
    // `finished(success=false)` from WebView2 — e.g. at webview teardown the op
    // that never reached Completed is interrupted. The download is already done
    // and the file renamed to its final path; don't flip it to failed.
    if !success && record.status == super::download_types::DownloadStatus::Completed {
        tracing::debug!(
            record_id = %record.id,
            "[ADL-DL] handle_download_finished: ignoring spurious finished(false) for an already-completed download (late native interrupt)"
        );
        return;
    }

    // Report the final (user-facing) path — WebView2 hands us the `.crdownload`
    // temp path, but complete_download renames it to record.file_path on success.
    let display_path = record.file_path.clone();

    // Post-resume failure detection (Option B): when a download fails within
    // 5 seconds of a native Resume() call, auto-retry via HTTP Range instead
    // of marking as failed. This catches the case where WebView2's Resume()
    // returns Ok(()) but the underlying connection is already broken (TCP
    // reset, proxy timeout, etc.) — WebView2 only discovers the failure when
    // it tries to read the next data chunk.
    if !success
        && record.status == super::download_types::DownloadStatus::InProgress
        && download_manager.was_recently_resumed(&record.id, 5)
    {
        tracing::info!(
            record_id = %record.id,
            url = %url,
            bytes_received = record.bytes_received,
            "[ADL-DL] handle_download_finished: POST-RESUME FAILURE DETECTED — Resume() succeeded but download failed within 5s, auto-retrying via HTTP Range"
        );
        // trigger_range_resume drops the dead native operation handle itself and
        // spawns a reqwest-based retry thread. Only on failure to even start
        // (e.g. .crdownload unreadable, thread spawn error) do we fall through
        // to the normal failure path.
        if let Err(e) = download_manager.trigger_range_resume(&record.id, record, app_handle) {
            tracing::error!(
                record_id = %record.id,
                error = %e,
                "[ADL-DL] handle_download_finished: failed to trigger auto-retry, falling through to normal failure"
            );
            // trigger_range_resume removes the dead native operation handle
            // before it can return Err, so there is nothing left to clean here.
            // Fall through to normal failure handling.
            let _ = download_manager.complete_download(
                &record.id,
                false,
                Some("PostResumeRetryFailed"),
            );
            let _ = app_handle.emit(
                "browser-download-finished",
                &serde_json::json!({
                    "id": record.id,
                    "url": url,
                    "filePath": display_path,
                    "success": false,
                    "source_tab_id": record.source_tab_id,
                }),
            );
        }
        return;
    }

    // The progress monitor may have already finalized this download (byte-truth
    // completion). A late `finished(success=true)` is then a duplicate — just
    // release the operation handle instead of re-emitting another finish event.
    if success && record.status == super::download_types::DownloadStatus::Completed {
        download_manager.remove_operation(url);
        tracing::debug!(
            record_id = %record.id,
            "[ADL-DL] handle_download_finished: already completed, skipping duplicate finish"
        );
        return;
    }

    // The reverse case: a paused/canceled download receiving finished(success=true)
    // means the native transfer actually completed at the byte level (e.g. the user
    // clicked pause just as the final bytes arrived, so Pause() couldn't undo an
    // already-finished transfer). Before flipping the record to completed, verify
    // the native operation really reached the completed state — otherwise we would
    // clobber the user-initiated Paused/Canceled status with a wrong "completed".
    if success
        && (record.status == super::download_types::DownloadStatus::Paused
            || record.status == super::download_types::DownloadStatus::Canceled)
    {
        match download_manager.native_operation_state(url) {
            super::download_manager::NativeDownloadState::Completed => {
                tracing::info!(
                    record_id = %record.id,
                    status = record.status.as_str(),
                    "[ADL-DL] handle_download_finished: paused/canceled download truly completed (native state=completed); flipping to completed"
                );
                // Fall through to the normal completion path below.
            },
            state => {
                tracing::info!(
                    record_id = %record.id,
                    status = record.status.as_str(),
                    native_state = ?state,
                    "[ADL-DL] handle_download_finished: received finished(true) for a paused/canceled download but native operation is NOT completed; keeping user intent (paused/canceled)"
                );
                return;
            },
        }
    }

    // Drop the native operation handle now that the download has truly ended.
    download_manager.remove_operation(url);

    if success {
        // If finalization (rename .crdownload → final, or the terminal-state DB
        // write) fails — e.g. a transient file lock or storage error — do NOT
        // report success: the record stays in_progress and the progress monitor
        // retries the rename on its next poll.
        if let Err(e) = download_manager.complete_download(&record.id, true, None) {
            tracing::warn!(
                record_id = &record.id,
                error = %e,
                "[ADL-DL] download finalization failed (rename or DB write); progress monitor will retry"
            );
            return;
        }
        tracing::debug!(record_id = &record.id, "[ADL-DL] download completed successfully");
        let _ = app_handle.emit(
            "browser-download-finished",
            &serde_json::json!({
                "id": record.id,
                "url": url,
                "filePath": display_path,
                "success": true,
                "source_tab_id": record.source_tab_id,
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
                "filePath": display_path,
                "success": false,
                "source_tab_id": record.source_tab_id,
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
        assert_eq!(settings.mode, DownloadMode::Ask);
        let _ =
            std::fs::remove_file(std::env::temp_dir().join("adl-download-handler-manager-arc.db"));
    }
}
