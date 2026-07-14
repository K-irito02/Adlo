#[cfg(windows)]
mod imp {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2Controller, ICoreWebView2Controller2, COREWEBVIEW2_COLOR,
    };
    use windows::core::{Interface, HSTRING};

    /// Set the WebView2 default background color via `ICoreWebView2Controller2`.
    ///
    /// This eliminates the white flash that appears before the page's first paint,
    /// because WebView2's default background is white regardless of the page's
    /// `prefers-color-scheme`.
    ///
    /// Returns an error if the controller does not implement `ICoreWebView2Controller2`
    /// (older WebView2 runtime versions).
    pub fn set_default_background_color(
        controller: &ICoreWebView2Controller,
        r: u8,
        g: u8,
        b: u8,
    ) -> Result<(), windows::core::Error> {
        let controller2: ICoreWebView2Controller2 = controller.cast()?;
        let color = COREWEBVIEW2_COLOR { R: r, G: g, B: b, A: 255 };
        unsafe { controller2.SetDefaultBackgroundColor(color) }
    }

    /// Map a color scheme name to RGB values matching the app's CSS variables.
    ///
    /// - `"dark"`  → `#141414` (`var(--bg)` in dark theme)
    /// - `"light"` → `#f8f8f8` (`var(--bg)` in light theme)
    /// - Unknown values default to dark.
    pub fn theme_to_rgb(color_scheme: &str) -> (u8, u8, u8) {
        match color_scheme {
            "light" => (0xF8, 0xF8, 0xF8),
            _ => (0x14, 0x14, 0x14),
        }
    }

    /// Navigate the WebView2 core to a URL string.
    ///
    /// This is used during WebView creation to navigate from the initial `about:blank`
    /// to the real target URL after the background color and CDP color scheme have been
    /// applied, ensuring the page's first paint uses the correct theme.
    pub fn navigate_core(core: &ICoreWebView2, url: &str) -> Result<(), windows::core::Error> {
        unsafe { core.Navigate(&HSTRING::from(url)) }
    }
}

#[cfg(not(windows))]
mod imp {
    /// Map a color scheme name to RGB values matching the app's CSS variables.
    ///
    /// - `"dark"`  → `#141414` (`var(--bg)` in dark theme)
    /// - `"light"` → `#f8f8f8` (`var(--bg)` in light theme)
    /// - Unknown values default to dark.
    pub fn theme_to_rgb(color_scheme: &str) -> (u8, u8, u8) {
        match color_scheme {
            "light" => (0xF8, 0xF8, 0xF8),
            _ => (0x14, 0x14, 0x14),
        }
    }
}

pub use imp::theme_to_rgb;
#[cfg(windows)]
pub use imp::{navigate_core, set_default_background_color};
