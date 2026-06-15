use adl_errors::AppError;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub(crate) const BROWSER_WEBVIEW_LABEL: &str = "adl-browser-view";

pub struct BrowserManager {
    active: AtomicBool,
}

impl Default for BrowserManager {
    fn default() -> Self {
        Self::new()
    }
}

impl BrowserManager {
    pub fn new() -> Self {
        Self { active: AtomicBool::new(false) }
    }

    pub fn is_active(&self) -> bool {
        self.active.load(Ordering::Acquire)
    }

    pub fn create(&self, app: &tauri::AppHandle, url: &str) -> Result<(), AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        if self.is_active() {
            self.destroy(app)?;
        }

        let target = crate::browser_navigation::resolve_url(url)?;

        let app_nav = app.clone();
        let app_handle = app.clone();
        let webview_builder = tauri::webview::WebviewBuilder::new(
            BROWSER_WEBVIEW_LABEL,
            tauri::WebviewUrl::External(target),
        )
        .initialization_script(crate::browser_navigation::INIT_SCRIPT)
        .on_navigation(move |url| crate::browser_events::navigation_handler(&app_nav, url))
        .on_new_window(move |url, _window_features| {
            crate::browser_events::new_window_handler(&app_handle, &url)
        });

        window
            .add_child(
                webview_builder,
                tauri::LogicalPosition::new(-10000.0, -10000.0),
                tauri::LogicalSize::new(800.0, 600.0),
            )
            .map_err(|e| AppError::Internal(format!("failed to create webview: {e}")))?;

        tracing::info!(url = url, "browser webview created off-screen");

        self.active.store(true, Ordering::Release);

        Ok(())
    }

    pub fn hide(&self, app: &tauri::AppHandle) -> Result<(), AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        let webview = window
            .get_webview(BROWSER_WEBVIEW_LABEL)
            .ok_or_else(|| AppError::Internal("browser webview not found".into()))?;

        webview.hide().map_err(|e| AppError::Internal(format!("hide failed: {e}")))?;

        Ok(())
    }

    pub fn show(&self, app: &tauri::AppHandle) -> Result<(), AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        let webview = window
            .get_webview(BROWSER_WEBVIEW_LABEL)
            .ok_or_else(|| AppError::Internal("browser webview not found".into()))?;

        webview.show().map_err(|e| AppError::Internal(format!("show failed: {e}")))?;

        Ok(())
    }

    pub fn destroy(&self, app: &tauri::AppHandle) -> Result<(), AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        if let Some(webview) = window.get_webview(BROWSER_WEBVIEW_LABEL) {
            let _ = webview.close();
        }

        self.active.store(false, Ordering::Release);

        tracing::info!("browser webview destroyed");
        Ok(())
    }

    pub fn set_bounds(&self, app: &tauri::AppHandle, bounds: Bounds) -> Result<(), AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        let webview = window
            .get_webview(BROWSER_WEBVIEW_LABEL)
            .ok_or_else(|| AppError::Internal("browser webview not found".into()))?;

        let position = tauri::LogicalPosition::new(bounds.x, bounds.y);
        let size = tauri::LogicalSize::new(bounds.width.max(1.0), bounds.height.max(1.0));

        webview
            .set_position(position)
            .map_err(|e| AppError::Internal(format!("set_position failed: {e}")))?;
        webview.set_size(size).map_err(|e| AppError::Internal(format!("set_size failed: {e}")))?;

        Ok(())
    }

    pub fn eval(&self, app: &tauri::AppHandle, script: &str) -> Result<(), AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        let webview = window
            .get_webview(BROWSER_WEBVIEW_LABEL)
            .ok_or_else(|| AppError::Internal("browser webview not found".into()))?;

        webview.eval(script).map_err(|e| AppError::Internal(format!("eval failed: {e}")))?;

        Ok(())
    }
}
