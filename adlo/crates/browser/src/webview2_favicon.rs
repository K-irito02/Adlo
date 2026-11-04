//! WebView2 FaviconChanged handler (Method 4).
//!
//! Native favicon detection via WebView2's FaviconChanged event
//! (requires ICoreWebView2_15, SDK 1.0.2950+).
//!
//! Caches the favicon URI in `FAVICON_CACHE`. The DocumentTitleChanged
//! handler (in `webview2_title`) reads from `FAVICON_CACHE` and emits
//! with the title. Additionally, when a favicon arrives late (after the
//! title event already fired), this handler re-emits a meta with the
//! current document title so the late favicon isn't dropped.

#[cfg(windows)]
mod imp {
    use std::sync::Arc;
    use std::sync::atomic::Ordering;

    use tracing::{debug, warn};
    use webview2_com::FaviconChangedEventHandler;
    use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2, ICoreWebView2_15};
    use webview2_com::take_pwstr;
    use windows::core::{IUnknown, Interface};

    use crate::webview_handle::WebView2EventBridge;
    use crate::webview2_message::shared::{
        FAVICON_CACHE, FAVICON_CHANGED_COUNT, should_emit_and_update,
    };

    /// FaviconChanged 事件处理逻辑（从闭包提取为自由函数，降低嵌套深度）。
    ///
    /// 获取 favicon URI 和页面 URL，缓存到 `FAVICON_CACHE` 并递增计数器。
    /// 计时序修复：favicon（尤其 bilibili/runoob 等站点）常在 DocumentTitleChanged
    /// 之后才可达；若仅靠 Method 3（标题事件）读缓存的那一次发射，晚期到达的
    /// favicon 会被丢弃。故缓存到「新」favicon 时，这里读取当前 document title
    /// 并用该 favicon 补发一次 meta（配合全局去重，避免刷屏）。
    /// 所有错误路径均静默返回 `Ok(())`，因为 favicon 检测是尽力而为的增强功能。
    fn handle_favicon_changed(
        sender: Option<ICoreWebView2>,
        _args: Option<IUnknown>,
        tab_id: &str,
        bridge: &Arc<dyn WebView2EventBridge>,
    ) -> windows::core::Result<()> {
        let Some(sender) = sender else {
            return Ok(());
        };

        let core15: ICoreWebView2_15 = match sender.cast() {
            Ok(c) => c,
            Err(_) => return Ok(()),
        };

        let mut favicon_pwstr = windows::core::PWSTR::null();
        if let Err(e) = unsafe { core15.FaviconUri(&mut favicon_pwstr) } {
            debug!("[ADL-META-RECV] Method 4 (FaviconChanged): FaviconUri() failed: {}", e);
            return Ok(());
        }
        let favicon =
            if favicon_pwstr.is_null() { String::new() } else { take_pwstr(favicon_pwstr) };
        if favicon.is_empty() {
            return Ok(());
        }

        let mut url_pwstr = windows::core::PWSTR::null();
        if let Err(_e) = unsafe { sender.Source(&mut url_pwstr) } {
            return Ok(());
        }
        let url = if url_pwstr.is_null() { String::new() } else { take_pwstr(url_pwstr) };

        // 仅「新 favicon」（较缓存旧值有变化）才补回传，配合 should_emit_and_update 去重。
        let changed = if !url.is_empty() {
            if let Ok(mut cache) = FAVICON_CACHE.write() {
                let changed = cache.get(&url) != Some(&favicon);
                cache.insert(url.clone(), favicon.clone());
                changed
            } else {
                false
            }
        } else {
            false
        };

        let count = FAVICON_CHANGED_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
        debug!(
            "[ADL-META-RECV] ◄ Method 4 (FaviconChanged): CACHED ✓ (#{}) | favicon: {} | url: {}",
            count,
            favicon.chars().take(50).collect::<String>(),
            url.chars().take(80).collect::<String>()
        );

        if changed && !url.is_empty() {
            let title = {
                let mut title_pwstr = windows::core::PWSTR::null();
                let res = unsafe { sender.DocumentTitle(&mut title_pwstr) };
                if res.is_ok() && !title_pwstr.is_null() {
                    take_pwstr(title_pwstr)
                } else {
                    String::new()
                }
            };
            if !title.is_empty() && should_emit_and_update(&url, &title, &favicon) {
                bridge.emit_meta_changed(tab_id, &title, &favicon, &url);
                debug!(
                    "[ADL-META-RECV] Method 4 (FaviconChanged): RE-EMIT ✓ (late favicon) | title: {} | favicon: {} | url: {}",
                    title.chars().take(50).collect::<String>(),
                    favicon.chars().take(60).collect::<String>(),
                    url.chars().take(80).collect::<String>()
                );
            }
        }

        Ok(())
    }

    pub fn setup_favicon_changed_handler(
        core: &ICoreWebView2,
        tab_id: &str,
        bridge: &Arc<dyn WebView2EventBridge>,
    ) -> Result<(), String> {
        debug!("[ADL-META-RECV] Method 4 (FaviconChanged): setting up handler");
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

            let tab_id_owned = tab_id.to_string();
            let bridge_owned = bridge.clone();
            let handler = FaviconChangedEventHandler::create(Box::new(
                move |sender: Option<ICoreWebView2>, args: Option<IUnknown>| {
                    handle_favicon_changed(sender, args, &tab_id_owned, &bridge_owned)
                },
            ));

            let mut token: i64 = 0;
            match core15.add_FaviconChanged(&handler, &mut token as *mut _ as *mut _) {
                Ok(_) => {
                    debug!(
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
    use std::ffi::c_void;
    use std::sync::Arc;
    use tracing::debug;

    use crate::webview_handle::WebView2EventBridge;

    pub fn setup_favicon_changed_handler(
        _core: &c_void,
        _tab_id: &str,
        _bridge: &Arc<dyn WebView2EventBridge>,
    ) -> Result<(), String> {
        debug!(
            "favicon changed handler not available on this platform (non-Windows), using fallback"
        );
        Ok(())
    }
}

pub use imp::setup_favicon_changed_handler;
