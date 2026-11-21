//! WebView2 platform setup helpers for the browser commands.
//!
//! Contains the new-window handler, webview builder factory, theme
//! application logic, and BrowserManager registration. These functions
//! are specific to Tauri's webview integration (as opposed to the
//! cross-platform `adl_browser` crate) and are used only by
//! `browser_create_for_tab`.

use std::collections::HashSet;
use std::sync::Arc;

use crate::state::AppState;
use crate::tauri_webview_handle::TauriWebViewHandle;
use adl_browser::download_handler::{handle_download_finished, setup_download_handler};
use adl_browser::download_manager::DownloadManager;
use adl_browser::webview_handle::{EventBridgeRef, WebViewHandle};
use adl_errors::AppError;
use tauri::{Emitter, Manager};

/// WebView2 environment options shared by every webview in the app.
///
/// WebView2 allows only ONE environment per user data directory; creating a
/// second one with different options fails with `HRESULT 0x8007139F`. The main
/// window (configured in `tauri.conf.json`), panel webviews and the divider
/// strip all share the default UDF, so they must pass the exact same string.
/// It must also include wry's own defaults (`--disable-features=...`), because
/// wry uses this string verbatim instead of appending to them.
///
/// Keep in sync with `app.windows[0].additionalBrowserArgs` in `tauri.conf.json`.
///
/// `--allow-file-access-from-files` is intentional: local HTML opened from the
/// address bar must be able to read sibling local resources (`fetch`/module
/// scripts) per the "trusted local document" product decision. The flag also
/// applies to remote pages, but Chromium still forbids non-file origins from
/// reading `file:` URLs, so the exposure is limited to user-opened local files.
///
/// `MediaSessionService` is disabled on purpose (事项 17 路线 A): Chromium's own
/// media session is attributed to `msedgewebview2.exe`, so the Windows media card
/// always showed「未知应用」+ no icon, and no host AUMID could change it. The host
/// now owns the SMTC session (`src-tauri/src/commands/media_session.rs`); browser
/// tabs mirror their site media into it through `init_script.js`
/// (`{type:'adl-media'}`) so tabs still reach the card.
pub(crate) const WEBVIEW_ADDITIONAL_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,MediaSessionService --allow-file-access-from-files";

/// Download-URL heuristics shared across the stack. This extension list must be
/// kept in sync with `crates/browser/src/init_script.js` (JS `isDownloadUrl`) and
/// `frontend/src/app/utils/downloadUrl.ts` (TS `isDownloadUrl`).
static DOWNLOAD_EXTENSIONS: &[&str] = &[
    "exe", "msi", "dmg", "pkg", "deb", "rpm", "zip", "rar", "7z", "tar", "gz", "bz2", "xz", "pdf",
    "apk", "ipa", "iso", "img", "cab", "msix", "appx", "bat", "cmd", "ps1", "scr", "com", "pif",
    "vbs", "wsf", "hta", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "rtf", "odt", "ods",
    "odp", "key", "mp3", "mp4", "avi", "mkv", "mov", "wmv", "flv", "webm", "ogg", "wav", "flac",
    "aac", "wma", "ttf", "otf", "woff", "woff2", "eot", "svg",
];

/// Consecutive polls (~500ms each) a byte-complete file must stay at full size
/// before the monitor finalizes it when the native op hasn't reported Completed.
/// Guards against finalizing while the engine is still flushing the tail bytes.
const FULL_SIZE_STABLE_POLLS: u32 = 2;

fn is_download_url(url: &url::Url) -> bool {
    let path = url.path().to_lowercase();
    for ext in DOWNLOAD_EXTENSIONS {
        // Allocation-free `.ext` suffix check: the byte before the extension must be `.`.
        if path.len() > ext.len() + 1
            && path.as_bytes()[path.len() - ext.len() - 1] == b'.'
            && path.ends_with(ext)
        {
            tracing::trace!(url = %url, ext = ext, "[ADL-DL] is_download_url: matched extension");
            return true;
        }
    }
    let query = url.query().unwrap_or("").to_lowercase();
    // Aligned with JS/TS (init_script.js & downloadUrl.ts): `download` must be a
    // standalone query key, matched case-insensitively across all standalone keys,
    // not a `.has(name)` lookup (which is case-sensitive) nor a substring inside
    // another value (e.g. `?redirect=..?download=1`).
    // Known boundary: JS/TS `URLSearchParams` split on both `&` and `;`, Rust
    // `query_pairs()` splits on `&` only — `?a=1;download=1` diverges. Extremely
    // rare in practice; recorded, not a blocker.
    if url.query_pairs().any(|(k, _)| k.eq_ignore_ascii_case("download")) {
        tracing::trace!(url = %url, "[ADL-DL] is_download_url: matched query key download");
        return true;
    }
    if path.contains("/download/") {
        tracing::trace!(url = %url, "[ADL-DL] is_download_url: matched /download/ path");
        return true;
    }
    // Additional patterns: common server-side download paths without file extensions
    for pattern in &["/files/", "/attachments/", "/get/", "/export/", "/generate/"] {
        if path.contains(pattern) {
            tracing::trace!(url = %url, pattern = pattern, "[ADL-DL] is_download_url: matched path pattern");
            return true;
        }
    }
    // Query params that indicate a download, combined with download-related path keywords
    if (query.contains("file=") || query.contains("attachment="))
        && (path.contains("download") || path.contains("files") || path.contains("export"))
    {
        tracing::trace!(url = %url, "[ADL-DL] is_download_url: matched file/attachment query with download path");
        return true;
    }
    tracing::trace!(url = %url, "[ADL-DL] is_download_url: no match");
    false
}

/// Decide whether a new-window request (`target="_blank"` / `window.open`)
/// should be routed to a brand-new browser tab. Returns the resolved URL to
/// open, or `None` for non-http(s) schemes that must stay blocked.
fn new_window_target(url: &url::Url) -> Option<String> {
    if url.scheme() == "http" || url.scheme() == "https" {
        adl_browser::resolve_url(url.as_str()).ok().map(|u| u.to_string())
    } else {
        None
    }
}

fn new_window_handler(
    app: &tauri::AppHandle,
    url: &url::Url,
    _download_manager: &DownloadManager,
) -> tauri::webview::NewWindowResponse<tauri::Wry> {
    tracing::info!(
        url = %url,
        scheme = url.scheme(),
        host = url.host_str().unwrap_or(""),
        path = url.path(),
        "[ADL-DL] new_window_handler: ENTER"
    );

    // Download URLs: open a new tab (matching Chrome/Edge behavior), then
    // delegate the actual download to on_download. The frontend will auto-close
    // the new tab once DownloadStarting fires.
    if is_download_url(url) {
        if let Some(target) = new_window_target(url) {
            tracing::info!(
                url = %url,
                target = %target,
                "[ADL-DL] new_window_handler: download URL → opening new tab for download"
            );
            let _ = app
                .emit("digital-life://browser-open-new-tab", serde_json::json!({ "url": target }));
        } else {
            tracing::info!(
                url = %url,
                "[ADL-DL] new_window_handler: download URL with non-http(s) scheme, denying"
            );
        }
        return tauri::webview::NewWindowResponse::Deny;
    }

    if let Some(target) = new_window_target(url) {
        tracing::info!(target, "new_window_handler: emitting browser-open-new-tab");
        let _ =
            app.emit("digital-life://browser-open-new-tab", serde_json::json!({ "url": target }));
    } else {
        tracing::info!(url = %url, "[ADL-DL] new_window_handler: non-http(s) scheme, denying");
    }
    tracing::info!(url = %url, "[ADL-DL] new_window_handler: DENY");
    tauri::webview::NewWindowResponse::Deny
}

pub(super) fn resolve_window_and_url(
    app: &tauri::AppHandle,
    url: &str,
) -> Result<(tauri::Window<tauri::Wry>, url::Url), AppError> {
    let window =
        app.get_window("main").ok_or_else(|| AppError::Internal("main window not found".into()))?;
    let target = adl_browser::resolve_url(url)
        .map_err(|e| AppError::Internal(format!("failed to resolve URL: {e}")))?;
    Ok((window, target))
}

/// WebView2 用户数据目录（UDF）分组：把“会互相闪主题”的 WebView 放进不同会话隔离。
///
/// 背景：`CoreWebView2Profile.PreferredColorScheme` 在同一 UDF 会话内实际是全局的
/// （WebView2Feedback #4920：同一 UDF 下即使 ProfileName 不同，新建控制器也会把其它
/// 窗口的主题一起改掉）。仅换 ProfileName 不可靠，必须按 UDF/会话隔离。
///
/// - `panel`（默认/`None`）：沿用 Tauri 默认 UDF，保留现有浏览会话/登录态，不做迁移。
/// - `center`：中心宿主全部 WebView 使用独立 UDF，与面板彻底隔离。
/// - `silent`：后台取标题/favicon 的不可见 WebView 使用独立 UDF，避免后台创建反过来
///   闪到可见组。
///
/// 代价（用户可感知，见事项 5）：独立 UDF = 独立空 profile（cookie/localStorage/缓存/
/// 登录态与默认 UDF 不共享）。升级后中心标签需重新登录一次；磁盘常驻多份 WebView2
/// 用户数据（默认 + center + silent）。主界面 WebView 留在默认 UDF（与面板同组），
/// 不新增第 4 个环境。
pub(super) fn data_subdir_for_location(location: Option<&str>) -> Option<&'static str> {
    match location {
        Some("center") => Some("center"),
        Some("silent") => Some("silent"),
        _ => None,
    }
}

/// 由分组名解析出完整的 `data_directory`（`None` = 沿用 Tauri 默认 UDF）。
/// 目录不存在时由 Tauri 在创建 WebView 时自动建立。
pub(super) fn webview_data_directory(
    app: &tauri::AppHandle,
    location: Option<&str>,
) -> Option<std::path::PathBuf> {
    let sub = match data_subdir_for_location(location) {
        Some(sub) => sub,
        None => {
            // 未知 location 与面板显式缺省都会落到这里；未知值打 warn，
            // 面板（None/"panel"）静默——沿用默认 UDF 是其既定语义。
            if !matches!(location, None | Some("panel")) {
                tracing::warn!(location = ?location, "unknown browser location; using default UDF (shares panel session)");
            }
            return None;
        },
    };
    match app.path().app_data_dir() {
        Ok(base) => Some(base.join("webview").join(sub)),
        Err(e) => {
            // 失败即 fail-open 回默认 UDF（与面板同会话，跨宿主闪主题可能复发），
            // 必须留痕，否则静默复发无从排查。
            tracing::warn!(error = %e, location = ?location, "app_data_dir unavailable; using default UDF (shares panel session)");
            None
        },
    }
}

#[allow(clippy::too_many_arguments)] // WebView builder assembles all per-tab creation options.
pub(super) fn build_webview_builder(
    label: &str,
    tab_id: &str,
    target: url::Url,
    app_handle: tauri::AppHandle,
    color_scheme: &str,
    is_silent: bool,
    agent_origins: &[String],
    agent_intercept_enabled: bool,
    agent_site_rules: &[adl_types::AgentSiteRule],
    agent_site_overrides: &[adl_types::AgentSiteOverride],
) -> tauri::webview::WebviewBuilder<tauri::Wry> {
    let app_nav = app_handle.clone();
    let tab_id_owned = tab_id.to_string();
    let init_script = adl_browser::init_script_with_background_and_agent(
        color_scheme,
        agent_origins,
        agent_intercept_enabled,
        agent_site_rules,
        agent_site_overrides,
    );
    let (r, g, b) = adl_browser::theme_to_rgb(color_scheme);
    tracing::debug!(color_scheme, "build_webview_builder: generated init_script with background");

    let download_manager = app_handle.state::<AppState>().download_manager.clone();
    let last_record_id: std::sync::Arc<std::sync::Mutex<Option<String>>> =
        std::sync::Arc::new(std::sync::Mutex::new(None));
    let requested_handler = setup_download_handler(
        app_handle.clone(),
        download_manager.clone(),
        last_record_id.clone(),
        is_silent,
        Some(tab_id.to_string()),
    );
    let app_download = app_handle.clone();
    let dm_for_monitor = download_manager.clone();
    let last_id_for_monitor = last_record_id.clone();

    tauri::webview::WebviewBuilder::new(label, tauri::WebviewUrl::External(target))
        // 在 builder 上声明主题背景色：wry 会在创建期用它初始化控制器默认背景（其官方
        // 消除 WebView2 首帧白闪的机制），避免创建新子 WebView 时共享合成面短暂露出默认色。
        .background_color(tauri::utils::config::Color(r, g, b, 255))
        .initialization_script(init_script)
        .additional_browser_args(WEBVIEW_ADDITIONAL_ARGS)
        .on_navigation(move |url| {
            // Skip about:blank — used as the initial URL during WebView creation
            // to allow background color and CDP color scheme to be applied before
            // the real page's first paint. See browser_create_for_tab.
            if url.as_str().starts_with("about:blank") {
                tracing::debug!(raw_url = %url.as_str(), "on_navigation: skipped about:blank");
                return true;
            }
            tracing::debug!(raw_url = %url.as_str(), "on_navigation: ENTER");
            adl_browser::navigation_handler(url, &|normalized| {
                tracing::debug!(normalized_url = %normalized, "on_navigation: emitting browser-url-changed");
                let _ = app_nav.emit(
                    "digital-life://browser-url-changed",
                    serde_json::json!({ "tabId": tab_id_owned, "url": normalized }),
                );
            })
        })
        .on_new_window({
            let dm_for_window = download_manager.clone();
            move |url, _window_features| {
                new_window_handler(&app_handle, &url, &dm_for_window)
            }
        })
        .on_download(move |_webview, event| {
            match event {
                tauri::webview::DownloadEvent::Requested { url, destination } => {
                    tracing::info!(
                        url = %url,
                        destination = %destination.display(),
                        "[ADL-DL] on_download: Requested"
                    );
                    let allowed = requested_handler(url.to_string(), destination);
                    tracing::info!(
                        url = %url,
                        allowed,
                        resolved_destination = %destination.display(),
                        "[ADL-DL] on_download: Requested handler decision"
                    );

                    // Start progress monitor if download was allowed
                    if allowed {
                        // Get the record ID that was just stored by the handler
                        let record_id = last_id_for_monitor
                            .lock()
                            .ok()
                            .and_then(|mut guard| guard.take())
                            .unwrap_or_default();

                        let file_path = destination.to_string_lossy().to_string();
                        tracing::info!(
                            record_id = %record_id,
                            file_path = %file_path,
                            "[ADL-DL] starting progress monitor"
                        );
                        start_download_progress_monitor(
                            app_download.clone(),
                            dm_for_monitor.clone(),
                            record_id,
                            file_path,
                        );
                    }

                    allowed
                }
                tauri::webview::DownloadEvent::Finished { url, path, success } => {
                    tracing::info!(
                        url = %url,
                        success,
                        path = path.as_ref().map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
                        "[ADL-DL] on_download: Finished"
                    );
                    handle_download_finished(
                        &app_download,
                        &download_manager,
                        url.as_str(),
                        path.as_deref(),
                        success,
                    );
                    true
                }
                _ => {
                    tracing::debug!("[ADL-DL] on_download: unhandled event variant");
                    true
                }
            }
        })
}

/// Start a background task that monitors download progress by checking file sizes.
/// This is called when a download starts and runs until the download completes.
pub fn start_download_progress_monitor(
    app_handle: tauri::AppHandle,
    download_manager: Arc<adl_browser::download_manager::DownloadManager>,
    record_id: String,
    file_path: String,
) {
    std::thread::spawn(move || {
        let path = std::path::Path::new(&file_path);
        let mut last_bytes = 0u64;
        let mut last_time = std::time::Instant::now();
        let mut total_bytes_resolved: Option<u64> = None;
        let mut head_attempted = false;

        // Create a reusable HTTP client for HEAD requests (M1: avoid per-invocation allocation)
        let head_client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()
            .ok();

        tracing::debug!(record_id = %record_id, file_path = %file_path, "[ADL-DL] progress monitor started");

        // Wait a moment for the download to start and file to be created
        std::thread::sleep(std::time::Duration::from_millis(1000));

        // Probe whether the server supports HTTP Range requests (needed for the
        // native Pause() to actually hold). Cache it on the manager so the
        // pause command can decide without a blocking network call.
        let record_url = download_manager
            .list_downloads()
            .ok()
            .and_then(|r| r.into_iter().find(|d| d.id == record_id))
            .map(|d| d.url)
            .unwrap_or_default();
        if let (Some(client), Ok(url)) = (&head_client, url::Url::parse(&record_url)) {
            if let Some(resumable) = check_server_resumable(client, &url) {
                download_manager.set_resumability(url.as_str(), resumable);
                tracing::debug!(
                    record_id = %record_id,
                    resumable,
                    url = url.as_str(),
                    "[ADL-DL] progress monitor: probed server resumability"
                );
            }
        }

        let mut paused_idle_logged = false;
        let mut cosmetic_pause_logged = false;
        let mut non_resumable_paused_logged = false;
        let mut was_non_resumable_paused: HashSet<String> = HashSet::new();
        // Tracks the last logged resume-state signature so the 500ms polling loop
        // only logs when the state actually changes (avoiding ~2 lines/sec/download
        // of identical noise in the debug log).
        let mut last_resume_state_logged: Option<String> = None;
        // Consecutive polls where the file stayed at full size (byte-complete but
        // the native op hasn't reported Completed — e.g. a pause on a
        // non-resumable download). Two polls (~1s) of an UNCHANGED full-size file
        // confirm the transfer has finished writing all bytes, so we can finalize
        // regardless of the op. Comparing adjacent sizes guards against finalizing
        // a download that is still growing (underestimated Content-Length).
        let mut full_size_stable_polls: u32 = 0;
        let mut last_full_size: u64 = 0;
        loop {
            std::thread::sleep(std::time::Duration::from_millis(500));

            // Find the record - try by ID first, then by file path
            let record = if !record_id.is_empty() {
                download_manager
                    .list_downloads()
                    .ok()
                    .and_then(|r| r.into_iter().find(|d| d.id == record_id))
            } else {
                // Fallback: find by file path. `file_path` is the `.crdownload`
                // temp path WebView2 writes to; the record stores the final path,
                // so strip the Chrome/Edge-style suffix before matching.
                let final_lookup = file_path.strip_suffix(".crdownload").unwrap_or(&file_path);
                download_manager.list_downloads().ok().and_then(|r| {
                    r.into_iter().find(|d| {
                        d.file_path == final_lookup
                            && d.status == adl_browser::download_types::DownloadStatus::InProgress
                    })
                })
            };

            let record = match record {
                Some(r) => r,
                None => {
                    tracing::trace!(file_path = %file_path, "[ADL-DL] progress monitor: record not found, retrying");
                    continue;
                },
            };

            // A cosmetic pause: the download's server doesn't support Range, so
            // pause_download skipped the native Pause() and the transfer is still
            // running. Keep polling so byte-completion is detected and finalized
            // (instead of idling forever on a paused-but-growing download). The
            // pause kind is the persisted interrupt_reason (set at pause time),
            // not re-derived from the mutable resumability cache.
            let cosmetic_pause = record.status
                == adl_browser::download_types::DownloadStatus::Paused
                && record.interrupt_reason.as_deref() == Some("CosmeticPaused");

            // A NonResumablePaused download was paused by canceling the native
            // WebView2 operation and deleting the temp file. The user can resume
            // it, which triggers a fresh reqwest download from offset 0. Keep the
            // monitor alive so it can detect the transition to InProgress and
            // spawn the new download thread.
            let non_resumable_paused = record.status
                == adl_browser::download_types::DownloadStatus::Paused
                && record.interrupt_reason.as_deref() == Some("NonResumablePaused");

            if non_resumable_paused {
                was_non_resumable_paused.insert(record.id.clone());
            }

            // Log resume state evaluation only when the state signature changes
            // (status + interrupt_reason). The 500ms loop would otherwise emit
            // ~2 identical lines/sec/download, drowning real logs; bytes_received
            // is intentionally excluded because it changes every poll for an
            // active download, which would defeat the dedup. The pause-kind flags
            // (cosmetic_pause / non_resumable_paused) are derivable from status +
            // interrupt_reason, so they too add nothing to the signature.
            let state_signature = format!(
                "{}|{}",
                record.status.as_str(),
                record.interrupt_reason.as_deref().unwrap_or("none")
            );
            if last_resume_state_logged.as_deref() != Some(&state_signature) {
                tracing::debug!(
                    record_id = %record.id,
                    status = record.status.as_str(),
                    interrupt_reason = record.interrupt_reason.as_deref().unwrap_or("none"),
                    bytes_received = record.bytes_received,
                    cosmetic_pause,
                    non_resumable_paused,
                    "[ADL-DL] progress monitor: evaluating resume state — status={}, interrupt_reason={}, bytes_received={}, cosmetic_pause={}, non_resumable_paused={}",
                    record.status.as_str(),
                    record.interrupt_reason.as_deref().unwrap_or("none"),
                    record.bytes_received,
                    cosmetic_pause,
                    non_resumable_paused
                );
                last_resume_state_logged = Some(state_signature);
            }

            // Otherwise, keep the monitor alive while paused: the native WebView2
            // download is actually paused (pause_download calls
            // DownloadOperation.Pause()), so the file size stays put. Idle here
            // (without emitting progress) and resume reporting once the user
            // resumes.
            if record.status == adl_browser::download_types::DownloadStatus::Paused
                && !cosmetic_pause
                && !non_resumable_paused
            {
                if !paused_idle_logged {
                    tracing::info!(
                        record_id = %record.id,
                        "[ADL-DL] progress monitor: download PAUSED, idling until resumed (native engine is paused)"
                    );
                    paused_idle_logged = true;
                }
                continue;
            }

            if cosmetic_pause && !cosmetic_pause_logged {
                tracing::info!(
                    record_id = %record.id,
                    "[ADL-DL] progress monitor: non-resumable download PAUSED (cosmetic), transfer continues — polling until completion"
                );
                cosmetic_pause_logged = true;
            }

            if non_resumable_paused && !non_resumable_paused_logged {
                tracing::info!(
                    record_id = %record.id,
                    "[ADL-DL] progress monitor: non-resumable download PAUSED (NonResumablePaused), waiting for user resume"
                );
                non_resumable_paused_logged = true;
            }

            // Detect resume from NonResumablePaused: the download was just
            // resumed (status=InProgress, interrupt_reason=NULL,
            // bytes_received=0). Spawn a fresh reqwest download from offset 0.
            if record.status == adl_browser::download_types::DownloadStatus::InProgress
                && record.interrupt_reason.is_none()
                && record.bytes_received == 0
                && was_non_resumable_paused.remove(&record.id)
            {
                tracing::info!(
                    record_id = %record.id,
                    url = %record.url,
                    file_path = %record.file_path,
                    "[ADL-DL] progress monitor: NonResumablePaused resumed — spawning fresh reqwest download from offset 0"
                );

                // Delegate to the manager's shared restart helper, which claims
                // the in-flight slot (so `resume_download` and this monitor can
                // race without spawning two threads) and uses the Builder +
                // truly_complete pattern. The monitor path is a redundant safety
                // net for resumes the user performs directly; resume_download
                // also spawns directly so a fast pause→resume (< one poll) is
                // still covered.
                let _ = download_manager.spawn_non_resumable_restart(
                    &record,
                    &app_handle,
                    total_bytes_resolved,
                );
            }

            // Stop only on terminal states (completed / failed / canceled).
            // A cosmetic pause is not terminal — the transfer is still running.
            // NonResumablePaused is handled above (resume spawns a new thread).
            if record.status != adl_browser::download_types::DownloadStatus::InProgress
                && !cosmetic_pause
                && !non_resumable_paused
            {
                tracing::debug!(
                    record_id = %record.id,
                    status = record.status.as_str(),
                    "[ADL-DL] progress monitor: download no longer in progress (status={}), stopping",
                    record.status.as_str()
                );
                break;
            }

            paused_idle_logged = false;

            // Resolve total_bytes via HTTP HEAD if not yet known (M3: only attempt once)
            if total_bytes_resolved.is_none() && record.total_bytes.is_none() && !head_attempted {
                head_attempted = true;
                if let (Some(client), Ok(url)) = (&head_client, url::Url::parse(&record.url)) {
                    match fetch_content_length(client, &url) {
                        Some(len) if len > 0 => {
                            // M4: only persist if DB write succeeds
                            match download_manager.update_total_bytes(&record.id, len) {
                                Ok(()) => {
                                    tracing::debug!(
                                        record_id = %record.id,
                                        total_bytes = len,
                                        "[ADL-DL] progress monitor: resolved total_bytes via HEAD"
                                    );
                                    total_bytes_resolved = Some(len);
                                },
                                Err(e) => {
                                    tracing::warn!(
                                        record_id = %record.id,
                                        error = %e,
                                        "[ADL-DL] progress monitor: failed to persist total_bytes"
                                    );
                                },
                            }
                        },
                        _ => {
                            tracing::trace!(
                                record_id = %record.id,
                                "[ADL-DL] progress monitor: could not resolve total_bytes via HEAD"
                            );
                        },
                    }
                }
            }
            if total_bytes_resolved.is_none() {
                total_bytes_resolved = record.total_bytes;
            }

            // Get current file size
            let current_bytes = if path.exists() {
                std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
            } else {
                0
            };

            // Calculate speed
            let elapsed = last_time.elapsed().as_secs_f64();
            let speed = if elapsed > 0.0 {
                ((current_bytes.saturating_sub(last_bytes)) as f64 / elapsed) as u64
            } else {
                0
            };

            last_bytes = current_bytes;
            last_time = std::time::Instant::now();

            // Emit progress event
            let _ = app_handle.emit(
                "browser-download-progress",
                &serde_json::json!({
                    "id": record.id,
                    "bytes_received": current_bytes,
                    "total_bytes": total_bytes_resolved.or(record.total_bytes),
                    "speed": speed,
                }),
            );

            // Update progress in manager
            let _ = download_manager.update_progress(&record.id, current_bytes, speed);

            tracing::trace!(
                record_id = %record.id,
                bytes_received = current_bytes,
                total_bytes = total_bytes_resolved.unwrap_or(0),
                speed = speed,
                "[ADL-DL] progress update emitted"
            );

            // Check if download is complete (file size >= total bytes). The
            // record was fetched at loop-top and any terminal status (including
            // WRY-completed) already broke the loop, so `record.status` is
            // InProgress or a cosmetic pause here — no need to re-query it.
            if let Some(total) = total_bytes_resolved {
                if current_bytes >= total && total > 0 {
                    // Fast path: the native operation already reached COMPLETED.
                    // Finalize immediately (no stability wait needed).
                    let native_state = download_manager.native_operation_state(&record.url);
                    if native_state == adl_browser::download_manager::NativeDownloadState::Completed
                    {
                        tracing::debug!(
                            record_id = %record.id,
                            bytes_received = current_bytes,
                            total_bytes = total,
                            "[ADL-DL] progress monitor: native operation COMPLETED, emitting finish event"
                        );

                        // Mark as completed in DB (complete_download renames the
                        // `.crdownload` temp to the final path). On failure
                        // (transient rename/lock) do NOT report success — retry on
                        // the next poll instead of leaving a false "completed".
                        if let Err(e) = download_manager.complete_download(&record.id, true, None) {
                            tracing::warn!(
                                record_id = %record.id,
                                error = %e,
                                "[ADL-DL] progress monitor: finalization failed (rename), will retry"
                            );
                            continue;
                        }

                        // Emit finish event to frontend
                        let _ = app_handle.emit(
                            "browser-download-finished",
                            &serde_json::json!({
                                "id": record.id,
                                "url": record.url,
                                "success": true,
                                "filePath": file_path.strip_suffix(".crdownload").unwrap_or(&file_path),
                                "source_tab_id": record.source_tab_id,
                            }),
                        );

                        break;
                    }

                    // The native op has NOT reached Completed yet. This is normal
                    // while the engine finalizes the last bytes, but it also
                    // happens permanently for downloads whose Pause() corrupted
                    // the op (e.g. a non-resumable server): every byte is on disk
                    // but the op never reports Completed. With the
                    // Chrome/Edge-style `.crdownload` design, a full-size file is
                    // genuinely complete — once it has stayed at the SAME full
                    // size across a couple of polls the transfer has finished
                    // writing, so we finalize (rename to the final path + mark
                    // complete), which also claims the file out of WebView2's
                    // cleanup path. The adjacent-size comparison prevents
                    // finalizing a download that is still growing (e.g. an
                    // underestimated Content-Length).
                    if current_bytes == last_full_size {
                        full_size_stable_polls += 1;
                    } else {
                        last_full_size = current_bytes;
                        full_size_stable_polls = 1;
                    }
                    if full_size_stable_polls >= FULL_SIZE_STABLE_POLLS {
                        tracing::info!(
                            record_id = %record.id,
                            native_state = ?native_state,
                            bytes_received = current_bytes,
                            total_bytes = total,
                            "[ADL-DL] progress monitor: file byte-complete and stable, finalizing download"
                        );

                        // Mark as completed in DB (renames `.crdownload` → final).
                        // On failure (transient rename/lock) do NOT report success
                        // — retry on the next poll instead of leaving a false
                        // "completed".
                        if let Err(e) = download_manager.complete_download(&record.id, true, None) {
                            tracing::warn!(
                                record_id = %record.id,
                                error = %e,
                                "[ADL-DL] progress monitor: finalization failed (rename), will retry"
                            );
                            continue;
                        }

                        // Emit finish event to frontend
                        let _ = app_handle.emit(
                            "browser-download-finished",
                            &serde_json::json!({
                                "id": record.id,
                                "url": record.url,
                                "success": true,
                                "filePath": file_path.strip_suffix(".crdownload").unwrap_or(&file_path),
                                "source_tab_id": record.source_tab_id,
                            }),
                        );

                        break;
                    }

                    tracing::trace!(
                        record_id = %record.id,
                        native_state = ?native_state,
                        bytes_received = current_bytes,
                        total_bytes = total,
                        full_size_stable_polls,
                        "[ADL-DL] progress monitor: file size matches total but not yet stable, waiting"
                    );
                    continue;
                }
            }
            full_size_stable_polls = 0;
            last_full_size = 0;
        }

        tracing::debug!(record_id = %record_id, "[ADL-DL] progress monitor stopped");
    });
}

/// Probe whether the server supports HTTP Range requests (needed for WebView2's
/// native Pause() to actually hold). Trusts either an explicit
/// `Accept-Ranges: bytes` header or a `206 Partial Content` reply to a
/// HEAD+Range probe — some Range-supporting CDNs (e.g. Tencent video) omit
/// `Accept-Ranges` on HEAD. Anything else is treated as non-resumable
/// (conservative — a cosmetic pause is harmless, but calling native Pause() on
/// a non-resumable download corrupts the operation and loses the file at
/// shutdown).
fn check_server_resumable(client: &reqwest::blocking::Client, url: &url::Url) -> Option<bool> {
    tracing::info!(
        url = %url,
        "[ADL-DL] check_server_resumable: probing server Range support..."
    );
    let resp = client.head(url.as_str()).header(reqwest::header::RANGE, "bytes=0-0").send().ok()?;
    let status = resp.status();
    let has_content_range = resp.headers().get(reqwest::header::CONTENT_RANGE).is_some();
    let accept_ranges = resp
        .headers()
        .get(reqwest::header::ACCEPT_RANGES)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_ascii_lowercase());

    tracing::info!(
        url = %url,
        status = %status,
        has_content_range,
        accept_ranges = accept_ranges.as_deref().unwrap_or("none"),
        "[ADL-DL] check_server_resumable: probe response"
    );

    if status == reqwest::StatusCode::PARTIAL_CONTENT && has_content_range {
        tracing::info!(url = %url, "[ADL-DL] check_server_resumable: server SUPPORTS Range (206 + Content-Range)");
        return Some(true);
    }
    if let Some(ar) = &accept_ranges {
        if ar.contains("bytes") {
            tracing::info!(url = %url, "[ADL-DL] check_server_resumable: server SUPPORTS Range (Accept-Ranges: bytes)");
            return Some(true);
        }
    }

    // The HEAD probe was inconclusive (200 without a positive signal). A server
    // that ignores Range on HEAD but honors it on GET (e.g. a proxy/CDN that
    // special-cases HEAD) would otherwise be misclassified as non-resumable —
    // pausing it would delete the partial file and restart from 0. Re-verify
    // with a GET Range request before declaring the server non-resumable.
    if let Ok(get_resp) =
        client.get(url.as_str()).header(reqwest::header::RANGE, "bytes=0-0").send()
    {
        let get_status = get_resp.status();
        let get_content_range = get_resp.headers().get(reqwest::header::CONTENT_RANGE).is_some();
        let get_accept_ranges = get_resp
            .headers()
            .get(reqwest::header::ACCEPT_RANGES)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_ascii_lowercase());
        if get_status == reqwest::StatusCode::PARTIAL_CONTENT && get_content_range {
            tracing::info!(url = %url, "[ADL-DL] check_server_resumable: GET re-verify CONFIRMS Range support (206 + Content-Range)");
            return Some(true);
        }
        if let Some(ar) = &get_accept_ranges {
            if ar.contains("bytes") {
                tracing::info!(url = %url, "[ADL-DL] check_server_resumable: GET re-verify CONFIRMS Range support (Accept-Ranges: bytes)");
                return Some(true);
            }
        }
    }

    tracing::info!(url = %url, "[ADL-DL] check_server_resumable: server does NOT support Range (non-resumable)");
    Some(false)
}

/// Attempt to fetch the Content-Length from a URL via HTTP HEAD request.
///
/// Only trusts the response if it actually looks like a file download. CDNs and
/// anti-hotlink layers often answer HEAD with a small HTML/verification page
/// (e.g. bilibili's CDN returned a 238-byte HTML page for a ~142 MB installer),
/// whose Content-Length would make the progress monitor declare the download
/// complete prematurely while the native engine is still writing bytes.
fn fetch_content_length(client: &reqwest::blocking::Client, url: &url::Url) -> Option<u64> {
    let resp = client.head(url.as_str()).send().ok()?;
    if !resp.status().is_success() {
        return None;
    }
    if let Some(ct) = resp.headers().get(reqwest::header::CONTENT_TYPE) {
        if let Ok(s) = ct.to_str() {
            let s = s.trim().to_ascii_lowercase();
            if s.starts_with("text/html")
                || s.starts_with("application/xhtml")
                || s.starts_with("text/plain")
                || s.contains("json")
            {
                return None;
            }
        }
    }
    let headers = resp.headers();

    // Try Content-Length first
    if let Some(val) = headers.get(reqwest::header::CONTENT_LENGTH) {
        if let Ok(len) = val.to_str().ok()?.trim().parse::<u64>() {
            return Some(len);
        }
    }

    // Fallback: Content-Range header (e.g. "bytes 0-1023/4096")
    if let Some(val) = headers.get(reqwest::header::CONTENT_RANGE) {
        let s = val.to_str().ok()?;
        if let Some(total) = s.split('/').next_back() {
            if let Ok(len) = total.trim().parse::<u64>() {
                return Some(len);
            }
        }
    }

    None
}
///
/// Unlike `build_webview_builder`, this intentionally omits the `on_navigation`
/// (→ `digital-life://browser-url-changed`) and `on_new_window`
/// (→ `digital-life://browser-open-new-tab`) handlers. A silent tab only renders
/// title/favicon into the meta channel consumed by the background fetch loop; it
/// must not pollute the visible tab list or the frontend's event stream.
pub(super) fn build_silent_webview_builder(
    label: &str,
    target: url::Url,
    color_scheme: &str,
    is_silent: bool,
) -> tauri::webview::WebviewBuilder<tauri::Wry> {
    // Silent/background webviews never render agent sites to the user, so agent
    // link interception is always off for them (`&[]` / `false`).
    let init_script =
        adl_browser::init_script_with_background_and_agent(color_scheme, &[], false, &[], &[]);
    tracing::debug!(
        color_scheme,
        "build_silent_webview_builder: generated init_script with background"
    );
    let builder = tauri::webview::WebviewBuilder::new(label, tauri::WebviewUrl::External(target))
        .initialization_script(init_script)
        .additional_browser_args(WEBVIEW_ADDITIONAL_ARGS);
    if is_silent {
        // Silent webviews: cancel ALL downloads unconditionally.
        // This is the ONLY download interception point for silent webviews —
        // build_silent_webview_builder does not go through setup_download_handler.
        builder.on_download(|_webview, event| {
            if let tauri::webview::DownloadEvent::Requested { url, .. } = event {
                tracing::warn!(
                    url = %url,
                    "[ADL-DL] download_requested: CANCELLED (silent webview)"
                );
            }
            false
        })
    } else {
        builder
    }
}

pub(super) fn setup_webview2_handlers_for_platform(
    webview: &tauri::Webview<tauri::Wry>,
    tab_id: &str,
    label: &str,
    bridge: EventBridgeRef,
    is_silent: bool,
) {
    #[cfg(windows)]
    {
        let bridge = bridge.clone();
        let tab_id = tab_id.to_string();
        let label = label.to_string();
        let app_handle = webview.app_handle().clone();
        let _ = webview.with_webview(move |platform_wv| unsafe {
            let controller = platform_wv.controller();
            if let Ok(core) = controller.CoreWebView2() {
                let manager = app_handle.state::<AppState>().download_manager.clone();
                adl_browser::setup_webview2_handlers(
                    &core, &tab_id, &label, &bridge, &manager, is_silent,
                );
            }
        });
    }
    #[cfg(not(windows))]
    {
        let app_handle = webview.app_handle().clone();
        let manager = app_handle.state::<crate::state::AppState>().download_manager.clone();
        adl_browser::setup_webview2_handlers(tab_id, label, &manager, is_silent);
    }
}

/// Apply the color scheme (background color + Profile PreferredColorScheme) and
/// then navigate the WebView from the initial `about:blank` to the real target URL.
///
/// On Windows, all three operations happen inside `with_webview` to guarantee
/// ordering: background color is set and Profile color scheme is applied BEFORE
/// the real page's first paint, eliminating the white flash and theme flicker.
///
/// **Race condition handling**: `with_webview` is asynchronous — the closure is
/// queued and executed on the next message-loop iteration. If the user switches
/// theme between `browser_create_for_tab` and the closure's execution, the
/// originally captured `color_scheme` would be stale. To fix this, the closure
/// re-reads `BrowserManager::current_color_scheme()` at execution time, ensuring
/// it always uses the latest theme. This prevents the scenario where:
///   1. closure_A (from create) sets Profile=light + Navigate
///   2. closure_B (from set_color_scheme_for_all) sets Profile=dark
///   3. YouTube detects the change and triggers ?themeRefresh=1 (flicker)
///
/// **Startup exception (事项 10)**: at restart-restore time the backend scheme
/// may never have been explicitly synced yet (it still holds `new()`'s hardcoded
/// default), so the re-read would yield a stale value. `fallback_color_scheme`
/// (the creation-time frontend-resolved value) is used until the first explicit
/// `set_color_scheme_for_all` arrives; afterwards the backend value always wins.
///
/// On non-Windows, there is no WebView2 flash issue, so we simply navigate.
pub(super) fn apply_theme_and_navigate_for_platform(
    webview: &tauri::Webview<tauri::Wry>,
    app_handle: tauri::AppHandle,
    real_url: &str,
    fallback_color_scheme: &str,
) {
    #[cfg(windows)]
    {
        let url_owned = real_url.to_string();
        let app_for_closure = app_handle.clone();
        let fallback_owned = fallback_color_scheme.to_string();
        tracing::debug!(url = &url_owned, "apply_theme_and_navigate_for_platform: ENTER (windows)");
        let _ = webview.with_webview(move |platform_wv| unsafe {
            let controller = platform_wv.controller();

            // Re-read the latest color scheme from BrowserManager at closure
            // execution time. `with_webview` is async, so the theme may have
            // changed since browser_create_for_tab was called. Using the latest
            // value ensures the Profile and Navigate use the same theme, avoiding
            // a stale-theme -> new-theme transition that triggers YouTube's
            // ?themeRefresh=1 flicker.
            // 事项 10：后端尚未显式同步过时用创建时刻值（fallback），否则重读
            // 会拿到 new() 硬编码默认值（dark），重启恢复的首帧落到旧主题。
            let cs = match app_for_closure.try_state::<AppState>() {
                Some(state) => state.browser_manager.current_color_scheme_or(&fallback_owned),
                None => {
                    // AppState 缺失比主题未同步更深层：连 manager 都没有。仍用创建时刻
                    // 值（事项 10），绝不回退到硬编码 dark。
                    tracing::warn!("apply_theme: AppState not found, using creation-time scheme");
                    fallback_owned
                }
            };
            tracing::debug!(
                latest_cs = &cs,
                url = &url_owned,
                "apply_theme: closure executing with latest color scheme"
            );

            // 1. Set background color via ICoreWebView2Controller2
            let (r, g, b) = adl_browser::theme_to_rgb(&cs);
            tracing::debug!(color_scheme = &cs, r, g, b, "apply_theme: set_default_background_color");
            if let Err(e) = adl_browser::set_default_background_color(&controller, r, g, b) {
                tracing::warn!(error = %e, "failed to set WebView2 default background color");
            }

            // 2. Set Profile PreferredColorScheme (synchronous, native WebView2 API)
            //    This takes effect before any page load, so the page's first paint
            //    always sees the correct prefers-color-scheme.
            if let Ok(core) = controller.CoreWebView2() {
                tracing::debug!(color_scheme = &cs, "apply_theme: calling set_profile_color_scheme");
                adl_browser::webview2_set_profile_color_scheme(&core, &cs);

                // 3. Navigate immediately — no need to wait for any callback
                tracing::debug!(url = &url_owned, "apply_theme: navigate_core");
                if let Err(e) = adl_browser::navigate_core(&core, &url_owned) {
                    tracing::warn!(error = %e, url = %url_owned, "failed to navigate WebView2 to real URL");
                }
            } else {
                tracing::warn!("apply_theme: failed to get CoreWebView2");
            }
        });
    }
    #[cfg(not(windows))]
    {
        // On non-Windows, navigate to the real URL via Tauri's cross-platform API.
        // No WebView2 background color / Profile color scheme flash issue exists
        // on these platforms.
        if let Ok(parsed) = url::Url::parse(real_url) {
            let _ = webview.navigate(parsed);
        }
        let _ = app_handle;
        let _ = fallback_color_scheme;
    }
}

pub(super) fn register_webview_with_manager(
    state: &AppState,
    app_handle: tauri::AppHandle,
    label: String,
    tab_id: &str,
) -> Result<Option<String>, AppError> {
    let handle: Arc<dyn WebViewHandle> = Arc::new(TauriWebViewHandle::new(app_handle, label));
    state
        .browser_manager
        .create_for_tab(handle, tab_id)
        .map_err(|e| AppError::Internal(format!("failed to register browser: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn data_subdir_groups_center_and_silent_apart_from_panel() {
        assert_eq!(data_subdir_for_location(Some("center")), Some("center"));
        assert_eq!(data_subdir_for_location(Some("silent")), Some("silent"));
        // 面板/默认/未知一律沿用默认 UDF（None），保留现有浏览会话。
        assert_eq!(data_subdir_for_location(Some("panel")), None);
        assert_eq!(data_subdir_for_location(None), None);
        assert_eq!(data_subdir_for_location(Some("unknown")), None);
    }

    #[test]
    fn main_window_shares_webview_additional_args() {
        // 同一 UDF 的 WebView2 环境选项必须逐字一致：主窗口（配置）与面板/分隔条
        // 子 WebView（常量）不一致时，CreateCoreWebView2EnvironmentWithOptions
        // 会返回 0x8007139F，表现为面板标签空白。
        let config = include_str!("../../tauri.conf.json");
        let expected = format!("\"additionalBrowserArgs\": \"{WEBVIEW_ADDITIONAL_ARGS}\"");
        assert!(config.contains(&expected), "tauri.conf.json main window must declare {expected}");
    }

    #[test]
    fn normalize_color_scheme_collapses_unknown_to_dark() {
        use adl_browser::normalize_color_scheme;
        assert_eq!(normalize_color_scheme("light"), "light");
        assert_eq!(normalize_color_scheme("dark"), "dark");
        // 非法/大小写变体一律 dark，保证首帧背景与 Profile 同色、不分裂。
        assert_eq!(normalize_color_scheme(""), "dark");
        assert_eq!(normalize_color_scheme("auto"), "dark");
        assert_eq!(normalize_color_scheme("Light"), "dark");
    }

    #[test]
    fn new_window_target_opens_http_and_https() {
        let http = url::Url::parse("http://example.com/page").unwrap();
        let https = url::Url::parse("https://www.bilibili.com/video/BV1xx").unwrap();
        assert_eq!(new_window_target(&http), Some("http://example.com/page".to_string()));
        assert_eq!(
            new_window_target(&https),
            Some("https://www.bilibili.com/video/BV1xx".to_string())
        );
    }

    #[test]
    fn new_window_target_ignores_other_schemes() {
        let ftp = url::Url::parse("ftp://example.com/file").unwrap();
        let js = url::Url::parse("javascript:void(0)").unwrap();
        let data = url::Url::parse("data:text/html,hi").unwrap();
        assert_eq!(new_window_target(&ftp), None);
        assert_eq!(new_window_target(&js), None);
        assert_eq!(new_window_target(&data), None);
    }

    #[test]
    fn is_download_url_detects_extensions_but_not_js() {
        assert!(is_download_url(&url::Url::parse("https://cdn.example.com/setup.exe").unwrap()));
        assert!(is_download_url(&url::Url::parse("https://cdn.example.com/archive.zip").unwrap()));
        assert!(is_download_url(&url::Url::parse("https://files.example.com/report.pdf").unwrap()));
        // .js is an inlined web resource, not a download carrier
        assert!(!is_download_url(&url::Url::parse("https://cdn.example.com/app/main.js").unwrap()));
        assert!(!is_download_url(&url::Url::parse("https://example.com/index.html").unwrap()));
    }

    #[test]
    fn is_download_url_detects_query_and_path_signals() {
        assert!(is_download_url(&url::Url::parse("https://example.com/api?download=1").unwrap()));
        assert!(is_download_url(&url::Url::parse("https://example.com/api?download").unwrap()));
        assert!(is_download_url(&url::Url::parse("https://example.com/download/package").unwrap()));
        assert!(is_download_url(&url::Url::parse("https://example.com/files/readme").unwrap()));
        assert!(is_download_url(
            &url::Url::parse("https://example.com/api/export?file=catalog").unwrap()
        ));
        // path keyword in host must not match
        assert!(!is_download_url(&url::Url::parse("https://files.example.com/page").unwrap()));
        assert!(!is_download_url(&url::Url::parse("https://example.com/about").unwrap()));
        // M1: `download` must be a standalone query key, not a substring inside
        // another value (e.g. a redirect URL carrying `?download=1` in its value).
        assert!(!is_download_url(
            &url::Url::parse("https://example.com/?redirect=https://x?download=1").unwrap()
        ));
    }
}
