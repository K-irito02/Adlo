use adl_errors::AppError;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
};
use std::time::Instant;
use tauri::{Emitter, Manager};

use crate::browser_events::{EMIT_DEDUP_WINDOW, LAST_EMIT, POLL_FAST_NOW};

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub(crate) const BROWSER_WEBVIEW_LABEL: &str = "adl-browser-view";

const POLL_INTERVAL_MS: u64 = 5000;
const FAST_POLL_INTERVAL_MS: u64 = 100;
const FAST_POLL_DURATION_MS: u64 = 10000;
const MEDIUM_POLL_INTERVAL_MS: u64 = 1000;
const MEDIUM_POLL_DURATION_MS: u64 = 20000;

static ACTIVE_FETCH_RECEIVED_COUNT: AtomicU64 = AtomicU64::new(0);

fn normalize_poll_url(raw: &str) -> String {
    let mut s = raw.split('#').next().unwrap_or(raw).to_string();
    if s.len() > 8 && s.ends_with('/') {
        let trimmed = s.trim_end_matches('/');
        if !trimmed.is_empty() {
            s = trimmed.to_string();
        }
    }
    s
}

#[derive(Debug, Clone, Default)]
struct PageState {
    url: String,
    title: String,
    favicon: String,
}

pub struct BrowserManager {
    active: AtomicBool,
    poll_stop: Arc<AtomicBool>,
    last_state: Arc<Mutex<PageState>>,
}

impl Default for BrowserManager {
    fn default() -> Self {
        Self::new()
    }
}

impl BrowserManager {
    pub fn new() -> Self {
        Self {
            active: AtomicBool::new(false),
            poll_stop: Arc::new(AtomicBool::new(false)),
            last_state: Arc::new(Mutex::new(PageState::default())),
        }
    }

    pub fn is_active(&self) -> bool {
        self.active.load(Ordering::Acquire)
    }

    pub fn create(&self, app: &tauri::AppHandle, url: &str) -> Result<(), AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        if self.is_active() {
            self.destroy(app)?;
        }

        let target = crate::browser_navigation::resolve_url(url)?;

        let app_nav = app.clone();
        let app_handle = app.clone();
        let webview_builder = tauri::webview::WebviewBuilder::new(
            BROWSER_WEBVIEW_LABEL,
            tauri::WebviewUrl::External(target),
        )
        .initialization_script(crate::browser_navigation::INIT_SCRIPT)
        .on_navigation(move |url| crate::browser_events::navigation_handler(&app_nav, url))
        .on_new_window(move |url, _window_features| {
            crate::browser_events::new_window_handler(&app_handle, &url)
        });

        window
            .add_child(
                webview_builder,
                tauri::LogicalPosition::new(-10000.0, -10000.0),
                tauri::LogicalSize::new(800.0, 600.0),
            )
            .map_err(|e| AppError::Internal(format!("failed to create webview: {e}")))?;

        tracing::info!(url = url, "browser webview created off-screen");

        // Setup WebView2 postMessage handler if available (Windows only)
        // This enables real-time communication from JavaScript to Rust
        if let Some(webview) = window.get_webview(BROWSER_WEBVIEW_LABEL) {
            if let Err(e) = crate::webview2_message::setup_webview2_messaging(webview.clone()) {
                tracing::warn!(error = %e, "webview2 messaging setup failed, using fallback");
            }
            if let Err(e) = crate::webview2_message::setup_document_title_handler(webview.clone()) {
                tracing::warn!(error = %e, "document title handler setup failed, using fallback");
            }
            if let Err(e) = crate::webview2_message::setup_favicon_changed_handler(webview.clone())
            {
                tracing::warn!(error = %e, "favicon changed handler setup failed, using fallback");
            }
            if let Err(e) = crate::webview2_message::setup_history_changed_handler(webview) {
                tracing::warn!(error = %e, "history changed handler setup failed, using fallback");
            }
        }

        self.active.store(true, Ordering::Release);

        // Reset state and start polling thread
        if let Ok(mut state) = self.last_state.lock() {
            *state = PageState::default();
        }
        self.poll_stop.store(false, Ordering::Release);
        self.start_polling(app);

        Ok(())
    }

    fn start_polling(&self, app: &tauri::AppHandle) {
        let app_handle = app.clone();
        let stop_flag = self.poll_stop.clone();
        let last_state = self.last_state.clone();

        std::thread::spawn(move || {
            tracing::info!("[ADL-META-RECV] Method 2 (active fetch): poll thread started (normal:{}ms, fast:{}ms×{}ms, medium:{}ms×{}ms)",
                    POLL_INTERVAL_MS, FAST_POLL_INTERVAL_MS, FAST_POLL_DURATION_MS,
                    MEDIUM_POLL_INTERVAL_MS, MEDIUM_POLL_DURATION_MS);
            let mut fast_poll_deadline: Option<std::time::Instant> = None;
            let mut medium_poll_deadline: Option<std::time::Instant> = None;

            loop {
                if stop_flag.load(Ordering::Acquire) {
                    tracing::info!("[ADL-META-RECV] poll thread stopped");
                    break;
                }

                // Check for external fast-poll signal from HistoryChanged handler (Method 5)
                if POLL_FAST_NOW.swap(false, Ordering::AcqRel) {
                    let now = std::time::Instant::now();
                    fast_poll_deadline =
                        Some(now + std::time::Duration::from_millis(FAST_POLL_DURATION_MS));
                    medium_poll_deadline = None;
                    tracing::info!(
                        "[ADL-META-RECV] POLL_FAST_NOW: fast poll triggered by HistoryChanged"
                    );
                }

                let now = std::time::Instant::now();
                let sleep_ms = if let Some(deadline) = fast_poll_deadline {
                    if now < deadline {
                        FAST_POLL_INTERVAL_MS
                    } else {
                        tracing::info!(
                                "[ADL-META-RECV] fast poll expired after {}ms, switching to medium poll ({}ms interval for {}ms)",
                                FAST_POLL_DURATION_MS, MEDIUM_POLL_INTERVAL_MS, MEDIUM_POLL_DURATION_MS
                            );
                        medium_poll_deadline =
                            Some(now + std::time::Duration::from_millis(MEDIUM_POLL_DURATION_MS));
                        fast_poll_deadline = None;
                        MEDIUM_POLL_INTERVAL_MS
                    }
                } else if let Some(deadline) = medium_poll_deadline {
                    if now < deadline {
                        MEDIUM_POLL_INTERVAL_MS
                    } else {
                        tracing::info!(
                                "[ADL-META-RECV] medium poll expired after {}ms, switching to normal poll ({}ms)",
                                MEDIUM_POLL_DURATION_MS, POLL_INTERVAL_MS
                            );
                        medium_poll_deadline = None;
                        POLL_INTERVAL_MS
                    }
                } else {
                    POLL_INTERVAL_MS
                };

                std::thread::sleep(std::time::Duration::from_millis(sleep_ms));

                if stop_flag.load(Ordering::Acquire) {
                    break;
                }

                let webview = match app_handle
                    .get_window("main")
                    .and_then(|w| w.get_webview(BROWSER_WEBVIEW_LABEL))
                {
                    Some(wv) => wv,
                    None => continue,
                };

                let current_url = match webview.url() {
                    Ok(u) => u.to_string(),
                    Err(_) => continue,
                };

                if current_url.starts_with("about:")
                    || current_url.starts_with("data:")
                    || current_url.is_empty()
                    || !(current_url.starts_with("http://") || current_url.starts_with("https://"))
                {
                    continue;
                }

                if let Some(meta_start) = current_url.find("#adl-meta=") {
                    let hash_part = &current_url[meta_start + "#adl-meta=".len()..];
                    let decoded_payload =
                        urlencoding::decode(hash_part).unwrap_or_default().into_owned();

                    let mut title = String::new();
                    let mut favicon = String::new();
                    let mut actual_url = String::new();

                    for pair in decoded_payload.split('&') {
                        if let Some((k, v)) = pair.split_once('=') {
                            let decoded_v = urlencoding::decode(v).unwrap_or_default().into_owned();
                            match k {
                                "title" => title = decoded_v,
                                "favicon" => favicon = decoded_v,
                                "url" => actual_url = decoded_v,
                                _ => {},
                            }
                        }
                    }

                    if !title.is_empty() || !favicon.is_empty() {
                        let mut should_emit = false;

                        if let Ok(mut state) = last_state.lock() {
                            let title_changed = !title.is_empty() && title != state.title;
                            let favicon_changed = !favicon.is_empty() && favicon != state.favicon;
                            let url_changed = !actual_url.is_empty() && actual_url != state.url;

                            if title_changed {
                                state.title = title.clone();
                                should_emit = true;
                            }
                            if favicon_changed {
                                state.favicon = favicon.clone();
                                should_emit = true;
                            }
                            if url_changed {
                                state.url = actual_url.clone();
                            }
                        }

                        if should_emit {
                            let count =
                                ACTIVE_FETCH_RECEIVED_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
                            let fast_mode = fast_poll_deadline.is_some();
                            tracing::info!(
                                "[ADL-META-RECV] ◄ Method 2 (active fetch): RECEIVED ✓ (#{}) [fast_mode={}] | title: {} | url: {}",
                                count,
                                fast_mode,
                                title.chars().take(50).collect::<String>(),
                                actual_url.chars().take(80).collect::<String>()
                            );
                            let _ = app_handle.emit(
                                "digital-life://browser-meta-changed",
                                serde_json::json!({
                                    "title": title,
                                    "favicon": favicon,
                                    "url": actual_url
                                }),
                            );
                        }
                    }

                    let clear_script = r#"
                    (function() {
                        try {
                            if (location.hash.indexOf('#adl-meta=') === 0) {
                                history.replaceState(null, '', location.href.split('#')[0]);
                            }
                        } catch(e) {}
                    })();
                    "#;
                    let _ = webview.eval(clear_script);
                    continue;
                }

                let mut last = match last_state.lock() {
                    Ok(guard) => guard.clone(),
                    Err(_) => continue,
                };

                let current_url_normalized = normalize_poll_url(&current_url);
                let last_url_normalized = normalize_poll_url(&last.url);

                if last_url_normalized != current_url_normalized {
                    tracing::info!(
                        "[ADL-META-RECV] URL changed: {} → {}, entering fast poll mode",
                        last_url_normalized.chars().take(60).collect::<String>(),
                        current_url_normalized.chars().take(60).collect::<String>()
                    );
                    // Store raw URL to track actual WebView URL, not normalized
                    last.url = current_url.clone();
                    last.title = String::new();
                    last.favicon = String::new();

                    // Deduplicate: skip emit if same URL emitted recently (within dedup window)
                    // Use shared LAST_EMIT from browser_events to deduplicate across both sources
                    let should_emit_url = {
                        if let Ok(guard) = LAST_EMIT.lock() {
                            match guard.as_ref() {
                                Some(last)
                                    if last.url == current_url_normalized
                                        && last.time.elapsed() < EMIT_DEDUP_WINDOW =>
                                {
                                    tracing::info!(
                                        "[ADL-META-RECV] URL emit dedup: skipping duplicate within {}ms",
                                        EMIT_DEDUP_WINDOW.as_millis()
                                    );
                                    false
                                },
                                _ => true,
                            }
                        } else {
                            true
                        }
                    };

                    if should_emit_url {
                        if let Ok(mut guard) = LAST_EMIT.lock() {
                            *guard = Some(crate::browser_events::LastEmit {
                                url: current_url_normalized.clone(),
                                time: Instant::now(),
                            });
                        }
                        let _ = app_handle.emit(
                            "digital-life://browser-url-changed",
                            serde_json::json!({ "url": current_url_normalized }),
                        );
                    }

                    fast_poll_deadline = Some(
                        std::time::Instant::now()
                            + std::time::Duration::from_millis(FAST_POLL_DURATION_MS),
                    );
                }

                // Always actively fetch title/favicon on every poll cycle to catch delayed SPA title changes.
                // This runs in fast, medium, and normal poll modes alike.
                // The Rust-side dedup (#adl-meta= hash processing) prevents unnecessary re-emissions.
                let fetch_script = r#"
                (function() {
                    try {
                        if (location.hash.indexOf('#adl-meta=') === 0) return;
                        var t = document.title ? document.title.trim() : '';
                        if (!t) {
                            var ogMeta = document.querySelector('meta[property="og:title"]');
                            if (ogMeta && ogMeta.content) {
                                t = ogMeta.content.trim();
                            }
                        }
                        if (!t) return;
                        var f = '';
                        var links = document.querySelectorAll('link[rel*="icon"]');
                        for (var i = 0; i < links.length; i++) {
                            if (!links[i].href) continue;
                            var rel = (links[i].getAttribute('rel') || '').toLowerCase();
                            if (rel.indexOf('icon') === -1) continue;
                            f = links[i].href;
                            break;
                        }
                        if (!f) {
                            var shortcut = document.querySelector('link[rel="shortcut icon"]');
                            if (shortcut && shortcut.href) f = shortcut.href;
                        }
                        var payload = 'title=' + encodeURIComponent(t) +
                                      '&favicon=' + encodeURIComponent(f) +
                                      '&url=' + encodeURIComponent(location.href.split('#')[0]);
                        history.replaceState(null, '', '#adl-meta=' + encodeURIComponent(payload));
                    } catch(e) {}
                })();
                "#;
                let _ = webview.eval(fetch_script);

                if let Ok(mut state) = last_state.lock() {
                    state.url = last.url;
                    state.title = last.title;
                    state.favicon = last.favicon;
                }
            }
        });
    }

    pub fn hide(&self, app: &tauri::AppHandle) -> Result<(), AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        let webview = window
            .get_webview(BROWSER_WEBVIEW_LABEL)
            .ok_or_else(|| AppError::Internal("browser webview not found".into()))?;

        webview.hide().map_err(|e| AppError::Internal(format!("hide failed: {e}")))?;

        Ok(())
    }

    pub fn show(&self, app: &tauri::AppHandle) -> Result<(), AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        let webview = window
            .get_webview(BROWSER_WEBVIEW_LABEL)
            .ok_or_else(|| AppError::Internal("browser webview not found".into()))?;

        webview.show().map_err(|e| AppError::Internal(format!("show failed: {e}")))?;

        Ok(())
    }

    pub fn destroy(&self, app: &tauri::AppHandle) -> Result<(), AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        if let Some(webview) = window.get_webview(BROWSER_WEBVIEW_LABEL) {
            let _ = webview.close();
        }

        // Stop polling thread
        self.poll_stop.store(true, Ordering::Release);
        if let Ok(mut state) = self.last_state.lock() {
            *state = PageState::default();
        }

        self.active.store(false, Ordering::Release);

        tracing::info!("browser webview destroyed");
        Ok(())
    }

    pub fn set_bounds(&self, app: &tauri::AppHandle, bounds: Bounds) -> Result<(), AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        let webview = window
            .get_webview(BROWSER_WEBVIEW_LABEL)
            .ok_or_else(|| AppError::Internal("browser webview not found".into()))?;

        let position = tauri::LogicalPosition::new(bounds.x, bounds.y);
        let size = tauri::LogicalSize::new(bounds.width.max(1.0), bounds.height.max(1.0));

        webview
            .set_position(position)
            .map_err(|e| AppError::Internal(format!("set_position failed: {e}")))?;
        webview.set_size(size).map_err(|e| AppError::Internal(format!("set_size failed: {e}")))?;

        Ok(())
    }

    pub fn eval(&self, app: &tauri::AppHandle, script: &str) -> Result<(), AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        let webview = window
            .get_webview(BROWSER_WEBVIEW_LABEL)
            .ok_or_else(|| AppError::Internal("browser webview not found".into()))?;

        webview.eval(script).map_err(|e| AppError::Internal(format!("eval failed: {e}")))?;

        Ok(())
    }
}
