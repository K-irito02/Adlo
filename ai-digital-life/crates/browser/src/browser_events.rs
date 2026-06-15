use tauri::Emitter;
use tauri::Manager;

use crate::browser_navigation::resolve_url;
use crate::browser_webview::BROWSER_WEBVIEW_LABEL;

pub(crate) fn navigation_handler(app: &tauri::AppHandle, url: &url::Url) -> bool {
    let _ = app
        .emit("digital-life://browser-url-changed", serde_json::json!({ "url": url.to_string() }));
    true
}

pub(crate) fn new_window_handler(
    app: &tauri::AppHandle,
    url: &url::Url,
) -> tauri::webview::NewWindowResponse<tauri::Wry> {
    if let Some(window) = app.get_window("main") {
        if let Some(webview) = window.get_webview(BROWSER_WEBVIEW_LABEL) {
            if let Ok(parsed_url) = resolve_url(url.as_str()) {
                let _ = webview.navigate(parsed_url);
            }
        }
    }
    tauri::webview::NewWindowResponse::Deny
}
