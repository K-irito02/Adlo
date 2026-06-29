use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use adl_browser::{Bounds, PageMeta};
use adl_errors::AppError;
use adl_kernel::IpcResult;
use tauri::{Manager, State};

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
        let result = state.browser_manager.create_for_tab(&app_inner, &tab_id, &url);
        let _ = tx.send(result);
    })
    .map_err(|e| AppError::Internal(format!("main thread dispatch failed: {e}")))?;

    Ok(ipc(rx.await.map_err(|e| AppError::Internal(format!("creation channel error: {e}")))?))
}

#[tauri::command]
pub fn browser_activate_tab(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.activate_tab(&app, &tab_id)))
}

#[tauri::command]
pub fn browser_destroy_tab(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.destroy_tab(&app, &tab_id)))
}

#[tauri::command]
pub fn browser_navigate_tab(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    tab_id: String,
    url: String,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.navigate_tab(&app, &tab_id, &url)))
}

#[tauri::command]
pub fn browser_set_tab_bounds(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    tab_id: String,
    bounds: Bounds,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.set_tab_bounds(&app, &tab_id, bounds)))
}

#[tauri::command]
pub fn browser_go_back_tab(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<IpcResult<bool>, CommandError> {
    Ok(ipc(state.browser_manager.go_back_tab(&app, &tab_id)))
}

#[tauri::command]
pub fn browser_go_forward_tab(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<IpcResult<bool>, CommandError> {
    Ok(ipc(state.browser_manager.go_forward_tab(&app, &tab_id)))
}

#[tauri::command]
pub fn browser_reload_tab(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.reload_tab(&app, &tab_id)))
}

#[tauri::command]
pub async fn browser_fetch_page_meta(url: String) -> Result<IpcResult<PageMeta>, CommandError> {
    let meta = fetch_page_meta_inner(&url).await?;
    Ok(ipc(Ok(meta)))
}

#[tauri::command]
pub fn browser_mute_tab(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    tab_id: String,
    muted: bool,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(state.browser_manager.mute_tab(&app, &tab_id, muted)))
}

#[tauri::command]
pub fn browser_set_color_scheme(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    color_scheme: String,
) -> Result<IpcResult<()>, CommandError> {
    tracing::info!(color_scheme, "browser_set_color_scheme command invoked");
    Ok(ipc(
        state
            .browser_manager
            .set_color_scheme_for_all(&app, &color_scheme),
    ))
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
    let mut guard = mutex.lock().expect("fetch cache mutex lock failed");
    f(&mut guard)
}

const FETCH_DEDUP_WINDOW_MS: u64 = 3000;

async fn fetch_page_meta_inner(url: &str) -> Result<PageMeta, AppError> {
    {
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

fn extract_title(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let start = lower.find("<title")?;
    let tag_end = html[start..].find('>')?;
    let content_start = start + tag_end + 1;
    let end = lower[content_start..].find("</title>")?;
    let raw = html[content_start..content_start + end].trim();
    Some(html_entity_decode(raw))
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
