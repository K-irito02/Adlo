#[cfg(windows)]
mod imp {
    use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2;
    use windows::core::HSTRING;

    pub fn set_color_scheme(core: &ICoreWebView2, color_scheme: &str) {
        let cs = color_scheme.to_string();
        tracing::info!(color_scheme = &cs, "webview2_set_color_scheme entered");

        unsafe {
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
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn set_color_scheme(_color_scheme: &str) {}
}

pub use imp::set_color_scheme;
