#[cfg(windows)]
mod imp {
    use tauri::Webview;

    pub fn set_color_scheme(webview: &Webview, color_scheme: &str) {
        let cs = color_scheme.to_string();
        let _ = webview.with_webview(move |platform_wv| unsafe {
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

            match core.CallDevToolsProtocolMethod(&method, &params, None) {
                Ok(_) => tracing::info!("CDP: set emulated media to {cs}"),
                Err(e) => tracing::warn!("CDP: CallDevToolsProtocolMethod failed: {e}"),
            }
        });
    }
}

#[cfg(not(windows))]
mod imp {
    use tauri::Webview;

    pub fn set_color_scheme(_webview: &Webview, _color_scheme: &str) {}
}

pub use imp::set_color_scheme;
