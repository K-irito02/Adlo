//! WebView2 postMessage support for Windows.
//!
//! This module is the entry point for real-time communication from
//! JavaScript to Rust via WebView2's `chrome.webview.postMessage` API and
//! native WebView2 events (DocumentTitleChanged, FaviconChanged,
//! HistoryChanged).
//!
//! On Windows, the four `setup_*` functions register handlers on the
//! WebView2 instance. On non-Windows platforms, they are no-ops.
//!
//! ## Module structure
//!
//! - [`shared`]: cross-handler state (dedup caches, counters) and the
//!   [`register_webview2_handler`] generic helper that wraps
//!   `webview.with_webview(...)` boilerplate.
//! - [`webview2_postmessage`]: Method 1 — `chrome.webview.postMessage` handler.
//! - [`webview2_title`]: Method 3 — `DocumentTitleChanged` handler.
//! - [`webview2_favicon`]: Method 4 — `FaviconChanged` handler (favicon cache only).
//! - [`webview2_history`]: Method 5 — `HistoryChanged` handler with SPA fallback.

#[cfg(windows)]
pub(crate) mod shared {
    use std::collections::HashMap;
    use std::sync::atomic::AtomicU64;
    use std::sync::{Mutex, RwLock};
    use std::time::Instant;

    use once_cell::sync::Lazy;
    use tauri::Webview;
    use tracing::{error, warn};
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2;

    pub(crate) static POSTMESSAGE_RECEIVED_COUNT: AtomicU64 = AtomicU64::new(0);
    pub(crate) static DOCUMENT_TITLE_CHANGED_COUNT: AtomicU64 = AtomicU64::new(0);

    pub(crate) static FAVICON_CACHE: Lazy<RwLock<HashMap<String, String>>> =
        Lazy::new(|| RwLock::new(HashMap::new()));
    pub(crate) static FAVICON_CHANGED_COUNT: AtomicU64 = AtomicU64::new(0);
    pub(crate) static HISTORY_CHANGED_COUNT: AtomicU64 = AtomicU64::new(0);
    pub(crate) static LAST_HISTORY_URL: Mutex<String> = Mutex::new(String::new());

    /// 去重：追踪最近一次发射的 (url, title, favicon) 和时间戳
    pub(crate) static LAST_EMIT_URL: Mutex<String> = Mutex::new(String::new());
    static LAST_EMIT_TITLE: Mutex<String> = Mutex::new(String::new());
    static LAST_EMIT_FAVICON: Mutex<String> = Mutex::new(String::new());
    static LAST_EMIT_TIME: Lazy<Mutex<Instant>> = Lazy::new(|| Mutex::new(Instant::now()));

    /// 去重窗口：相同 (url, title, favicon) 在 N 毫秒内不重复发射
    const EMIT_DEDUP_MS: u64 = 2000;

    /// 检查是否应该发射。跳过情况：
    /// 1. 重复发射：同 url+title+favicon 在 EMIT_DEDUP_MS 内
    /// 2. 空标题
    pub(crate) fn should_emit_and_update(url: &str, title: &str, favicon: &str) -> bool {
        if title.is_empty() {
            return false;
        }

        let now = Instant::now();

        if let Ok(last_url) = LAST_EMIT_URL.lock() {
            if let Ok(last_title) = LAST_EMIT_TITLE.lock() {
                if let Ok(last_favicon) = LAST_EMIT_FAVICON.lock() {
                    if let Ok(last_time) = LAST_EMIT_TIME.lock() {
                        // 重复发射抑制（同 url + title + favicon）
                        if *last_url == url
                            && *last_title == title
                            && *last_favicon == favicon
                            && (now.duration_since(*last_time).as_millis() as u64) < EMIT_DEDUP_MS
                        {
                            return false;
                        }
                    }
                }
            }
        }

        // 更新状态
        if let Ok(mut last_url) = LAST_EMIT_URL.lock() {
            *last_url = url.to_string();
        }
        if let Ok(mut last_title) = LAST_EMIT_TITLE.lock() {
            *last_title = title.to_string();
        }
        if let Ok(mut last_favicon) = LAST_EMIT_FAVICON.lock() {
            *last_favicon = favicon.to_string();
        }
        if let Ok(mut last_time) = LAST_EMIT_TIME.lock() {
            *last_time = now;
        }

        true
    }

    /// Generic helper that wraps the `webview.with_webview(...)` boilerplate
    /// common to all four `setup_*` handlers.
    ///
    /// - Acquires the `ICoreWebView2` from the platform webview controller.
    /// - Invokes `handler_setup(&core)` to perform the handler-specific
    ///   registration (cast, create handler closure, call `add_*`).
    /// - Logs the standard "FAILED to get CoreWebView2" and "with_webview
    ///   FAILED" messages with `method_name` for context.
    /// - Returns `Err(format!("{}: {}", error_prefix, e))` on with_webview
    ///   failure so each caller can preserve its own error format.
    ///
    /// The `handler_setup` closure runs on the webview thread (inside
    /// `with_webview`) and is responsible for its own success/failure
    /// logging of the `add_*` registration call.
    pub(crate) fn register_webview2_handler<F>(
        webview: Webview,
        method_name: &'static str,
        error_prefix: &'static str,
        handler_setup: F,
    ) -> Result<(), String>
    where
        F: FnOnce(&ICoreWebView2) + Send + 'static,
    {
        let result = webview.with_webview(move |platform_wv| unsafe {
            let controller = platform_wv.controller();

            let core = match controller.CoreWebView2() {
                Ok(c) => c,
                Err(e) => {
                    error!("[ADL-META-RECV] {}: FAILED to get CoreWebView2: {}", method_name, e);
                    return;
                },
            };

            handler_setup(&core);
        });

        match result {
            Ok(_) => Ok(()),
            Err(e) => {
                warn!("[ADL-META-RECV] {}: with_webview FAILED: {}, falling back", method_name, e);
                Err(format!("{}: {}", error_prefix, e))
            },
        }
    }
}

// Re-export the four setup functions from their dedicated sub-modules so
// callers can continue to use `crate::webview2_message::setup_*`.
pub use crate::webview2_favicon::setup_favicon_changed_handler;
pub use crate::webview2_history::setup_history_changed_handler;
pub use crate::webview2_postmessage::setup_webview2_messaging;
pub use crate::webview2_title::setup_document_title_handler;
