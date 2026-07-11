//! WebView2 DocumentTitleChanged handler (Method 3).
//!
//! Native title change detection via WebView2's DocumentTitleChanged event.
//! Reads cached favicon from `webview2_message::shared::FAVICON_CACHE` and emits
//! a meta event with (title, favicon, url).

#[cfg(windows)]
mod imp {
    use std::sync::Arc;
    use std::sync::atomic::Ordering;

    use tracing::{debug, info, warn};
    use webview2_com::take_pwstr;
    use webview2_com::DocumentTitleChangedEventHandler;
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2;
    use windows::core::IUnknown;

    use crate::webview2_message::shared::{
        should_emit_and_update, DOCUMENT_TITLE_CHANGED_COUNT,
        FAVICON_CACHE,
    };
    use crate::WebView2EventBridge;

    pub fn setup_document_title_handler(core: &ICoreWebView2, bridge: &Arc<dyn WebView2EventBridge>) -> Result<(), String> {
        info!("[ADL-META-RECV] Method 3 (DocumentTitleChanged): setting up handler");
        unsafe {
            let bridge_for_handler = bridge.clone();
            let handler = DocumentTitleChangedEventHandler::create(Box::new(
                move |sender: Option<ICoreWebView2>, _args: Option<IUnknown>| {
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
                    let url =
                        if url_pwstr.is_null() { String::new() } else { take_pwstr(url_pwstr) };

                    // Look up cached favicon for this URL
                    let favicon = if !url.is_empty() {
                        if let Ok(cache) = FAVICON_CACHE.read() {
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

                    let count =
                        DOCUMENT_TITLE_CHANGED_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
                    info!(
                        "[ADL-META-RECV] ◄ Method 3 (DocumentTitleChanged): RECEIVED ✓ (#{}) | title: {} | favicon: {} | url: {}",
                        count,
                        title.chars().take(50).collect::<String>(),
                        if favicon.is_empty() { "(empty)".to_string() } else { "✓".to_string() },
                        url.chars().take(80).collect::<String>()
                    );

                    bridge_for_handler.emit_meta_changed(&title, &favicon, &url);

                    Ok(())
                },
            ));

            let mut token: i64 = 0;
            match core.add_DocumentTitleChanged(&handler, &mut token as *mut _ as *mut _) {
                Ok(_) => {
                    info!(
                        "[ADL-META-RECV] Method 3 (DocumentTitleChanged): handler REGISTERED ✓ (token={}), NATIVE TITLE DETECTION ENABLED",
                        token
                    );
                },
                Err(e) => {
                    warn!(
                        "[ADL-META-RECV] Method 3 (DocumentTitleChanged): FAILED to register handler: {}, WebView2 runtime may be too old",
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

    pub fn setup_document_title_handler() -> Result<(), String> {
        debug!(
            "document title handler not available on this platform (non-Windows), using fallback"
        );
        Ok(())
    }
}

pub use imp::setup_document_title_handler;
