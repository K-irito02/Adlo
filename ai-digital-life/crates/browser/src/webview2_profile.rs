#[cfg(windows)]
mod imp {
    use tauri::Webview;

    pub fn set_color_scheme(webview: &Webview, color_scheme: &str) {
        let cs = color_scheme.to_string();
        tracing::info!(color_scheme = &cs, "webview2_set_color_scheme entered");

        let _ = webview.with_webview(move |platform_wv| unsafe {
            tracing::info!("CDP: inside with_webview closure");

            let controller = platform_wv.controller();

            let core = match controller.CoreWebView2() {
                Ok(c) => c,
                Err(e) => {
                    tracing::warn!("CDP: failed to get CoreWebView2: {e}");
                    return;
                }
            };

            let params_json = format!(
                r#"{{"features":[{{"name":"prefers-color-scheme","value":"{cs}"}}]}}"#
            );
            let method = windows::core::HSTRING::from("Emulation.setEmulatedMedia");
            let params = windows::core::HSTRING::from(&params_json);

            tracing::info!("CDP: about to call CallDevToolsProtocolMethod");
            match core.CallDevToolsProtocolMethod(&method, &params, None) {
                Ok(_) => {
                    tracing::info!("CDP: set emulated media to {cs}");
                }
                Err(e) => tracing::warn!("CDP: CallDevToolsProtocolMethod failed: {e}"),
            }
        });

        // Fallback: also set CSS color-scheme property via eval (scrollbars, form controls)
        let fallback_js = format!(
            "try{{document.documentElement.style.colorScheme='{color_scheme}'}}catch(e){{}}"
        );
        let _ = webview.eval(&fallback_js);
    }
}

#[cfg(not(windows))]
mod imp {
    use tauri::Webview;

    pub fn set_color_scheme(_webview: &Webview, _color_scheme: &str) {}
}

pub use imp::set_color_scheme;
