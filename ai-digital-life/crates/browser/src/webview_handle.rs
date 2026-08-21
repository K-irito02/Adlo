use adl_errors::AppError;
use std::sync::Arc;

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub trait WebViewHandle: Send + Sync {
    fn navigate(&self, url: &str) -> Result<(), AppError>;
    fn close(&self) -> Result<(), AppError>;
    fn set_bounds(&self, bounds: Bounds) -> Result<(), AppError>;
    fn eval_js(&self, js: &str) -> Result<String, AppError>;
    /// 用 WebView2 原生 `ICoreWebView2_15::GetFavicon` 获取当前页面 favicon 的
    /// PNG 字节流（WebView2 用自己的网络栈下载，能访问 reqwest 无法直连的站点，
    /// 如无代理环境下的 YouTube）。返回 PNG 字节；失败/无 favicon 返回空。
    fn get_favicon_data(&self) -> Result<Vec<u8>, AppError>;
    fn set_color_scheme(&self, scheme: &str) -> Result<(), AppError>;
    fn id(&self) -> &str;
    fn show(&self) -> Result<(), AppError>;
    fn hide(&self) -> Result<(), AppError>;
    fn set_zoom(&self, factor: f64) -> Result<(), AppError>;
    fn mute(&self, muted: bool) -> Result<(), AppError>;
    fn clear_cookies(&self) -> Result<(), AppError>;
    fn clear_cache(&self) -> Result<(), AppError>;
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
    /// injected `init_script.js` when the page targets `_blank` or calls
    /// `window.open` (postMessage `{type:'open-new-tab', url}`).
    fn emit_open_new_tab(&self, url: &str);
}

/// Type alias for an optional shared event bridge reference.
pub type EventBridgeRef = Arc<dyn WebView2EventBridge>;
