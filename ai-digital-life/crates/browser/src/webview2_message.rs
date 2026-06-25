//! WebView2 postMessage support for Windows.
//!
//! This module provides real-time communication from JavaScript to Rust
//! via WebView2's chrome.webview.postMessage API.
//!
//! On Windows, this registers a WebMessageReceived handler on the WebView2 instance,
//! allowing JavaScript to send messages instantly via chrome.webview.postMessage().
//! On non-Windows platforms, this is a no-op.

#[cfg(windows)]
mod imp {
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Mutex;
    use std::time::Instant;

    use once_cell::sync::Lazy;
    use tauri::{Emitter, Manager, Webview};
    use tracing::{debug, error, info, warn};
    use webview2_com::take_pwstr;
    use webview2_com::DocumentTitleChangedEventHandler;
    use webview2_com::FaviconChangedEventHandler;
    use webview2_com::HistoryChangedEventHandler;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2WebMessageReceivedEventArgs, ICoreWebView2_15, ICoreWebView2_2,
    };
    use windows::core::{IUnknown, Interface};

    type EventRegistrationToken = i64;
    static POSTMESSAGE_RECEIVED_COUNT: AtomicU64 = AtomicU64::new(0);
    static DOCUMENT_TITLE_CHANGED_COUNT: AtomicU64 = AtomicU64::new(0);

    static FAVICON_CACHE: Lazy<Mutex<HashMap<String, String>>> =
        Lazy::new(|| Mutex::new(HashMap::new()));
    static FAVICON_CHANGED_COUNT: AtomicU64 = AtomicU64::new(0);
    static HISTORY_CHANGED_COUNT: AtomicU64 = AtomicU64::new(0);
    static LAST_HISTORY_URL: Mutex<String> = Mutex::new(String::new());

    /// 去重：追踪最近一次发射的 (url, title, favicon) 和时间戳
    static LAST_EMIT_URL: Mutex<String> = Mutex::new(String::new());
    static LAST_EMIT_TITLE: Mutex<String> = Mutex::new(String::new());
    static LAST_EMIT_FAVICON: Mutex<String> = Mutex::new(String::new());
    static LAST_EMIT_TIME: Lazy<Mutex<Instant>> = Lazy::new(|| Mutex::new(Instant::now()));

    /// 去重窗口：相同 (url, title, favicon) 在 N 毫秒内不重复发射
    const EMIT_DEDUP_MS: u64 = 1000;

    /// 检查是否应该发射。三种情况跳过：
    /// 1. 重复发射：同 url+title+favicon 在 EMIT_DEDUP_MS 内
    /// 2. 旧标题：URL 变了但 title 与上次相同（pushState 旧标题残留）
    ///    仅当 favicon 也未变时才跳过（避免拦截 favicon 迟到的事件）
    /// 3. 空标题
    fn should_emit_and_update(url: &str, title: &str, favicon: &str) -> bool {
        if title.is_empty() {
            return false;
        }

        let now = Instant::now();

        if let Ok(last_url) = LAST_EMIT_URL.lock() {
            if let Ok(last_title) = LAST_EMIT_TITLE.lock() {
                if let Ok(last_favicon) = LAST_EMIT_FAVICON.lock() {
                    if let Ok(last_time) = LAST_EMIT_TIME.lock() {
                        // Case 1: 重复发射抑制（同 url + title + favicon）
                        if *last_url == url
                            && *last_title == title
                            && *last_favicon == favicon
                            && (now.duration_since(*last_time).as_millis() as u64) < EMIT_DEDUP_MS
                        {
                            return false;
                        }
                        // Case 2: 旧标题检测（URL 变了但 title 没变 且 favicon 也没变）
                        if *last_url != url && *last_title == title && *last_favicon == favicon {
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

    pub fn setup_webview2_messaging(webview: Webview) -> Result<(), String> {
        let app = webview.app_handle().clone();
        info!("[ADL-META-RECV] Method 1 (postMessage): setting up handler");

        let result = webview.with_webview(move |platform_wv| {
            unsafe {
                let controller = platform_wv.controller();

                let core = match controller.CoreWebView2() {
                    Ok(c) => c,
                    Err(e) => {
                        error!("[ADL-META-RECV] Method 1 (postMessage): FAILED to get CoreWebView2: {}", e);
                        return;
                    }
                };

                let core2: ICoreWebView2_2 = match core.cast() {
                    Ok(c) => c,
                    Err(e) => {
                        error!("[ADL-META-RECV] Method 1 (postMessage): FAILED to cast to ICoreWebView2_2: {}", e);
                        return;
                    }
                };

                let app_for_handler = app.clone();
                let handler =
                    webview2_com::WebMessageReceivedEventHandler::create(Box::new(
                        move |_sender: Option<ICoreWebView2>,
                              args: Option<ICoreWebView2WebMessageReceivedEventArgs>| {
                            let Some(args) = args else {
                                return Ok(());
                            };

                            let mut json = windows::core::PWSTR::null();
                            if let Err(e) = args.TryGetWebMessageAsString(&mut json) {
                                debug!("[ADL-META-RECV] Method 1 (postMessage): failed to get message: {}", e);
                                return Ok(());
                            }
                            if json.is_null() {
                                return Ok(());
                            }

                            let json_str = take_pwstr(json);
                            if json_str.is_empty() {
                                return Ok(());
                            }

                            if let Ok(meta) = serde_json::from_str::<serde_json::Value>(&json_str) {
                                if meta.get("type").and_then(|t| t.as_str()) == Some("meta") {
                                    let title = meta.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                    let favicon = meta.get("favicon").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                    let url = meta.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();

                                    // Skip stale/duplicate emissions
                                    if !should_emit_and_update(&url, &title, &favicon) {
                                        debug!(
                                            "[ADL-META-RECV] Method 1 (postMessage): SKIPPED (stale/duplicate) | title: {} | url: {}",
                                            title.chars().take(50).collect::<String>(),
                                            url.chars().take(80).collect::<String>()
                                        );
                                        return Ok(());
                                    }

                                    let count = POSTMESSAGE_RECEIVED_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
                                    info!(
                                        "[ADL-META-RECV] ◄ Method 1 (postMessage): RECEIVED ✓ (#{}) | title: {} | url: {}",
                                        count,
                                        title.chars().take(50).collect::<String>(),
                                        url.chars().take(80).collect::<String>()
                                    );

                                    let _ = app_for_handler.emit(
                                        "digital-life://browser-meta-changed",
                                        serde_json::json!({
                                            "title": title,
                                            "favicon": favicon,
                                            "url": url
                                        }),
                                    );
                                }
                            }

                            Ok(())
                        },
                    ));

                let mut token: EventRegistrationToken = 0;
                match core2.add_WebMessageReceived(&handler, &mut token as *mut _ as *mut _) {
                    Ok(_) => {
                        info!(
                            "[ADL-META-RECV] Method 1 (postMessage): handler REGISTERED ✓ (token={}), REAL-TIME SYNC ENABLED",
                            token
                        );
                    }
                    Err(e) => {
                        warn!("[ADL-META-RECV] Method 1 (postMessage): FAILED to register handler: {}, falling back", e);
                    }
                }
            }
        });

        match result {
            Ok(_) => Ok(()),
            Err(e) => {
                warn!(
                    "[ADL-META-RECV] Method 1 (postMessage): with_webview FAILED: {}, falling back",
                    e
                );
                Err(format!("webview2 setup failed: {}", e))
            },
        }
    }

    pub fn setup_document_title_handler(webview: Webview) -> Result<(), String> {
        let app = webview.app_handle().clone();
        info!("[ADL-META-RECV] Method 3 (DocumentTitleChanged): setting up handler");

        let result = webview.with_webview(move |platform_wv| {
            unsafe {
                let controller = platform_wv.controller();

                let core = match controller.CoreWebView2() {
                    Ok(c) => c,
                    Err(e) => {
                        error!(
                            "[ADL-META-RECV] Method 3 (DocumentTitleChanged): FAILED to get CoreWebView2: {}",
                            e
                        );
                        return;
                    }
                };

                let app_for_handler = app.clone();
                let handler = DocumentTitleChangedEventHandler::create(Box::new(
                    move |sender: Option<ICoreWebView2>,
                          _args: Option<IUnknown>| {
                        let Some(sender) = sender else {
                            return Ok(());
                        };

                        let mut title_pwstr = windows::core::PWSTR::null();
                        if let Err(e) = sender.DocumentTitle(&mut title_pwstr) {
                            debug!(
                                "[ADL-META-RECV] Method 3 (DocumentTitleChanged): DocumentTitle() failed: {}",
                                e
                            );
                            return Ok(());
                        }
                        if title_pwstr.is_null() {
                            return Ok(());
                        }
                        let title = take_pwstr(title_pwstr);
                        if title.is_empty() {
                            return Ok(());
                        }

                        let mut url_pwstr = windows::core::PWSTR::null();
                        if let Err(e) = sender.Source(&mut url_pwstr) {
                            debug!(
                                "[ADL-META-RECV] Method 3 (DocumentTitleChanged): Source() failed: {}",
                                e
                            );
                            return Ok(());
                        }
                        let url = if url_pwstr.is_null() {
                            String::new()
                        } else {
                            take_pwstr(url_pwstr)
                        };

                        // Look up cached favicon for this URL
                        let favicon = if !url.is_empty() {
                            if let Ok(cache) = FAVICON_CACHE.lock() {
                                cache.get(&url).cloned().unwrap_or_default()
                            } else {
                                String::new()
                            }
                        } else {
                            String::new()
                        };

                        // Skip stale/duplicate emissions
                        if !should_emit_and_update(&url, &title, &favicon) {
                            debug!(
                                "[ADL-META-RECV] Method 3 (DocumentTitleChanged): SKIPPED (stale/duplicate) | title: {} | url: {}",
                                title.chars().take(50).collect::<String>(),
                                url.chars().take(80).collect::<String>()
                            );
                            return Ok(());
                        }

                        let count = DOCUMENT_TITLE_CHANGED_COUNT
                            .fetch_add(1, Ordering::Relaxed)
                            + 1;
                        info!(
                            "[ADL-META-RECV] ◄ Method 3 (DocumentTitleChanged): RECEIVED ✓ (#{}) | title: {} | favicon: {} | url: {}",
                            count,
                            title.chars().take(50).collect::<String>(),
                            if favicon.is_empty() { "(empty)".to_string() } else { "✓".to_string() },
                            url.chars().take(80).collect::<String>()
                        );

                        let _ = app_for_handler.emit(
                            "digital-life://browser-meta-changed",
                            serde_json::json!({
                                "title": title,
                                "favicon": favicon,
                                "url": url
                            }),
                        );

                        Ok(())
                    },
                ));

                let mut token: EventRegistrationToken = 0;
                match core.add_DocumentTitleChanged(&handler, &mut token as *mut _ as *mut _) {
                    Ok(_) => {
                        info!(
                            "[ADL-META-RECV] Method 3 (DocumentTitleChanged): handler REGISTERED ✓ (token={}), NATIVE TITLE DETECTION ENABLED",
                            token
                        );
                    }
                    Err(e) => {
                        warn!(
                            "[ADL-META-RECV] Method 3 (DocumentTitleChanged): FAILED to register handler: {}, WebView2 runtime may be too old",
                            e
                        );
                    }
                }
            }
        });

        match result {
            Ok(_) => Ok(()),
            Err(e) => {
                warn!(
                    "[ADL-META-RECV] Method 3 (DocumentTitleChanged): with_webview FAILED: {}, falling back",
                    e
                );
                Err(format!("document title handler setup failed: {}", e))
            },
        }
    }

    pub fn setup_favicon_changed_handler(webview: Webview) -> Result<(), String> {
        info!("[ADL-META-RECV] Method 4 (FaviconChanged): setting up handler");

        let result = webview.with_webview(move |platform_wv| {
            unsafe {
                let controller = platform_wv.controller();

                let core = match controller.CoreWebView2() {
                    Ok(c) => c,
                    Err(e) => {
                        error!(
                            "[ADL-META-RECV] Method 4 (FaviconChanged): FAILED to get CoreWebView2: {}",
                            e
                        );
                        return;
                    }
                };

                // ICoreWebView2_15 is required for add_FaviconChanged + FaviconUri
                let core15: ICoreWebView2_15 = match core.cast() {
                    Ok(c) => c,
                    Err(e) => {
                        warn!(
                            "[ADL-META-RECV] Method 4 (FaviconChanged): ICoreWebView2_15 not available (need SDK 1.0.2950+): {}, falling back to postMessage/poll",
                            e
                        );
                        return;
                    }
                };

                let handler = FaviconChangedEventHandler::create(Box::new(
                    move |sender: Option<ICoreWebView2>,
                          _args: Option<IUnknown>| {
                        let Some(sender) = sender else {
                            return Ok(());
                        };

                        let core15: ICoreWebView2_15 = match sender.cast() {
                            Ok(c) => c,
                            Err(_) => return Ok(()),
                        };

                        // Get favicon URL
                        let mut favicon_pwstr = windows::core::PWSTR::null();
                        if let Err(e) = core15.FaviconUri(&mut favicon_pwstr) {
                            debug!(
                                "[ADL-META-RECV] Method 4 (FaviconChanged): FaviconUri() failed: {}",
                                e
                            );
                            return Ok(());
                        }
                        let favicon = if favicon_pwstr.is_null() {
                            String::new()
                        } else {
                            take_pwstr(favicon_pwstr)
                        };
                        if favicon.is_empty() {
                            return Ok(());
                        }

                        // Get current URL for cache key
                        let mut url_pwstr = windows::core::PWSTR::null();
                        if let Err(_e) = sender.Source(&mut url_pwstr) {
                            return Ok(());
                        }
                        let url = if url_pwstr.is_null() {
                            String::new()
                        } else {
                            take_pwstr(url_pwstr)
                        };

                        // Only cache favicon — do NOT emit. DocumentTitleChanged handler
                        // reads from FAVICON_CACHE and emits with the title.
                        if !url.is_empty() {
                            if let Ok(mut cache) = FAVICON_CACHE.lock() {
                                cache.insert(url.clone(), favicon.clone());
                            }
                        }

                        let count = FAVICON_CHANGED_COUNT
                            .fetch_add(1, Ordering::Relaxed)
                            + 1;
                        debug!(
                            "[ADL-META-RECV] ◄ Method 4 (FaviconChanged): CACHED ✓ (#{}) | favicon: {} | url: {}",
                            count,
                            favicon.chars().take(50).collect::<String>(),
                            url.chars().take(80).collect::<String>()
                        );

                        Ok(())
                    },
                ));

                let mut token: EventRegistrationToken = 0;
                match core15.add_FaviconChanged(&handler, &mut token as *mut _ as *mut _) {
                    Ok(_) => {
                        info!(
                            "[ADL-META-RECV] Method 4 (FaviconChanged): handler REGISTERED ✓ (token={}), NATIVE FAVICON DETECTION ENABLED",
                            token
                        );
                    }
                    Err(e) => {
                        warn!(
                            "[ADL-META-RECV] Method 4 (FaviconChanged): FAILED to register handler: {}, falling back",
                            e
                        );
                    }
                }
            }
        });

        match result {
            Ok(_) => Ok(()),
            Err(e) => {
                warn!(
                    "[ADL-META-RECV] Method 4 (FaviconChanged): with_webview FAILED: {}, falling back",
                    e
                );
                Err(format!("favicon changed handler setup failed: {}", e))
            },
        }
    }

    pub fn setup_history_changed_handler(webview: Webview) -> Result<(), String> {
        let app = webview.app_handle().clone();
        info!("[ADL-META-RECV] Method 5 (HistoryChanged): setting up handler");

        let result = webview.with_webview(move |platform_wv| {
            unsafe {
                let controller = platform_wv.controller();

                let core = match controller.CoreWebView2() {
                    Ok(c) => c,
                    Err(e) => {
                        error!(
                            "[ADL-META-RECV] Method 5: FAILED to get CoreWebView2: {}",
                            e
                        );
                        return;
                    }
                };

                let app_for_handler = app.clone();
                let handler = HistoryChangedEventHandler::create(Box::new(
                    move |sender: Option<ICoreWebView2>,
                          _args: Option<IUnknown>| {
                        let Some(sender) = sender else {
                            return Ok(());
                        };

                        let mut url_pwstr = windows::core::PWSTR::null();
                        if let Err(_e) = sender.Source(&mut url_pwstr) {
                            return Ok(());
                        }
                        let url = if url_pwstr.is_null() {
                            String::new()
                        } else {
                            take_pwstr(url_pwstr)
                        };

                        if url.is_empty()
                            || !(url.starts_with("http://") || url.starts_with("https://"))
                        {
                            return Ok(());
                        }

                        // Strip #adl-meta=... hash (set by fetch_script) before emitting,
                        // otherwise the URL oscillates between clean and hash forms on every
                        // fast-poll cycle, flooding the frontend with onUrlChanged events.
                        let clean_url = url.split("#adl-meta").next().unwrap_or(&url).to_string();

                        // Deduplicate: only emit if the clean URL actually changed.
                        // Both fetch_script (#adl-meta=...) and clear_script (clean) use
                        // history.replaceState, which triggers HistoryChanged ~100ms apart
                        // during fast poll. Without dedup, the frontend receives ~20
                        // events/second for the same URL.
                        let is_new_url = {
                            if let Ok(mut last) = LAST_HISTORY_URL.lock() {
                                if *last == clean_url {
                                    false
                                } else {
                                    *last = clean_url.clone();
                                    true
                                }
                            } else {
                                true
                            }
                        };

                        if !is_new_url {
                            return Ok(());
                        }

                        crate::browser_events::POLL_FAST_NOW.store(true, Ordering::Release);

                        let _ = app_for_handler.emit(
                            "digital-life://browser-url-changed",
                            serde_json::json!({ "url": clean_url }),
                        );

                        let count =
                            HISTORY_CHANGED_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
                        info!(
                            "[ADL-META-RECV] ◄ Method 5 (HistoryChanged): RECEIVED ✓ (#{}) | url: {}",
                            count,
                            clean_url.chars().take(80).collect::<String>()
                        );

                        Ok(())
                    },
                ));

                let mut token: EventRegistrationToken = 0;
                match core.add_HistoryChanged(&handler, &mut token as *mut _ as *mut _) {
                    Ok(_) => {
                        info!(
                            "[ADL-META-RECV] Method 5 (HistoryChanged): handler REGISTERED ✓ (token={}), SPA NAVIGATION DETECTION ENABLED",
                            token
                        );
                    }
                    Err(e) => {
                        warn!(
                            "[ADL-META-RECV] Method 5 (HistoryChanged): FAILED to register handler: {}, falling back",
                            e
                        );
                    }
                }
            }
        });

        match result {
            Ok(_) => Ok(()),
            Err(e) => {
                warn!(
                    "[ADL-META-RECV] Method 5 (HistoryChanged): with_webview FAILED: {}, falling back",
                    e
                );
                Err(format!("history changed handler setup failed: {}", e))
            },
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use tauri::Webview;
    use tracing::debug;

    pub fn setup_webview2_messaging(_webview: Webview) -> Result<(), String> {
        debug!("webview2 messaging not available on this platform (non-Windows), using fallback");
        Ok(())
    }

    pub fn setup_document_title_handler(_webview: Webview) -> Result<(), String> {
        debug!(
            "document title handler not available on this platform (non-Windows), using fallback"
        );
        Ok(())
    }

    pub fn setup_favicon_changed_handler(_webview: Webview) -> Result<(), String> {
        debug!(
            "favicon changed handler not available on this platform (non-Windows), using fallback"
        );
        Ok(())
    }

    pub fn setup_history_changed_handler(_webview: Webview) -> Result<(), String> {
        debug!(
            "history changed handler not available on this platform (non-Windows), using fallback"
        );
        Ok(())
    }
}

pub use imp::{
    setup_document_title_handler, setup_favicon_changed_handler, setup_history_changed_handler,
    setup_webview2_messaging,
};
