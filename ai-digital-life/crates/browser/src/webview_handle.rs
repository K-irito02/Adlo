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
