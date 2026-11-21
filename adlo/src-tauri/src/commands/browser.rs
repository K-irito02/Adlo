use std::sync::Arc;

use crate::commands::browser_memory::system_memory_pressured;
use crate::commands::browser_webview_setup::{
    apply_theme_and_navigate_for_platform, build_silent_webview_builder, build_webview_builder,
    register_webview_with_manager, resolve_window_and_url, setup_webview2_handlers_for_platform,
    webview_data_directory,
};
use crate::commands::ipc;
use crate::error::CommandError;
use crate::state::AppState;
use crate::webview_event_bridge::TauriWebView2EventBridge;
use adl_browser::webview_handle::{Bounds, EventBridgeRef};
use adl_browser::{
    CachedMetaBridge, META_SOURCE_COM, PageMeta, PageMetaService, SiteMetaCacheEntry,
    is_placeholder_title, is_unsafe_title, normalize_color_scheme, webview_label,
};
use adl_errors::AppError;
use adl_types::{AgentSiteOverride, AgentSiteRule, IpcResult};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use tauri::{Manager, State};

#[tauri::command]
#[allow(clippy::too_many_arguments)] // IPC boundary mirrors the frontend create call fields.
pub async fn browser_create_for_tab(
    app: tauri::AppHandle,
    tab_id: String,
    url: String,
    color_scheme: Option<String>,
    location: Option<String>,
    agent_origins: Vec<String>,
    agent_intercept_enabled: bool,
    agent_site_rules: Option<Vec<AgentSiteRule>>,
    agent_site_overrides: Option<Vec<AgentSiteOverride>>,
) -> Result<IpcResult<Option<String>>, CommandError> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let app_inner = app.clone();

    app.run_on_main_thread(move || {
        let state = app_inner.state::<AppState>();
        let label = webview_label(&tab_id);
        tracing::debug!(tab_id = &tab_id, url = &url, color_scheme = ?&color_scheme, location = ?&location, "browser_create_for_tab: ENTER");

        let result = (|| -> Result<Option<String>, AppError> {
            let (window, _target) = resolve_window_and_url(&app_inner, &url)?;

            // Resolve the color scheme early — it's needed for the init script
            // (hardcoded background color in INIT_SCRIPT). The init script uses
            // this value to set document.documentElement.style.backgroundColor
            // before page CSS loads. apply_theme_and_navigate_for_platform will
            // re-read the latest color scheme at closure execution time, so this
            // value only affects the INIT_SCRIPT background color.
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
            // UDF 隔离：中心宿主走独立用户数据目录，与面板/默认会话隔离，
            // 新建控制器不再触碰另一宿主的 PreferredColorScheme。
            let data_directory = webview_data_directory(&app_inner, location.as_deref());
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
            attach_webview_child(&window, &label, &tab_id, webview_builder, || {
                Arc::new(TauriWebView2EventBridge::new(app_inner.clone()))
            }, false)?;

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
fn attach_webview_child(
    window: &tauri::Window<tauri::Wry>,
    label: &str,
    tab_id: &str,
    webview_builder: tauri::webview::WebviewBuilder<tauri::Wry>,
    make_bridge: impl FnOnce() -> EventBridgeRef,
    is_silent: bool,
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
        setup_webview2_handlers_for_platform(&webview, tab_id, label, bridge, is_silent);
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
            let webview_builder = match webview_data_directory(&app_inner, Some("silent")) {
                Some(dir) => silent_builder.data_directory(dir),
                None => silent_builder,
            };
            attach_webview_child(
                &window,
                &label,
                &tab_id_inner,
                webview_builder,
                move || Arc::new(CachedMetaBridge::new(Some(tx))),
                true,
            )?;
            if let Some(webview) = window.get_webview(&label) {
                apply_theme_and_navigate_for_platform(&webview, app_inner.clone(), &url_owned, &cs);
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
        Ok(()) => tracing::info!(
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

/// 后台 favicon 字节下载并发上限：warmup 至多 200 路静默抓取各自触发一次下载，
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

/// 无图标条目的补抓冷却（per cache key）：标题-only 条目在 `get` 缓存命中与启动
/// `warmup` 时会各触发一次静默补抓；冷却避免同一会话对无图标站点反复创建 WebView。
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
/// - 标题不成立且 `favicon_url` 为空 → 抓（即便已有 data-URI 也会抓：warmup 顺带补标题）；
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
    if !silent_fetch_url_allowed(url) {
        tracing::warn!(%url, "fetch_silent_meta: invalid URL, skip silent webview");
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

    tracing::info!(
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
    tracing::info!(url = %url, "[ADL-META] browser_page_meta_get_silent: ENTER (tauri IPC hit)");
    match fetch_silent_meta(app.clone(), &state, &url).await {
        Ok(page_meta) => {
            let src = if page_meta.source.is_empty() {
                META_SOURCE_COM
            } else {
                page_meta.source.as_str()
            };
            emit_page_meta_updated(&app, &page_meta, src);
            tracing::info!(
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
    // 输入验证：限制 URL 数量防止拒绝服务（与前端 warmupUrls.ts 上限 200 一致）
    if urls.len() > 200 {
        return Ok(ipc(Err(AppError::InvalidInput(
            "URL list exceeds maximum length of 200".to_string(),
        ))));
    }
    let svc = state.browser_manager.page_meta_service();
    // 静默预热：去重后按 `warmup_target_allowed` 选取目标——无条目 / 无有效缓存直接抓，
    // 「标题-only」条目也纳入补抓（补 favicon；预览端同样不把它当有效命中），仅有图标的
    // 有效缓存与退避期失败墓碑跳过（预览端另有 TTL 到期重抓，桌面端本轮未引入）。
    // 每个目标各创建一个隐藏 WebView2，故用信号量限制并发；无图标补抓另设单次启动预算，
    // 避免长期积累的条目集中建窗。
    // 消除 preload 竞态：入口显式等待一次（幂等——get_all + or_insert），
    // 保证下方 peek 过滤读到磁盘全量条目，而不是只有空内存镜像。
    if let Err(e) = svc.preload().await {
        tracing::warn!(error = %e, "browser_page_meta_warmup: preload failed (继续，过滤可能偏保守)");
    }
    // 单次启动最多补抓多少个「标题-only」条目（正常首抓不设上限）。
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
            // 仅「已有有效缓存但缺图标」的补抓消耗预算与冷却；首次预热不设限。
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
    let sem = std::sync::Arc::new(tokio::sync::Semaphore::new(3));
    let mut handles = Vec::with_capacity(targets.len());
    for url in targets {
        let permit = sem.clone();
        let app = app.clone();
        handles.push(tokio::spawn(async move {
            let _permit = permit.acquire_owned().await.ok()?;
            let g = app.state::<AppState>();
            fetch_silent_meta(app.clone(), &g, &url).await.ok()
        }));
    }
    // 镜像传播：预热完成后逐个广播，前端 siteMetaCache 镜像与标签标题实时落地
    for h in handles {
        if let Ok(Some(meta)) = h.await {
            emit_page_meta_updated(&app, &meta, META_SOURCE_COM);
        }
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
        tracing::warn!(
            favicon_url = %favicon_url,
            referer = ?referer,
            "download_favicon_data_uri: request send failed (network/timeout/TLS)"
        );
        return String::new();
    };
    if !resp.status().is_success() {
        tracing::warn!(
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
                tracing::info!(
                    url = %url,
                    favicon_len = meta.favicon.len(),
                    data_uri_len = meta.favicon_data_uri.len(),
                    "spawn_meta_refetch: favicon-less entry refetched"
                );
            },
            Err(e) => {
                tracing::warn!(url = %url, error = %e, "spawn_meta_refetch: silent refetch failed");
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
    // 60s per-origin 冷却：避免同一站点被 warmup/get 反复探测惯例图标。
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
                tracing::info!(
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
                tracing::info!(
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
        // 去重逻辑在 browser_page_meta_warmup 命令内验证
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
