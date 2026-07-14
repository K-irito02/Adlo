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
    fn set_color_scheme(&self, scheme: &str) -> Result<(), AppError>;
    fn id(&self) -> &str;
    fn show(&self) -> Result<(), AppError>;
    fn hide(&self) -> Result<(), AppError>;
    fn set_zoom(&self, factor: f64) -> Result<(), AppError>;
    fn mute(&self, muted: bool) -> Result<(), AppError>;
    fn clear_cookies(&self) -> Result<(), AppError>;
    fn clear_cache(&self) -> Result<(), AppError>;
}

/// Bridge for emitting events from native WebView2 handlers back to the platform layer.
/// Implemented in `src-tauri/` using `tauri::AppHandle`.
pub trait WebView2EventBridge: Send + Sync {
    fn emit_meta_changed(&self, tab_id: &str, title: &str, favicon: &str, url: &str);
    fn emit_url_changed(&self, tab_id: &str, url: &str);
    fn emit_audio_changed(&self, tab_id: &str, is_playing: bool, is_muted: bool);
    fn spawn_spa_fallback(&self, label: &str, url: &str);
}

/// Type alias for an optional shared event bridge reference.
pub type EventBridgeRef = Arc<dyn WebView2EventBridge>;
