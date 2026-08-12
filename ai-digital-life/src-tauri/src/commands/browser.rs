use std::sync::Arc;

use crate::commands::browser_webview_setup::{
    apply_theme_and_navigate_for_platform, build_webview_builder, register_webview_with_manager,
    resolve_window_and_url, setup_webview2_handlers_for_platform,
};
use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use crate::webview_event_bridge::TauriWebView2EventBridge;
use adl_browser::html_meta::{
    extract_favicon, extract_title, google_favicon_url, origin_favicon_fallback,
};
use adl_browser::webview_handle::{Bounds, EventBridgeRef};
use adl_browser::{PageMeta, webview_label};
use adl_errors::AppError;
use adl_types::IpcResult;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use tauri::{Manager, State};

#[tauri::command]
pub async fn browser_create_for_tab(
    app: tauri::AppHandle,
    tab_id: String,
    url: String,
    color_scheme: Option<String>,
) -> Result<IpcResult<Option<String>>, CommandError> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let app_inner = app.clone();

    app.run_on_main_thread(move || {
        let state = app_inner.state::<AppState>();
        let label = webview_label(&tab_id);
        tracing::debug!(tab_id = &tab_id, url = &url, color_scheme = ?&color_scheme, "browser_create_for_tab: ENTER");

        let result = (|| -> Result<Option<String>, AppError> {
            let (window, _target) = resolve_window_and_url(&app_inner, &url)?;

            // Resolve the color scheme early — it's needed for the init script
            // (hardcoded background color in INIT_SCRIPT). The init script uses
            // this value to set document.documentElement.style.backgroundColor
            // before page CSS loads. apply_theme_and_navigate_for_platform will
            // re-read the latest color scheme at closure execution time, so this
            // value only affects the INIT_SCRIPT background color.
            let cs = color_scheme.unwrap_or_else(|| state.browser_manager.current_color_scheme());

            // Create the WebView with about:blank as the initial URL to prevent
            // the real page from loading before the background color and Profile
            // color scheme are applied. The real URL is navigated to after theme
            // setup in apply_theme_and_navigate_for_platform.
            let blank_url = url::Url::parse("about:blank")
                .map_err(|e| AppError::Internal(format!("failed to parse about:blank: {e}")))?;
            let webview_builder = build_webview_builder(&label, &tab_id, blank_url, app_inner.clone(), &cs);

            window
                .add_child(
                    webview_builder,
                    tauri::LogicalPosition::new(-10000.0, -10000.0),
                    tauri::LogicalSize::new(800.0, 600.0),
                )
                .map_err(|e| {
                    AppError::Internal(format!("failed to create webview for tab {tab_id}: {e}"))
                })?;

            tracing::info!(tab_id = &tab_id, url = &url, "browser webview created for tab");

            if let Some(webview) = window.get_webview(&label) {
                let bridge: EventBridgeRef =
                    Arc::new(TauriWebView2EventBridge::new(app_inner.clone()));
                setup_webview2_handlers_for_platform(&webview, &tab_id, &label, bridge.clone());
            }

            // Register the webview with BrowserManager BEFORE calling
            // apply_theme_and_navigate_for_platform. This ensures the webview is
            // in the manager's map when set_color_scheme_for_all runs, so any
            // pending theme change can update it. apply_theme_and_navigate_for_platform
            // will also re-read the latest color scheme at closure execution time,
            // handling the race where the theme was changed between
            // browser_create_for_tab and the with_webview closure execution.
            let register_result = register_webview_with_manager(
                &state,
                app_inner.clone(),
                label.clone(),
                &tab_id,
            );

            match register_result {
                Ok(result) => {
                    if let Some(webview) = window.get_webview(&label) {
                        apply_theme_and_navigate_for_platform(&webview, app_inner.clone(), &url);
                    }
                    Ok(result)
                }
                Err(e) => {
                    // Clean up the orphan WebView to prevent resource leaks
                    if let Some(webview) = window.get_webview(&label) {
                        let _ = webview.close();
                    }
                    Err(e)
                }
            }
        })();

        let _ = tx.send(result);
    })
    .map_err(|e| AppError::Internal(format!("main thread dispatch: {e}")))?;

    Ok(ipc(rx.await.map_err(|e| AppError::Internal(format!("creation channel: {e}")))?))
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
pub fn browser_site_meta_get_all(
    state: State<'_, AppState>,
) -> Result<IpcResult<HashMap<String, adl_browser::SiteMetaCacheEntry>>, CommandError> {
    Ok(ipc(state.browser_manager.site_meta_cache().get_all()))
}

#[tauri::command]
pub fn browser_site_meta_upsert(
    state: State<'_, AppState>,
    entries: HashMap<String, adl_browser::SiteMetaCacheEntry>,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.site_meta_cache().upsert(&entries)))
}

#[tauri::command]
pub fn browser_site_meta_remove(
    state: State<'_, AppState>,
    urls: Vec<String>,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.site_meta_cache().remove(&urls)))
}

#[tauri::command]
pub fn browser_site_meta_clear(state: State<'_, AppState>) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.site_meta_cache().clear()))
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

/// Canonical User-Agent for outbound browser HTTP requests.
///
/// Mirrors `frontend/src/shared/userAgent.ts` (`USER_AGENT`). Update both
/// locations together — they must stay in sync so Tauri-mode and preview-mode
/// requests appear identical to servers.
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

/// Download favicon image bytes as a base64 data-URI. Returns empty string on
/// any failure (network / timeout / non-success / > 64KB). Callers must not
/// cache a failed result — the previous cached entry stays intact.
async fn download_favicon_data_uri(client: &reqwest::Client, favicon_url: &str) -> String {
    if favicon_url.is_empty()
        || !favicon_url.starts_with("http://") && !favicon_url.starts_with("https://")
    {
        return String::new();
    }
    let Ok(resp) = client.get(favicon_url).send().await else {
        return String::new();
    };
    if !resp.status().is_success() {
        return String::new();
    }
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(';').next().unwrap_or(s).trim().to_string())
        .unwrap_or_else(|| "image/x-icon".to_string());
    let Ok(bytes) = resp.bytes().await else {
        return String::new();
    };
    if bytes.is_empty() || bytes.len() > 64 * 1024 {
        return String::new();
    }
    to_data_uri(&bytes, &content_type)
}

fn to_data_uri(bytes: &[u8], content_type: &str) -> String {
    format!("data:{content_type};base64,{}", STANDARD.encode(bytes))
}

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
                favicon_data_uri: String::new(),
            });
        }
    }

    tracing::info!(url = %url, "fetch_page_meta_inner: start");

    if !url.starts_with("http://") && !url.starts_with("https://") {
        tracing::warn!(url = %url, "fetch_page_meta_inner: non-http URL, returning empty");
        return Ok(PageMeta {
            title: String::new(),
            favicon: String::new(),
            url: url.to_string(),
            favicon_data_uri: String::new(),
        });
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
                favicon_data_uri: String::new(),
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

    let favicon_data_uri = if final_favicon.is_empty() {
        String::new()
    } else {
        download_favicon_data_uri(&client, &final_favicon).await
    };

    tracing::info!(url = %url, title = %final_title, favicon_len = final_favicon.len(), favicon_data_uri_len = favicon_data_uri.len(), "fetch_page_meta_inner: result");
    Ok(PageMeta {
        title: final_title,
        favicon: final_favicon,
        url: url.to_string(),
        favicon_data_uri,
    })
}

#[cfg(test)]
mod favicon_data_uri_tests {
    use super::*;

    fn sample_meta() -> PageMeta {
        PageMeta {
            title: "T".into(),
            favicon: "https://a.com/favicon.ico".into(),
            url: "https://a.com/".into(),
            favicon_data_uri: String::new(),
        }
    }

    #[test]
    fn page_meta_serializes_camel_case() {
        let json = serde_json::to_string(&sample_meta()).unwrap();
        assert!(json.contains("\"faviconDataUri\""));
    }

    #[test]
    fn empty_favicon_url_produces_empty_data_uri() {
        let out = to_data_uri(&[], "image/x-icon");
        assert!(out.starts_with("data:image/x-icon;base64,"));
    }
}
