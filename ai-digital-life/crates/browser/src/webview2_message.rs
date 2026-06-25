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
    use std::sync::atomic::{AtomicU64, Ordering};
    use tauri::{Emitter, Manager, Webview};
    use tracing::{debug, error, info, warn};
    use webview2_com::take_pwstr;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2WebMessageReceivedEventArgs, ICoreWebView2_2,
    };
    use windows::core::Interface;

    type EventRegistrationToken = i64;
    static POSTMESSAGE_RECEIVED_COUNT: AtomicU64 = AtomicU64::new(0);

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
}

#[cfg(not(windows))]
mod imp {
    use tauri::Webview;
    use tracing::debug;

    pub fn setup_webview2_messaging(_webview: Webview) -> Result<(), String> {
        debug!("webview2 messaging not available on this platform (non-Windows), using fallback");
        Ok(())
    }
}

pub use imp::setup_webview2_messaging;
