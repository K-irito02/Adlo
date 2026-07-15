//! WebView2 platform setup helpers for the browser commands.
//!
//! Contains the new-window handler, webview builder factory, theme
//! application logic, and BrowserManager registration. These functions
//! are specific to Tauri's webview integration (as opposed to the
//! cross-platform `adl_browser` crate) and are used only by
//! `browser_create_for_tab`.

use std::sync::Arc;

use crate::state::AppState;
use crate::tauri_webview_handle::TauriWebViewHandle;
use crate::webview_event_bridge::TauriWebView2EventBridge;
use adl_browser::webview_handle::{EventBridgeRef, WebViewHandle};
use adl_browser::BROWSER_WEBVIEW_LABEL;
use adl_errors::AppError;
use tauri::{Emitter, Manager};

fn new_window_handler(
    app: &tauri::AppHandle,
    url: &url::Url,
) -> tauri::webview::NewWindowResponse<tauri::Wry> {
    if url.scheme() == "http" || url.scheme() == "https" {
        if let Some(window) = app.get_window("main") {
            if let Some(webview) = window.get_webview(BROWSER_WEBVIEW_LABEL) {
                if let Ok(parsed_url) = adl_browser::resolve_url(url.as_str()) {
                    let _ = webview.navigate(parsed_url);
                }
            }
        }
    }
    tauri::webview::NewWindowResponse::Deny
}

pub(super) fn resolve_window_and_url(
    app: &tauri::AppHandle,
    url: &str,
) -> Result<(tauri::Window<tauri::Wry>, url::Url), AppError> {
    let window =
        app.get_window("main").ok_or_else(|| AppError::Internal("main window not found".into()))?;
    let target = adl_browser::resolve_url(url)
        .map_err(|e| AppError::Internal(format!("failed to resolve URL: {e}")))?;
    Ok((window, target))
}

pub(super) fn build_webview_builder(
    label: &str,
    tab_id: &str,
    target: url::Url,
    app_handle: tauri::AppHandle,
    color_scheme: &str,
) -> tauri::webview::WebviewBuilder<tauri::Wry> {
    let app_nav = app_handle.clone();
    let tab_id_owned = tab_id.to_string();
    let init_script = adl_browser::init_script_with_background(color_scheme);
    tracing::debug!(color_scheme, "build_webview_builder: generated init_script with background");
    tauri::webview::WebviewBuilder::new(label, tauri::WebviewUrl::External(target))
        .initialization_script(init_script)
        .on_navigation(move |url| {
            // Skip about:blank — used as the initial URL during WebView creation
            // to allow background color and CDP color scheme to be applied before
            // the real page's first paint. See browser_create_for_tab.
            if url.as_str().starts_with("about:blank") {
                tracing::debug!(raw_url = %url.as_str(), "on_navigation: skipped about:blank");
                return true;
            }
            tracing::debug!(raw_url = %url.as_str(), "on_navigation: ENTER");
            adl_browser::navigation_handler(url, &|normalized| {
                tracing::debug!(normalized_url = %normalized, "on_navigation: emitting browser-url-changed");
                let _ = app_nav.emit(
                    "digital-life://browser-url-changed",
                    serde_json::json!({ "tabId": tab_id_owned, "url": normalized }),
                );
            })
        })
        .on_new_window(move |url, _window_features| new_window_handler(&app_handle, &url))
}

pub(super) fn setup_webview2_handlers_for_platform(
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

/// Apply the color scheme (background color + Profile PreferredColorScheme) and
/// then navigate the WebView from the initial `about:blank` to the real target URL.
///
/// On Windows, all three operations happen inside `with_webview` to guarantee
/// ordering: background color is set and Profile color scheme is applied BEFORE
/// the real page's first paint, eliminating the white flash and theme flicker.
///
/// **Race condition handling**: `with_webview` is asynchronous — the closure is
/// queued and executed on the next message-loop iteration. If the user switches
/// theme between `browser_create_for_tab` and the closure's execution, the
/// originally captured `color_scheme` would be stale. To fix this, the closure
/// re-reads `BrowserManager::current_color_scheme()` at execution time, ensuring
/// it always uses the latest theme. This prevents the scenario where:
///   1. closure_A (from create) sets Profile=light + Navigate
///   2. closure_B (from set_color_scheme_for_all) sets Profile=dark
///   3. YouTube detects the change and triggers ?themeRefresh=1 (flicker)
///
/// On non-Windows, there is no WebView2 flash issue, so we simply navigate.
pub(super) fn apply_theme_and_navigate_for_platform(
    webview: &tauri::Webview<tauri::Wry>,
    app_handle: tauri::AppHandle,
    real_url: &str,
) {
    #[cfg(windows)]
    {
        let url_owned = real_url.to_string();
        let app_for_closure = app_handle.clone();
        tracing::debug!(url = &url_owned, "apply_theme_and_navigate_for_platform: ENTER (windows)");
        let _ = webview.with_webview(move |platform_wv| unsafe {
            let controller = platform_wv.controller();

            // Re-read the latest color scheme from BrowserManager at closure
            // execution time. `with_webview` is async, so the theme may have
            // changed since browser_create_for_tab was called. Using the latest
            // value ensures the Profile and Navigate use the same theme, avoiding
            // a stale-theme -> new-theme transition that triggers YouTube's
            // ?themeRefresh=1 flicker.
            let cs = match app_for_closure.try_state::<AppState>() {
                Some(state) => state.browser_manager.current_color_scheme(),
                None => {
                    tracing::warn!("apply_theme: AppState not found, falling back to dark");
                    "dark".to_string()
                }
            };
            tracing::debug!(
                latest_cs = &cs,
                url = &url_owned,
                "apply_theme: closure executing with latest color scheme"
            );

            // 1. Set background color via ICoreWebView2Controller2
            let (r, g, b) = adl_browser::theme_to_rgb(&cs);
            tracing::debug!(color_scheme = &cs, r, g, b, "apply_theme: set_default_background_color");
            if let Err(e) = adl_browser::set_default_background_color(&controller, r, g, b) {
                tracing::warn!(error = %e, "failed to set WebView2 default background color");
            }

            // 2. Set Profile PreferredColorScheme (synchronous, native WebView2 API)
            //    This takes effect before any page load, so the page's first paint
            //    always sees the correct prefers-color-scheme.
            if let Ok(core) = controller.CoreWebView2() {
                tracing::debug!(color_scheme = &cs, "apply_theme: calling set_profile_color_scheme");
                adl_browser::webview2_set_profile_color_scheme(&core, &cs);

                // 3. Navigate immediately — no need to wait for any callback
                tracing::debug!(url = &url_owned, "apply_theme: navigate_core");
                if let Err(e) = adl_browser::navigate_core(&core, &url_owned) {
                    tracing::warn!(error = %e, url = %url_owned, "failed to navigate WebView2 to real URL");
                }
            } else {
                tracing::warn!("apply_theme: failed to get CoreWebView2");
            }
        });
    }
    #[cfg(not(windows))]
    {
        // On non-Windows, navigate to the real URL via Tauri's cross-platform API.
        // No WebView2 background color / Profile color scheme flash issue exists
        // on these platforms.
        if let Ok(parsed) = url::Url::parse(real_url) {
            let _ = webview.navigate(parsed);
        }
        let _ = app_handle;
    }
}

pub(super) fn register_webview_with_manager(
    state: &AppState,
    app_handle: tauri::AppHandle,
    label: String,
    tab_id: &str,
) -> Result<Option<String>, AppError> {
    let handle: Arc<dyn WebViewHandle> = Arc::new(TauriWebViewHandle::new(app_handle, label));
    state
        .browser_manager
        .create_for_tab(handle, tab_id)
        .map_err(|e| AppError::Internal(format!("failed to register browser: {e}")))
}
