#[cfg(windows)]
mod imp {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_PREFERRED_COLOR_SCHEME, ICoreWebView2, ICoreWebView2_13,
    };
    use windows::core::Interface;

    /// Set the WebView2 Profile's `PreferredColorScheme`.
    ///
    /// This is the **native** WebView2 API for color scheme control (introduced
    /// in WebView2 1.0.1518.0). Unlike CDP `Emulation.setEmulatedMedia`, it is
    /// **synchronous** — it takes effect immediately, before any page load, so
    /// the page's first paint always sees the correct `prefers-color-scheme`.
    ///
    /// Values: 0=Auto, 1=Light, 2=Dark
    pub fn set_profile_color_scheme(core: &ICoreWebView2, color_scheme: &str) {
        let cs_val: i32 = match color_scheme {
            "light" => 1,
            "dark" => 2,
            _ => 0, // Auto
        };
        tracing::debug!(color_scheme = color_scheme, cs_val, "set_profile_color_scheme: ENTER");

        // Cast to ICoreWebView2_13 to access the Profile() method
        let core13: ICoreWebView2_13 = match core.cast() {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!(error = %e, "set_profile_color_scheme: failed to cast to ICoreWebView2_13 (old WebView2 runtime?)");
                return;
            },
        };

        let profile = match unsafe { core13.Profile() } {
            Ok(p) => p,
            Err(e) => {
                tracing::warn!(error = %e, "set_profile_color_scheme: failed to get Profile");
                return;
            },
        };

        let scheme = COREWEBVIEW2_PREFERRED_COLOR_SCHEME(cs_val);
        match unsafe { profile.SetPreferredColorScheme(scheme) } {
            Ok(_) => tracing::debug!(
                color_scheme = color_scheme,
                cs_val,
                "set_profile_color_scheme: SetPreferredColorScheme succeeded"
            ),
            Err(e) => {
                tracing::warn!(error = %e, "set_profile_color_scheme: SetPreferredColorScheme failed")
            },
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn set_profile_color_scheme(_color_scheme: &str) {}
}

pub use imp::set_profile_color_scheme;
