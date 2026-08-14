//! WebView2 chrome.webview.postMessage handler (Method 1).
//!
//! Registers a WebMessageReceived handler on the WebView2 instance,
//! allowing JavaScript to send meta events instantly via
//! `chrome.webview.postMessage(JSON.stringify({type:'meta', ...}))`.
//!
//! Also handles `{type:'open-new-tab', url}` messages sent by the injected
//! `init_script.js` when the page requests a new tab (target="_blank" links
//! and `window.open`), routing them to the platform event bridge.

#[cfg(windows)]
mod imp {
    use std::sync::Arc;
    use std::sync::atomic::Ordering;

    use tracing::{debug, error, warn};
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2_2, ICoreWebView2WebMessageReceivedEventArgs,
    };
    use webview2_com::take_pwstr;
    use windows::core::Interface;

    use crate::WebView2EventBridge;
    use crate::webview2_message::shared::{POSTMESSAGE_RECEIVED_COUNT, should_emit_and_update};

    pub fn setup_webview2_messaging(
        core: &ICoreWebView2,
        tab_id: &str,
        bridge: &Arc<dyn WebView2EventBridge>,
    ) -> Result<(), String> {
        debug!("[ADL-META-RECV] Method 1 (postMessage): setting up handler");
        unsafe {
            let core2: ICoreWebView2_2 = match core.cast() {
                Ok(c) => c,
                Err(e) => {
                    error!(
                        "[ADL-META-RECV] Method 1 (postMessage): FAILED to cast to ICoreWebView2_2: {}",
                        e
                    );
                    return Ok(());
                },
            };

            let bridge_for_handler = bridge.clone();
            let tab_id_for_handler = tab_id.to_string();
            let handler = webview2_com::WebMessageReceivedEventHandler::create(Box::new(
                move |_sender: Option<ICoreWebView2>,
                      args: Option<ICoreWebView2WebMessageReceivedEventArgs>| {
                    let Some(args) = args else {
                        return Ok(());
                    };

                    let mut json = windows::core::PWSTR::null();
                    if let Err(e) = args.TryGetWebMessageAsString(&mut json) {
                        debug!(
                            "[ADL-META-RECV] Method 1 (postMessage): failed to get message: {}",
                            e
                        );
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
                        if let Some(url) = super::open_new_tab_url_from_message(&json_str) {
                            bridge_for_handler.emit_open_new_tab(&url);
                            return Ok(());
                        }
                        if meta.get("type").and_then(|t| t.as_str()) == Some("meta") {
                            let title = meta
                                .get("title")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            let favicon = meta
                                .get("favicon")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            let url =
                                meta.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();

                            // Skip stale/duplicate emissions
                            if !should_emit_and_update(&url, &title, &favicon) {
                                debug!(
                                    "[ADL-META-RECV] Method 1 (postMessage): SKIPPED (stale/duplicate) | title: {} | url: {}",
                                    title.chars().take(50).collect::<String>(),
                                    url.chars().take(80).collect::<String>()
                                );
                                return Ok(());
                            }

                            let count =
                                POSTMESSAGE_RECEIVED_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
                            debug!(
                                "[ADL-META-RECV] ◄ Method 1 (postMessage): RECEIVED ✓ (#{}) | title: {} | url: {}",
                                count,
                                title.chars().take(50).collect::<String>(),
                                url.chars().take(80).collect::<String>()
                            );

                            bridge_for_handler.emit_meta_changed(
                                &tab_id_for_handler,
                                &title,
                                &favicon,
                                &url,
                            );
                        }
                    }

                    Ok(())
                },
            ));

            let mut token: i64 = 0;
            match core2.add_WebMessageReceived(&handler, &mut token as *mut _ as *mut _) {
                Ok(_) => {
                    debug!(
                        "[ADL-META-RECV] Method 1 (postMessage): handler REGISTERED ✓ (token={}), REAL-TIME SYNC ENABLED",
                        token
                    );
                },
                Err(e) => {
                    warn!(
                        "[ADL-META-RECV] Method 1 (postMessage): FAILED to register handler: {}, falling back",
                        e
                    );
                },
            }
        }

        Ok(())
    }
}

#[cfg(not(windows))]
mod imp {
    use tracing::debug;

    pub fn setup_webview2_messaging(_tab_id: &str) -> Result<(), String> {
        debug!("webview2 messaging not available on this platform (non-Windows), using fallback");
        Ok(())
    }
}

pub use imp::setup_webview2_messaging;

/// Pure parse of an `{type:'open-new-tab', url}` postMessage payload.
///
/// Returns the URL only when the message type matches and the URL uses an
/// http/https scheme. Anything else returns `None` so the message is ignored.
pub fn open_new_tab_url_from_message(json: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(json).ok()?;
    if value.get("type").and_then(|t| t.as_str()) != Some("open-new-tab") {
        return None;
    }
    let url = value.get("url").and_then(|v| v.as_str())?;
    if url.starts_with("http://") || url.starts_with("https://") {
        Some(url.to_string())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::open_new_tab_url_from_message;

    #[test]
    fn open_new_tab_http_url_returns_some() {
        let json = r#"{"type":"open-new-tab","url":"https://www.bilibili.com/video/BV1eSGP6BEfn"}"#;
        assert_eq!(
            open_new_tab_url_from_message(json),
            Some("https://www.bilibili.com/video/BV1eSGP6BEfn".to_string())
        );
    }

    #[test]
    fn open_new_tab_http_scheme_returns_some() {
        let json = r#"{"type":"open-new-tab","url":"http://example.com/a"}"#;
        assert_eq!(open_new_tab_url_from_message(json), Some("http://example.com/a".to_string()));
    }

    #[test]
    fn open_new_tab_meta_type_returns_none() {
        let json = r#"{"type":"meta","title":"t","url":"https://example.com"}"#;
        assert_eq!(open_new_tab_url_from_message(json), None);
    }

    #[test]
    fn open_new_tab_non_http_url_returns_none() {
        let json = r#"{"type":"open-new-tab","url":"javascript:alert(1)"}"#;
        assert_eq!(open_new_tab_url_from_message(json), None);
    }

    #[test]
    fn open_new_tab_malformed_json_returns_none() {
        assert_eq!(open_new_tab_url_from_message("not json"), None);
    }

    #[test]
    fn open_new_tab_missing_url_returns_none() {
        let json = r#"{"type":"open-new-tab"}"#;
        assert_eq!(open_new_tab_url_from_message(json), None);
    }
}
