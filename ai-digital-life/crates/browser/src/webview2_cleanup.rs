#[cfg(windows)]
mod imp {
    use tauri::Webview;
    use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
    use windows::core::HSTRING;

    pub fn clear_cookies(webview: &Webview) {
        let _ = webview.with_webview(move |platform_wv| unsafe {
            let controller = platform_wv.controller();
            let core = match controller.CoreWebView2() {
                Ok(c) => c,
                Err(e) => {
                    tracing::warn!("clear_cookies: failed to get CoreWebView2: {e}");
                    return;
                },
            };

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
        });
    }

    pub fn clear_cache(webview: &Webview) {
        let _ = webview.with_webview(move |platform_wv| unsafe {
            let controller = platform_wv.controller();
            let core = match controller.CoreWebView2() {
                Ok(c) => c,
                Err(e) => {
                    tracing::warn!("clear_cache: failed to get CoreWebView2: {e}");
                    return;
                },
            };

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
        });
    }
}

#[cfg(not(windows))]
mod imp {
    use tauri::Webview;

    pub fn clear_cookies(_webview: &Webview) {
        tracing::debug!("clear_cookies: not supported on non-Windows");
    }

    pub fn clear_cache(_webview: &Webview) {
        tracing::debug!("clear_cache: not supported on non-Windows");
    }
}

pub use imp::{clear_cache, clear_cookies};
