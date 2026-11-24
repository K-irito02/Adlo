#[cfg(windows)]
mod imp {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_COLOR, ICoreWebView2, ICoreWebView2Controller, ICoreWebView2Controller2,
    };
    use windows::core::{HSTRING, Interface};

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

    /// Map a color scheme name to the browser-canvas neutral color.
    ///
    /// This is the WebView2 default background (behind pages that do not set
    /// their own background). It is intentionally **not** the app theme color:
    /// pages without a background must remain readable (dark text), and the
    /// canvas should look neutral in both themes. Dark mode is a slightly
    /// deeper neutral than light mode.
    ///
    /// - `"dark"`  → `#e0e0e0`
    /// - `"light"` → `#f2f2f2`
    /// - Unknown values default to dark.
    pub fn theme_to_rgb(color_scheme: &str) -> (u8, u8, u8) {
        match color_scheme {
            "light" => (0xF2, 0xF2, 0xF2),
            _ => (0xE0, 0xE0, 0xE0),
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
    /// Map a color scheme name to the browser-canvas neutral color.
    ///
    /// This is the WebView2 default background (behind pages that do not set
    /// their own background). It is intentionally **not** the app theme color:
    /// pages without a background must remain readable (dark text), and the
    /// canvas should look neutral in both themes. Dark mode is a slightly
    /// deeper neutral than light mode.
    ///
    /// - `"dark"`  → `#e0e0e0`
    /// - `"light"` → `#f2f2f2`
    /// - Unknown values default to dark.
    pub fn theme_to_rgb(color_scheme: &str) -> (u8, u8, u8) {
        match color_scheme {
            "light" => (0xF2, 0xF2, 0xF2),
            _ => (0xE0, 0xE0, 0xE0),
        }
    }
}

pub use imp::theme_to_rgb;
#[cfg(windows)]
pub use imp::{navigate_core, set_default_background_color};

/// 归一化主题字符串（关闭审查）：命令签名接受任意 String（直接 IPC 可达），但
/// 下游语义分裂（`theme_to_rgb`/init 脚本偏 dark，`set_profile` 偏 Auto）。
/// 所有主题入口（创建、存储同步）统一归一化为 `"light" | "dark"`，保证首帧背景
/// 与 Profile 一致；未知值一律 dark。
pub fn normalize_color_scheme(scheme: &str) -> String {
    match scheme {
        "light" => "light".to_string(),
        _ => "dark".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::theme_to_rgb;

    #[test]
    fn browser_canvas_is_neutral_in_both_themes() {
        // Not the app theme background: pages without their own background must
        // stay readable with dark text, in both themes.
        assert_eq!(theme_to_rgb("light"), (0xF2, 0xF2, 0xF2));
        assert_eq!(theme_to_rgb("dark"), (0xE0, 0xE0, 0xE0));
        assert_eq!(theme_to_rgb("unknown"), (0xE0, 0xE0, 0xE0));
    }
}
