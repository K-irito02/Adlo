//! WebView2 HistoryChanged handler (Method 5).
//!
//! Detects SPA (Single Page Application) navigations via WebView2's
//! HistoryChanged event. Emits a `browser-url-changed` event and spawns
//! a 2-second fallback thread to extract the title via JS eval if no
//! DocumentTitleChanged/postMessage event arrives (handles YouTube
//! auto-play and similar SPA flows where `document.title` is not updated).

#[cfg(windows)]
mod imp {
    use std::sync::Arc;
    use std::sync::atomic::Ordering;

    use tracing::{debug, warn};
    use webview2_com::HistoryChangedEventHandler;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2HistoryChangedEventHandler,
    };
    use webview2_com::take_pwstr;
    use windows::core::IUnknown;

    use crate::WebView2EventBridge;
    use crate::browser_events::should_emit_history_changed;
    use crate::webview2_message::shared::HISTORY_CHANGED_COUNT;

    fn build_history_handler(
        bridge: Arc<dyn WebView2EventBridge>,
        tab_id: String,
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

                let clean_url = url.split("#adl-meta").next().unwrap_or(&url).to_string();

                if !should_emit_history_changed(&tab_id, &clean_url) {
                    return Ok(());
                }

                bridge.emit_url_changed(&tab_id, &clean_url);

                let count = HISTORY_CHANGED_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
                debug!(
                    "[ADL-META-RECV] ◄ Method 5 (HistoryChanged): RECEIVED ✓ (#{}) | url: {}",
                    count,
                    clean_url.chars().take(80).collect::<String>()
                );

                bridge.spawn_spa_fallback(&label, &clean_url);

                Ok(())
            },
        ))
    }

    pub fn setup_history_changed_handler(
        core: &ICoreWebView2,
        tab_id: &str,
        label: &str,
        bridge: &Arc<dyn WebView2EventBridge>,
    ) -> Result<(), String> {
        debug!("[ADL-META-RECV] Method 5 (HistoryChanged): setting up handler");
        unsafe {
            let bridge_for_handler = bridge.clone();
            let handler =
                build_history_handler(bridge_for_handler, tab_id.to_string(), label.to_string());

            let mut token: i64 = 0;
            match core.add_HistoryChanged(&handler, &mut token as *mut _ as *mut _) {
                Ok(_) => {
                    debug!(
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
        }

        Ok(())
    }

    /// Whether the WebView's native history has a previous entry to go back to.
    pub fn can_go_back_webview2(core: &ICoreWebView2) -> bool {
        unsafe {
            let mut value: windows::core::BOOL = windows::core::BOOL::default();
            let ok = core.CanGoBack(&mut value).is_ok();
            ok && value.as_bool()
        }
    }

    /// Whether the WebView's native history has a next entry to go forward to.
    pub fn can_go_forward_webview2(core: &ICoreWebView2) -> bool {
        unsafe {
            let mut value: windows::core::BOOL = windows::core::BOOL::default();
            let ok = core.CanGoForward(&mut value).is_ok();
            ok && value.as_bool()
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use std::ffi::c_void;
    use std::sync::Arc;
    use tracing::debug;

    use crate::webview_handle::WebView2EventBridge;

    pub fn setup_history_changed_handler(
        _core: &c_void,
        _tab_id: &str,
        _label: &str,
        _bridge: &Arc<dyn WebView2EventBridge>,
    ) -> Result<(), String> {
        debug!(
            "history changed handler not available on this platform (non-Windows), using fallback"
        );
        Ok(())
    }

    pub fn can_go_back_webview2() -> bool {
        false
    }

    pub fn can_go_forward_webview2() -> bool {
        false
    }
}

pub use imp::can_go_back_webview2;
pub use imp::can_go_forward_webview2;
pub use imp::setup_history_changed_handler;
