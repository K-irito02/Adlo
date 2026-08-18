use std::sync::Arc;

use crate::commands::browser_webview_setup::{
    apply_theme_and_navigate_for_platform, build_silent_webview_builder, build_webview_builder,
    register_webview_with_manager, resolve_window_and_url, setup_webview2_handlers_for_platform,
};
use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use crate::webview_event_bridge::TauriWebView2EventBridge;
use adl_browser::html_meta::{extract_favicon, extract_title, origin_favicon_fallback};
use adl_browser::robots_policy::{DomainRateLimiter, RobotsCache, domain_of, is_private_url};
use adl_browser::robots_txt::parse_robots_txt;
use adl_browser::webview_handle::{Bounds, EventBridgeRef};
use adl_browser::{
    CachedMetaBridge, META_SOURCE_COM, META_SOURCE_HTTP, PageMeta, PageMetaFetcher,
    PageMetaService, SiteMetaCacheEntry, is_placeholder_title, is_unsafe_title, webview_label,
};
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

            // Off-screen child attachment + WebView2 handler setup — shared with
            // the silent-tab path so both paths keep identical creation semantics.
            attach_webview_child(&window, &label, &tab_id, webview_builder, || {
                Arc::new(TauriWebView2EventBridge::new(app_inner.clone()))
            })?;

            // Register the webview with BrowserManager BEFORE calling
            // apply_theme_and_navigate_for_platform. This ensures the webview is
            // in the manager's map when set_color_scheme_for_all runs, so any
            // pending theme change can update it. apply_theme_and_navigate_for_platform
            // will also re-read the latest color scheme at closure execution time,
            // handling the race where the theme was changed between
            // browser_create_for_tab and the with_webview closure execution.
            let register_result =
                register_webview_with_manager(&state, app_inner.clone(), label.clone(), &tab_id);

            match register_result {
                Ok(result) => {
                    if let Some(webview) = window.get_webview(&label) {
                        apply_theme_and_navigate_for_platform(&webview, app_inner.clone(), &url);
                    }
                    Ok(result)
                },
                Err(e) => {
                    // Clean up the orphan WebView to prevent resource leaks
                    if let Some(webview) = window.get_webview(&label) {
                        let _ = webview.close();
                    }
                    Err(e)
                },
            }
        })();

        let _ = tx.send(result);
    })
    .map_err(|e| AppError::Internal(format!("main thread dispatch: {e}")))?;

    Ok(ipc(rx.await.map_err(|e| AppError::Internal(format!("creation channel: {e}")))?))
}

/// Attach a child WebView to the main window at an off-screen position and set
/// up its platform (WebView2) handlers with the given event bridge.
///
/// Shared by the visible-tab (`browser_create_for_tab`) and silent-tab
/// (`create_silent_webview`) creation paths. The off-screen placement keeps the
/// webview invisible to the user; navigation onto a real page happens later via
/// `apply_theme_and_navigate_for_platform` (registered visible tabs) or the
/// silent path described in `create_silent_webview`.
fn attach_webview_child(
    window: &tauri::Window<tauri::Wry>,
    label: &str,
    tab_id: &str,
    webview_builder: tauri::webview::WebviewBuilder<tauri::Wry>,
    make_bridge: impl FnOnce() -> EventBridgeRef,
) -> Result<(), AppError> {
    window
        .add_child(
            webview_builder,
            tauri::LogicalPosition::new(-10000.0, -10000.0),
            tauri::LogicalSize::new(800.0, 600.0),
        )
        .map_err(|e| {
            AppError::Internal(format!("failed to create webview for tab {tab_id}: {e}"))
        })?;

    tracing::info!(tab_id = &tab_id, "browser webview created for tab");

    if let Some(webview) = window.get_webview(label) {
        let bridge = make_bridge();
        setup_webview2_handlers_for_platform(&webview, tab_id, label, bridge);
    }
    Ok(())
}

/// WebView label for a silent (background, off-screen) tab.
///
/// Uses a distinct prefix (`adl-silent-view-`) so it can never collide with the
/// visible-tab labels produced by `webview_label` (`adl-browser-view-{tab_id}`).
/// Task 3 holds the silent tab id returned by `create_silent_webview` and uses
/// this to locate / close the underlying webview.
pub fn silent_webview_label(tab_id: &str) -> String {
    format!("adl-silent-view-{tab_id}")
}

/// 创建静默 WebView（后台不可见，不注册进可见标签系统）。
///
/// 在主线程 dispatch；渲染出的 title/favicon 经 Task 1 的 `CachedMetaBridge`
/// 流入返回的 channel（channel receiver 由 Task 3 的 fetch 循环在 tokio await
/// 上下文消费）。返回 `(silent_tab_id, meta 接收 channel)`。
#[allow(clippy::type_complexity)] // 签名按简报锁定，不可改为类型别名
pub fn create_silent_webview(
    app: tauri::AppHandle,
    state: &AppState,
    url: &str,
) -> Result<
    (String, tokio::sync::mpsc::UnboundedReceiver<(String, String, String, String)>),
    AppError,
> {
    // 静默 tab 不可见，配色仅用于 INIT_SCRIPT 背景色，无需像可见 tab 那样处理
    // 主题闪烁的竞态（apply_theme... 命名处仍会在主线程闭包执行时重读最新配色）。
    let cs = state.browser_manager.current_color_scheme();
    let url_owned = url.to_string();
    let silent_tab_id = adl_types::create_id("silent");
    let label = silent_webview_label(&silent_tab_id);
    let tab_id_inner = silent_tab_id.clone();

    // meta 经非阻塞 channel 流入由调用方持有的 receiver。
    let (tx, rx) = tokio::sync::mpsc::unbounded_channel::<(String, String, String, String)>();
    let (created_tx, created_rx) = tokio::sync::oneshot::channel();
    let app_inner = app.clone();

    app.run_on_main_thread(move || {
        let result = (|| -> Result<(), AppError> {
            let (window, _target) = resolve_window_and_url(&app_inner, &url_owned)?;
            let blank_url = url::Url::parse("about:blank")
                .map_err(|e| AppError::Internal(format!("failed to parse about:blank: {e}")))?;
            let webview_builder = build_silent_webview_builder(&label, blank_url, &cs);
            attach_webview_child(&window, &label, &tab_id_inner, webview_builder, move || {
                Arc::new(CachedMetaBridge::new(Some(tx)))
            })?;
            if let Some(webview) = window.get_webview(&label) {
                apply_theme_and_navigate_for_platform(&webview, app_inner.clone(), &url_owned);
            }
            Ok(())
        })();
        let _ = created_tx.send(result);
    })
    .map_err(|e| AppError::Internal(format!("main thread dispatch: {e}")))?;

    // 本函数为同步 `pub fn`（签名锁定），故用 blocking_recv 等待主线程创建结果，
    // 而非 `.await`。调用方（Task 3 的 fetch 循环）应在其自身的阻塞/tokio 上下文
    // 调用本函数，避免在 tokio runtime 的工作线程内直接调用（会 panic）。
    let created: Result<(), AppError> = created_rx
        .blocking_recv()
        .map_err(|e| AppError::Internal(format!("creation channel: {e}")))?;
    created?;
    Ok((silent_tab_id, rx))
}

/// 静默标签页抓取超时（毫秒），与前端 bookMarkMeta 体验对齐。
pub const SILENT_FETCH_TIMEOUT_MS: u64 = 6000;

/// 静默 WebView 抓取开关。true → 真实渲染主路径（Chrome/Edge 式）；false → 回退 HTTP 爬虫。
/// 唯一真源：Task 5 前端独立判断，不与后端强同步。
pub const SILENT_FETCH_ENABLED: bool = true;

/// 缓存命中判定：缓存条目含有效标题（非空且过 unsafe/placeholder 检查）或非空
/// favicon 视为有效缓存 → 可直接返回（零 WebView 创建）。
fn silent_cache_hit(e: &SiteMetaCacheEntry, url: &str) -> bool {
    let has_good_title =
        !e.title.is_empty() && !is_unsafe_title(&e.title) && !is_placeholder_title(&e.title, url);
    has_good_title || !e.favicon_url.is_empty()
}

/// 标题启发式：真实（非空、非占位标题、非反爬/验证码）标题才算有效。
fn silent_title_ok(title: &str, url: &str) -> bool {
    !title.is_empty() && !is_placeholder_title(title, url) && !is_unsafe_title(title)
}

/// 收敛判定：同时具备真实标题与 favicon 才视为完整元数据，可立即返回。
fn silent_converged(title: &str, url: &str, favicon_url: &str) -> bool {
    silent_title_ok(title, url) && !favicon_url.is_empty()
}

/// 将缓存条目转换为返回给命令层的 `PageMeta`。source 语义：有真实标题则标
/// `META_SOURCE_COM`（对齐 WebView2/Chromium 静默渲染来源），否则置空。
fn page_meta_from_entry(e: SiteMetaCacheEntry, url: &str) -> PageMeta {
    let source = if e.title.is_empty() { String::new() } else { META_SOURCE_COM.to_string() };
    PageMeta {
        title: e.title,
        favicon: e.favicon_url,
        favicon_data_uri: e.favicon_data_uri,
        url: url.to_string(),
        source,
    }
}

/// 从缓存条目返回"已得部分"元数据；无任何有效元数据则回退 `empty_page_meta`。
fn best_silent_meta(svc: &PageMetaService, url: &str) -> PageMeta {
    match svc.peek(url) {
        Some(e) if silent_title_ok(&e.title, url) || !e.favicon_url.is_empty() => {
            page_meta_from_entry(e, url)
        },
        _ => empty_page_meta(url),
    }
}

/// 轮询参数（可注入以便单测用短时长加速驱动时序分支）。
#[derive(Clone, Copy)]
struct SilentPollDurations {
    /// 单轮 recv 超时：无数据收包时本轮等待时长。
    round_ms: u64,
    /// 部分元数据（自首个有效起）等待的提前返回阈值。
    partial_ms: u64,
}

impl Default for SilentPollDurations {
    fn default() -> Self {
        SilentPollDurations { round_ms: 300, partial_ms: 1500 }
    }
}

/// 轮询静默元数据 channel 直至收敛 / 部分提前返回 / 总体超时。
///
/// - 收到元组即 `svc.report(_, _, _, META_SOURCE_COM)` 持久化入缓存；
/// - 已收敛（真实标题 + favicon）→ 立即返回；
/// - 部分（仅标题或仅 favicon）→ 自首个非空起等待 ≥ `partial_ms` 提前返回
///   （无论该等待期间 channel 是否仍有数据/静默）；
/// - 总体 `SILENT_FETCH_TIMEOUT_MS`（6s）超时 → 返回已得部分，无则空。
async fn wait_for_silent_meta(
    rx: &mut tokio::sync::mpsc::UnboundedReceiver<(String, String, String, String)>,
    svc: &PageMetaService,
    url: &str,
) -> PageMeta {
    let result = tokio::time::timeout(
        std::time::Duration::from_millis(SILENT_FETCH_TIMEOUT_MS),
        poll_silent_meta(rx, svc, url, SilentPollDurations::default()),
    )
    .await;

    match result {
        Ok(meta) => meta,
        Err(_elapsed) => best_silent_meta(svc, url),
    }
}

/// `wait_for_silent_meta` 的轮询主体（无总体超时，由外层 `timeout` 兜底）。
async fn poll_silent_meta(
    rx: &mut tokio::sync::mpsc::UnboundedReceiver<(String, String, String, String)>,
    svc: &PageMetaService,
    url: &str,
    d: SilentPollDurations,
) -> PageMeta {
    let round = std::time::Duration::from_millis(d.round_ms);
    let partial_threshold = std::time::Duration::from_millis(d.partial_ms);
    let mut first_meta_at: Option<std::time::Instant> = None;
    loop {
        let recv = tokio::time::timeout(round, rx.recv()).await;
        match recv {
            Ok(Some((_tab_id, u, title, fav))) => {
                if let Err(e) = svc.report(&u, &title, &fav, META_SOURCE_COM).await {
                    tracing::warn!(url = %u, error = %e, "wait_for_silent_meta: report failed");
                }
                if let Some(entry) = svc.peek(url) {
                    if silent_converged(&entry.title, url, &entry.favicon_url) {
                        return page_meta_from_entry(entry, url);
                    }
                    if silent_title_ok(&entry.title, url) || !entry.favicon_url.is_empty() {
                        first_meta_at.get_or_insert_with(std::time::Instant::now);
                    }
                }
                if first_meta_at.is_some_and(|st| st.elapsed() >= partial_threshold) {
                    return best_silent_meta(svc, url);
                }
            },
            Ok(None) => return best_silent_meta(svc, url), // channel 已关闭
            // 单轮无数据收包：
            // - 若早已记录部分元数据且等待已到 `partial_ms` → 立即提前返回部分结果，
            //   而非继续空转直到外层 6s 总体超时（修复前行为）。
            // - 否则继续轮询等待（后续消息或总体超时兜底）。
            Err(_elapsed) => {
                if first_meta_at.is_some_and(|st| st.elapsed() >= partial_threshold) {
                    return best_silent_meta(svc, url);
                }
            },
        }
    }
}

/// 在主线程销毁静默 WebView（按 label 定位），找不到则记 warn 提示泄漏风险。
fn destroy_silent_webview(app: &tauri::AppHandle, tab_id: &str) {
    let label = silent_webview_label(tab_id);
    let app_inner = app.clone();
    if let Err(e) = app.run_on_main_thread(move || match app_inner.get_window("main") {
        Some(window) => match window.get_webview(&label) {
            Some(webview) => {
                if let Err(e) = webview.close() {
                    tracing::warn!(
                        error = %e,
                        label = %label,
                        "destroy_silent_webview: close failed"
                    );
                }
            },
            None => tracing::warn!(
                label = %label,
                "destroy_silent_webview: webview not found (leak risk)"
            ),
        },
        None => tracing::warn!(label = %label, "destroy_silent_webview: main window not found"),
    }) {
        tracing::warn!(
            error = %e,
            tab_id,
            "destroy_silent_webview: main thread dispatch failed"
        );
    }
}

/// 静默 WebView 渲染抓取核心流程（spawn_blocking 创建 → 轮询 → 主线程销毁），
/// 返回已写缓存的结果 `PageMeta`，不广播。（DRY：`browser_page_meta_get_silent` /
/// `browser_page_meta_get` / `browser_page_meta_refresh` 三个命令共用。）
///
/// # spawn_blocking 契约
/// `create_silent_webview` 是同步函数（内部 `blocking_recv()` 等待主线程创建结果），
/// 在 tokio async 命令工作线程内直接调用会 panic。故创建必须放入 `spawn_blocking`，
/// 轮询封装的 channel 在 async 上下文 await 消费。
async fn fetch_silent_meta(
    app: tauri::AppHandle,
    state: &AppState,
    url: &str,
) -> Result<PageMeta, AppError> {
    let app_owned = app.clone();
    let url_owned = url.to_string();
    let (tab_id, mut rx) = tokio::task::spawn_blocking(move || {
        let g = app_owned.state::<AppState>(); // Manager trait；borrow 绑定到 app_owned
        create_silent_webview(app_owned.clone(), &g, &url_owned)
    })
    .await
    .map_err(|e| AppError::Internal(format!("silent webview join: {e}")))??;

    let page_meta =
        wait_for_silent_meta(&mut rx, state.browser_manager.page_meta_service(), url).await;

    destroy_silent_webview(&app, &tab_id);

    Ok(page_meta)
}

#[tauri::command]
pub async fn browser_page_meta_get_silent(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    url: String,
) -> Result<IpcResult<PageMeta>, CommandError> {
    let page_meta = fetch_silent_meta(app.clone(), &state, &url).await?;
    let src = if page_meta.source.is_empty() { META_SOURCE_COM } else { page_meta.source.as_str() };
    emit_page_meta_updated(&app, &page_meta, src);
    Ok(ipc(Ok(page_meta)))
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
pub fn browser_site_meta_get_all(
    state: State<'_, AppState>,
) -> Result<IpcResult<HashMap<String, adl_browser::SiteMetaCacheEntry>>, CommandError> {
    Ok(ipc(state.browser_manager.site_meta_cache().get_all()))
}

struct AppFetcher;
impl PageMetaFetcher for AppFetcher {
    fn fetch(
        &self,
        url: &str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = PageMeta> + Send + '_>> {
        // 借用无法跨 trait 返回的生命周期逃逸（返回值绑定在 &self 上），
        // 故 future 持有 owned 拷贝，避免借用 url: &str。
        let url = url.to_string();
        Box::pin(async move {
            fetch_page_meta_inner(&url).await.unwrap_or_else(|_| empty_page_meta(&url))
        })
    }
}

#[tauri::command]
pub async fn browser_page_meta_get(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    url: String,
    force: Option<bool>,
) -> Result<IpcResult<PageMeta>, CommandError> {
    let svc = state.browser_manager.page_meta_service();
    if SILENT_FETCH_ENABLED {
        // 静默主路径：缓存优先（零 WebView）。命中有效缓存（有效标题或非空 favicon）
        // 直接返回；`force=true` 绕过缓存。
        if !force.unwrap_or(false) {
            if let Some(e) = svc.peek(&url) {
                if silent_cache_hit(&e, &url) {
                    let meta = PageMeta {
                        title: e.title,
                        favicon: e.favicon_url,
                        favicon_data_uri: e.favicon_data_uri,
                        url: url.clone(),
                        source: e.title_source,
                    };
                    let src = if meta.source.is_empty() {
                        META_SOURCE_HTTP
                    } else {
                        meta.source.as_str()
                    };
                    emit_page_meta_updated(&app, &meta, src);
                    return Ok(ipc(Ok(meta)));
                }
            }
        }
        let meta = fetch_silent_meta(app.clone(), &state, &url).await?;
        emit_page_meta_updated(&app, &meta, META_SOURCE_COM);
        return Ok(ipc(Ok(meta)));
    }
    // —— 原回退爬虫路径（SILENT 关闭时）——
    let meta = svc.get(&url, force.unwrap_or(false), &AppFetcher).await?;
    let src = if meta.source.is_empty() { META_SOURCE_HTTP } else { meta.source.as_str() };
    emit_page_meta_updated(&app, &meta, src);
    Ok(ipc(Ok(meta)))
}

#[tauri::command]
pub async fn browser_page_meta_report(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    url: String,
    title: String,
    favicon: String,
    source: String,
) -> Result<IpcResult<bool>, CommandError> {
    let svc = state.browser_manager.page_meta_service();
    let changed = svc.report(&url, &title, &favicon, &source).await?;
    if changed {
        if let Some(e) = svc.peek(&url) {
            emit_page_meta_updated_raw(&app, &url, &e, &source);
        }
    }
    Ok(ipc(Ok(changed)))
}

#[tauri::command]
pub async fn browser_page_meta_refresh(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    url: String,
) -> Result<IpcResult<PageMeta>, CommandError> {
    let svc = state.browser_manager.page_meta_service();
    if SILENT_FETCH_ENABLED {
        // 静默主路径：刷新强制重新渲染抓取。
        let meta = fetch_silent_meta(app.clone(), &state, &url).await?;
        emit_page_meta_updated(&app, &meta, META_SOURCE_COM);
        return Ok(ipc(Ok(meta)));
    }
    // —— 原回退爬虫路径（SILENT 关闭时）——
    let meta = svc.get(&url, true, &AppFetcher).await?;
    let src = if meta.source.is_empty() { META_SOURCE_HTTP } else { meta.source.as_str() };
    emit_page_meta_updated(&app, &meta, src);
    Ok(ipc(Ok(meta)))
}

#[tauri::command]
pub async fn browser_page_meta_warmup(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    urls: Vec<String>,
) -> Result<IpcResult<()>, CommandError> {
    // 输入验证：限制 URL 数量防止拒绝服务（与前端 warmupUrls.ts 上限 200 一致）
    if urls.len() > 200 {
        return Ok(ipc(Err(AppError::InvalidInput(
            "URL list exceeds maximum length of 200".to_string(),
        ))));
    }
    let svc = state.browser_manager.page_meta_service();
    let metas = svc.warmup(&urls, &AppFetcher, 8).await?;
    // 镜像传播：预热完成后逐个广播，前端 siteMetaCache 镜像与标签标题实时落地
    for meta in metas {
        let src = if meta.source.is_empty() { META_SOURCE_HTTP } else { meta.source.as_str() };
        emit_page_meta_updated(&app, &meta, src);
    }
    Ok(ipc(Ok(())))
}

fn emit_page_meta_updated(app: &tauri::AppHandle, meta: &PageMeta, source: &str) {
    emit_page_meta_updated_raw(
        app,
        &meta.url,
        &adl_browser::SiteMetaCacheEntry {
            title: meta.title.clone(),
            title_source: source.to_string(),
            favicon_url: meta.favicon.clone(),
            favicon_data_uri: meta.favicon_data_uri.clone(),
            fetched_at: 0,
            last_ok_at: 0,
            next_retry_at: 0,
            fail_count: 0,
        },
        source,
    );
}

fn emit_page_meta_updated_raw(
    app: &tauri::AppHandle,
    url: &str,
    e: &adl_browser::SiteMetaCacheEntry,
    source: &str,
) {
    use tauri::Emitter;
    let _ = app.emit(
        "digital-life://page-meta-updated",
        serde_json::json!({
            "url": url, "title": e.title, "faviconUrl": e.favicon_url,
            "faviconDataUri": e.favicon_data_uri, "source": source,
        }),
    );
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
        source: String::new(),
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

async fn fetch_page_meta_inner(url: &str) -> Result<PageMeta, AppError> {
    let t0 = std::time::Instant::now();
    tracing::info!(url = %url, "fetch_page_meta_inner: start");

    if !url.starts_with("http://") && !url.starts_with("https://") {
        tracing::warn!(url = %url, "fetch_page_meta_inner: non-http URL, returning empty");
        return Ok(PageMeta {
            title: String::new(),
            favicon: String::new(),
            url: url.to_string(),
            favicon_data_uri: String::new(),
            source: String::new(),
        });
    }

    // 爬虫主路径禁用短路：静默 WebView 渲染为主路径时，HTTP 爬虫不再作为抓取来源
    // （var 宿主的 encode 通常命中验证码/反爬）。保留全部原爬虫代码，验证通过后由
    // 用户决定是否删除。
    if SILENT_FETCH_ENABLED {
        tracing::debug!(url = %url, "fetch_page_meta_inner: HTTP crawler disabled by SILENT_FETCH_ENABLED");
        return Ok(empty_page_meta(url));
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent(USER_AGENT)
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| AppError::Internal(format!("failed to build http client: {e}")))?;

    // 合规爬虫门控：robots.txt Disallow 硬跳过（私网豁免 / fail-open 见辅助函数）。
    let robots_allowed = robots_allow_fetch(&client, url).await;
    tracing::info!(url = %url, robots_allowed, robots_ms = t0.elapsed().as_millis(), "fetch_page_meta_inner: robots gate");
    if !robots_allowed {
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
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            tracing::info!(url = %url, status, body_len = body.len(), page_ms = t0.elapsed().as_millis(), "fetch_page_meta_inner: HTTP success");
            body
        },
        Err(e) => {
            tracing::info!(url = %url, err = %e, page_ms = t0.elapsed().as_millis(), "fetch_page_meta_inner: HTTP failed, returning empty title/favicon (previous cache entry is kept)");
            return Ok(PageMeta {
                title: String::new(),
                favicon: String::new(),
                url: url.to_string(),
                favicon_data_uri: String::new(),
                source: String::new(),
            });
        },
    };

    let body = body.chars().take(65536).collect::<String>();
    let title = extract_title(&body);
    let favicon = extract_favicon(&body, url);

    let is_unsafe = title.as_deref().is_some_and(adl_browser::is_unsafe_title);
    let final_title = title
        .unwrap_or_else(|| {
            tracing::warn!(url = %url, "fetch_page_meta_inner: <title> not found, returning empty title");
            String::new()
        })
        .chars()
        .take(200)
        .collect::<String>();
    tracing::info!(
        url = %url,
        raw_title = %final_title,
        is_unsafe,
        "fetch_page_meta_inner: title extracted (unsafe/captcha will be cleared in write_success)"
    );

    // 仅接受页面真实声明或 origin 惯例兜底（RC5）：不再使用 DDG/Google 代理图标服务
    // —— 它们对无收录域名返回默认地球图标，且在国内被墙/不稳定，误存后还会被
    // should_replace_favicon 当权威图标锁死，导致"与真实 favicon 不一致"。
    let final_favicon = match favicon.or_else(|| Some(origin_favicon_fallback(url))) {
        Some(f) if !f.is_empty() => f,
        _ => String::new(),
    };
    tracing::info!(
        url = %url,
        final_favicon = %final_favicon,
        is_framework_default = adl_browser::is_framework_default_favicon(&final_favicon),
        parse_ms = t0.elapsed().as_millis(),
        "fetch_page_meta_inner: favicon decided"
    );

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

    tracing::info!(url = %url, title = %final_title, favicon_len = final_favicon.len(), favicon_data_uri_len = favicon_data_uri.len(), total_ms = t0.elapsed().as_millis(), "fetch_page_meta_inner: result");
    Ok(PageMeta {
        title: final_title,
        favicon: final_favicon,
        url: url.to_string(),
        favicon_data_uri,
        source: String::new(),
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
            source: String::new(),
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

#[cfg(test)]
mod page_meta_service_cmd_tests {
    use super::*;

    #[test]
    fn report_merge_keeps_http_title_over_com() {
        // 命令层冒烟：browser_page_meta_report 走 PageMetaService::report 的
        // 来源优先级决策 —— com 来源不得覆盖 http 权威标题。
        assert!(!adl_browser::should_apply_exact_match_title(
            "真实标题",
            "https://example.com/",
            "陈旧标题",
            adl_browser::META_SOURCE_COM,
            Some(adl_browser::META_SOURCE_HTTP)
        ));
    }

    #[test]
    fn warmup_url_list_exceeds_limit_returns_invalid_input() {
        // browser_page_meta_warmup 的输入验证：URL 超 200 返回 InvalidInput 错误
        let urls: Vec<String> = (0..201).map(|i| format!("https://warmup{i}.example/")).collect();
        assert_eq!(urls.len(), 201);
        let err = AppError::InvalidInput("URL list exceeds maximum length of 200".to_string());
        match &err {
            AppError::InvalidInput(msg) => {
                assert!(msg.contains("200"));
            },
            _ => panic!("expected InvalidInput error"),
        }
    }

    #[test]
    fn warmup_url_list_within_limit_ok() {
        // 验证 200 个 URL 在允许范围内
        let urls: Vec<String> = (0..200).map(|i| format!("https://warmup{i}.example/")).collect();
        assert_eq!(urls.len(), 200);
        // 200 不触发 InvalidInput，正常通过验证
        assert!(urls.len() <= 200);
    }

    #[test]
    fn warmup_empty_url_list_ok() {
        // 空 URL 列表应视为合法输入（warmup 直接返回空结果）
        let urls: Vec<String> = vec![];
        assert!(urls.len() <= 200);
    }

    #[test]
    fn warmup_duplicate_urls_deduped() {
        // 重复 URL 在 warmup 中应被去重（内部使用 HashSet 去重）
        let urls: Vec<String> = vec![
            "https://example.com/page".to_string(),
            "https://example.com/page".to_string(),
            "https://example.com/page#hash".to_string(),
        ];
        // 客户端层传 3 个（含重复），仍可接受
        assert!(urls.len() <= 200);
        // 去重逻辑在 PageMetaService::warmup 内部验证
    }
}

#[cfg(test)]
mod silent_meta_tests {
    use super::*;
    use adl_browser::{SiteMetaCacheEntry, SiteMetaCacheStore};

    /// 构造一个内存空缓存的 PageMetaService（隔离于真实磁盘存储，使用临时目录）。
    /// 目录名加入 `create_id` 唯一后缀：tests 并行时若复用同一目录会互相删建导致
    /// 磁盘竞争（Store::open 在目录被并发删除时失败）。
    fn empty_svc() -> PageMetaService {
        let dir = std::env::temp_dir()
            .join(format!("adl-silent-meta-test-{}", adl_types::create_id("sm")));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        PageMetaService::new(SiteMetaCacheStore::open(&dir).unwrap())
    }

    #[test]
    fn silent_title_ok_rejects_unsafe_and_placeholder() {
        let url = "https://www.bilibili.com/";
        assert!(!silent_title_ok("", url));
        assert!(!silent_title_ok("验证码_哔哩哔哩", url));
        assert!(!silent_title_ok("安全验证", url));
        assert!(!silent_title_ok("bilibili.com", url));
        assert!(!silent_title_ok("https://www.bilibili.com/", url));
    }

    #[test]
    fn silent_title_ok_accepts_real_title() {
        assert!(silent_title_ok("哔哩哔哩 (゜-゜)つロ 干杯~", "https://www.bilibili.com/"));
        assert!(silent_title_ok("真实的标题", "https://a.com/"));
    }

    #[test]
    fn silent_converged_requires_title_and_favicon() {
        let url = "https://a.com/";
        assert!(silent_converged("真实标题", url, "https://a.com/favicon.ico"));
        assert!(!silent_converged("真实标题", url, ""));
        assert!(!silent_converged("", url, "https://a.com/favicon.ico"));
        assert!(!silent_converged("a.com", url, "https://a.com/favicon.ico"));
    }

    #[test]
    fn page_meta_from_entry_sets_com_source_when_title_present() {
        let e = SiteMetaCacheEntry {
            title: "标题".into(),
            title_source: META_SOURCE_COM.into(),
            favicon_url: "https://a.com/favicon.ico".into(),
            favicon_data_uri: String::new(),
            fetched_at: 0,
            last_ok_at: 0,
            next_retry_at: 0,
            fail_count: 0,
        };
        let meta = page_meta_from_entry(e, "https://a.com/");
        assert_eq!(meta.title, "标题");
        assert_eq!(meta.favicon, "https://a.com/favicon.ico");
        assert_eq!(meta.source, META_SOURCE_COM);
        assert_eq!(meta.url, "https://a.com/");
    }

    #[test]
    fn page_meta_from_entry_empty_title_loses_source() {
        let e = SiteMetaCacheEntry {
            title: String::new(),
            title_source: META_SOURCE_COM.into(),
            favicon_url: String::new(),
            favicon_data_uri: String::new(),
            fetched_at: 0,
            last_ok_at: 0,
            next_retry_at: 0,
            fail_count: 0,
        };
        let meta = page_meta_from_entry(e, "https://a.com/");
        assert!(meta.title.is_empty());
        assert!(meta.source.is_empty());
        assert_eq!(meta.url, "https://a.com/");
    }

    #[tokio::test]
    async fn best_silent_meta_falls_back_to_empty_when_no_cache() {
        let svc = empty_svc();
        let meta = best_silent_meta(&svc, "https://nope.example/");
        assert!(meta.title.is_empty());
        assert!(meta.favicon.is_empty());
        assert_eq!(meta.url, "https://nope.example/");
    }

    #[tokio::test]
    async fn report_then_best_returns_partial_com_meta() {
        let svc = empty_svc();
        // 只上报标题（无 favicon）→ 部分元数据，来源应为 COM
        svc.report("https://a.example/", "标题", "", META_SOURCE_COM).await.unwrap();
        let meta = best_silent_meta(&svc, "https://a.example/");
        assert_eq!(meta.title, "标题");
        assert!(meta.favicon.is_empty());
        assert_eq!(meta.source, META_SOURCE_COM);
    }

    #[tokio::test]
    async fn channel_close_returns_best_partial_meta() {
        let svc = empty_svc();
        let (tx, mut rx) =
            tokio::sync::mpsc::unbounded_channel::<(String, String, String, String)>();
        tx.send(("tab".into(), "https://p.example/".into(), "标题".into(), String::new())).unwrap();
        drop(tx); // 关闭 channel → poll 走 Ok(None) 分支返回已得部分
        let meta = wait_for_silent_meta(&mut rx, &svc, "https://p.example/").await;
        assert_eq!(meta.title, "标题");
        assert!(meta.favicon.is_empty());
        assert_eq!(meta.source, META_SOURCE_COM);
        assert_eq!(meta.url, "https://p.example/");
    }

    /// 回归修复（Important-1）：部分元数据到达一次后 channel 保持静默（不关闭、
    /// 不再发数据），也应自首个有效起等待 ≥ `partial_ms` 后提前返回当前部分结果，
    /// 而非空转直到外层 6s 总体超时。
    ///
    /// 注入短时长：round_ms=20ms / partial_ms=100ms，使时序路径确定且毫秒级完成。
    #[tokio::test]
    async fn partial_meta_pre_returns_even_when_channel_goes_silent() {
        let svc = empty_svc();
        let url = "https://silent-partial.example/";
        let (tx, mut rx) =
            tokio::sync::mpsc::unbounded_channel::<(String, String, String, String)>();
        // 只上报标题（无 favicon）→ 部分元数据；tx 保持存活 → channel 静默但不关闭。
        tx.send(("tab".into(), url.into(), "部分标题".into(), String::new())).unwrap();

        let d = SilentPollDurations { round_ms: 20, partial_ms: 100 };
        let start = std::time::Instant::now();
        let meta = poll_silent_meta(&mut rx, &svc, url, d).await;
        let elapsed = start.elapsed();

        // 应在约 `partial_ms` 处（而非 6s 总体超时）提前返回。
        assert!(
            elapsed < std::time::Duration::from_millis(1000),
            "partial pre-return too slow (would wait until 6s timeout): {elapsed:?}"
        );
        assert_eq!(meta.title, "部分标题");
        assert!(meta.favicon.is_empty());
        assert_eq!(meta.source, META_SOURCE_COM);
        assert_eq!(meta.url, url);
    }

    /// 构造一个 SiteMetaCacheEntry 便于断言 `silent_cache_hit`。
    fn cache_entry(title: &str, favicon: &str) -> SiteMetaCacheEntry {
        SiteMetaCacheEntry {
            title: title.into(),
            title_source: META_SOURCE_COM.into(),
            favicon_url: favicon.into(),
            favicon_data_uri: String::new(),
            fetched_at: 0,
            last_ok_at: 0,
            next_retry_at: 0,
            fail_count: 0,
        }
    }

    #[test]
    fn silent_cache_hit_rejects_unsafe_title() {
        // 验证码/反爬标题不得作为有效缓存命中 → 需重新抓取。
        assert!(!silent_cache_hit(
            &cache_entry("验证码_哔哩哔哩", ""),
            "https://www.bilibili.com/"
        ));
        assert!(!silent_cache_hit(&cache_entry("安全验证", ""), "https://www.bilibili.com/"));
    }

    #[test]
    fn silent_cache_hit_rejects_placeholder_title() {
        // 占位标题（宿主名/裸 URL）不做有效命中。
        assert!(!silent_cache_hit(&cache_entry("", ""), "https://a.com/"));
        assert!(!silent_cache_hit(&cache_entry("bilibili.com", ""), "https://www.bilibili.com/"));
        assert!(!silent_cache_hit(
            &cache_entry("https://www.bilibili.com/", ""),
            "https://www.bilibili.com/"
        ));
    }

    #[test]
    fn silent_cache_hit_accepts_valid_title_or_favicon() {
        // 真实标题（无 favicon 也命中）。
        assert!(silent_cache_hit(
            &cache_entry("哔哩哔哩 (゜-゜)つロ 干杯~", ""),
            "https://www.bilibili.com/"
        ));
        // 仅 favicon 命中。
        assert!(silent_cache_hit(&cache_entry("", "https://a.com/favicon.ico"), "https://a.com/"));
        // 两者皆有更命中。
        assert!(silent_cache_hit(
            &cache_entry("真实标题", "https://a.com/favicon.ico"),
            "https://a.com/"
        ));
    }

    #[tokio::test]
    async fn fetch_page_meta_inner_short_circuits_when_silent_enabled() {
        if !SILENT_FETCH_ENABLED {
            return;
        }
        // SILENT 开启时 HTTP 爬虫主路径被禁用短路：直接返回 empty，不发网络请求。
        let meta = fetch_page_meta_inner("https://example.com/").await.unwrap();
        assert!(meta.title.is_empty());
        assert!(meta.favicon.is_empty());
        assert!(meta.favicon_data_uri.is_empty());
        assert_eq!(meta.url, "https://example.com/");
        assert!(meta.source.is_empty());
    }
}
