#[cfg(windows)]
mod imp {
    use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2;
    use windows::core::HSTRING;

    pub fn clear_cookies(core: &ICoreWebView2) {
        unsafe {
            let method = HSTRING::from("Network.clearBrowserCookies");
            let params = HSTRING::from("{}");

            let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                move |_error_code, result_json| {
                    tracing::info!(
                        ?_error_code,
                        result = %result_json,
                        "cdp: Network.clearBrowserCookies completed"
                    );
                    Ok(())
                },
            ));

            match core.CallDevToolsProtocolMethod(&method, &params, Some(&handler)) {
                Ok(_) => tracing::info!("cdp: Network.clearBrowserCookies called"),
                Err(e) => tracing::warn!("cdp: Network.clearBrowserCookies failed: {e}"),
            }
        }
    }

    pub fn clear_cache(core: &ICoreWebView2) {
        unsafe {
            let method = HSTRING::from("Network.clearBrowserCache");
            let params = HSTRING::from("{}");

            let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                move |_error_code, result_json| {
                    tracing::info!(
                        ?_error_code,
                        result = %result_json,
                        "cdp: Network.clearBrowserCache completed"
                    );
                    Ok(())
                },
            ));

            match core.CallDevToolsProtocolMethod(&method, &params, Some(&handler)) {
                Ok(_) => tracing::info!("cdp: Network.clearBrowserCache called"),
                Err(e) => tracing::warn!("cdp: Network.clearBrowserCache failed: {e}"),
            }
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn clear_cookies() {
        tracing::debug!("clear_cookies: not supported on non-Windows");
    }

    pub fn clear_cache() {
        tracing::debug!("clear_cache: not supported on non-Windows");
    }
}

pub use imp::{clear_cache, clear_cookies};
