use adl_errors::AppError;
use url::Url;

/// 初始化脚本：确保所有链接点击都在当前 WebView 中打开
///
/// Source lives in `init_script.js` to enable JS IDE tooling (syntax highlighting,
/// linting, formatting). Inlined at compile time via `include_str!` — no runtime
/// file I/O.
pub const INIT_SCRIPT: &str = include_str!("init_script.js");

/// Generate an initialization script with a hardcoded background color based on
/// the color scheme. This avoids relying on `prefers-color-scheme` media query
/// which may return stale values during the `about:blank` phase (before
/// `SetPreferredColorScheme` is applied via Profile API).
///
/// The background color is set via inline style on `document.documentElement`
/// before the page's CSS loads, preventing theme flash.
pub fn init_script_with_background(color_scheme: &str) -> String {
    // Color values must match `theme_to_rgb` in webview2_background.rs
    let bg = match color_scheme {
        "light" => "#f8f8f8",
        _ => "#141414",
    };
    format!(
        "(function() {{ try {{ document.documentElement.style.backgroundColor = '{bg}'; }} catch(e) {{}} }})();\n{INIT_SCRIPT}"
    )
}

pub fn resolve_url(raw: &str) -> Result<Url, AppError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("about:blank") {
        return Url::parse("data:text/html,<html><body></body></html>")
            .map_err(|e| AppError::Internal(format!("invalid url: {e}")));
    }
    if let Ok(parsed) = Url::parse(trimmed) {
        return Ok(parsed);
    }
    if !trimmed.contains("://") {
        let with_scheme = format!("https://{}", trimmed);
        if let Ok(parsed) = Url::parse(&with_scheme) {
            return Ok(parsed);
        }
    }
    Err(AppError::InvalidInput(format!("Cannot parse URL: {}", trimmed)))
}
