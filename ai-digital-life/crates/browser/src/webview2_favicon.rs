//! WebView2 FaviconChanged handler (Method 4).
//!
//! Native favicon detection via WebView2's FaviconChanged event
//! (requires ICoreWebView2_15, SDK 1.0.2950+).
//!
//! Only caches the favicon URI — does NOT emit. The DocumentTitleChanged
//! handler (in `webview2_title`) reads from `FAVICON_CACHE` and emits
//! with the title.

#[cfg(windows)]
mod imp {
    use std::sync::atomic::Ordering;

    use tracing::{debug, info, warn};
    use webview2_com::take_pwstr;
    use webview2_com::FaviconChangedEventHandler;
    use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2, ICoreWebView2_15};
    use windows::core::{IUnknown, Interface};

    use crate::webview2_message::shared::{
        FAVICON_CACHE, FAVICON_CHANGED_COUNT,
    };

    pub fn setup_favicon_changed_handler(core: &ICoreWebView2) -> Result<(), String> {
        info!("[ADL-META-RECV] Method 4 (FaviconChanged): setting up handler");
        unsafe {
            let core15: ICoreWebView2_15 = match core.cast() {
                Ok(c) => c,
                Err(e) => {
                    warn!(
                        "[ADL-META-RECV] Method 4 (FaviconChanged): ICoreWebView2_15 not available (need SDK 1.0.2950+): {}, falling back to postMessage/poll",
                        e
                    );
                    return Ok(());
                },
            };

            let handler = FaviconChangedEventHandler::create(Box::new(
                move |sender: Option<ICoreWebView2>, _args: Option<IUnknown>| {
                    let Some(sender) = sender else {
                        return Ok(());
                    };

                    let core15: ICoreWebView2_15 = match sender.cast() {
                        Ok(c) => c,
                        Err(_) => return Ok(()),
                    };

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

                    let mut url_pwstr = windows::core::PWSTR::null();
                    if let Err(_e) = sender.Source(&mut url_pwstr) {
                        return Ok(());
                    }
                    let url =
                        if url_pwstr.is_null() { String::new() } else { take_pwstr(url_pwstr) };

                    if !url.is_empty() {
                        if let Ok(mut cache) = FAVICON_CACHE.write() {
                            cache.insert(url.clone(), favicon.clone());
                        }
                    }

                    let count = FAVICON_CHANGED_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
                    debug!(
                        "[ADL-META-RECV] ◄ Method 4 (FaviconChanged): CACHED ✓ (#{}) | favicon: {} | url: {}",
                        count,
                        favicon.chars().take(50).collect::<String>(),
                        url.chars().take(80).collect::<String>()
                    );

                    Ok(())
                },
            ));

            let mut token: i64 = 0;
            match core15.add_FaviconChanged(&handler, &mut token as *mut _ as *mut _) {
                Ok(_) => {
                    info!(
                        "[ADL-META-RECV] Method 4 (FaviconChanged): handler REGISTERED ✓ (token={}), NATIVE FAVICON DETECTION ENABLED",
                        token
                    );
                },
                Err(e) => {
                    warn!(
                        "[ADL-META-RECV] Method 4 (FaviconChanged): FAILED to register handler: {}, falling back",
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

    pub fn setup_favicon_changed_handler() -> Result<(), String> {
        debug!(
            "favicon changed handler not available on this platform (non-Windows), using fallback"
        );
        Ok(())
    }
}

pub use imp::setup_favicon_changed_handler;
