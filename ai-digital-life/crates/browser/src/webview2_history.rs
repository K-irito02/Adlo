//! WebView2 HistoryChanged handler (Method 5).
//!
//! Detects SPA (Single Page Application) navigations via WebView2's
//! HistoryChanged event. Emits a `browser-url-changed` event and spawns
//! a 2-second fallback thread to extract the title via JS eval if no
//! DocumentTitleChanged/postMessage event arrives (handles YouTube
//! auto-play and similar SPA flows where `document.title` is not updated).

#[cfg(windows)]
mod imp {
    use std::sync::atomic::Ordering;

    use tauri::{AppHandle, Emitter, Manager, Webview};
    use tracing::{info, warn};
    use webview2_com::take_pwstr;
    use webview2_com::HistoryChangedEventHandler;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2HistoryChangedEventHandler,
    };
    use windows::core::IUnknown;

    use crate::browser_events::POLL_FAST_NOW;
    use crate::webview2_message::shared::{
        register_webview2_handler, HISTORY_CHANGED_COUNT, LAST_EMIT_URL, LAST_HISTORY_URL,
    };

    /// Deduplicate history changes: only return `true` if the clean URL
    /// differs from the last emitted URL.
    ///
    /// Both `fetch_script` (`#adl-meta=...`) and `clear_script` (clean) use
    /// `history.replaceState`, which triggers HistoryChanged ~100ms apart
    /// during fast poll. Without dedup, the frontend receives ~20
    /// events/second for the same URL.
    fn dedup_history_url(clean_url: &str) -> bool {
        if let Ok(mut last) = LAST_HISTORY_URL.lock() {
            if *last == clean_url {
                false
            } else {
                *last = clean_url.to_string();
                true
            }
        } else {
            true
        }
    }

    /// Spawn a fallback thread that, after 2 seconds, evaluates JS on the
    /// webview to extract `document.title` and posts it back via
    /// `chrome.webview.postMessage`. This handles SPA navigations (e.g.
    /// YouTube auto-play) where `document.title` is not updated by the page.
    fn spawn_spa_fallback(app: AppHandle, label: String, url: String) {
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(2000)).await;
            // Check if meta was already emitted for this URL
            let already_emitted = {
                if let Ok(last_url) = LAST_EMIT_URL.lock() {
                    *last_url == url
                } else {
                    false
                }
            };
            if already_emitted {
                return;
            }
            if let Some(wv) = app.get_webview(&label) {
                let _ = wv.eval(
                    r#"(function(){
                        var t = document.title;
                        if (t && t.trim()) {
                            try {
                                chrome.webview.postMessage(JSON.stringify({
                                    type: 'meta',
                                    title: t,
                                    favicon: '',
                                    url: location.href
                                }));
                            } catch(e) {}
                        }
                    })()"#,
                );
            }
        });
    }

    /// Build the `HistoryChangedEventHandler` closure that processes URL
    /// changes, emits `browser-url-changed`, and spawns the SPA fallback.
    fn build_history_handler(
        app: AppHandle,
        label: String,
    ) -> ICoreWebView2HistoryChangedEventHandler {
        HistoryChangedEventHandler::create(Box::new(
            move |sender: Option<ICoreWebView2>, _args: Option<IUnknown>| {
                let Some(sender) = sender else {
                    return Ok(());
                };

                let mut url_pwstr = windows::core::PWSTR::null();
                if let Err(_e) = unsafe { sender.Source(&mut url_pwstr) } {
                    return Ok(());
                }
                let url = if url_pwstr.is_null() { String::new() } else { take_pwstr(url_pwstr) };

                if url.is_empty() || !(url.starts_with("http://") || url.starts_with("https://")) {
                    return Ok(());
                }

                // Strip #adl-meta=... hash (set by fetch_script) before emitting,
                // otherwise the URL oscillates between clean and hash forms on every
                // fast-poll cycle, flooding the frontend with onUrlChanged events.
                let clean_url = url.split("#adl-meta").next().unwrap_or(&url).to_string();

                if !dedup_history_url(&clean_url) {
                    return Ok(());
                }

                POLL_FAST_NOW.store(true, Ordering::Release);

                let _ = app.emit(
                    "digital-life://browser-url-changed",
                    serde_json::json!({ "url": clean_url }),
                );

                let count = HISTORY_CHANGED_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
                info!(
                    "[ADL-META-RECV] ◄ Method 5 (HistoryChanged): RECEIVED ✓ (#{}) | url: {}",
                    count,
                    clean_url.chars().take(80).collect::<String>()
                );

                // Fallback: after 2s, if no DocumentTitleChanged/postMessage arrived
                // for this URL, eval JS to extract title and emit meta event.
                spawn_spa_fallback(app.clone(), label.clone(), clean_url);

                Ok(())
            },
        ))
    }

    pub fn setup_history_changed_handler(webview: Webview, label: String) -> Result<(), String> {
        let app = webview.app_handle().clone();
        info!("[ADL-META-RECV] Method 5 (HistoryChanged): setting up handler");

        register_webview2_handler(
            webview,
            "Method 5 (HistoryChanged)",
            "history changed handler setup failed",
            move |core| unsafe {
                let app_for_handler = app.clone();
                let label_for_handler = label.clone();
                let handler = build_history_handler(app_for_handler, label_for_handler);

                let mut token: i64 = 0;
                match core.add_HistoryChanged(&handler, &mut token as *mut _ as *mut _) {
                    Ok(_) => {
                        info!(
                            "[ADL-META-RECV] Method 5 (HistoryChanged): handler REGISTERED ✓ (token={}), SPA NAVIGATION DETECTION ENABLED",
                            token
                        );
                    },
                    Err(e) => {
                        warn!(
                            "[ADL-META-RECV] Method 5 (HistoryChanged): FAILED to register handler: {}, falling back",
                            e
                        );
                    },
                }
            },
        )
    }
}

#[cfg(not(windows))]
mod imp {
    use tauri::Webview;
    use tracing::debug;

    pub fn setup_history_changed_handler(_webview: Webview, _label: String) -> Result<(), String> {
        debug!(
            "history changed handler not available on this platform (non-Windows), using fallback"
        );
        Ok(())
    }
}

pub use imp::setup_history_changed_handler;
