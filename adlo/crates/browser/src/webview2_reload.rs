//! 「强制刷新」的平台实现：忽略本地缓存重新加载当前文档。
//!
//! WebView2 没有「忽略缓存刷新」的原生 API（`Reload()` 会命中 HTTP 缓存），只能
//! 经 CDP 下发 `Page.reload { ignoreCache: true }`。
//!
//! 失败处理分两层：同步派发失败向上返回 `Err`（由调用方决定怎么报）；已经在途的
//! 异步阶段失败记 warn 并尝试一次普通 `Reload()`；其返回值不参与回执。

#[cfg(windows)]
mod imp {
    use adl_errors::AppError;
    use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2;
    use windows::core::HSTRING;

    pub fn reload_ignoring_cache(core: &ICoreWebView2) -> Result<(), AppError> {
        // SAFETY: 只发起 CDP 调用（`Page.reload`）；`core` 的生命周期由调用方保证，
        // 回调内只用克隆出来的 COM 接口，不跨线程持有裸指针。
        unsafe {
            let core_for_cb = core.clone();
            let reload = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                move |error_code, result| {
                    if let Err(e) = error_code {
                        tracing::warn!(
                            "cdp: Page.reload(ignoreCache) failed: {e}; falling back to plain reload"
                        );
                        let _ = core_for_cb.Reload();
                        return Ok(());
                    }
                    tracing::info!(result = %result, "cdp: Page.reload(ignoreCache) completed");
                    Ok(())
                },
            ));
            match core.CallDevToolsProtocolMethod(
                &HSTRING::from("Page.reload"),
                &HSTRING::from("{\"ignoreCache\":true}"),
                Some(&reload),
            ) {
                Ok(_) => {
                    tracing::info!("cdp: Page.reload(ignoreCache) called");
                    Ok(())
                },
                Err(e) => {
                    tracing::warn!(
                        "cdp: Page.reload(ignoreCache) failed: {e}; falling back to plain reload"
                    );
                    let _ = core.Reload();
                    Err(AppError::Internal(format!("Page.reload(ignoreCache): {e}")))
                },
            }
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use adl_errors::AppError;

    /// 非 WebView2 后端没有 CDP，只能用 `location.reload()`（会命中缓存）；
    /// 返回明确失败，避免让「强制刷新」名不副实。
    pub fn reload_ignoring_cache() -> Result<(), AppError> {
        Err(AppError::InvalidInput(
            "reload_ignoring_cache: only supported on the WebView2 (Windows) backend".into(),
        ))
    }
}

pub use imp::reload_ignoring_cache;
