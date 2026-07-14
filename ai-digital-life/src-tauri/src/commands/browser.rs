use std::sync::Arc;

use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use crate::tauri_webview_handle::TauriWebViewHandle;
use crate::webview_event_bridge::TauriWebView2EventBridge;
use adl_browser::webview_handle::{Bounds, EventBridgeRef, WebViewHandle};
use adl_browser::{webview_label, PageMeta};
use adl_errors::AppError;
use adl_kernel::IpcResult;
use tauri::{Emitter, Manager, State};

fn new_window_handler(
    app: &tauri::AppHandle,
    url: &url::Url,
) -> tauri::webview::NewWindowResponse<tauri::Wry> {
    if url.scheme() == "http" || url.scheme() == "https" {
        if let Some(window) = app.get_window("main") {
            if let Some(webview) = window.get_webview(adl_browser::BROWSER_WEBVIEW_LABEL) {
                if let Ok(parsed_url) = adl_browser::resolve_url(url.as_str()) {
                    let _ = webview.navigate(parsed_url);
                }
            }
        }
    }
    tauri::webview::NewWindowResponse::Deny
}

fn resolve_window_and_url(
    app: &tauri::AppHandle,
    url: &str,
) -> Result<(tauri::Window<tauri::Wry>, url::Url), AppError> {
    let window = app
        .get_window("main")
        .ok_or_else(|| AppError::Internal("main window not found".into()))?;
    let target = adl_browser::resolve_url(url)
        .map_err(|e| AppError::Internal(format!("failed to resolve URL: {e}")))?;
    Ok((window, target))
}

fn build_webview_builder(
    label: &str,
    target: url::Url,
    app_handle: tauri::AppHandle,
) -> tauri::webview::WebviewBuilder<tauri::Wry> {
    let app_nav = app_handle.clone();
    tauri::webview::WebviewBuilder::new(label, tauri::WebviewUrl::External(target))
        .initialization_script(adl_browser::INIT_SCRIPT)
        .on_navigation(move |url| {
            adl_browser::navigation_handler(url, &|normalized| {
                let _ = app_nav.emit(
                    "digital-life://browser-url-changed",
                    serde_json::json!({ "url": normalized }),
                );
            })
        })
        .on_new_window(move |url, _window_features| new_window_handler(&app_handle, &url))
}

fn setup_webview2_handlers_for_platform(
    webview: &tauri::Webview<tauri::Wry>,
    tab_id: &str,
    label: &str,
    bridge: EventBridgeRef,
) {
    #[cfg(windows)]
    {
        let bridge = bridge.clone();
        let tab_id = tab_id.to_string();
        let label = label.to_string();
        let _ = webview.with_webview(move |platform_wv| unsafe {
            let controller = platform_wv.controller();
            if let Ok(core) = controller.CoreWebView2() {
                adl_browser::setup_webview2_handlers(&core, &tab_id, &label, &bridge);
            }
        });
    }
    #[cfg(not(windows))]
    {
        adl_browser::setup_webview2_handlers(tab_id, label);
    }
}

fn apply_color_scheme_for_platform(
    webview: &tauri::Webview<tauri::Wry>,
    color_scheme: &str,
) {
    #[cfg(windows)]
    {
        let cs = color_scheme.to_string();
        let _ = webview.with_webview(move |platform_wv| unsafe {
            let controller = platform_wv.controller();
            if let Ok(core) = controller.CoreWebView2() {
                adl_browser::webview2_set_color_scheme(&core, &cs);
            }
        });
    }
    #[cfg(not(windows))]
    {
        adl_browser::webview2_set_color_scheme(color_scheme);
    }
}

fn register_webview_with_manager(
    state: &AppState,
    app_handle: tauri::AppHandle,
    label: String,
    tab_id: &str,
) -> Result<Option<String>, AppError> {
    let handle: Arc<dyn WebViewHandle> =
        Arc::new(TauriWebViewHandle::new(app_handle, label));
    state
        .browser_manager
        .create_for_tab(handle, tab_id)
        .map_err(|e| AppError::Internal(format!("failed to register browser: {e}")))
}

#[tauri::command]
pub async fn browser_create_for_tab(
    app: tauri::AppHandle,
    tab_id: String,
    url: String,
) -> Result<IpcResult<Option<String>>, CommandError> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let app_inner = app.clone();

    app.run_on_main_thread(move || {
        let state = app_inner.state::<AppState>();
        let label = webview_label(&tab_id);

        let result = (|| -> Result<Option<String>, AppError> {
            let (window, target) = resolve_window_and_url(&app_inner, &url)?;
            let webview_builder = build_webview_builder(&label, target, app_inner.clone());

            window
                .add_child(
                    webview_builder,
                    tauri::LogicalPosition::new(-10000.0, -10000.0),
                    tauri::LogicalSize::new(800.0, 600.0),
                )
                .map_err(|e| AppError::Internal(format!("failed to create webview for tab {tab_id}: {e}")))?;

            tracing::info!(tab_id = &tab_id, url = &url, "browser webview created for tab");

            if let Some(webview) = window.get_webview(&label) {
                let bridge: EventBridgeRef =
                    Arc::new(TauriWebView2EventBridge::new(app_inner.clone()));
                setup_webview2_handlers_for_platform(&webview, &tab_id, &label, bridge.clone());
                let cs = state.browser_manager.current_color_scheme();
                apply_color_scheme_for_platform(&webview, &cs);
            }

            register_webview_with_manager(&state, app_inner.clone(), label.clone(), &tab_id)
        })();

        let _ = tx.send(result);
    })
    .map_err(|e| AppError::Internal(format!("main thread dispatch: {e}")))?;

    Ok(ipc(
        rx.await
            .map_err(|e| AppError::Internal(format!("creation channel: {e}")))?,
    ))
}

#[tauri::command]
pub fn browser_activate_tab(
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.activate_tab(&tab_id)))
}

#[tauri::command]
pub fn browser_destroy_tab(
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.destroy_tab(&tab_id)))
}

#[tauri::command]
pub fn browser_navigate_tab(
    state: State<'_, AppState>,
    tab_id: String,
    url: String,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.navigate_tab(&tab_id, &url)))
}

#[tauri::command]
pub fn browser_set_tab_bounds(
    state: State<'_, AppState>,
    tab_id: String,
    bounds: Bounds,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.set_tab_bounds(&tab_id, bounds)))
}

#[tauri::command]
pub fn browser_go_back_tab(
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<IpcResult<bool>, CommandError> {
    Ok(ipc(state.browser_manager.go_back_tab(&tab_id)))
}

#[tauri::command]
pub fn browser_go_forward_tab(
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<IpcResult<bool>, CommandError> {
    Ok(ipc(state.browser_manager.go_forward_tab(&tab_id)))
}

#[tauri::command]
pub fn browser_reload_tab(
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.reload_tab(&tab_id)))
}

#[tauri::command]
pub async fn browser_fetch_page_meta(
    url: String,
    force: Option<bool>,
) -> Result<IpcResult<PageMeta>, CommandError> {
    let skip_dedup = force.unwrap_or(false);
    let meta = fetch_page_meta_inner(&url, skip_dedup).await?;
    Ok(ipc(Ok(meta)))
}

#[tauri::command]
pub fn browser_mute_tab(
    state: State<'_, AppState>,
    tab_id: String,
    muted: bool,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.mute_tab(&tab_id, muted)))
}

#[tauri::command]
pub fn browser_set_color_scheme(
    state: State<'_, AppState>,
    color_scheme: String,
) -> Result<IpcResult<()>, CommandError> {
    tracing::info!(color_scheme, "browser_set_color_scheme command invoked");
    Ok(ipc(state.browser_manager.set_color_scheme_for_all(&color_scheme)))
}

#[tauri::command]
pub fn browser_set_zoom(
    state: State<'_, AppState>,
    tab_id: String,
    zoom_factor: f64,
) -> Result<IpcResult<()>, CommandError> {
    tracing::info!(tab_id = %tab_id, zoom_factor = zoom_factor, "browser_set_zoom command invoked");
    Ok(ipc(state.browser_manager.set_zoom(&tab_id, zoom_factor)))
}

#[tauri::command]
pub fn browser_clear_cookies(
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<IpcResult<()>, CommandError> {
    tracing::info!(tab_id = %tab_id, "browser_clear_cookies command invoked");
    Ok(ipc(state.browser_manager.clear_cookies_for_tab(&tab_id)))
}

#[tauri::command]
pub fn browser_clear_cache(
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<IpcResult<()>, CommandError> {
    tracing::info!(tab_id = %tab_id, "browser_clear_cache command invoked");
    Ok(ipc(state.browser_manager.clear_cache_for_tab(&tab_id)))
}

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

fn with_fetch_cache<F, R>(f: F) -> R
where
    F: FnOnce(&mut HashMap<String, Instant>) -> R,
{
    static CACHE: std::sync::OnceLock<Mutex<HashMap<String, Instant>>> = std::sync::OnceLock::new();
    let mutex = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut guard = mutex.lock().unwrap_or_else(|e| e.into_inner());
    f(&mut guard)
}

const FETCH_DEDUP_WINDOW_MS: u64 = 3000;

async fn fetch_page_meta_inner(url: &str, skip_dedup: bool) -> Result<PageMeta, AppError> {
    if !skip_dedup {
        let is_dupe = with_fetch_cache(|cache| {
            let now = Instant::now();
            match cache.get(url) {
                Some(last)
                    if now.duration_since(*last)
                        < std::time::Duration::from_millis(FETCH_DEDUP_WINDOW_MS) =>
                {
                    true
                },
                _ => {
                    cache.insert(url.to_string(), now);
                    false
                },
            }
        });
        if is_dupe {
            tracing::info!(url = %url, "fetch_page_meta_inner: skipped (dedup within {}ms)", FETCH_DEDUP_WINDOW_MS);
            return Ok(PageMeta {
                title: String::new(),
                favicon: String::new(),
                url: url.to_string(),
            });
        }
    }

    tracing::info!(url = %url, "fetch_page_meta_inner: start");

    if !url.starts_with("http://") && !url.starts_with("https://") {
        tracing::warn!(url = %url, "fetch_page_meta_inner: non-http URL, returning empty");
        return Ok(PageMeta { title: String::new(), favicon: String::new(), url: url.to_string() });
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent(USER_AGENT)
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| AppError::Internal(format!("failed to build http client: {e}")))?;

    let response = client
        .get(url)
        .header("Accept", "text/html,application/xhtml+xml")
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        .send()
        .await;

    let body = match response {
        Ok(resp) => {
            let body = resp.text().await.unwrap_or_default();
            tracing::info!(url = %url, body_len = body.len(), "fetch_page_meta_inner: HTTP success");
            body
        },
        Err(e) => {
            tracing::info!(url = %url, err = %e, "fetch_page_meta_inner: HTTP failed, returning empty title");
            return Ok(PageMeta {
                title: String::new(),
                favicon: google_favicon_url(url),
                url: url.to_string(),
            });
        },
    };

    let body = body.chars().take(65536).collect::<String>();
    let title = extract_title(&body);
    let favicon = extract_favicon(&body, url);

    let final_title = title.unwrap_or_else(|| {
        tracing::warn!(url = %url, "fetch_page_meta_inner: <title> not found, returning empty title");
        String::new()
    });

    let final_favicon = favicon.unwrap_or_else(|| origin_favicon_fallback(url));

    tracing::info!(url = %url, title = %final_title, favicon_len = final_favicon.len(), "fetch_page_meta_inner: result");
    Ok(PageMeta { title: final_title, favicon: final_favicon, url: url.to_string() })
}

fn extract_meta_content<'a>(lower: &'a str, html: &'a str, property: &str) -> Option<String> {
    let prop_lower = property.to_lowercase();
    let markers = [
        format!("property=\"{}\"", &prop_lower),
        format!("property='{}'", &prop_lower),
        format!("property = \"{}\"", &prop_lower),
        format!("property = '{}'", &prop_lower),
    ];
    for marker in &markers {
        if let Some(start) = lower.find(marker) {
            let snippet = &lower[..start];
            let tag_start = snippet.rfind("<meta")?;
            let tag_end = lower[tag_start..].find('>')?;
            let tag = &html[tag_start..tag_start + tag_end];
            if let Some(content) = extract_attr_value(tag, "content") {
                return Some(content);
            }
        }
    }
    None
}

fn extract_attr_value(html: &str, attr: &str) -> Option<String> {
    for marker in &[format!("{}=\"", attr), format!("{}='", attr)] {
        if let Some(start) = html.to_lowercase().find(marker) {
            let value_start = start + marker.len();
            let quote = &html.to_lowercase()[value_start - 1..value_start];
            let end =
                html.to_lowercase()[value_start..].find(if quote == "\"" { "\"" } else { "'" })?;
            let raw = &html[value_start..value_start + end];
            if !raw.is_empty() {
                return Some(raw.to_string());
            }
        }
    }
    None
}

fn extract_title(html: &str) -> Option<String> {
    let lower = html.to_lowercase();

    // Try <title> first
    if let Some(t_start) = lower.find("<title") {
        if let Some(t_tag_end) = html[t_start..].find('>') {
            let content_start = t_start + t_tag_end + 1;
            if let Some(t_end) = lower[content_start..].find("</title>") {
                let raw = html[content_start..content_start + t_end].trim();
                if !raw.is_empty() {
                    return Some(html_entity_decode(raw));
                }
            }
        }
    }

    // Fall back to og:title
    if let Some(content) = extract_meta_content(&lower, html, "og:title") {
        let trimmed = content.trim();
        if !trimmed.is_empty() {
            return Some(html_entity_decode(trimmed));
        }
    }

    None
}

fn extract_href(snippet: &str, snippet_lower: &str) -> Option<String> {
    for marker in [r#"href=""#, "href='"] {
        if let Some(start) = snippet_lower.find(marker) {
            let value_start = start + marker.len();
            let quote = &snippet_lower[value_start - 1..value_start];
            let end = snippet_lower[value_start..].find(if quote == "\"" { "\"" } else { "'" })?;
            let raw = snippet[value_start..value_start + end].trim();
            if !raw.is_empty() && !raw.contains(' ') {
                return Some(raw.to_string());
            }
        }
    }
    None
}

fn resolve_url(href: &str, base_url: &str) -> Option<String> {
    if href.starts_with("http://") || href.starts_with("https://") {
        return Some(href.to_string());
    }
    if href.starts_with("//") {
        return Some(format!("https:{}", href));
    }
    let base = url::Url::parse(base_url).ok()?;
    base.join(href).ok().map(|u| u.to_string())
}

fn extract_favicon(html: &str, base_url: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let mut best_href = String::new();
    let mut best_score = 0i32;
    let mut search_start = 0usize;

    while let Some(link_pos) = lower[search_start..].find("<link") {
        let abs_link = search_start + link_pos;
        let tag_end = match html[abs_link..].find('>') {
            Some(e) => e,
            None => break,
        };
        let snippet = &html[abs_link..abs_link + tag_end];
        let snippet_lower = &lower[abs_link..abs_link + tag_end];

        let rel = extract_attr(snippet_lower, "rel").unwrap_or_default();
        let rel_lower = rel.to_lowercase();
        if rel_lower.contains("icon") {
            if let Some(href) = extract_href(snippet, snippet_lower) {
                if let Some(resolved) = resolve_url(&href, base_url) {
                    let sizes = extract_attr(snippet_lower, "sizes").unwrap_or_default();
                    let score = favicon_score(&resolved, &rel_lower, &sizes);
                    if score > best_score {
                        best_score = score;
                        best_href = resolved;
                    }
                }
            }
        }
        search_start = abs_link + tag_end;
    }

    if best_href.is_empty() {
        None
    } else {
        Some(best_href)
    }
}

fn extract_attr(snippet_lower: &str, attr: &str) -> Option<String> {
    for marker in [format!("{}=\"", attr), format!("{}='", attr)] {
        if let Some(start) = snippet_lower.find(&marker) {
            let value_start = start + marker.len();
            let quote = &snippet_lower[value_start - 1..value_start];
            if let Some(end) =
                snippet_lower[value_start..].find(if quote == "\"" { "\"" } else { "'" })
            {
                return Some(snippet_lower[value_start..value_start + end].to_string());
            }
        }
    }
    None
}

fn favicon_score(href: &str, rel: &str, sizes: &str) -> i32 {
    let href_lower = href.to_lowercase();
    let mut score = 0i32;

    if rel.contains("apple-touch-icon") {
        score += 50;
    }

    if let Some(size_match) = sizes.split('x').next() {
        if let Ok(size) = size_match.trim().parse::<i32>() {
            score += size;
        }
    }

    if href_lower.ends_with(".svg") {
        score += 200;
    } else if href_lower.ends_with(".png") {
        score += 30;
        if href_lower.contains("512")
            || href_lower.contains("256")
            || href_lower.contains("192")
            || href_lower.contains("180")
        {
            score += 100;
        }
    } else if href_lower.ends_with("favicon.ico") {
        score += 1;
    } else if href_lower.ends_with(".ico") {
        score += 5;
    } else {
        score += 10;
    }

    score
}

fn google_favicon_url(url: &str) -> String {
    if let Ok(parsed) = url::Url::parse(url) {
        if let Some(host) = parsed.host_str() {
            if host == "localhost" || host.starts_with("127.") || host.starts_with("192.168.") {
                return String::new();
            }
            return format!("https://www.google.com/s2/favicons?domain={host}&sz=64");
        }
    }
    String::new()
}

fn origin_favicon_fallback(url: &str) -> String {
    if let Ok(parsed) = url::Url::parse(url) {
        let origin = parsed.origin().ascii_serialization();
        let ico_url = format!("{origin}/favicon.ico");
        return ico_url;
    }
    google_favicon_url(url)
}

fn html_entity_decode(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&#x2F;", "/")
        .replace("&nbsp;", " ")
}
