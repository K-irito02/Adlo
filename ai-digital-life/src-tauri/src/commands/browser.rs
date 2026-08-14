use std::sync::Arc;

use crate::commands::browser_webview_setup::{
    apply_theme_and_navigate_for_platform, build_webview_builder, register_webview_with_manager,
    resolve_window_and_url, setup_webview2_handlers_for_platform,
};
use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use crate::webview_event_bridge::TauriWebView2EventBridge;
use adl_browser::html_meta::{extract_favicon, extract_title, origin_favicon_fallback};
use adl_browser::robots_policy::{DomainRateLimiter, RobotsCache, domain_of, is_private_url};
use adl_browser::robots_txt::parse_robots_txt;
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
pub fn browser_can_go_back_tab(
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<IpcResult<bool>, CommandError> {
    Ok(ipc(state.browser_manager.can_go_back_tab(&tab_id)))
}

#[tauri::command]
pub fn browser_can_go_forward_tab(
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<IpcResult<bool>, CommandError> {
    Ok(ipc(state.browser_manager.can_go_forward_tab(&tab_id)))
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
/// requests appear identical to servers. This is a compliant crawler identity
/// (robots.txt product token: `AIDigitalLife`), not a browser UA spoof.
const USER_AGENT: &str = "AIDigitalLife/1.0 (+https://github.com/K-irito02/Kora; MetaFetcher)";
const BOT_PRODUCT_TOKEN: &str = "AIDigitalLife";

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

const RATE_LIMIT_WINDOW: std::time::Duration = std::time::Duration::from_secs(5);

static ROBOTS_CACHE: std::sync::OnceLock<RobotsCache> = std::sync::OnceLock::new();
static RATE_LIMITER: std::sync::OnceLock<DomainRateLimiter> = std::sync::OnceLock::new();

/// 统一构造空 PageMeta（robots 拦截 / 限速兜底返回值）。
fn empty_page_meta(url: &str) -> PageMeta {
    PageMeta {
        title: String::new(),
        favicon: String::new(),
        url: url.to_string(),
        favicon_data_uri: String::new(),
    }
}

/// robots 门控（含私网豁免与 fail-open）。返回 true 表示允许抓取。
/// 私网直接放行；否则查缓存 → 未命中则拉取 robots.txt（失败按 Allow）→
/// 用 `BOT_PRODUCT_TOKEN` 匹配 URL 的 path。
async fn robots_allow_fetch(client: &reqwest::Client, url_str: &str) -> bool {
    if is_private_url(url_str) {
        return true;
    }
    let Ok(parsed) = url::Url::parse(url_str) else {
        return true;
    };
    let Some(domain) = parsed.host_str().map(|s| s.to_string()) else {
        return true;
    };
    let now = std::time::Instant::now();
    let rules = {
        let cache = ROBOTS_CACHE.get_or_init(RobotsCache::new);
        if let Some(rules) = cache.get(&domain, now) {
            Some(rules)
        } else {
            let robots_url = format!("{}://{domain}/robots.txt", parsed.scheme());
            let fetched = client.get(&robots_url).send().await;
            let rules = match fetched {
                Ok(resp) if resp.status().is_success() => {
                    let body = resp.text().await.unwrap_or_default();
                    (!body.is_empty()).then(|| parse_robots_txt(&body))
                },
                _ => None,
            };
            if let Some(rules) = &rules {
                cache.insert(&domain, rules.clone(), std::time::Instant::now());
            }
            rules
        }
    };
    match rules {
        Some(rules) => rules.is_allowed(BOT_PRODUCT_TOKEN, parsed.path()),
        None => true, // fail-open
    }
}

/// 按域名限速（5s/次）的决策。私网 URL 直接放行且不消费限速令牌
/// （与前端 `pageMetaGateAllows` 的私网豁免一致）；仅公有域名进入限速器。
fn rate_limit_allowed(url: &str) -> bool {
    if is_private_url(url) {
        return true;
    }
    match domain_of(url) {
        Some(domain) => RATE_LIMITER
            .get_or_init(|| DomainRateLimiter::new(RATE_LIMIT_WINDOW))
            .try_acquire(&domain, std::time::Instant::now()),
        None => true,
    }
}

fn normalized_content_type(raw: &str) -> String {
    raw.split(';').next().unwrap_or("").trim().to_lowercase()
}

/// Download favicon image bytes as a base64 data-URI. Returns empty string on
/// any failure (network / timeout / non-success / > 64KB / non-image
/// Content-Type). Callers must not cache a failed result — the previous cached
/// entry stays intact.
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
    // Precheck the declared Content-Length so an oversized favicon is rejected
    // before its body is buffered (bounded memory against hostile/large
    // endpoints). The post-download check remains as the backstop for servers
    // that omit Content-Length.
    let content_length = resp
        .headers()
        .get(reqwest::header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<usize>().ok());
    if content_length.is_some_and(|len| len > 64 * 1024) {
        return String::new();
    }
    // Missing or non-image Content-Type: do not persist an invalid data-URI
    // (the cached favicon must render as an image).
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(normalized_content_type)
        .filter(|ct| ct.starts_with("image/"));
    let Some(content_type) = content_type else {
        return String::new();
    };
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

    // 合规爬虫门控：robots.txt Disallow 硬跳过（私网豁免 / fail-open 见辅助函数）。
    if !robots_allow_fetch(&client, url).await {
        tracing::info!(url = %url, "fetch_page_meta_inner: blocked by robots.txt, returning empty");
        return Ok(empty_page_meta(url));
    }
    // 按域名限速（5s/次）；私网 URL 豁免限速，不消费任何令牌。
    if !rate_limit_allowed(url) {
        tracing::info!(url = %url, "fetch_page_meta_inner: rate limited, returning empty");
        return Ok(empty_page_meta(url));
    }

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
            tracing::info!(url = %url, err = %e, "fetch_page_meta_inner: HTTP failed, returning empty title/favicon (previous cache entry is kept)");
            return Ok(PageMeta {
                title: String::new(),
                favicon: String::new(),
                url: url.to_string(),
                favicon_data_uri: String::new(),
            });
        },
    };

    let body = body.chars().take(65536).collect::<String>();
    let title = extract_title(&body);
    let favicon = extract_favicon(&body, url);

    let final_title = title
        .unwrap_or_else(|| {
            tracing::warn!(url = %url, "fetch_page_meta_inner: <title> not found, returning empty title");
            String::new()
        })
        .chars()
        .take(200)
        .collect::<String>();

    let final_favicon = favicon.unwrap_or_else(|| origin_favicon_fallback(url));

    let favicon_data_uri = if final_favicon.is_empty() {
        String::new()
    } else {
        // 对 favicon URL 再查一次 robots 门控（跨域 CDN 也受保护）。
        if robots_allow_fetch(&client, &final_favicon).await {
            download_favicon_data_uri(&client, &final_favicon).await
        } else {
            String::new()
        }
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
    fn empty_bytes_produce_valid_data_uri() {
        let out = to_data_uri(&[], "image/x-icon");
        assert!(out.starts_with("data:image/x-icon;base64,"));
    }

    #[test]
    fn normalized_content_type_strips_parameters_and_whitespace() {
        assert_eq!(normalized_content_type("image/png"), "image/png");
        assert_eq!(normalized_content_type("image/svg+xml; charset=utf-8"), "image/svg+xml");
        assert_eq!(normalized_content_type("  image/png; boundary=xyz  "), "image/png");
        assert_eq!(normalized_content_type("image/png;"), "image/png");
    }

    #[test]
    fn favicon_content_type_must_be_an_image() {
        // Acceptance set: any image/* mime is acceptable.
        for ct in ["image/png", "image/x-icon", "image/svg+xml", "image/webp"] {
            assert!(
                ct.starts_with("image/"),
                "expected {ct} to be accepted as an image content type"
            );
        }
        // Reject set: non-image and empty content types must not be persisted.
        for ct in ["text/html", "application/octet-stream", "image", ""] {
            assert!(
                !ct.starts_with("image/"),
                "expected {ct:?} to be rejected as a favicon content type"
            );
        }
    }
}

#[cfg(test)]
mod robots_gate_tests {
    use super::*;
    use adl_browser::robots_txt::{RobotsRules, parse_robots_txt};

    /// 纯决策：私网直接放行；无 robots（fail-open）放行；Disallow 硬跳过。
    fn gate(url: &str, robots: Option<&RobotsRules>) -> bool {
        if is_private_url(url) {
            return true;
        }
        match robots {
            None => true, // fail-open
            Some(rules) => {
                let path = url
                    .parse::<url::Url>()
                    .map(|u| u.path().to_string())
                    .unwrap_or_else(|_| "/".to_string());
                rules.is_allowed(BOT_PRODUCT_TOKEN, &path)
            },
        }
    }

    #[test]
    fn private_url_always_allowed() {
        assert!(gate("http://localhost:3000", None));
        assert!(gate(
            "http://127.0.0.1/x",
            Some(&parse_robots_txt("User-agent: *\nDisallow: /\n"))
        ));
    }

    #[test]
    fn fail_open_when_robots_unavailable() {
        assert!(gate("https://example.com/x", None));
    }

    #[test]
    fn disallow_hard_skips_public_url() {
        let rules = parse_robots_txt("User-agent: AIDigitalLife\nDisallow: /private");
        assert!(!gate("https://example.com/private/a", Some(&rules)));
        assert!(gate("https://example.com/public", Some(&rules)));
    }

    #[test]
    fn private_url_never_consumes_rate_token() {
        // 私网 URL 豁免限速：连续两次请求均放行（限速器不为其扣减令牌），
        // 否则 `domain_of("http://localhost:3000")` 返回 `Some("localhost")`
        // 会在 5s 窗口内命中限速，与"私网豁免"规格相悖。
        assert!(rate_limit_allowed("http://localhost:3000"));
        assert!(rate_limit_allowed("http://localhost:3000"));
        assert!(rate_limit_allowed("http://127.0.0.1/x"));
    }
}
