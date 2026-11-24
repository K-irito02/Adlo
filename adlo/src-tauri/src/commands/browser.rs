use std::sync::Arc;

use crate::commands::browser_memory::system_memory_pressured;
use crate::commands::browser_webview_setup::{
    apply_theme_and_navigate_for_platform, build_silent_webview_builder, build_webview_builder,
    has_download_extension, register_webview_with_manager, resolve_window_and_url,
    sanitize_referrer, setup_webview2_handlers_for_platform, webview_data_directory,
};
use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use crate::webview_event_bridge::TauriWebView2EventBridge;
use adl_browser::webview_handle::{Bounds, EventBridgeRef};
use adl_browser::{
    CachedMetaBridge, META_SOURCE_COM, META_SOURCE_HTTP, PageMeta, PageMetaService,
    SiteMetaCacheEntry, is_placeholder_title, is_unsafe_title, normalize_color_scheme,
    webview_label,
};
use adl_errors::AppError;
use adl_types::{AgentSiteOverride, AgentSiteRule, IpcResult};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use futures::StreamExt;
use tauri::{Manager, State};

#[derive(Debug, Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitialSize {
    pub width: f64,
    pub height: f64,
}

#[tauri::command]
#[allow(clippy::too_many_arguments)] // IPC boundary mirrors the frontend create call fields.
pub async fn browser_create_for_tab(
    app: tauri::AppHandle,
    tab_id: String,
    url: String,
    color_scheme: Option<String>,
    location: Option<String>,
    share_profile: Option<bool>,
    agent_origins: Vec<String>,
    agent_intercept_enabled: bool,
    agent_site_rules: Option<Vec<AgentSiteRule>>,
    agent_site_overrides: Option<Vec<AgentSiteOverride>>,
    referrer: Option<String>,
    initial_size: Option<InitialSize>,
) -> Result<IpcResult<Option<String>>, CommandError> {
    let referrer = sanitize_referrer(referrer);
    let (tx, rx) = tokio::sync::oneshot::channel();
    let app_inner = app.clone();

    app.run_on_main_thread(move || {
        let state = app_inner.state::<AppState>();
        let label = webview_label(&tab_id);
        tracing::debug!(tab_id = &tab_id, url = &url, color_scheme = ?&color_scheme, location = ?&location, "browser_create_for_tab: ENTER");

        let result = (|| -> Result<Option<String>, AppError> {
            let (window, _target) = resolve_window_and_url(&app_inner, &url)?;

            // Resolve the color scheme early — it's needed for the init script
            // (themed background for the initial about:blank document only).
            // apply_theme_and_navigate_for_platform will re-read the latest color
            // scheme at closure execution time, so this value only affects the
            // INIT_SCRIPT background.
            let cs = match color_scheme {
                Some(cs) => normalize_color_scheme(&cs),
                None => {
                    // 无显式传参时没有可用的 fallback：后端尚未同步过则读到的是
                    // 硬编码默认值（事项 10）。前端创建链路恒传 Some，此分支仅
                    // 直接 IPC 调用可达，留痕以便排查。
                    if !state.browser_manager.is_theme_initialized() {
                        tracing::warn!("browser_create_for_tab: no color_scheme provided and backend theme never synced; using backend default (may be stale)");
                    }
                    state.browser_manager.current_color_scheme()
                }
            };

            // Create the WebView with about:blank as the initial URL to prevent
            // the real page from loading before the background color and Profile
            // color scheme are applied. The real URL is navigated to after theme
            // setup in apply_theme_and_navigate_for_platform.
            let blank_url = url::Url::parse("about:blank")
                .map_err(|e| AppError::Internal(format!("failed to parse about:blank: {e}")))?;
            // 默认共享 WebView2 用户数据目录（中心与面板同一会话）；关闭「共享浏览
            // 配置文件」后中心走独立 UDF（ADR 0001 修订版）。
            let data_directory = webview_data_directory(&app_inner, location.as_deref(), share_profile);
            let builder = build_webview_builder(
                &label,
                &tab_id,
                blank_url,
                app_inner.clone(),
                &cs,
                false,
                &agent_origins,
                agent_intercept_enabled,
                &agent_site_rules.unwrap_or_default(),
                &agent_site_overrides.unwrap_or_default(),
            );
            let webview_builder = match data_directory {
                Some(dir) => builder.data_directory(dir),
                None => builder,
            };

            // Off-screen child attachment + WebView2 handler setup — shared with
            // the silent-tab path so both paths keep identical creation semantics.
            let host = location.as_deref().unwrap_or("panel");
            attach_webview_child(
                &window,
                &label,
                &tab_id,
                host,
                webview_builder,
                || Arc::new(TauriWebView2EventBridge::new(app_inner.clone())),
                false,
                initial_size,
            )?;

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
                        apply_theme_and_navigate_for_platform(
                            &webview,
                            app_inner.clone(),
                            &url,
                            &cs,
                            referrer.as_deref(),
                        );
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
fn initial_webview_size(initial_size: Option<InitialSize>) -> (f64, f64) {
    let width = initial_size.map(|s| s.width).unwrap_or(800.0).clamp(1.0, 10_000.0);
    let height = initial_size.map(|s| s.height).unwrap_or(600.0).clamp(1.0, 10_000.0);
    (width, height)
}

fn attach_webview_child(
    window: &tauri::Window<tauri::Wry>,
    label: &str,
    tab_id: &str,
    host: &str,
    webview_builder: tauri::webview::WebviewBuilder<tauri::Wry>,
    make_bridge: impl FnOnce() -> EventBridgeRef,
    is_silent: bool,
    initial_size: Option<InitialSize>,
) -> Result<(), AppError> {
    // 屏外创建，但尽量按最终容器尺寸初始化：页面在揭示前就以正确宽度/高度完成
    // 首屏布局，揭示时只移动位置，避免按默认 800×600 渲染后二次 resize 的重排。
    let (width, height) = initial_webview_size(initial_size);
    window
        .add_child(
            webview_builder,
            tauri::LogicalPosition::new(-10000.0, -10000.0),
            tauri::LogicalSize::new(width, height),
        )
        .map_err(|e| {
            AppError::Internal(format!("failed to create webview for tab {tab_id}: {e}"))
        })?;

    if is_silent {
        // silent 建窗（可见标签/显式刷新触发）走 DEBUG；正常标签页保留 INFO。
        tracing::debug!(tab_id = &tab_id, "browser webview created for silent tab");
    } else {
        tracing::info!(tab_id = &tab_id, "browser webview created for tab");
    }

    if let Some(webview) = window.get_webview(label) {
        let bridge = make_bridge();
        setup_webview2_handlers_for_platform(&webview, tab_id, label, host, bridge, is_silent);
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
    // 诚实说明：启动期此处读到的仍可能是后端默认值（脏），随后作为 fallback
    // 原样返回——可接受，因为静默面不可见且已隔离到独立 UDF，不污染可见组。
    // 归一化保证 init 背景与 Profile 同色（非法输入一律 dark，不分裂）。
    let cs = normalize_color_scheme(&state.browser_manager.current_color_scheme());
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
            // 静默 WebView 走独立 UDF：后台创建同样会重置同会话 profile 主题，
            // 隔离后不会闪到面板/中心任一可见组。
            let silent_builder = build_silent_webview_builder(&label, blank_url, &cs, true);
            let webview_builder = match webview_data_directory(&app_inner, Some("silent"), None) {
                Some(dir) => silent_builder.data_directory(dir),
                None => silent_builder,
            };
            attach_webview_child(
                &window,
                &label,
                &tab_id_inner,
                "silent",
                webview_builder,
                move || Arc::new(CachedMetaBridge::new(Some(tx))),
                true,
                None,
            )?;
            if let Some(webview) = window.get_webview(&label) {
                apply_theme_and_navigate_for_platform(
                    &webview,
                    app_inner.clone(),
                    &url_owned,
                    &cs,
                    None,
                );
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
    match &created {
        Ok(()) => tracing::debug!(
            url = %url,
            tab_id = %silent_tab_id,
            "[ADL-META] create_silent_webview: created OK"
        ),
        Err(e) => tracing::error!(
            url = %url,
            tab_id = %silent_tab_id,
            error = %e,
            "[ADL-META] create_silent_webview: created FAILED"
        ),
    }
    created?;
    Ok((silent_tab_id, rx))
}

/// 静默标签页抓取超时（毫秒），与前端 bookMarkMeta 体验对齐。
pub const SILENT_FETCH_TIMEOUT_MS: u64 = 6000;

/// 后台 favicon 字节下载并发上限：批量补齐/多标签刷新可能各自触发一次下载，
/// 无上限会对 CDN/远端打满连接（M2 移入后台任务后新引入的并发面）。
static FAVICON_DOWNLOAD_SEM: std::sync::OnceLock<std::sync::Arc<tokio::sync::Semaphore>> =
    std::sync::OnceLock::new();

fn favicon_download_semaphore() -> std::sync::Arc<tokio::sync::Semaphore> {
    FAVICON_DOWNLOAD_SEM.get_or_init(|| std::sync::Arc::new(tokio::sync::Semaphore::new(8))).clone()
}

/// 正在后台下载的 favicon URL 集合（per-URL in-flight 去重）：同 URL 数秒内多次
/// `get`/`get_silent` 触发多次下载时，仅首个下载真正执行，其余跳过（陈旧守卫仅
/// 在下载完成后校验，无法拦截并行重复）。
static FAVICON_DOWNLOADING: std::sync::OnceLock<
    std::sync::Mutex<std::collections::HashSet<String>>,
> = std::sync::OnceLock::new();

fn favicon_downloading() -> &'static std::sync::Mutex<std::collections::HashSet<String>> {
    FAVICON_DOWNLOADING.get_or_init(|| std::sync::Mutex::new(std::collections::HashSet::new()))
}

/// 退避短路判定（与预览端 `backedOff` 同构）：无成功记录（`last_ok_at == 0`）
/// 且仍在退避窗口（`now < next_retry_at`）→ 后台不再静默抓取。
/// 有成功记录的条目由缓存命中/TTL 语义管辖，backoff 不介入。
fn silent_backoff_active(e: &SiteMetaCacheEntry, now_ms: i64) -> bool {
    e.last_ok_at == 0 && now_ms < e.next_retry_at
}

/// 条目是否已有可显示图标（外部 URL 或内联 data-URI）。
/// 与 `silent_cache_hit` 关注点不同：后者表达「可直接返回」（有效标题 **或** 非空
/// `favicon_url`），本函数表达「有任何可显示图标」（`favicon_url` **或** data-URI）。
fn has_favicon(e: &SiteMetaCacheEntry) -> bool {
    !e.favicon_url.is_empty() || !e.favicon_data_uri.is_empty()
}

/// 无图标条目的补抓冷却（per cache key）：标题-only 条目在 `get` 缓存命中与显式
/// 刷新时会各触发一次静默补抓；冷却避免同一会话对无图标站点反复创建 WebView。
static FAVICON_LESS_REFETCH_COOLDOWN: std::sync::OnceLock<
    std::sync::Mutex<std::collections::HashMap<String, std::time::Instant>>,
> = std::sync::OnceLock::new();

fn favicon_less_refetch_cooldown()
-> &'static std::sync::Mutex<std::collections::HashMap<String, std::time::Instant>> {
    FAVICON_LESS_REFETCH_COOLDOWN
        .get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
}

const FAVICON_LESS_REFETCH_COOLDOWN_MS: u64 = 10 * 60 * 1000;

/// 检查并记录该 cache key 的无图标补抓尝试：冷却期内返回 false（跳过本次）。
fn favicon_less_refetch_allowed(key: &str) -> bool {
    let now = std::time::Instant::now();
    let mut map = favicon_less_refetch_cooldown().lock().unwrap_or_else(|e| e.into_inner());
    if let Some(&last) = map.get(key) {
        if now.duration_since(last).as_millis() < FAVICON_LESS_REFETCH_COOLDOWN_MS as u128 {
            return false;
        }
    }
    map.insert(key.to_string(), now);
    true
}

/// 冷却表键：与站点元数据缓存同口径（`get` 与 `warmup` 必须命中同一条记录，
/// 否则 `https://a.com/p/` 与 `https://a.com/p` 会各抓一次）。
fn favicon_less_refetch_key(url: &str) -> String {
    adl_browser::normalize_cache_key(url)
}

/// warmup 目标判定（纯函数）：
/// - 无条目 → 抓（首次预热）；
/// - 退避期墓碑 → 跳过（失败退避与预览端同构）；
/// - 标题不成立且 `favicon_url` 为空 → 抓（HTTP 只补图标、不写标题，即便已有 data-URI 也会抓）；
/// - 有效缓存（`silent_cache_hit`）但没有任何图标 → 仍抓（标题-only 条目补 favicon）。
///   这与预览端不再把「有标题」当有效命中一致；但预览端另有 `META_TTL_MS` 到期重抓
///   （有图标也会重抓），桌面端本轮未引入 TTL 语义，此处只对齐「标题-only」这一条；
/// - 有效缓存且已有图标 → 跳过。
fn warmup_target_allowed(e: Option<&SiteMetaCacheEntry>, url: &str, now_ms: i64) -> bool {
    match e {
        None => true,
        Some(entry) if silent_backoff_active(entry, now_ms) => false,
        Some(entry) if !silent_cache_hit(entry, url) => true,
        Some(entry) => !has_favicon(entry),
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 静默抓取结束后的请求键回写（消除重定向分叉）：
///
/// - full-empty meta（无标题/图标/data-URI）→ `note_failure` 落墓碑（fail_count+1、
///   指数退避、持久化），该站点后续启动不再重抓；
/// - 非空 meta → 按**请求键** `report`（复用占位/质量/data-URI 既有门控），与 poll
///   期间写在上报键下的条目并存。重定向站点从此在 warmup/get 的请求键 peek 上命中。
///
/// 无重定向（请求键 == 上报键，poll 已按请求键 report）时重复 report 为无变更 no-op。
async fn backfill_request_meta(svc: &PageMetaService, req_url: &str, meta: &PageMeta) {
    if meta.title.is_empty() && meta.favicon.is_empty() && meta.favicon_data_uri.is_empty() {
        if let Err(e) = svc.note_failure(req_url) {
            tracing::warn!(url = %req_url, error = %e, "backfill_request_meta: note_failure failed");
        }
        return;
    }
    let source = if meta.source.is_empty() { META_SOURCE_COM } else { meta.source.as_str() };
    if let Err(e) = svc.report(req_url, &meta.title, &meta.favicon, source).await {
        tracing::warn!(url = %req_url, error = %e, "backfill_request_meta: report failed");
    }
}

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
///
/// `reported`：静默 WebView2 实际上报的 URL（`sender.Source()`，重定向后与请求 URL
/// 不同）。条目经 `svc.report` 存于上报键下，故优先探测上报键；请求键作回退
/// （L1：重定向站点此前收敛判定/读取用请求键落空 → 空转 6s 后返回空 meta）。
fn best_silent_meta(svc: &PageMetaService, url: &str, reported: Option<&str>) -> PageMeta {
    let mut keys = Vec::with_capacity(2);
    if let Some(r) = reported {
        if !r.is_empty() && r != url {
            keys.push(r);
        }
    }
    keys.push(url);
    for key in keys {
        if let Some(e) = svc.peek(key) {
            if silent_title_ok(&e.title, key) || !e.favicon_url.is_empty() {
                let mut meta = page_meta_from_entry(e, key);
                // 键分叉兜底：标题与 favicon 事件之间发生导航时，标题/图标可能分别
                // 落在上报键与请求键（或反之），各含一半字段。命中条目缺失的标题/
                // 图标/数据 URI 从另一键条目补全，避免返回仅 favicon 无标题的部分 meta。
                if meta.title.is_empty() || meta.favicon.is_empty() {
                    let other = if key == url { reported } else { Some(url) }
                        .filter(|o| !o.is_empty() && *o != key);
                    if let Some(ok) = other {
                        if let Some(oe) = svc.peek(ok) {
                            if meta.title.is_empty() && silent_title_ok(&oe.title, ok) {
                                meta.title = oe.title.clone();
                                meta.source = oe.title_source.clone();
                            }
                            if meta.favicon.is_empty() {
                                meta.favicon = oe.favicon_url.clone();
                            }
                            // data-URI 必须来自同 favicon URL（否则 A 的 URL 配 B 的字节）。
                            if meta.favicon_data_uri.is_empty() && oe.favicon_url == meta.favicon {
                                meta.favicon_data_uri = oe.favicon_data_uri.clone();
                            }
                        }
                    }
                }
                return meta;
            }
        }
    }
    empty_page_meta(url)
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
        // 总体超时：poll 内部无有效上报到达（channel 全程静默），双键探测兜底。
        Err(_elapsed) => {
            tracing::debug!(
                req_url = %url,
                timeout_ms = SILENT_FETCH_TIMEOUT_MS,
                "[ADL-META-POLL] TOTAL TIMEOUT → fallback to best_silent_meta"
            );
            best_silent_meta(svc, url, None)
        },
    }
}

/// `wait_for_silent_meta` 的轮询主体（无总体超时，由外层 `timeout` 兜底）。
///
/// 策略（favicon 感知部分返回）：
/// - 首个有效元数据到达时启动 `partial_ms` 计时器
/// - 若计时器到期前达到**收敛**（标题 + favicon 齐全）→ 立即返回
/// - 若只有标题无 favicon 且 `partial_ms` 到期 → **不立即返回**，而是延长等待
///   `FAVICON_ONLY_WAIT_MS`（favicon 通常在标题之后由 Method 4 FaviconChanged 触发）
/// - 延长期间若 favicon 到达 → 收敛返回；否则等到总体超时或 channel 关闭
async fn poll_silent_meta(
    rx: &mut tokio::sync::mpsc::UnboundedReceiver<(String, String, String, String)>,
    svc: &PageMetaService,
    url: &str,
    d: SilentPollDurations,
) -> PageMeta {
    let round = std::time::Duration::from_millis(d.round_ms);
    let partial_threshold = std::time::Duration::from_millis(d.partial_ms);
    /// 仅标题无 favicon 时，额外等待 favicon 到达的最长时间（毫秒）。
    const FAVICON_ONLY_WAIT_MS: u64 = 3000;
    let favicon_only_threshold = std::time::Duration::from_millis(FAVICON_ONLY_WAIT_MS);
    let mut first_meta_at: Option<std::time::Instant> = None;
    let mut favicon_extended = false;
    // 最近一次实际上报的 URL（`sender.Source()`）。重定向后与请求 URL 不同。
    let mut last_reported: Option<String> = None;
    let poll_start = std::time::Instant::now();
    let mut tuple_count: u32 = 0;
    tracing::debug!(
        req_url = %url,
        round_ms = d.round_ms,
        partial_ms = d.partial_ms,
        favicon_only_ms = FAVICON_ONLY_WAIT_MS,
        "[ADL-META-POLL] poll_silent_meta: START"
    );
    loop {
        let recv = tokio::time::timeout(round, rx.recv()).await;
        match recv {
            Ok(Some((_tab_id, u, title, fav))) => {
                tuple_count += 1;
                let elapsed_ms = poll_start.elapsed().as_millis();
                tracing::trace!(
                    url = %u,
                    req_url = %url,
                    title_len = title.len(),
                    title = %title,
                    favicon_len = fav.len(),
                    favicon_preview = %fav.chars().take(40).collect::<String>(),
                    elapsed_ms = elapsed_ms,
                    tuple_count = tuple_count,
                    "[ADL-META-POLL] received tuple from silent webview"
                );
                if let Err(e) = svc.report(&u, &title, &fav, META_SOURCE_COM).await {
                    tracing::warn!(url = %u, error = %e, "[ADL-META-POLL] report failed");
                }
                last_reported = Some(u.clone());
                let peek_key = last_reported.as_deref().unwrap_or(url);
                if let Some(entry) = svc.peek(peek_key) {
                    let title_ok = silent_title_ok(&entry.title, peek_key);
                    let fav_present = !entry.favicon_url.is_empty();
                    tracing::trace!(
                        req_url = %url,
                        peek_key = %peek_key,
                        stored_title = %entry.title,
                        stored_favicon = %entry.favicon_url,
                        stored_favicon_len = entry.favicon_url.len(),
                        title_ok,
                        favicon_present = fav_present,
                        converged = title_ok && fav_present,
                        elapsed_ms = elapsed_ms,
                        "[ADL-META-POLL] cache state after report"
                    );
                    if silent_converged(&entry.title, peek_key, &entry.favicon_url) {
                        tracing::debug!(
                            req_url = %url,
                            peek_key = %peek_key,
                            elapsed_ms = elapsed_ms,
                            "[ADL-META-POLL] CONVERGED → return early"
                        );
                        return page_meta_from_entry(entry, peek_key);
                    }
                    if title_ok || fav_present {
                        if first_meta_at.is_none() {
                            tracing::debug!(
                                req_url = %url,
                                has_title = title_ok,
                                has_favicon = fav_present,
                                elapsed_ms = elapsed_ms,
                                "[ADL-META-POLL] first_meta_at SET (waiting for other)"
                            );
                        }
                        first_meta_at.get_or_insert_with(std::time::Instant::now);
                    }
                }
                // ---- 部分返回逻辑（favicon 感知） ----
                if let Some(start) = first_meta_at {
                    let since_first = start.elapsed();
                    if !favicon_extended && since_first >= partial_threshold {
                        // partial_ms 到期：检查是否只有标题无 favicon
                        let peek_url = last_reported.as_deref().unwrap_or(url);
                        if let Some(entry) = svc.peek(peek_url) {
                            let title_ok = silent_title_ok(&entry.title, peek_url);
                            let has_fav = !entry.favicon_url.is_empty();
                            if title_ok && !has_fav {
                                // 只有标题无 favicon → 延长等待 favicon 到达
                                favicon_extended = true;
                                tracing::debug!(
                                    req_url = %url,
                                    elapsed_ms = elapsed_ms,
                                    "[ADL-META-POLL] partial_ms reached, title-only → extend wait for favicon"
                                );
                            } else {
                                // 无有效标题（不需要等待）或已有 favicon（应已收敛）
                                tracing::debug!(
                                    req_url = %url,
                                    elapsed_ms = elapsed_ms,
                                    title_ok,
                                    has_favicon = has_fav,
                                    "[ADL-META-POLL] partial threshold reached → return partial"
                                );
                                return best_silent_meta(svc, url, last_reported.as_deref());
                            }
                        }
                    }
                    // 延长等待到期：favicon_only_ms 从首个元数据开始算
                    if favicon_extended && since_first >= partial_threshold + favicon_only_threshold
                    {
                        tracing::debug!(
                            req_url = %url,
                            elapsed_ms = elapsed_ms,
                            "[ADL-META-POLL] favicon_only extension expired → return partial"
                        );
                        return best_silent_meta(svc, url, last_reported.as_deref());
                    }
                }
            },
            Ok(None) => {
                tracing::debug!(
                    req_url = %url,
                    elapsed_ms = poll_start.elapsed().as_millis(),
                    tuple_count = tuple_count,
                    "[ADL-META-POLL] channel CLOSED → return best"
                );
                return best_silent_meta(svc, url, last_reported.as_deref());
            },
            // 单轮无数据收包：
            // - 若早已记录部分元数据且等待已到 `partial_ms` → 立即提前返回部分结果，
            //   而非继续空转直到外层 6s 总体超时（修复前行为）。
            // - 否则继续轮询等待（后续消息或总体超时兜底）。
            Err(_elapsed) => {
                if let Some(start) = first_meta_at {
                    let since_first = start.elapsed();
                    // 部分数据已到、channel 静默且已过 partial_ms：直接返回当前
                    // 部分结果（对齐文档声明；favicon 延长等待仅适用于收到消息分支）。
                    if !favicon_extended && since_first >= partial_threshold {
                        tracing::debug!(
                            req_url = %url,
                            elapsed_ms = poll_start.elapsed().as_millis(),
                            tuple_count = tuple_count,
                            "[ADL-META-POLL] idle + partial threshold reached → return partial"
                        );
                        return best_silent_meta(svc, url, last_reported.as_deref());
                    }
                    if favicon_extended && since_first >= partial_threshold + favicon_only_threshold
                    {
                        tracing::debug!(
                            req_url = %url,
                            elapsed_ms = poll_start.elapsed().as_millis(),
                            tuple_count = tuple_count,
                            "[ADL-META-POLL] idle + favicon_only expired → return partial"
                        );
                        return best_silent_meta(svc, url, last_reported.as_deref());
                    }
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

/// Search-result, human-verification, and consent pages are not metadata
/// targets. Fetching them with the crawler UA adds a programmatic request to
/// the exact page the user is opening (the visible tab already reports its own
/// title/favicon). This deny-list is independent of robots.txt reachability.
fn is_search_or_challenge_url(parsed: &url::Url) -> bool {
    let host = parsed.host_str().unwrap_or("").to_ascii_lowercase();
    let path = parsed.path().to_ascii_lowercase();

    let google = matches!(host.as_str(), "google.com" | "www.google.com");
    if google && (path.starts_with("/search") || path.starts_with("/sorry")) {
        return true;
    }
    let bing = matches!(host.as_str(), "bing.com" | "www.bing.com" | "cn.bing.com");
    if bing && path.starts_with("/search") {
        return true;
    }
    let baidu = matches!(host.as_str(), "baidu.com" | "www.baidu.com");
    if baidu && path.starts_with("/s") {
        return true;
    }
    let sogou = matches!(host.as_str(), "sogou.com" | "www.sogou.com");
    if sogou && path.starts_with("/web") {
        return true;
    }
    let so = matches!(host.as_str(), "so.com" | "www.so.com");
    if so && path.starts_with("/s") {
        return true;
    }
    let ddg = matches!(host.as_str(), "duckduckgo.com" | "www.duckduckgo.com");
    if ddg
        && parsed.query().is_some_and(|query| {
            query.split('&').any(|part| part.starts_with("q=") || part.starts_with("query="))
        })
    {
        return true;
    }
    false
}

/// 静默抓取只接受公网 http(s)：盘符伪主机（历史坏数据 `https://c/Users/...`）会让
/// WebView2 在主线程创建/导航时卡死（实测 AppHang），必须在建 WebView 前拦截。
/// 判定口径（与前端 `sanitizeRestoredBrowserUrl` 同源）：
/// - 扩展名检查作用于 path 而非 host（`https://agents.md/` 是真域名，不得误杀）；
/// - 单字母主机一律拒绝（盘符混淆）；
/// - 其余单标签主机（`http://nas/` 类内网）同样跳过静默抓取：手动打开不受影响，
///   仅后台元数据预热降级为空（有意设计，见 F9）。
fn silent_fetch_url_allowed(value: &str) -> bool {
    let Ok(parsed) = url::Url::parse(value) else {
        return false;
    };
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return false;
    }
    if is_search_or_challenge_url(&parsed) {
        return false;
    }
    // 下载目标本身没有可抓取的页面元数据；后台静默抓取这类 URL 只会让页面
    // 自动触发的安装包/压缩包请求被取消（既有 WARN 噪声，事项 9）。
    // 只按扩展名判断：`/download/`、`/get/` 等路径可能是正常页面，不做宽匹配。
    if has_download_extension(&parsed) {
        return false;
    }
    let Some(host) = parsed.host_str() else {
        return false;
    };
    // IPv6 host_str 带方括号（`[::1]`），先剥掉再做 IP 判定。
    let host = host.trim_start_matches('[').trim_end_matches(']');
    if host.eq_ignore_ascii_case("localhost") || host.parse::<std::net::IpAddr>().is_ok() {
        return true;
    }
    if host.len() == 1 && host.as_bytes()[0].is_ascii_alphabetic() {
        return false;
    }
    host.contains('.')
}

/// 解析 HTML 属性值（大小写不敏感；允许 `attr = "value"` 的空格）。
fn extract_html_attr(tag: &str, attr: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let needle = attr.to_ascii_lowercase();
    let bytes = lower.as_bytes();
    let mut search_from = 0usize;
    while let Some(pos) = lower[search_from..].find(&needle) {
        let name_pos = search_from + pos;
        let before = lower[..name_pos].chars().next_back();
        if !matches!(before, None | Some(' ' | '\t' | '\n' | '\r' | '<')) {
            search_from = name_pos + needle.len();
            continue;
        }
        let mut i = name_pos + needle.len();
        while i < bytes.len() && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        if i >= bytes.len() || bytes[i] != b'=' {
            search_from = i;
            continue;
        }
        i += 1;
        while i < bytes.len() && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        if i >= bytes.len() {
            return None;
        }
        let quote = bytes[i];
        if quote != b'"' && quote != b'\'' {
            let start = i;
            while i < bytes.len() && !bytes[i].is_ascii_whitespace() && bytes[i] != b'>' {
                i += 1;
            }
            return Some(tag[start..i].to_string());
        }
        let start = i + 1;
        let end = tag[start..].find(quote as char)? + start;
        return Some(tag[start..end].to_string());
    }
    None
}

fn decode_html_entities(input: &str) -> String {
    input
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&nbsp;", " ")
}

fn extract_html_title(html: &str) -> String {
    let lower = html.to_ascii_lowercase();
    if let Some(start) = lower.find("<title") {
        if let Some(gt) = lower[start..].find('>') {
            let content_start = start + gt + 1;
            if let Some(end) = lower[content_start..].find("</title>") {
                let title = html[content_start..content_start + end].trim();
                return decode_html_entities(title).chars().take(200).collect();
            }
        }
    }
    // og:title 兜底
    let mut offset = 0usize;
    while let Some(pos) = lower[offset..].find("<meta") {
        let tag_start = offset + pos;
        let Some(tag_end) = lower[tag_start..].find('>') else { break };
        let tag = &html[tag_start..tag_start + tag_end];
        let property = extract_html_attr(tag, "property").unwrap_or_default();
        if property.eq_ignore_ascii_case("og:title") {
            if let Some(content) = extract_html_attr(tag, "content") {
                return decode_html_entities(content.trim()).chars().take(200).collect();
            }
        }
        offset = tag_start + tag_end + 1;
    }
    String::new()
}

fn extract_icon_url(html: &str, page_url: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let base = url::Url::parse(page_url).ok()?;
    let mut offset = 0usize;
    while let Some(pos) = lower[offset..].find("<link") {
        let tag_start = offset + pos;
        let tag_end = lower[tag_start..].find('>')? + tag_start;
        let tag = &html[tag_start..tag_end];
        let rel = extract_html_attr(tag, "rel").unwrap_or_default();
        if rel.to_ascii_lowercase().contains("icon") {
            if let Some(href) = extract_html_attr(tag, "href") {
                let href = href.trim();
                if !href.is_empty() {
                    if let Ok(resolved) = base.join(href) {
                        return Some(resolved.to_string());
                    }
                }
            }
        }
        offset = tag_end + 1;
    }
    None
}

fn origin_favicon_url(page_url: &str) -> Option<String> {
    let parsed = url::Url::parse(page_url).ok()?;
    let host = parsed.host_str()?;
    let port = parsed.port().map(|value| format!(":{value}")).unwrap_or_default();
    Some(format!("{}://{host}{port}/favicon.ico", parsed.scheme()))
}

fn is_private_http_host(host: &str) -> bool {
    host.eq_ignore_ascii_case("localhost")
        || host.parse::<std::net::IpAddr>().is_ok()
        || (host.len() == 1 && host.as_bytes()[0].is_ascii_alphabetic())
}

/// 解析 robots.txt 分组（RFC 9309 子集，与预览端 `crawlerRobots.parseRobotsTxt` 同构）：
/// 注释只剥到行尾、空行不结束分组；`User-agent` 在已有规则后开新组；无前缀的
/// `Allow`/`Disallow` 归入 `*` 组。
#[derive(Default)]
struct RobotsGroup {
    user_agents: Vec<String>,
    allow: Vec<String>,
    disallow: Vec<String>,
}

fn parse_robots_txt(raw: &str) -> Vec<RobotsGroup> {
    let mut groups: Vec<RobotsGroup> = Vec::new();
    let mut current: Option<RobotsGroup> = None;
    for raw_line in raw.lines() {
        let line = raw_line.split('#').next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }
        let Some((field, value)) = line.split_once(':') else { continue };
        let field = field.trim().to_ascii_lowercase();
        // 单条规则字符上限：防止超长 Disallow 让下面的 DP 分配膨胀。
        let value: String = value.trim().chars().take(MAX_ROBOTS_RULE_CHARS).collect();
        let value = value.as_str();
        match field.as_str() {
            "user-agent" => {
                let has_rules =
                    current.as_ref().is_some_and(|g| !g.allow.is_empty() || !g.disallow.is_empty());
                if has_rules {
                    if let Some(group) = current.take() {
                        groups.push(group);
                    }
                }
                current
                    .get_or_insert_with(RobotsGroup::default)
                    .user_agents
                    .push(value.to_string());
            },
            "allow" if !value.is_empty() => current
                .get_or_insert_with(|| RobotsGroup {
                    user_agents: vec!["*".to_string()],
                    ..RobotsGroup::default()
                })
                .allow
                .push(value.to_string()),
            "disallow" if !value.is_empty() => current
                .get_or_insert_with(|| RobotsGroup {
                    user_agents: vec!["*".to_string()],
                    ..RobotsGroup::default()
                })
                .disallow
                .push(value.to_string()),
            _ => {},
        }
    }
    if let Some(group) = current {
        groups.push(group);
    }
    groups
}

/// robots.txt 解析上限：正文 64KB、单条规则 512 字符。恶意/损坏站点不能让
/// 常驻桌面进程为 DP 匹配分配 GB 级内存。
const MAX_ROBOTS_BODY: usize = 64 * 1024;
const MAX_ROBOTS_RULE_CHARS: usize = 512;
const MAX_ROBOTS_DP_CELLS: usize = 250_000;

/// 通配符模式（`*` 任意串、尾部 `$` 锚定）的最长前缀匹配长度；不匹配返回 None。
/// 与预览端 `longestMatch` 的 DP 语义一致。
#[allow(clippy::needless_range_loop)] // DP 表按行列下标推进，迭代器形式反而难读。
fn robots_longest_match(pattern: &str, path: &str) -> Option<usize> {
    let anchored = pattern.ends_with('$');
    let core = if anchored { &pattern[..pattern.len() - 1] } else { pattern };
    let pat: Vec<char> = core.chars().collect();
    let self_chars: Vec<char> = path.chars().collect();
    // 乘积上限保护：正常规则（≤512 字符 + 短路径）远低于阈值。
    if pat.len().saturating_mul(self_chars.len()) > MAX_ROBOTS_DP_CELLS {
        return None;
    }
    let mut dp = vec![vec![false; self_chars.len() + 1]; pat.len() + 1];
    dp[0][0] = true;
    for i in 1..=pat.len() {
        if pat[i - 1] == '*' {
            for j in 0..=self_chars.len() {
                if dp[i - 1][j] {
                    dp[i][j] = true;
                }
            }
            for j in 1..=self_chars.len() {
                if dp[i][j - 1] {
                    dp[i][j] = true;
                }
            }
        } else {
            for j in 1..=self_chars.len() {
                if dp[i - 1][j - 1] && pat[i - 1] == self_chars[j - 1] {
                    dp[i][j] = true;
                }
            }
        }
    }
    if anchored {
        return dp[pat.len()][self_chars.len()].then_some(self_chars.len());
    }
    (0..=self_chars.len()).rev().find(|&j| dp[pat.len()][j])
}

/// robots 判定（与预览端 `crawlerRobots.isAllowed` 同语义）：
/// 精确 UA 分组优先、否则 `*`；`Allow`/`Disallow` 取最长匹配，等长时 Allow 胜。
fn robots_allows(robots: &str, user_agent: &str, path: &str) -> bool {
    let groups = parse_robots_txt(robots);
    let token = user_agent.split('/').next().unwrap_or(user_agent).trim();
    let group = groups
        .iter()
        .find(|g| g.user_agents.iter().any(|ua| ua.eq_ignore_ascii_case(token)))
        .or_else(|| groups.iter().find(|g| g.user_agents.iter().any(|ua| ua == "*")));
    let Some(group) = group else { return true };
    let path = if path.is_empty() { "/" } else { path };
    let allow_max =
        group.allow.iter().filter_map(|pattern| robots_longest_match(pattern, path)).max();
    let disallow_max =
        group.disallow.iter().filter_map(|pattern| robots_longest_match(pattern, path)).max();
    match (allow_max, disallow_max) {
        (None, None) => true,
        (None, Some(_)) => false,
        (Some(_), None) => true,
        (Some(allow), Some(disallow)) => allow >= disallow,
    }
}

static ROBOTS_CACHE: std::sync::OnceLock<
    std::sync::Mutex<std::collections::HashMap<String, Vec<String>>>,
> = std::sync::OnceLock::new();

/// robots 正文封顶并按行切分（纯函数：便于用超长正文验证上限）。
fn robots_lines_from_body(mut body: Vec<u8>) -> Vec<String> {
    if body.len() > MAX_ROBOTS_BODY {
        body.truncate(MAX_ROBOTS_BODY);
    }
    trim_incomplete_utf8_tail(&mut body);
    String::from_utf8_lossy(&body).lines().take(500).map(str::to_string).collect()
}

async fn robots_allows_url(url: &str) -> bool {
    let Ok(parsed) = url::Url::parse(url) else { return true };
    let Some(host) = parsed.host_str() else { return true };
    if is_private_http_host(host) {
        return true;
    }
    let origin = format!(
        "{}://{}{}",
        parsed.scheme(),
        host,
        parsed.port().map(|port| format!(":{port}")).unwrap_or_default()
    );
    let cache =
        ROBOTS_CACHE.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()));
    if let Some(lines) = cache.lock().unwrap_or_else(|e| e.into_inner()).get(&origin) {
        return robots_allows(&lines.join("\n"), USER_AGENT, parsed.path());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .user_agent(USER_AGENT)
        .redirect(reqwest::redirect::Policy::limited(3))
        .build();
    let Ok(client) = client else { return true };
    let robots_url = format!("{origin}/robots.txt");
    let lines = match client.get(&robots_url).send().await {
        Ok(response) if response.status().is_success() => {
            let mut body = Vec::with_capacity(MAX_ROBOTS_BODY);
            let mut stream = response.bytes_stream();
            while let Some(chunk) = stream.next().await {
                let Ok(chunk) = chunk else { break };
                body.extend_from_slice(&chunk);
                if body.len() >= MAX_ROBOTS_BODY {
                    body.truncate(MAX_ROBOTS_BODY);
                    trim_incomplete_utf8_tail(&mut body);
                    break;
                }
            }
            robots_lines_from_body(body)
        },
        _ => Vec::new(),
    };
    let allowed = robots_allows(&lines.join("\n"), USER_AGENT, parsed.path());
    cache.lock().unwrap_or_else(|e| e.into_inner()).insert(origin, lines);
    allowed
}

/// 截断点可能落在多字节字符中间：仅当尾部是「不完整字符」时回退到字符边界；
/// 页面本身含非法字节（GBK 等）时保留原样，由解码步骤判定。
fn trim_incomplete_utf8_tail(buffer: &mut Vec<u8>) {
    if let Err(error) = std::str::from_utf8(buffer) {
        if error.error_len().is_none() {
            buffer.truncate(error.valid_up_to());
        }
    }
}

/// 从 HTML 字节解码标题：仅接受合法 UTF-8，并过滤占位/反爬标题。
fn decode_html_title(bytes: &[u8], url: &str) -> Option<String> {
    let html = std::str::from_utf8(bytes).ok()?;
    let raw = extract_html_title(html);
    silent_title_ok(&raw, url).then_some(raw)
}

/// 解析已截断的 HTML 字节（标题 + 图标）。内部再对齐一次 UTF-8 尾字节，
/// 让截断/解码走同一条路径（`parse_html_meta_trims_half_char_and_rejects_gbk` 覆盖）。
fn parse_html_meta(mut buffer: Vec<u8>, url: &str, final_url: &url::Url) -> (String, String) {
    trim_incomplete_utf8_tail(&mut buffer);
    let title = decode_html_title(&buffer, url).unwrap_or_default();
    let html = String::from_utf8_lossy(&buffer);
    // 相对图标按重定向后的最终 URL 解析（短链 / http→https / 目录跳转）。
    let favicon = extract_icon_url(&html, final_url.as_str())
        .or_else(|| origin_favicon_url(final_url.as_str()))
        .unwrap_or_default();
    (title, favicon)
}

/// HTTP 元数据抓取（不做 WebView）：HTML 前 64KB 解析 title / link icon，
/// 图标 URL 缺失时回退 `{origin}/favicon.ico`。失败返回 None，由调用方落失败墓碑。
async fn fetch_page_meta_http(url: &str) -> Option<PageMeta> {
    let parsed = url::Url::parse(url).ok()?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return None;
    }
    if is_search_or_challenge_url(&parsed) {
        return None;
    }
    // 安装包/压缩包等下载目标没有可解析的页面元数据；GET 安装包只会消耗带宽。
    if has_download_extension(&parsed) {
        return None;
    }
    if !robots_allows_url(parsed.as_str()).await {
        return None;
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .user_agent(USER_AGENT)
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .ok()?;
    let response = client
        .get(parsed.clone())
        .header(reqwest::header::ACCEPT, "text/html,application/xhtml+xml")
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let final_url = response.url().clone();
    // 响应不整包读入：只保留解析所需的 64KB（不依赖 Content-Length）。
    let mut stream = response.bytes_stream();
    let mut buffer = Vec::with_capacity(64 * 1024);
    while let Some(chunk) = stream.next().await {
        let Ok(chunk) = chunk else { break };
        buffer.extend_from_slice(&chunk);
        if buffer.len() >= 64 * 1024 {
            buffer.truncate(64 * 1024);
            // 截断点可能落在多字节字符中间：回退到最近字符边界，避免正常 UTF-8
            // 页面因尾部半个字符被误判为「非 UTF-8」而丢标题。
            trim_incomplete_utf8_tail(&mut buffer);
            break;
        }
    }
    // 只有真正的非法 UTF-8（GBK/Shift-JIS 等）才丢弃标题；截断已对齐字符边界。
    // 反爬/验证码页与占位标题也不返回给调用方（新建书签、显式刷新都消费该返回值）。
    let (title, favicon) = parse_html_meta(buffer, url, &final_url);
    if title.is_empty() && favicon.is_empty() {
        return None;
    }
    Some(PageMeta {
        title,
        favicon,
        url: url.to_string(),
        favicon_data_uri: String::new(),
        source: META_SOURCE_HTTP.to_string(),
    })
}

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
    if !silent_fetch_url_allowed(url) {
        // 静默抓取入口可能收到空白/非 http 页面/单标签内网主机：属正常跳过，不产生告警。
        tracing::debug!(%url, "fetch_silent_meta: invalid URL, skip silent webview");
        return Ok(PageMeta { url: url.to_string(), ..PageMeta::default() });
    }
    let app_owned = app.clone();
    let url_owned = url.to_string();
    // 创建本身也可能被主线程阻塞（WebView2 初始化慢/UI 忙），`create_silent_webview`
    // 内部 `blocking_recv` 无超时；故对整个 spawn_blocking 套 6s 超时，避免命令无限挂起。
    let mut create_handle = tokio::task::spawn_blocking(move || {
        let g = app_owned.state::<AppState>(); // Manager trait；borrow 绑定到 app_owned
        create_silent_webview(app_owned.clone(), &g, &url_owned)
    });
    let (tab_id, mut rx) = match tokio::time::timeout(
        std::time::Duration::from_millis(SILENT_FETCH_TIMEOUT_MS),
        &mut create_handle,
    )
    .await
    {
        Ok(Ok(Ok(created))) => created,
        Ok(Ok(Err(e))) => return Err(e),
        Ok(Err(e)) => return Err(AppError::Internal(format!("silent webview join: {e}"))),
        Err(_) => {
            // 超时：spawn_blocking 任务不可取消，主线程稍后可能仍创建成功 → 承接句柄，
            // 若最终成功则销毁孤儿 WebView，避免泄漏；超时仅提前返回给调用方。
            let app_late = app.clone();
            tokio::spawn(async move {
                if let Ok(Ok((orphan_tab_id, _))) = create_handle.await {
                    destroy_silent_webview(&app_late, &orphan_tab_id);
                }
            });
            return Err(AppError::Internal("silent webview creation timed out".into()));
        },
    };

    let page_meta =
        wait_for_silent_meta(&mut rx, state.browser_manager.page_meta_service(), url).await;

    destroy_silent_webview(&app, &tab_id);

    // 请求键回写（消除重定向分叉）：非空 meta 按请求键 report，空 meta 落墓碑。
    // poll 只保证上报键命中，本步补齐请求键——否则重定向站点 warmup/get 永远 miss。
    backfill_request_meta(state.browser_manager.page_meta_service(), url, &page_meta).await;

    // 静默路径补全 data-URI（M2）：WebView2 只给出 favicon URL，若前端直接跨域 <img>
    // 加载会命中 CDN 防盗链（bilibili/runoob 等），导致渲染回退到兜底图标。以页面自身
    // 为 Referer 下载 favicon 字节内嵌为 data-URI，使渲染不受跨域/防盗链影响。
    // 下载移入后台任务：命令先行返回（≤6s 抓取窗口），favicon 字节下载（至多 ~10s）
    // 不再阻塞调用方；完成后持久化 + emit 广播，前端镜像自愈。
    // 注：网络环境正常时（reqwest 可达）后台下载成功；无网络/被墙时下载失败，
    // data-URI 不生成，前端回退显示外部 URL 或兜底图标（可接受，不强求）。
    if !page_meta.favicon.is_empty() && page_meta.favicon_data_uri.is_empty() {
        // L1：条目经 report 存于实际最终 URL（重定向后 ≠ 请求 URL），data-URI 必须以
        // 持有该 favicon 的条目键回填（重定向/fork 时标题与 favicon 可能分落两键，
        // 直接写 page_meta.url 会命中陈旧守卫被丢弃）。
        let cache_key = resolve_favicon_backfill_key(
            state.browser_manager.page_meta_service(),
            &page_meta.url,
            url,
            &page_meta.favicon,
        );
        let favicon_url = page_meta.favicon.clone();
        let req_url_owned = url.to_string();
        let svc = state.browser_manager.page_meta_service().clone();
        spawn_favicon_download(&app, svc, cache_key, favicon_url, req_url_owned);
    } else if page_meta.favicon.is_empty() {
        // 惯例兜底：静默渲染一个图标都没拿到（页面未声明 / 隐藏渲染被登录墙挡住）时，
        // 按 Chrome 语义回退 `{origin}/favicon.ico`。与预览端 `previewFetchPageMeta`
        // 的「`<link rel=icon>` → origin 惯例兜底」对齐——否则同一网站浏览器模式有
        // 图标、桌面端只显示首字母。
        let svc = state.browser_manager.page_meta_service().clone();
        spawn_convention_favicon(app.clone(), svc, url.to_string(), page_meta.title.clone());
    }

    tracing::debug!(
        req_url = %url,
        favicon_len = page_meta.favicon.len(),
        favicon_full = %page_meta.favicon,
        title_len = page_meta.title.len(),
        title = %page_meta.title,
        data_uri_len = page_meta.favicon_data_uri.len(),
        "fetch_silent_meta: FINAL returned meta"
    );

    Ok(page_meta)
}

#[tauri::command]
pub async fn browser_page_meta_get_silent(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    url: String,
) -> Result<IpcResult<PageMeta>, CommandError> {
    tracing::debug!(url = %url, "[ADL-META] browser_page_meta_get_silent: ENTER (tauri IPC hit)");
    match fetch_silent_meta(app.clone(), &state, &url).await {
        Ok(page_meta) => {
            let src = if page_meta.source.is_empty() {
                META_SOURCE_COM
            } else {
                page_meta.source.as_str()
            };
            emit_page_meta_updated(&app, &page_meta, src);
            tracing::debug!(
                url = %url,
                title_len = page_meta.title.len(),
                title = %page_meta.title,
                favicon_len = page_meta.favicon.len(),
                data_uri_len = page_meta.favicon_data_uri.len(),
                "[ADL-META] browser_page_meta_get_silent: OK"
            );
            Ok(ipc(Ok(page_meta)))
        },
        Err(e) => {
            tracing::error!(url = %url, error = %e, "[ADL-META] browser_page_meta_get_silent: FAILED");
            Err(e.into())
        },
    }
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

#[tauri::command]
pub fn browser_site_meta_clear(state: State<'_, AppState>) -> Result<IpcResult<()>, CommandError> {
    let store = state.browser_manager.site_meta_cache();
    let count = store.count().unwrap_or(0);
    // 经 PageMetaService::clear 清空：仅清 store 会留下会话内 peek 命中陈旧内存条目的窗口。
    state.browser_manager.page_meta_service().clear().map_err(CommandError::from)?;
    tracing::info!(cleared = count, "browser_site_meta_clear: site meta cache cleared");
    Ok(ipc(Ok(())))
}

#[tauri::command]
pub fn browser_site_meta_upsert(
    state: State<'_, AppState>,
    entries: HashMap<String, adl_browser::SiteMetaCacheEntry>,
) -> Result<IpcResult<()>, CommandError> {
    let count = entries.len();
    state.browser_manager.page_meta_service().upsert(&entries).map_err(CommandError::from)?;
    tracing::info!(count, "browser_site_meta_upsert: site meta cache upserted");
    Ok(ipc(Ok(())))
}

#[tauri::command]
pub fn browser_site_meta_remove(
    state: State<'_, AppState>,
    urls: Vec<String>,
) -> Result<IpcResult<()>, CommandError> {
    let count = urls.len();
    state.browser_manager.page_meta_service().remove(&urls).map_err(CommandError::from)?;
    tracing::info!(count, "browser_site_meta_remove: site meta cache removed");
    Ok(ipc(Ok(())))
}

#[tauri::command]
pub fn browser_memory_pressure() -> Result<IpcResult<bool>, CommandError> {
    Ok(ipc(Ok(system_memory_pressured())))
}

#[tauri::command]
pub async fn browser_page_meta_get(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    url: String,
    force: Option<bool>,
) -> Result<IpcResult<PageMeta>, CommandError> {
    let svc = state.browser_manager.page_meta_service();
    // 静默主路径：缓存优先（零 WebView）。命中有效缓存（有效标题或非空 favicon）
    // 直接返回；`force=true` 绕过缓存。Tauri 桌面应用只用 WebView2 静默渲染抓取，
    // 不再保留任何 HTTP 爬虫回退。
    if !force.unwrap_or(false) {
        if let Some(e) = svc.peek(&url) {
            // 退避期中的墓碑条目（从未成功过且仍在 next_retry_at 窗口）：不创建
            // WebView，直接返回空 meta；不 emit——避免空 meta 广播清空前端镜像。
            if !silent_cache_hit(&e, &url) && silent_backoff_active(&e, now_ms()) {
                return Ok(ipc(Ok(PageMeta { url: url.clone(), ..PageMeta::default() })));
            }
            if silent_cache_hit(&e, &url) {
                // 标题-only 缓存（无任何图标）：命中仍即时返回，但后台补抓一次
                // 静默渲染补上 favicon 并广播自愈。否则该 URL 的图标会永久停在
                // 兜底首字母，只能靠用户手动「刷新网站图标与标题」。
                let needs_favicon_refetch = !has_favicon(&e);
                let meta = PageMeta {
                    title: e.title,
                    favicon: e.favicon_url,
                    favicon_data_uri: e.favicon_data_uri,
                    url: url.clone(),
                    source: e.title_source,
                };
                let src =
                    if meta.source.is_empty() { META_SOURCE_COM } else { meta.source.as_str() };
                emit_page_meta_updated(&app, &meta, src);
                // 缓存命中但缺 data-URI（重启后 / 此前下载与退出竞态）：后台补全，
                // 使可见标签的防盗链 favicon 不再长期停留在兜底图标（去重/冷却/信号量兜底）。
                if !meta.favicon.is_empty() && meta.favicon_data_uri.is_empty() {
                    let cache_key = meta.url.clone();
                    let favicon_url = meta.favicon.clone();
                    let req_url = url.clone();
                    let svc_backfill = state.browser_manager.page_meta_service().clone();
                    spawn_favicon_download(&app, svc_backfill, cache_key, favicon_url, req_url);
                } else if needs_favicon_refetch
                    && favicon_less_refetch_allowed(&favicon_less_refetch_key(&url))
                {
                    spawn_meta_refetch(&app, url.clone());
                }
                return Ok(ipc(Ok(meta)));
            }
        }
    }
    let meta = fetch_silent_meta(app.clone(), &state, &url).await?;
    emit_page_meta_updated(&app, &meta, META_SOURCE_COM);
    Ok(ipc(Ok(meta)))
}

/// HTTP 抓取 + 缓存写入 + 图标 data-URI 补全 + 广播。供命令与显式 warmup 复用。
async fn fetch_and_store_http_meta(
    app: &tauri::AppHandle,
    svc: std::sync::Arc<PageMetaService>,
    url: &str,
) -> Option<PageMeta> {
    let Some(mut meta) = fetch_page_meta_http(url).await else {
        if let Err(error) = svc.note_failure(url) {
            tracing::debug!(url = %url, error = %error, "page_meta_fetch_http: note_failure failed");
        }
        return None;
    };
    let incoming_favicon = meta.favicon.clone();
    // 静态 HTTP 标题不得覆盖渲染期 COM 标题（SPA 静态 title 常是站点名）。
    // 这里只上报图标；标题仅在返回值里供「新建书签」等显式入口使用，不落缓存。
    if let Err(error) = svc.report(url, "", &meta.favicon, META_SOURCE_HTTP).await {
        tracing::debug!(url = %url, error = %error, "page_meta_fetch_http: report failed");
    }
    let key = adl_browser::normalize_cache_key(url);
    let Some(entry) = svc.peek(&key) else {
        return Some(meta);
    };
    meta.favicon = entry.favicon_url.clone();
    meta.favicon_data_uri = entry.favicon_data_uri.clone();
    // 只有质量门控真正采纳了本次图标 URL 才下载，且下载放后台（旧路径的
    // in-flight 去重/冷却/陈旧守卫都在 spawn_favicon_download 内）。
    if !entry.favicon_url.is_empty()
        && entry.favicon_url == incoming_favicon
        && entry.favicon_data_uri.is_empty()
    {
        spawn_favicon_download(
            app,
            svc.clone(),
            url.to_string(),
            entry.favicon_url.clone(),
            url.to_string(),
        );
    }
    // 只广播图标：空标题让前端保留现有标题，避免 HTTP 静态标题覆盖渲染标题。
    let mut broadcast_entry = entry.clone();
    broadcast_entry.title.clear();
    broadcast_entry.title_source.clear();
    emit_page_meta_updated_raw(app, url, &broadcast_entry, META_SOURCE_HTTP);
    Some(meta)
}

/// HTTP-first 元数据抓取（无 WebView）：启动不再批量预热；书签/标签的缺图标补齐
/// 先走本条。显式刷新/可见标签可再调用 `browser_page_meta_refresh` 回退静默 WebView。
#[tauri::command]
pub async fn browser_page_meta_fetch_http(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    url: String,
) -> Result<IpcResult<PageMeta>, CommandError> {
    let svc = state.browser_manager.page_meta_service();
    let meta = fetch_and_store_http_meta(&app, svc.clone(), &url)
        .await
        .unwrap_or_else(|| PageMeta { url: url.clone(), ..PageMeta::default() });
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
    // 静默主路径：刷新强制重新渲染抓取。Tauri 桌面应用只用 WebView2 静默渲染。
    let meta = fetch_silent_meta(app.clone(), &state, &url).await?;
    emit_page_meta_updated(&app, &meta, META_SOURCE_COM);
    Ok(ipc(Ok(meta)))
}

#[tauri::command]
pub async fn browser_page_meta_warmup(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    urls: Vec<String>,
) -> Result<IpcResult<()>, CommandError> {
    // 输入验证：URL 数量超过下方代码中的上限时返回 InvalidInput。
    if urls.len() > 200 {
        return Ok(ipc(Err(AppError::InvalidInput(
            "URL list exceeds maximum length of 200".to_string(),
        ))));
    }
    let svc = state.browser_manager.page_meta_service();
    // 显式批量补齐（不再由启动调用）：HTTP-first，绝不创建隐藏 WebView。
    // 缺图标的条目走 reqwest 抓 HTML + 图标（不写标题）；失败落失败墓碑，下一次按退避窗口跳过。
    if let Err(e) = svc.preload().await {
        tracing::warn!(error = %e, "browser_page_meta_warmup: preload failed (继续，过滤可能偏保守)");
    }
    // 单次批量最多补抓多少个「标题-only」条目。
    const WARMUP_FAVICON_BACKFILL_MAX: usize = 40;
    let mut seen = std::collections::HashSet::new();
    let mut favicon_backfills = 0usize;
    let now = now_ms();
    let targets: Vec<String> = urls
        .into_iter()
        .filter(|u| {
            let key = adl_browser::normalize_cache_key(u);
            if !seen.insert(key.clone()) {
                return false;
            }
            let entry = svc.peek(&key);
            if !warmup_target_allowed(entry.as_ref(), u, now) {
                return false;
            }
            // 仅「已有有效缓存但缺图标」的补抓消耗预算与冷却；首次补齐不设限。
            let is_favicon_backfill =
                entry.as_ref().is_some_and(|e| silent_cache_hit(e, u) && !has_favicon(e));
            if is_favicon_backfill {
                if favicon_backfills >= WARMUP_FAVICON_BACKFILL_MAX
                    || !favicon_less_refetch_allowed(&favicon_less_refetch_key(u))
                {
                    return false;
                }
                favicon_backfills += 1;
            }
            true
        })
        .collect();
    let sem = std::sync::Arc::new(tokio::sync::Semaphore::new(6));
    let mut handles = Vec::with_capacity(targets.len());
    for url in targets {
        let permit = sem.clone();
        let app = app.clone();
        handles.push(tokio::spawn(async move {
            let _permit = permit.acquire_owned().await.ok()?;
            let g = app.state::<AppState>();
            let svc = g.browser_manager.page_meta_service();
            fetch_and_store_http_meta(&app, svc.clone(), &url).await.map(|_| ())
        }));
    }
    for handle in handles {
        let _ = handle.await;
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

/// 事项 17 路线 A：系统媒体卡片的播放/暂停/停止 → 标签页内的媒体元素。
///
/// `action` 只接受 `play|pause|stop`（越界值在这里就拒绝，不下发到页面）；
/// 元素挑选规则与 `init_script.js` 的上报口径一致。
#[tauri::command]
pub fn browser_media_control_tab(
    state: State<'_, AppState>,
    tab_id: String,
    action: String,
) -> Result<IpcResult<()>, CommandError> {
    if !matches!(action.as_str(), "play" | "pause" | "stop") {
        return Ok(ipc(Err(AppError::InvalidInput(format!("unsupported media action: {action}")))));
    }
    Ok(ipc(state.browser_manager.control_media(&tab_id, &action)))
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
pub fn browser_set_agent_intercept(
    state: State<'_, AppState>,
    origins: Vec<String>,
    enabled: bool,
    rules: Option<Vec<AgentSiteRule>>,
    overrides: Option<Vec<AgentSiteOverride>>,
) -> Result<(), adl_errors::AppError> {
    tracing::info!(
        origin_count = origins.len(),
        enabled,
        rule_count = rules.as_ref().map(Vec::len).unwrap_or(0),
        override_count = overrides.as_ref().map(Vec::len).unwrap_or(0),
        "browser_set_agent_intercept command invoked"
    );
    state.browser_manager.set_agent_intercept_for_all(
        &origins,
        enabled,
        &rules.unwrap_or_default(),
        &overrides.unwrap_or_default(),
    )
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

/// Canonical User-Agent for outbound HTTP requests that fetch favicon bytes.
///
/// Mirrors `frontend/src/shared/userAgent.ts` (`USER_AGENT`). Update both
/// locations together — they must stay in sync so Tauri-mode and preview-mode
/// requests appear identical to servers.
const USER_AGENT: &str = "Adlo/1.0 (+https://github.com/K-irito02/Adlo; MetaFetcher)";

use std::collections::HashMap;

/// 统一构造空 PageMeta（抓取无结果时的兜底返回值）。
fn empty_page_meta(url: &str) -> PageMeta {
    PageMeta {
        title: String::new(),
        favicon: String::new(),
        url: url.to_string(),
        favicon_data_uri: String::new(),
        source: String::new(),
    }
}

fn normalized_content_type(raw: &str) -> String {
    raw.split(';').next().unwrap_or("").trim().to_lowercase()
}

/// Favicon body size cap. Must be bounded (each favicon is persisted as a
/// base64 data-URI in the site-meta cache), but generous enough for legitimate
/// multi-resolution .ico / PNG / SVG icons that routinely exceed 64KB.
const MAX_FAVICON_BYTES: usize = 512 * 1024;

/// Magic-byte content sniffing fallback for favicons. Many CDNs serve `.ico` /
/// `.png` without (or with a non-image) `Content-Type`, which would otherwise
/// block data-URI generation. Detect from the decoded body when the declared
/// header is unusable. Returns a stable `image/*` mime or `None` when unknown.
fn sniff_image_content_type(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() >= 8 && bytes[..8] == [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a] {
        Some("image/png")
    } else if bytes.len() >= 3 && bytes[..3] == [0xff, 0xd8, 0xff] {
        Some("image/jpeg")
    } else if bytes.len() >= 4 && bytes[..4] == [0x47, 0x49, 0x46, 0x38] {
        Some("image/gif")
    } else if bytes.len() >= 4 && bytes[..4] == [0x00, 0x00, 0x01, 0x00] {
        Some("image/x-icon") // ICO
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else if bytes.len() >= 2 && &bytes[..2] == b"BM" {
        Some("image/bmp")
    } else {
        None
    }
}

/// Download favicon image bytes as a base64 data-URI. Returns empty string on
/// any failure (network / timeout / non-success / > `MAX_FAVICON_BYTES` /
/// unrecognized image format). Callers must not cache a failed result — the
/// previous cached entry stays intact.
///
/// `referer`（可选）：传入目标页面 URL 以模拟页面内资源加载，规避 CDN 防盗链
/// （如 bilibili `i0.hdslb.com`、runoob `static.char123.com`）的 Referer 校验。
async fn download_favicon_data_uri(
    client: &reqwest::Client,
    favicon_url: &str,
    referer: Option<&str>,
) -> String {
    if favicon_url.is_empty()
        || !favicon_url.starts_with("http://") && !favicon_url.starts_with("https://")
    {
        return String::new();
    }
    let mut req = client.get(favicon_url);
    if let Some(referer) = referer {
        if !referer.is_empty() {
            req = req.header(reqwest::header::REFERER, referer);
        }
    }
    tracing::debug!(
        favicon_url = %favicon_url,
        referer = referer.unwrap_or(""),
        "download_favicon_data_uri: attempt (resolving via backend client)"
    );
    let Ok(resp) = req.send().await else {
        // favicon 是 best-effort：站点无图标 / 证书异常 / 超时都很常见，
        // 被动补齐/批量刷新时会成批出现；用 DEBUG 记录，避免把外部站点问题当应用告警。
        tracing::debug!(
            favicon_url = %favicon_url,
            referer = ?referer,
            "download_favicon_data_uri: request send failed (network/timeout/TLS)"
        );
        return String::new();
    };
    if !resp.status().is_success() {
        tracing::debug!(
            favicon_url = %favicon_url,
            status = resp.status().as_u16(),
            "download_favicon_data_uri: non-success status"
        );
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
    if content_length.is_some_and(|len| len > MAX_FAVICON_BYTES) {
        tracing::debug!(
            favicon_url = %favicon_url,
            content_length,
            "download_favicon_data_uri: Content-Length exceeds MAX_FAVICON_BYTES"
        );
        return String::new();
    }
    // Capture the declared `Content-Type` before the body is consumed (bytes()
    // moves the response); it drives the data-URI mime when usable as an image.
    let declared: Option<String> = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(normalized_content_type)
        .filter(|ct| ct.starts_with("image/"));
    let Ok(bytes) = resp.bytes().await else {
        tracing::debug!(favicon_url = %favicon_url, "download_favicon_data_uri: read body failed");
        return String::new();
    };
    if bytes.is_empty() || bytes.len() > MAX_FAVICON_BYTES {
        tracing::debug!(
            favicon_url = %favicon_url,
            bytes_len = bytes.len(),
            "download_favicon_data_uri: empty/oversized body"
        );
        return String::new();
    }
    // 兜底：声明头缺失或非 image/* 时，用魔数判定真实格式（很多 CDN 提供
    // .ico/.png 时不带可用 Content-Type，如 kimi.com/favicon.ico）。
    let content_type: String = declared.unwrap_or_else(|| {
        sniff_image_content_type(&bytes).map(str::to_string).unwrap_or_default()
    });
    if content_type.is_empty() {
        tracing::debug!(
            favicon_url = %favicon_url,
            content_type = "(unrecognized by sniffing)",
            "download_favicon_data_uri: unrecognized image format"
        );
        return String::new();
    }
    let data_uri = to_data_uri(&bytes, &content_type);
    tracing::debug!(
        favicon_url = %favicon_url,
        content_type = %content_type,
        bytes_len = bytes.len(),
        "download_favicon_data_uri: SUCCESS"
    );
    data_uri
}

fn to_data_uri(bytes: &[u8], content_type: &str) -> String {
    format!("data:{content_type};base64,{}", STANDARD.encode(bytes))
}

/// 解析 favicon data-URI 回填的目标缓存键。
///
/// 条目经 `report` 存于实际上报 URL（重定向后 ≠ 请求 URL）；键分叉（标题/favicon
/// 事件间导航）时 `best_silent_meta` 可能把 favicon 从另一键补全，此时 `page_meta.url`
/// 是持标题的键而 favicon 落在 `url`/上报键。data-URI 必须写回**持有该 favicon_url** 的
/// 条目键，否则陈旧守卫 `peek(key).favicon_url != favicon_url` 会把它当陈旧下载丢弃。
fn resolve_favicon_backfill_key(
    svc: &PageMetaService,
    page_meta_url: &str,
    req_url: &str,
    favicon: &str,
) -> String {
    // 候选键：返回键（= 实际缓存键）与请求键。优先取缓存中 favicon_url 匹配的键。
    let mut candidates = Vec::with_capacity(2);
    if !page_meta_url.is_empty() {
        candidates.push(page_meta_url.to_string());
    }
    if !req_url.is_empty() && req_url != page_meta_url {
        candidates.push(req_url.to_string());
    }
    for key in &candidates {
        if svc.peek(key).is_some_and(|e| e.favicon_url == favicon) {
            return key.clone();
        }
    }
    candidates.first().cloned().unwrap_or_default()
}

/// per-URL 下载冷却窗口：缓存命中缺 data-URI 的重试（重启后 / 此前失败）若每次
/// cache-hit 都触发下载，会对永久无法生成 data-URI 的站点反复打 CDN。窗口内不重复。
static FAVICON_DOWNLOAD_COOLDOWN: std::sync::OnceLock<
    std::sync::Mutex<std::collections::HashMap<String, std::time::Instant>>,
> = std::sync::OnceLock::new();

fn favicon_download_cooldown()
-> &'static std::sync::Mutex<std::collections::HashMap<String, std::time::Instant>> {
    FAVICON_DOWNLOAD_COOLDOWN
        .get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
}

const FAVICON_DOWNLOAD_COOLDOWN_MS: u64 = 60_000;

/// 检查并记录该 URL 的下载尝试：冷却期内返回 false（跳过），否则记录本次尝试时间。
fn favicon_download_cooldown_check(url: &str) -> bool {
    let now = std::time::Instant::now();
    let mut map = favicon_download_cooldown().lock().unwrap_or_else(|e| e.into_inner());
    if let Some(&last) = map.get(url) {
        if now.duration_since(last).as_millis() < FAVICON_DOWNLOAD_COOLDOWN_MS as u128 {
            return false;
        }
    }
    map.insert(url.to_string(), now);
    true
}

/// 后台补抓无图标条目的元数据（静默 WebView 渲染 + 图标字节下载）：
/// `get` 命中标题-only 缓存时的自愈入口。完成后广播，前端镜像即时换上真实图标。
///
/// 触发面与预算：仅"已结算成功但一个图标都没有"的条目，且受
/// `FAVICON_LESS_REFETCH_COOLDOWN` 冷却（同一 URL 10 分钟一次）约束。
fn spawn_meta_refetch(app: &tauri::AppHandle, url: String) {
    let app = app.clone();
    tokio::spawn(async move {
        let state = app.state::<AppState>();
        match fetch_silent_meta(app.clone(), &state, &url).await {
            Ok(meta) => {
                let src =
                    if meta.source.is_empty() { META_SOURCE_COM } else { meta.source.as_str() };
                emit_page_meta_updated(&app, &meta, src);
                tracing::debug!(
                    url = %url,
                    favicon_len = meta.favicon.len(),
                    data_uri_len = meta.favicon_data_uri.len(),
                    "spawn_meta_refetch: favicon-less entry refetched"
                );
            },
            Err(e) => {
                // 后台静默补抓失败很常见（站点拒绝/超时）；按 best-effort 降为 DEBUG。
                tracing::debug!(url = %url, error = %e, "spawn_meta_refetch: silent refetch failed");
            },
        }
    });
}

/// 惯例 favicon 兜底：抓取 `{origin}/favicon.ico` 并写入站点元数据缓存。
///
/// 只在静默渲染完全没拿到图标时调用；下载失败（非图片 / 超时 / 404 / 超限）静默跳过。
/// 与预览端 `previewFetchPageMeta` 的 origin 惯例兜底同语义（双端一致）。
fn spawn_convention_favicon(
    app: tauri::AppHandle,
    svc: Arc<PageMetaService>,
    req_url: String,
    title: String,
) {
    let Some(origin) = url_origin(&req_url) else {
        return;
    };
    let favicon_url = format!("{origin}/favicon.ico");
    // 60s per-origin 冷却：避免同一站点被静默渲染/显式刷新反复探测惯例图标。
    if !favicon_download_cooldown_check(&format!("convention:{favicon_url}")) {
        return;
    }
    tokio::spawn(async move {
        let Ok(_permit) = favicon_download_semaphore().acquire_owned().await else {
            return;
        };
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .user_agent(USER_AGENT)
            .redirect(reqwest::redirect::Policy::limited(10))
            .build();
        let Ok(client) = client else {
            return;
        };
        let data_uri = download_favicon_data_uri(&client, &favicon_url, Some(&req_url)).await;
        if data_uri.is_empty() {
            tracing::debug!(
                req_url = %req_url,
                favicon_url = %favicon_url,
                "spawn_convention_favicon: no usable icon at convention path"
            );
            return;
        }
        // `report` 的质量门控只保护 favicon_url 一侧：图标被门控拒绝时 favicon_url
        // 仍是既有（更优）图标。data-URI 必须与它所属的 URL 一致，否则会把惯例图标的
        // 字节配到更优图标上，并被 `should_replace_favicon` 的 `data:` 锁永久固化。
        // 因此回填前复核条目当前 favicon_url（与 `spawn_favicon_download` 的陈旧守卫同口径）。
        if let Err(e) = svc.report(&req_url, &title, &favicon_url, META_SOURCE_COM).await {
            tracing::warn!(url = %req_url, error = %e, "spawn_convention_favicon: report failed");
            return;
        }
        if !svc.peek(&req_url).is_some_and(|e| e.favicon_url == favicon_url) {
            tracing::debug!(
                req_url = %req_url,
                favicon_url = %favicon_url,
                "spawn_convention_favicon: convention icon not adopted (entry kept a better icon)"
            );
            return;
        }
        match svc.update_favicon_data_uri(&req_url, &data_uri) {
            Ok(true) => {
                if let Some(e) = svc.peek(&req_url) {
                    emit_page_meta_updated_raw(&app, &req_url, &e, META_SOURCE_COM);
                }
                tracing::debug!(
                    req_url = %req_url,
                    favicon_url = %favicon_url,
                    data_uri_len = data_uri.len(),
                    "spawn_convention_favicon: convention icon persisted"
                );
            },
            Ok(false) => {},
            Err(e) => {
                tracing::warn!(url = %req_url, error = %e, "spawn_convention_favicon: persist failed");
            },
        }
    });
}

/// `scheme://host[:port]`（仅 http/https）；解析失败返回 `None`。
fn url_origin(url: &str) -> Option<String> {
    let parsed = reqwest::Url::parse(url).ok()?;
    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return None;
    }
    let host = parsed.host_str()?;
    Some(match parsed.port() {
        Some(port) => format!("{scheme}://{host}:{port}"),
        None => format!("{scheme}://{host}"),
    })
}

/// 后台补全 favicon data-URI（M2 共享入口）：`fetch_silent_meta`（静默渲染后）与
/// `browser_page_meta_get` 缓存命中缺 data-URI 的路径（重启后补全）共用。
///
/// - 并发上限：`FAVICON_DOWNLOAD_SEM`（8 路）限制对 CDN 的并发连接。
/// - per-URL in-flight 去重：`FAVICON_DOWNLOADING` 防止同 URL 并行重复下载。
/// - 冷却窗口：`FAVICON_DOWNLOAD_COOLDOWN` 防止永久失败的 favicon 被反复重试。
/// - 竞态守卫：下载期间条目 favicon 变更则丢弃陈旧 data-URI。
///
/// 完成后持久化 + emit 广播，前端镜像自愈。
fn spawn_favicon_download(
    app: &tauri::AppHandle,
    svc: std::sync::Arc<PageMetaService>,
    cache_key: String,
    favicon_url: String,
    req_url: String,
) {
    // 冷却窗口：窗口内已尝试过（含失败）则跳过，避免 cache-hit 反复触发。
    if !favicon_download_cooldown_check(&favicon_url) {
        tracing::debug!(
            favicon_url = %favicon_url,
            "spawn_favicon_download: within cooldown, skip"
        );
        return;
    }
    let app = app.clone();
    tokio::spawn(async move {
        // 并发上限：同一 URL 多次重叠抓取/大批量 warmup 时限制并发 HTTP 下载。
        let Ok(_permit) = favicon_download_semaphore().acquire_owned().await else {
            return;
        };
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .user_agent(USER_AGENT)
            .redirect(reqwest::redirect::Policy::limited(10))
            .build();
        let Ok(client) = client else {
            tracing::warn!(favicon_url = %favicon_url, "spawn_favicon_download: http client build failed");
            return;
        };
        // per-URL in-flight 去重：同 URL 已有下载在进行则跳过本次（信号量只管总量）。
        if !favicon_downloading()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(favicon_url.clone())
        {
            tracing::debug!(favicon_url = %favicon_url, "spawn_favicon_download: already in flight");
            return;
        }
        // 仅对公有/合法 http(s) CDN 尝试，避免向不可达地址阻塞太久（内部自带超时）。
        let data_uri = download_favicon_data_uri(&client, &favicon_url, Some(&cache_key)).await;
        if data_uri.is_empty() {
            favicon_downloading().lock().unwrap_or_else(|e| e.into_inner()).remove(&favicon_url);
            return;
        }
        // 竞态守卫：下载期间该 URL 可能被重新抓取且 favicon 已更换 → 陈旧下载的
        // data-URI 不得配到新 favicon_url 上（否则被 should_replace_favicon 冻结）。
        if svc.peek(&cache_key).is_some_and(|e| e.favicon_url != favicon_url) {
            tracing::debug!(
                req_url = %req_url,
                cache_key = %cache_key,
                "spawn_favicon_download: stale download dropped (entry favicon changed)"
            );
            favicon_downloading().lock().unwrap_or_else(|e| e.into_inner()).remove(&favicon_url);
            return;
        }
        match svc.update_favicon_data_uri(&cache_key, &data_uri) {
            Ok(true) => {
                tracing::debug!(
                    req_url = %req_url,
                    cache_key = %cache_key,
                    favicon_len = favicon_url.len(),
                    data_uri_len = data_uri.len(),
                    "spawn_favicon_download: data-URI resolved & persisted (background)"
                );
                // 广播回填后的完整条目，前端镜像自愈（替换命令层先行的空 data-URI 事件）。
                if let Some(e) = svc.peek(&cache_key) {
                    emit_page_meta_updated_raw(&app, &cache_key, &e, META_SOURCE_COM);
                }
            },
            Ok(false) => {
                tracing::debug!(
                    req_url = %req_url,
                    cache_key = %cache_key,
                    "spawn_favicon_download: no backfill performed (missing entry or unchanged data-URI)"
                );
            },
            Err(e) => {
                tracing::warn!(
                    req_url = %req_url,
                    cache_key = %cache_key,
                    error = %e,
                    "spawn_favicon_download: persist favicon data-URI failed"
                );
            },
        }
        favicon_downloading().lock().unwrap_or_else(|e| e.into_inner()).remove(&favicon_url);
    });
}

#[cfg(test)]
mod html_meta_tests {
    use super::*;

    #[test]
    fn extracts_title_entities_and_og_fallback() {
        assert_eq!(
            extract_html_title("<html><head><title>A &amp; B</title></head></html>"),
            "A & B"
        );
        assert_eq!(
            extract_html_title(r#"<meta property="og:title" content="OG &quot;T&quot;">"#),
            "OG \"T\""
        );
        assert_eq!(extract_html_title("<html><body>no title</body></html>"), "");
    }

    #[test]
    fn extracts_relative_and_absolute_icon_links() {
        let html = r#"<link rel="shortcut icon" href="/static/favicon.png">"#;
        assert_eq!(
            extract_icon_url(html, "https://example.com/a/b").as_deref(),
            Some("https://example.com/static/favicon.png")
        );
        let svg = r#"<link rel="icon" type="image/svg+xml" href="//cdn.example.com/i.svg">"#;
        assert_eq!(
            extract_icon_url(svg, "https://example.com/").as_deref(),
            Some("https://cdn.example.com/i.svg")
        );
    }

    #[test]
    fn extracts_icon_with_attribute_order_and_single_quotes() {
        let html = r#"<LINK HREF='/favicon.ico' REL='icon'>"#;
        assert_eq!(
            extract_icon_url(html, "https://example.com/").as_deref(),
            Some("https://example.com/favicon.ico")
        );
        let unquoted = r#"<link rel=icon href=/icon.png>"#;
        assert_eq!(
            extract_icon_url(unquoted, "https://example.com/").as_deref(),
            Some("https://example.com/icon.png")
        );
    }

    #[test]
    fn falls_back_to_origin_favicon() {
        assert_eq!(
            origin_favicon_url("https://example.com:8443/path?q=1").as_deref(),
            Some("https://example.com:8443/favicon.ico")
        );
        assert_eq!(origin_favicon_url("not-a-url"), None);
    }

    #[test]
    fn parse_html_meta_trims_half_char_and_rejects_gbk() {
        let final_url = url::Url::parse("https://example.com/").unwrap();
        // 64KB 上限处正好切在「中」的中间：解析入口必须回退尾字节后仍取到标题。
        let mut bytes = "<title>中文标题</title>".as_bytes().to_vec();
        bytes.resize(64 * 1024 - 1, b'a');
        bytes.extend_from_slice(&"中".as_bytes()[..1]);
        let (title, _) = parse_html_meta(bytes, "https://example.com/", &final_url);
        assert_eq!(title, "中文标题");

        // 真实非法 UTF-8（GBK「中文」）不返回标题。
        let (gbk_title, _) = parse_html_meta(
            vec![b'<', b't', 0xD6, 0xD0, 0xCE, 0xC4, b'>'],
            "https://example.com/",
            &final_url,
        );
        assert_eq!(gbk_title, "");
    }

    #[test]
    fn robots_body_cap_ignores_rules_beyond_limit() {
        let mut body = vec![b'a'; MAX_ROBOTS_BODY];
        body.extend_from_slice(b"\nUser-agent: *\nDisallow: /\n");
        let lines = robots_lines_from_body(body);
        // 超过 64KB 的尾部规则被截掉：没有生效的 Disallow。
        assert!(robots_allows(&lines.join("\n"), USER_AGENT, "/x"));
    }

    #[test]
    fn robots_ignores_oversized_rule_without_panic() {
        // 超长 Disallow 被截到上限，DP 乘积守卫兜底；不应 panic/分配爆炸。
        let long_rule = format!("User-agent: *\nDisallow: /{}\n", "a".repeat(2_000_000));
        assert!(robots_allows(&long_rule, USER_AGENT, "/x"));
        // 乘积守卫：能匹配但超过上限的规则按不匹配处理，避免 GB 级分配。
        let long_path = "/".repeat(500);
        assert_eq!(robots_longest_match(&"*".repeat(600), &long_path), None);
        assert_eq!(robots_longest_match(&"*".repeat(10), &long_path), Some(500));
    }

    #[test]
    fn robots_allow_overrides_disallow_by_longest_match() {
        let robots = "User-agent: *\nDisallow: /private\nAllow: /private/public\n";
        assert!(!robots_allows(robots, USER_AGENT, "/private/x"));
        assert!(robots_allows(robots, USER_AGENT, "/private/public/page"));
        assert!(robots_allows(robots, USER_AGENT, "/public"));
        // Disallow: / + Allow: /$ → 首页允许、其余禁止。
        let root = "User-agent: *\nDisallow: /\nAllow: /$\n";
        assert!(robots_allows(root, USER_AGENT, "/"));
        assert!(!robots_allows(root, USER_AGENT, "/docs"));
    }

    #[test]
    fn robots_groups_comments_and_wildcards() {
        // 注释不是分组边界：注释后的 Disallow 仍属于当前分组。
        let commented = "User-agent: *\n# 注释\nDisallow: /private\n";
        assert!(!robots_allows(commented, USER_AGENT, "/private/x"));
        // 通配符与锚定。
        let wildcard = "User-agent: *\nDisallow: /*?*\nDisallow: /*.pdf$\n";
        assert!(!robots_allows(wildcard, USER_AGENT, "/page?q=1"));
        assert!(!robots_allows(wildcard, USER_AGENT, "/a/b.pdf"));
        assert!(robots_allows(wildcard, USER_AGENT, "/a/b.pdfx"));
        // 精确 UA 分组优先于 `*`。
        let other = "User-agent: Googlebot\nDisallow: /\n\nUser-agent: Adlo\nDisallow: /no-adl\n";
        assert!(robots_allows(other, USER_AGENT, "/whatever"));
        assert!(!robots_allows(other, USER_AGENT, "/no-adl/page"));
    }
}

#[cfg(test)]
mod initial_size_tests {
    use super::*;

    #[test]
    fn initial_webview_size_defaults_and_clamps() {
        assert_eq!(initial_webview_size(None), (800.0, 600.0));
        assert_eq!(
            initial_webview_size(Some(InitialSize { width: 1024.0, height: 768.0 })),
            (1024.0, 768.0)
        );
        assert_eq!(
            initial_webview_size(Some(InitialSize { width: 0.0, height: -5.0 })),
            (1.0, 1.0)
        );
        assert_eq!(
            initial_webview_size(Some(InitialSize { width: 50_000.0, height: 50_000.0 })),
            (10_000.0, 10_000.0)
        );
    }
}

#[cfg(test)]
mod silent_url_tests {
    use super::*;

    #[test]
    fn rejects_drive_letter_pseudo_hosts() {
        assert!(!silent_fetch_url_allowed("https://c/Users/31432/AppData/Local/Temp/x.html"));
        assert!(!silent_fetch_url_allowed("http://AGENTS"));
        assert!(!silent_fetch_url_allowed("file:///C:/x.html"));
        assert!(!silent_fetch_url_allowed("about:blank"));
    }

    #[test]
    fn accepts_public_and_loopback_hosts() {
        // agents.md 是真域名（扩展名检查不得作用于 host）。
        assert!(silent_fetch_url_allowed("https://agents.md/"));
        assert!(silent_fetch_url_allowed("http://AGENTS.md/"));
        assert!(silent_fetch_url_allowed("https://www.bilibili.com/video"));
        assert!(silent_fetch_url_allowed("http://127.0.0.1:3080/"));
        assert!(silent_fetch_url_allowed("http://localhost:5173/"));
        assert!(silent_fetch_url_allowed("http://[::1]:3080/"));
    }

    #[test]
    fn rejects_search_and_challenge_pages() {
        assert!(!silent_fetch_url_allowed("https://www.google.com/search?q=secret"));
        assert!(!silent_fetch_url_allowed("https://www.google.com/sorry/index"));
        assert!(!silent_fetch_url_allowed("https://www.bing.com/search?q=secret"));
        assert!(!silent_fetch_url_allowed("https://cn.bing.com/search?q=secret"));
        assert!(!silent_fetch_url_allowed("https://duckduckgo.com/?q=secret"));
        assert!(!silent_fetch_url_allowed("https://www.baidu.com/s?wd=secret"));
        assert!(silent_fetch_url_allowed("https://www.google.com/about"));
    }

    #[test]
    fn rejects_download_targets() {
        // 安装包/压缩包等下载目标不是元数据页面，静默抓取会触发取消下载（事项 9）。
        assert!(!silent_fetch_url_allowed(
            "https://autopatchcn.bhsr.com/client/4.5.0/launcher/StarRail_setup_1.18.0.380.exe"
        ));
        assert!(!silent_fetch_url_allowed("https://example.com/archive.zip"));
        // 仅扩展名命中；`/download/` 等路径可能是正常页面，不跳过（避免元数据缺失）。
        assert!(silent_fetch_url_allowed("https://example.com/download/firefox"));
        // 正常页面不受影响。
        assert!(silent_fetch_url_allowed("https://example.com/article"));
    }
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

    #[test]
    fn favicon_download_cooldown_allows_retry_after_window() {
        // 冷却窗口（60s）内同 URL 重试被拒绝；窗口过后允许再次尝试。
        let url = "https://cooldown.test/favicon.ico";
        // 首次尝试 → 允许
        assert!(favicon_download_cooldown_check(url));
        // 窗口内立即重试 → 拒绝（防 CDN 反复打）
        assert!(!favicon_download_cooldown_check(url));
        // 模拟窗口流逝：直接改写记录时间戳
        {
            let mut map = favicon_download_cooldown().lock().unwrap();
            let now = std::time::Instant::now();
            map.insert(
                url.to_string(),
                now - std::time::Duration::from_millis(FAVICON_DOWNLOAD_COOLDOWN_MS + 1),
            );
        }
        // 窗口过后 → 允许重试
        assert!(favicon_download_cooldown_check(url));
    }

    #[test]
    fn sniff_image_content_type_recognizes_common_formats() {
        let png = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
        assert_eq!(sniff_image_content_type(&png), Some("image/png"));

        let jpeg = [0xff, 0xd8, 0xff, 0xe0];
        assert_eq!(sniff_image_content_type(&jpeg), Some("image/jpeg"));

        let gif = *b"GIF89a";
        assert_eq!(sniff_image_content_type(&gif), Some("image/gif"));

        // ICO 头：0x00 0x00 0x01 0x00 —— 常见于无 Content-Type 的 favicon.ico
        let ico = [0x00, 0x00, 0x01, 0x00, 0x01, 0x00];
        assert_eq!(sniff_image_content_type(&ico), Some("image/x-icon"));

        let webp = [b'R', b'I', b'F', b'F', 0, 0, 0, 0, b'W', b'E', b'B', b'P'];
        assert_eq!(sniff_image_content_type(&webp), Some("image/webp"));

        let bmp = [b'B', b'M', 0, 0];
        assert_eq!(sniff_image_content_type(&bmp), Some("image/bmp"));
    }

    #[test]
    fn sniff_image_content_type_rejects_unknown_or_short_buffers() {
        assert_eq!(sniff_image_content_type(b""), None);
        // Too short to hold any signature.
        assert_eq!(sniff_image_content_type(&[0x89, b'P']), None);
        // SVG 文本 / 未知二进制不应误判成位图。
        assert_eq!(sniff_image_content_type(b"<svg xmlns=\"http://www.w3.org/2000/svg\">"), None);
    }

    #[test]
    fn to_data_uri_embeds_sniffed_mime() {
        let out = to_data_uri(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a], "image/png");
        assert!(out.starts_with("data:image/png;base64,"));
    }
}

#[cfg(test)]
mod page_meta_service_cmd_tests {
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
        let meta = best_silent_meta(&svc, "https://nope.example/", None);
        assert!(meta.title.is_empty());
        assert!(meta.favicon.is_empty());
        assert_eq!(meta.url, "https://nope.example/");
    }

    #[tokio::test]
    async fn report_then_best_returns_partial_com_meta() {
        let svc = empty_svc();
        // 只上报标题（无 favicon）→ 部分元数据，来源应为 COM
        svc.report("https://a.example/", "标题", "", META_SOURCE_COM).await.unwrap();
        let meta = best_silent_meta(&svc, "https://a.example/", None);
        assert_eq!(meta.title, "标题");
        assert!(meta.favicon.is_empty());
        assert_eq!(meta.source, META_SOURCE_COM);
    }

    #[tokio::test]
    async fn best_silent_meta_probes_reported_key_before_request_key() {
        // L1：重定向后条目存于上报 URL（最终 URL）下；请求键/上报键均有条目时
        // 必须优先返回上报键（探测顺序为上报键优先）。
        let svc = empty_svc();
        svc.report(
            "https://final.example/page",
            "重定向后标题",
            "https://cdn.example/icon.ico",
            META_SOURCE_COM,
        )
        .await
        .unwrap();
        // 请求键也存在条目（旧缓存或并发写入）→ 用于证明上报键被优先探测。
        svc.report("https://request.example/", "请求键标题", "", META_SOURCE_COM).await.unwrap();
        let meta =
            best_silent_meta(&svc, "https://request.example/", Some("https://final.example/page"));
        assert_eq!(meta.title, "重定向后标题", "上报键条目必须优先于请求键条目");
        assert_eq!(meta.url, "https://final.example/page", "返回值应携带实际缓存键");
    }

    #[tokio::test]
    async fn best_silent_meta_merges_missing_fields_across_key_fork() {
        // 键分叉兜底：标题事件与 favicon 事件间发生导航 → 上报键仅有 favicon、请求键仅有标题，
        // 命中条目缺失字段须从另一键条目补全，而非返回仅 favicon 无标题的部分 meta。
        let svc = empty_svc();
        svc.report("https://b.example/", "", "https://cdn.example/b.ico", META_SOURCE_COM)
            .await
            .unwrap();
        svc.report("https://a.example/", "页面标题", "", META_SOURCE_COM).await.unwrap();
        let meta = best_silent_meta(&svc, "https://a.example/", Some("https://b.example/"));
        assert_eq!(meta.title, "页面标题", "上报键缺标题应从请求键条目补全");
        assert_eq!(meta.favicon, "https://cdn.example/b.ico");
        // 反向分叉：上报键有标题、请求键有图标 → 同样互补。
        let svc2 = empty_svc();
        svc2.report("https://b.example/", "页面标题", "", META_SOURCE_COM).await.unwrap();
        svc2.report("https://a.example/", "", "https://cdn.example/a.ico", META_SOURCE_COM)
            .await
            .unwrap();
        let meta2 = best_silent_meta(&svc2, "https://a.example/", Some("https://b.example/"));
        assert_eq!(meta2.title, "页面标题");
        assert_eq!(meta2.favicon, "https://cdn.example/a.ico", "上报键缺图标应从请求键条目补全");
    }

    #[tokio::test]
    async fn resolve_backfill_key_targets_favicon_holding_entry_across_fork() {
        // F1 回归：键分叉（标题在 b、favicon 在 a）时，data-URI 回填必须写回持有
        // favicon_url 的条目键，否则陈旧守卫会把它当陈旧下载丢弃，防盗链站点长期兜底图标。
        let svc = empty_svc();
        svc.report("https://b.example/", "页面标题", "", META_SOURCE_COM).await.unwrap();
        svc.report("https://a.example/", "", "https://cdn.example/a.ico", META_SOURCE_COM)
            .await
            .unwrap();
        // best_silent_meta 返回的 url 是持标题键（b），但 favicon 在请求键（a）。
        let meta = best_silent_meta(&svc, "https://a.example/", Some("https://b.example/"));
        assert_eq!(meta.url, "https://b.example/");
        assert_eq!(meta.favicon, "https://cdn.example/a.ico");
        let key =
            resolve_favicon_backfill_key(&svc, &meta.url, "https://a.example/", &meta.favicon);
        // 必须解析到持 favicon 的键 a，使陈旧守卫通过（a 条目 favicon_url == favicon）。
        assert_eq!(key, "https://a.example/");
        assert!(svc.peek(&key).is_some_and(|e| e.favicon_url == meta.favicon));
    }

    #[test]
    fn resolve_backfill_key_falls_back_to_page_meta_url_when_no_match() {
        // 无分叉（favicon 与标题同键）时解析结果等于 page_meta.url。
        let svc = empty_svc();
        let key = resolve_favicon_backfill_key(
            &svc,
            "https://x.example/",
            "https://x.example/",
            "https://cdn.example/x.ico",
        );
        assert_eq!(key, "https://x.example/");
    }

    #[test]
    fn silent_backoff_active_scopes_to_never_succeeded_entries() {
        // 退避短路只约束 last_ok_at==0（从未成功过）的墓碑条目；已有成功记录的条目
        // 由 TTL/缓存命中语义管辖，backoff 不介入。
        let url_entry = |last_ok_at: i64, next_retry_at: i64| SiteMetaCacheEntry {
            title: String::new(),
            title_source: String::new(),
            favicon_url: String::new(),
            favicon_data_uri: String::new(),
            fetched_at: 0,
            last_ok_at,
            next_retry_at,
            fail_count: 1,
        };
        let now = 1_800_000_000_000_i64;
        assert!(silent_backoff_active(&url_entry(0, now + 60_000), now), "未来退避期应短路");
        assert!(!silent_backoff_active(&url_entry(0, now - 1), now), "退避期已过应放行");
        assert!(
            !silent_backoff_active(&url_entry(now, now + 60_000), now),
            "已成功条目不受 backoff 约束"
        );
        assert!(!silent_backoff_active(&url_entry(0, 0), now), "无退避记录放行");
    }

    #[test]
    fn warmup_target_allowed_heals_title_only_entries() {
        // warmup 目标判定：标题-only 条目必须继续补抓 favicon（与预览端口径对齐），
        // 已有图标的有效缓存 / 退避期墓碑才跳过。
        let mut e = SiteMetaCacheEntry {
            title: String::new(),
            title_source: String::new(),
            favicon_url: String::new(),
            favicon_data_uri: String::new(),
            fetched_at: 0,
            last_ok_at: 0,
            next_retry_at: 0,
            fail_count: 0,
        };
        let url = "https://a.example/";
        let now = 1_800_000_000_000_i64;
        // 无条目 → 抓
        assert!(warmup_target_allowed(None, url, now));
        // 全空 → 抓
        assert!(warmup_target_allowed(Some(&e), url, now));
        // 标题-only（有效缓存命中但无图标）→ 仍抓（本次修复的核心口径）
        e.title = "Example".into();
        e.last_ok_at = now;
        assert!(silent_cache_hit(&e, url), "标题-only 条目仍算缓存命中");
        assert!(!has_favicon(&e));
        assert!(warmup_target_allowed(Some(&e), url, now));
        // 有图标 → 跳过
        e.favicon_url = "https://cdn.example/i.ico".into();
        assert!(!warmup_target_allowed(Some(&e), url, now));
        // 仅 data-URI 也算有图标 → 跳过
        e.favicon_url.clear();
        e.favicon_data_uri = "data:image/png;base64,AA".into();
        assert!(!warmup_target_allowed(Some(&e), url, now));
        // 退避期墓碑 → 跳过（即使无图标）
        let tombstone = SiteMetaCacheEntry {
            title: String::new(),
            title_source: String::new(),
            favicon_url: String::new(),
            favicon_data_uri: String::new(),
            fetched_at: now,
            last_ok_at: 0,
            next_retry_at: now + 60_000,
            fail_count: 1,
        };
        assert!(!warmup_target_allowed(Some(&tombstone), url, now));
    }

    #[test]
    fn favicon_less_refetch_cooldown_allows_retry_after_window() {
        // 无图标补抓冷却：同一 cache key 10 分钟内只允许一次，窗口过后再放行。
        let key = "https://cooldown-refetch.example/";
        assert!(favicon_less_refetch_allowed(key));
        assert!(!favicon_less_refetch_allowed(key));
        {
            let mut map = favicon_less_refetch_cooldown().lock().unwrap_or_else(|e| e.into_inner());
            let stale = std::time::Instant::now()
                - std::time::Duration::from_millis(FAVICON_LESS_REFETCH_COOLDOWN_MS + 1);
            map.insert(key.to_string(), stale);
        }
        assert!(favicon_less_refetch_allowed(key));
    }

    #[test]
    fn favicon_less_refetch_key_shares_one_cooldown_across_url_forms() {
        // `get` 传原始 URL、`warmup` 传归一化 URL：冷却键必须同口径，否则同一缓存
        // 条目在 10 分钟内会被抓两次（各建一个隐藏 WebView）。
        assert_eq!(
            favicon_less_refetch_key("https://shared-cooldown.example/p/"),
            favicon_less_refetch_key("https://shared-cooldown.example/p")
        );
        assert_eq!(
            favicon_less_refetch_key("https://shared-cooldown.example/p#section"),
            favicon_less_refetch_key("https://shared-cooldown.example/p")
        );
        assert!(favicon_less_refetch_allowed(&favicon_less_refetch_key(
            "https://shared-cooldown.example/p/"
        )));
        assert!(!favicon_less_refetch_allowed(&favicon_less_refetch_key(
            "https://shared-cooldown.example/p"
        )));
    }

    #[test]
    fn url_origin_builds_conventional_favicon_base() {
        // 惯例兜底 `{origin}/favicon.ico` 的 origin 口径：保留非默认端口、丢弃路径/查询。
        assert_eq!(
            url_origin("https://gitee.com/K_irito/Adlo?tab=readme"),
            Some("https://gitee.com".to_string())
        );
        assert_eq!(
            url_origin("http://127.0.0.1:8082/admin"),
            Some("http://127.0.0.1:8082".to_string())
        );
        assert_eq!(url_origin("file:///C:/a.html"), None);
        assert_eq!(url_origin("about:blank"), None);
    }

    #[tokio::test]
    async fn backfill_request_meta_writes_request_key_alias() {
        // 重定向分叉：poll 把条目写在上报键（final），fetch 结束后按请求键（request）
        // 回写别名——使 warmup/get 的请求键 peek 能命中，消除每次启动重抓。
        let svc = empty_svc();
        // 模拟 poll 阶段已写入上报键
        svc.report(
            "https://final.example/page",
            "跳转后标题",
            "https://cdn.example/i.ico",
            META_SOURCE_COM,
        )
        .await
        .unwrap();
        let meta = PageMeta {
            title: "跳转后标题".into(),
            favicon: "https://cdn.example/i.ico".into(),
            favicon_data_uri: String::new(),
            url: "https://final.example/page".into(),
            source: META_SOURCE_COM.into(),
        };
        backfill_request_meta(&svc, "https://request.example/", &meta).await;
        let entry = svc.peek("https://request.example/").expect("请求键应有别名条目");
        assert_eq!(entry.title, "跳转后标题");
        assert_eq!(entry.favicon_url, "https://cdn.example/i.ico");
        assert!(silent_cache_hit(&entry, "https://request.example/"), "别名条目应计为有效缓存");
    }

    #[tokio::test]
    async fn backfill_request_meta_empty_writes_tombstone() {
        // 抓取全空 → 请求键落墓碑（fail_count+1、退避），重启后不再重抓。
        let svc = empty_svc();
        let meta = PageMeta {
            title: String::new(),
            favicon: String::new(),
            favicon_data_uri: String::new(),
            url: "https://fail.example/".into(),
            source: String::new(),
        };
        backfill_request_meta(&svc, "https://fail.example/", &meta).await;
        let entry = svc.peek("https://fail.example/").expect("失败应落墓碑");
        assert_eq!(entry.fail_count, 1);
        assert!(entry.next_retry_at > 0);
        assert!(silent_backoff_active(&entry, entry.fetched_at + 1));
    }

    #[tokio::test]
    async fn poll_converges_on_reported_url_after_redirect() {
        // L1 回归：请求 URL 与上报 URL 不同（重定向）时，poll 必须用上报键收敛，
        // 否则空转至总体超时后返回空 meta。
        let svc = empty_svc();
        let req_url = "https://request.example/";
        let final_url = "https://final.example/page";
        let (tx, mut rx) =
            tokio::sync::mpsc::unbounded_channel::<(String, String, String, String)>();
        // 上报键 = final_url（WebView2 sender.Source()），请求键 = req_url。
        tx.send((
            "tab".into(),
            final_url.into(),
            "重定向后标题".into(),
            "https://cdn.example/icon.ico".into(),
        ))
        .unwrap();
        drop(tx);
        let meta = wait_for_silent_meta(&mut rx, &svc, req_url).await;
        assert_eq!(meta.title, "重定向后标题", "重定向后应从上报键收敛而非返回空");
        assert_eq!(meta.url, final_url);
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

    // 回归测试（2026-08-29 恢复）：部分元数据到达一次后 channel 保持静默（不关闭、
    // 不再发数据），`poll_silent_meta` 应自首个有效起等待 ≥ `partial_ms` 后提前返回
    // 当前部分结果，而非空转直到外层 6s 总体超时。此行为曾未实现导致测试挂死（后已
    // 在 Err(idle) 分支实现提前返回）；用 tokio::time::timeout 兜底防 CI 挂起。
    // 注入短时长：round_ms=20ms / partial_ms=100ms，使时序路径确定且毫秒级完成。
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
        let meta = tokio::time::timeout(
            std::time::Duration::from_secs(5),
            poll_silent_meta(&mut rx, &svc, url, d),
        )
        .await
        .expect("poll_silent_meta should return well before the timeout (no hang)");
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
}
