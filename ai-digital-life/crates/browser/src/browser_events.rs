use tauri::Emitter;
use tauri::Manager;

use crate::browser_navigation::resolve_url;
use crate::browser_webview::BROWSER_WEBVIEW_LABEL;

pub(crate) fn navigation_handler(app: &tauri::AppHandle, url: &url::Url) -> bool {
    // Detect hash-based title reporting from eval'd scripts
    let hash = url.fragment().unwrap_or("");
    if let Some(title) = hash.strip_prefix("adl-title=") {
        let decoded = urlencoding::decode(title).unwrap_or_default().into_owned();
        if !decoded.is_empty() {
            tracing::info!(title = %decoded, url = %url, "navigation_handler: title from hash");
            let mut clean_url = url.clone();
            clean_url.set_fragment(None);
            let _ = app.emit(
                "digital-life://browser-meta-changed",
                serde_json::json!({
                    "title": decoded,
                    "favicon": "",
                    "url": clean_url.to_string()
                }),
            );
        }
        return false;
    }
    let _ = app
        .emit("digital-life://browser-url-changed", serde_json::json!({ "url": url.to_string() }));
    true
}

pub(crate) fn new_window_handler(
    app: &tauri::AppHandle,
    url: &url::Url,
) -> tauri::webview::NewWindowResponse<tauri::Wry> {
    // Detect window.open-based title reporting from eval'd scripts
    // Format: adl-title:<encoded_title>?url=<encoded_page_url>
    if url.scheme() == "adl-title" {
        let title = urlencoding::decode(url.path()).unwrap_or_default().into_owned();
        let actual_url = url
            .query_pairs()
            .find(|(k, _)| k == "url")
            .map(|(_, v)| v.to_string())
            .unwrap_or_default();
        if !title.is_empty() {
            tracing::info!(title = %title, url = %actual_url, "new_window_handler: title from window.open");
            let _ = app.emit(
                "digital-life://browser-meta-changed",
                serde_json::json!({
                    "title": title,
                    "favicon": "",
                    "url": actual_url
                }),
            );
        }
        return tauri::webview::NewWindowResponse::Deny;
    }
    if let Some(window) = app.get_window("main") {
        if let Some(webview) = window.get_webview(BROWSER_WEBVIEW_LABEL) {
            if let Ok(parsed_url) = resolve_url(url.as_str()) {
                let _ = webview.navigate(parsed_url);
            }
        }
    }
    tauri::webview::NewWindowResponse::Deny
}
