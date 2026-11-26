use adl_errors::AppError;
use std::sync::Arc;

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Divider-strip (panel sash bridge) width guardrail, in CSS pixels.
///
/// The strip is a transparent child webview straddling the center/right-panel
/// boundary. It must stay a narrow band: wide enough to grab, narrow enough
/// to keep the overlapped WebView edges usable.
pub const DIVIDER_STRIP_WIDTH_MIN: f64 = 2.0;
pub const DIVIDER_STRIP_WIDTH_MAX: f64 = 16.0;

/// Clamp divider-strip bounds to sane values before sending them to WebView2.
///
/// Returns `None` for degenerate geometry (non-finite components): callers
/// treat `None` as no-op `Ok` instead of flashing the strip at the origin.
/// Guards against transient layout states (panel collapsing, window minimizing).
pub fn sanitize_strip_bounds(bounds: &Bounds) -> Option<Bounds> {
    if ![bounds.x, bounds.y, bounds.width, bounds.height].iter().all(|v| v.is_finite()) {
        return None;
    }
    Some(Bounds {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width.clamp(DIVIDER_STRIP_WIDTH_MIN, DIVIDER_STRIP_WIDTH_MAX),
        height: bounds.height.max(1.0),
    })
}

/// 清理类操作的完成回执：CDP / CookieManager 都是异步的，命令层必须据此判断
/// 成败，而不是「发出即成功」。`Err(msg)` 表示平台侧明确失败。
pub type CleanupDone = std::sync::mpsc::Sender<Result<(), String>>;

pub trait WebViewHandle: Send + Sync {
    fn navigate(&self, url: &str) -> Result<(), AppError>;
    fn close(&self) -> Result<(), AppError>;
    fn set_bounds(&self, bounds: Bounds) -> Result<(), AppError>;
    fn eval_js(&self, js: &str) -> Result<String, AppError>;
    fn set_color_scheme(&self, scheme: &str) -> Result<(), AppError>;
    fn id(&self) -> &str;
    fn show(&self) -> Result<(), AppError>;
    fn set_zoom(&self, factor: f64) -> Result<(), AppError>;
    fn mute(&self, muted: bool) -> Result<(), AppError>;
    /// 「清除全部 Cookie」：清空全局 Cookie 罐，完成后重载本 WebView。
    fn clear_cookies(&self, done: CleanupDone) -> Result<(), AppError>;
    /// 「清除本站 Cookie」：按当前文档 host 删除该站点的 cookie，完成后重载本
    /// WebView（[`Self::clear_cookies`] 是全局版本）。
    fn clear_site_cookies(&self, done: CleanupDone) -> Result<(), AppError>;
    /// 「清除全部缓存」：清空全局 HTTP 缓存，然后重载本 WebView。
    ///
    /// 重载只作用于本 WebView 对应的标签页，因此不会重载其它标签（含另一个
    /// 宿主正在显示的那个）。
    fn clear_cache_and_reload(&self, done: CleanupDone) -> Result<(), AppError>;
    /// 「清除本站缓存」：清掉本 WebView 当前 origin 的站点数据（离线包 /
    /// Service Worker / 本地库 / 草稿，不含 Cookie），然后重载本 WebView。
    fn clear_site_cache(&self, done: CleanupDone) -> Result<(), AppError>;
    /// Reload the current document bypassing the HTTP cache（「强制刷新」）。
    ///
    /// 当前实现：WebView2 后端经 CDP `Page.reload{ignoreCache}`；CDP 派发失败时
    /// 尝试普通刷新并记 warn，调用方拿到 `Ok`（不宣称“已忽略缓存”）。非 WebView2
    /// 后端退化为普通刷新（`location.reload()`）并记 warn，同样返回 `Ok`。
    fn hard_reload(&self) -> Result<(), AppError>;
    /// Open the platform DevTools window **of this WebView**.
    ///
    /// 与 Tauri 内置的 `internal_toggle_devtools` 不同：后者不传 label 时作用于
    /// 发起 invoke 的 webview（即应用壳）。标签页页面在子 WebView 里，需按 label
    /// 定位，因此不能复用它。
    fn open_devtools(&self) -> Result<(), AppError>;
    /// Navigate back in the WebView's native history stack.
    ///
    /// Implemented via the platform's native history API (ICoreWebView2::GoBack)
    /// instead of `history.back()` so the URL change arrives through the same
    /// HistoryChanged path as forward navigation. Returns `Ok(true)` when the
    /// native call was reachable (GoBack is a no-op when no previous entry
    /// exists, so `true` does not imply a navigation actually happened).
    fn go_back(&self) -> Result<bool, AppError>;
    /// Navigate forward in the WebView's native history stack.
    ///
    /// Implemented via the platform's native history API (ICoreWebView2::GoForward).
    /// Returns `Ok(true)` when the native call was reachable (no-op at the top
    /// of the stack, so `true` does not imply a navigation actually happened).
    fn go_forward(&self) -> Result<bool, AppError>;
    /// Whether the WebView has a previous history entry to go back to.
    fn can_go_back(&self) -> Result<bool, AppError>;
    /// Whether the WebView has a forward history entry to go forward to.
    fn can_go_forward(&self) -> Result<bool, AppError>;
}

/// Bridge for emitting events from native WebView2 handlers back to the platform layer.
/// Implemented in `src-tauri/` using `tauri::AppHandle`.
pub trait WebView2EventBridge: Send + Sync {
    fn emit_meta_changed(&self, tab_id: &str, title: &str, favicon: &str, url: &str);
    fn emit_url_changed(&self, tab_id: &str, url: &str);
    fn emit_audio_changed(&self, tab_id: &str, is_playing: bool, is_muted: bool);
    fn spawn_spa_fallback(&self, label: &str, url: &str);
    /// Emit a request to open `url` in a new browser tab. Triggered by the
    /// injected `init_script.js` for target="_blank"/`<area>` links and modified
    /// (ctrl/meta/shift/middle) clicks (postMessage `{type:'open-new-tab', url,
    /// referrer?}`). Normal-site `window.open` uses the native
    /// NewWindowRequested path and does not come through here.
    ///
    /// `tab_id` is the requesting tab: the frontend uses it to open the new tab
    /// in the same host (center page → center tab, panel page → panel tab).
    /// `referrer` is the requesting page's referrer (same-origin: full URL,
    /// cross-origin: origin only under the default policy; absent when the link
    /// opted out with `rel="noreferrer"`/`referrerpolicy=no-referrer`, or on an
    /// HTTPS→HTTP downgrade); the new tab's first navigation sets it as the
    /// `Referer` header.
    fn emit_open_new_tab(&self, tab_id: &str, url: &str, referrer: Option<&str>);
    /// Emit an intercepted blob download. Triggered by `init_script.js` on every
    /// site (postMessage `{type:'save-blob', fileName, dataBase64}`): a browser
    /// tab has no Tauri IPC access, so the host persists the payload.
    ///
    /// `tab_id` is the requesting tab, so the download record carries
    /// `source_tab_id` like native downloads (keeps the tab protected from the
    /// suspend scheduler while downloading). Default no-op so the silent meta
    /// bridge ignores it.
    fn save_blob(&self, _tab_id: &str, _file_name: &str, _data_base64: &str) {}
    /// Emit a page-side blob download failure (oversize/fetch error, no payload).
    /// Default no-op so the silent meta bridge ignores it.
    fn save_blob_failed(&self, _tab_id: &str, _file_name: &str) {}
    /// Emit an intercepted agent-site link click. Triggered by `init_script.js`
    /// only for whitelisted agent sites (postMessage `{type:'adl-agent-link', ...}`).
    ///
    /// Default no-op so implementers that never host visible agent tabs (e.g. the
    /// silent meta bridge) need not handle it.
    fn emit_agent_link(&self, _tab_id: &str, _kind: &str, _url: &str) {}
    /// Emit a browser-tab media snapshot. Triggered by `init_script.js`
    /// (postMessage `{type:'adl-media', ...}`) for the page's own
    /// `navigator.mediaSession` metadata + primary `<video>/<audio>` state.
    ///
    /// 事项 17 路线 A：Adlo 关闭了 Chromium 的 `MediaSessionService`（其会话归属
    /// `msedgewebview2.exe`，系统卡片恒显示「未知应用」），改由 Rust 侧 SMTC 承载。
    /// 标签页要「两者兼得」就必须把站点媒体状态经这里送回宿主。
    ///
    /// Default no-op so the silent meta bridge ignores it.
    fn emit_media_state(&self, _tab_id: &str, _state: &BrowserMediaState) {}
}

/// 浏览器标签页的媒体快照（事项 17 路线 A）。
///
/// 来源：`init_script.js` 的 `{type:'adl-media', ...}` postMessage。`title` 优先取站点
/// 自己的 `navigator.mediaSession.metadata.title`（与 Edge 卡片同源），回退
/// `document.title`；`paused/ended/position/duration` 取自页面里「正在播放优先、
/// 其次进度最大」的那个 `<video>/<audio>`。系统卡片只显示标题，因此没有 artist/album。
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct BrowserMediaState {
    pub title: String,
    pub paused: bool,
    pub ended: bool,
    /// 秒。
    pub position: f64,
    /// 秒；未知为 0。
    pub duration: f64,
}

/// Type alias for an optional shared event bridge reference.
pub type EventBridgeRef = Arc<dyn WebView2EventBridge>;
