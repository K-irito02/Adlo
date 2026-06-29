#[cfg(windows)]
mod imp {
    use tauri::Webview;
    use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
    use windows::core::HSTRING;

    pub fn set_color_scheme(webview: &Webview, color_scheme: &str) {
        let cs = color_scheme.to_string();
        tracing::info!(color_scheme = &cs, "webview2_set_color_scheme entered");

        // Use CDP Emulation.setEmulatedMedia instead of Profile.SetPreferredColorScheme.
        // SetPreferredColorScheme affects the WebView2 PROFILE which is shared with the
        // main app WebView, causing the app's prefers-color-scheme media query to change
        // and triggering a ThemeController feedback loop.
        // CDP emulation is per-WebView and does NOT affect the shared profile.
        let _ = webview.with_webview(move |platform_wv| unsafe {
            let controller = platform_wv.controller();
            let core = match controller.CoreWebView2() {
                Ok(c) => c,
                Err(e) => {
                    tracing::warn!("cdp: failed to get CoreWebView2: {e}");
                    return;
                },
            };

            let params_json =
                format!(r#"{{"features":[{{"name":"prefers-color-scheme","value":"{cs}"}}]}}"#);
            let method = HSTRING::from("Emulation.setEmulatedMedia");
            let params = HSTRING::from(&params_json);

            let cs_handler = cs.clone();
            let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                move |_error_code, _result_json| {
                    tracing::info!(
                        ?_error_code,
                        result = %_result_json,
                        "cdp: Emulation.setEmulatedMedia completed for {cs_handler}"
                    );
                    Ok(())
                },
            ));

            match core.CallDevToolsProtocolMethod(&method, &params, Some(&handler)) {
                Ok(_) => tracing::info!("cdp: set emulated media to {cs}"),
                Err(e) => tracing::warn!("cdp: CallDevToolsProtocolMethod failed: {e}"),
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
