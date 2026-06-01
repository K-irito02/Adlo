use adl_errors::AppError;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Emitter;
use tauri::Manager;
use url::Url;

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

const BROWSER_WEBVIEW_LABEL: &str = "adl-browser-view";

fn resolve_url(raw: &str) -> Result<Url, AppError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("about:blank") {
        return Url::parse("data:text/html,<html><body></body></html>")
            .map_err(|e| AppError::Internal(format!("invalid url: {e}")));
    }
    if let Ok(parsed) = Url::parse(trimmed) {
        return Ok(parsed);
    }
    if !trimmed.contains("://") {
        let with_scheme = format!("https://{}", trimmed);
        if let Ok(parsed) = Url::parse(&with_scheme) {
            return Ok(parsed);
        }
    }
    Err(AppError::InvalidInput(format!("Cannot parse URL: {}", trimmed)))
}

pub struct BrowserManager {
    active: AtomicBool,
}

impl BrowserManager {
    pub fn new() -> Self {
        Self {
            active: AtomicBool::new(false),
        }
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

        let target = resolve_url(url)?;

        let app_nav = app.clone();
        let webview_builder = tauri::webview::WebviewBuilder::new(
            BROWSER_WEBVIEW_LABEL,
            tauri::WebviewUrl::External(target),
        )
        .on_navigation(move |url| {
            let _ = app_nav.emit(
                "digital-life://browser-url-changed",
                serde_json::json!({ "url": url.to_string() }),
            );
            true
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

        webview
            .hide()
            .map_err(|e| AppError::Internal(format!("hide failed: {e}")))?;

        Ok(())
    }

    pub fn show(&self, app: &tauri::AppHandle) -> Result<(), AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        let webview = window
            .get_webview(BROWSER_WEBVIEW_LABEL)
            .ok_or_else(|| AppError::Internal("browser webview not found".into()))?;

        webview
            .show()
            .map_err(|e| AppError::Internal(format!("show failed: {e}")))?;

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

    pub fn navigate(&self, app: &tauri::AppHandle, url: &str) -> Result<(), AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        let webview = window
            .get_webview(BROWSER_WEBVIEW_LABEL)
            .ok_or_else(|| AppError::Internal("browser webview not found".into()))?;

        let target = resolve_url(url)?;

        webview
            .navigate(target)
            .map_err(|e| AppError::Internal(format!("navigate failed: {e}")))?;

        tracing::info!(url = url, "browser navigate");
        Ok(())
    }

    pub fn go_back(&self, app: &tauri::AppHandle) -> Result<bool, AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        let webview = window
            .get_webview(BROWSER_WEBVIEW_LABEL)
            .ok_or_else(|| AppError::Internal("browser webview not found".into()))?;

        webview
            .eval("history.back()")
            .map_err(|e| AppError::Internal(format!("go_back eval failed: {e}")))?;

        Ok(true)
    }

    pub fn go_forward(&self, app: &tauri::AppHandle) -> Result<bool, AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        let webview = window
            .get_webview(BROWSER_WEBVIEW_LABEL)
            .ok_or_else(|| AppError::Internal("browser webview not found".into()))?;

        webview
            .eval("history.forward()")
            .map_err(|e| AppError::Internal(format!("go_forward eval failed: {e}")))?;

        Ok(true)
    }

    pub fn reload(&self, app: &tauri::AppHandle) -> Result<(), AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        let webview = window
            .get_webview(BROWSER_WEBVIEW_LABEL)
            .ok_or_else(|| AppError::Internal("browser webview not found".into()))?;

        webview
            .eval("location.reload()")
            .map_err(|e| AppError::Internal(format!("reload eval failed: {e}")))?;

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
        webview
            .set_size(size)
            .map_err(|e| AppError::Internal(format!("set_size failed: {e}")))?;

        Ok(())
    }

    pub fn eval(&self, app: &tauri::AppHandle, script: &str) -> Result<(), AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        let webview = window
            .get_webview(BROWSER_WEBVIEW_LABEL)
            .ok_or_else(|| AppError::Internal("browser webview not found".into()))?;

        webview
            .eval(script)
            .map_err(|e| AppError::Internal(format!("eval failed: {e}")))?;

        Ok(())
    }
}
