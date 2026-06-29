use adl_errors::AppError;
use std::sync::Mutex;
use tauri::Manager;

use crate::browser_pool::BrowserPool;

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub(crate) const BROWSER_WEBVIEW_LABEL: &str = "adl-browser-view";

const DEFAULT_POOL_SIZE: usize = 6;

fn webview_label(tab_id: &str) -> String {
    format!("adl-browser-view-{tab_id}")
}

pub struct BrowserManager {
    pool: BrowserPool,
    current_color_scheme: Mutex<String>,
}

impl Default for BrowserManager {
    fn default() -> Self {
        Self::new()
    }
}

impl BrowserManager {
    pub fn new() -> Self {
        Self {
            pool: BrowserPool::new(DEFAULT_POOL_SIZE),
            current_color_scheme: Mutex::new("dark".to_string()),
        }
    }

    pub fn create_for_tab(
        &self,
        app: &tauri::AppHandle,
        tab_id: &str,
        url: &str,
    ) -> Result<Option<String>, AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        let evicted = self.pool.register(tab_id.to_string());

        if let Some(ref evict_id) = evicted {
            crate::webview2_audio::cleanup_audio_handler(evict_id);
            let label = webview_label(evict_id);
            if let Some(wv) = window.get_webview(&label) {
                let _ = wv.close();
            }
            tracing::info!(tab_id = evict_id, "evicted LRU tab WebView");
        }

        let target = crate::browser_navigation::resolve_url(url)?;
        let label = webview_label(tab_id);

        let app_nav = app.clone();
        let app_handle = app.clone();
        let webview_builder =
            tauri::webview::WebviewBuilder::new(&label, tauri::WebviewUrl::External(target))
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
            .map_err(|e| {
                AppError::Internal(format!("failed to create webview for tab {tab_id}: {e}"))
            })?;

        tracing::info!(tab_id = tab_id, url = url, "browser webview created for tab");

        if let Some(webview) = window.get_webview(&label) {
            if let Err(e) = crate::webview2_message::setup_webview2_messaging(webview.clone()) {
                tracing::warn!(tab_id = tab_id, error = %e, "webview2 messaging setup failed");
            }
            if let Err(e) = crate::webview2_message::setup_document_title_handler(webview.clone()) {
                tracing::warn!(tab_id = tab_id, error = %e, "document title handler setup failed");
            }
            if let Err(e) = crate::webview2_message::setup_favicon_changed_handler(webview.clone())
            {
                tracing::warn!(tab_id = tab_id, error = %e, "favicon changed handler setup failed");
            }
            if let Err(e) = crate::webview2_message::setup_history_changed_handler(
                webview.clone(),
                label.clone(),
            ) {
                tracing::warn!(tab_id = tab_id, error = %e, "history changed handler setup failed");
            }
            if let Err(e) =
                crate::webview2_audio::setup_audio_changed_handler(webview.clone(), tab_id)
            {
                tracing::warn!(tab_id = tab_id, error = %e, "audio handler setup failed");
            }

            // Apply current PreferredColorScheme to the new WebView
            let cs = self
                .current_color_scheme
                .lock()
                .unwrap_or_else(|e| {
                    tracing::warn!("current_color_scheme mutex was poisoned, recovering");
                    e.into_inner()
                })
                .clone();
            tracing::info!(
                tab_id = tab_id,
                color_scheme = &cs,
                "applying current color scheme to new WebView"
            );
            crate::webview2_set_color_scheme(&webview, &cs);
        }

        Ok(evicted)
    }

    pub fn activate_tab(&self, app: &tauri::AppHandle, tab_id: &str) -> Result<(), AppError> {
        self.pool.touch(tab_id);

        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        let active_label = webview_label(tab_id);
        let active_webview = window
            .get_webview(&active_label)
            .ok_or_else(|| AppError::Internal(format!("webview for tab {tab_id} not found")))?;

        active_webview
            .show()
            .map_err(|e| AppError::Internal(format!("show failed for {tab_id}: {e}")))?;

        // Hide all other webviews
        for entry_id in self.pool.tab_ids() {
            if entry_id == tab_id {
                continue;
            }
            let other_label = webview_label(&entry_id);
            if let Some(other_wv) = window.get_webview(&other_label) {
                let _ = other_wv.hide();
            }
        }

        Ok(())
    }

    pub fn destroy_tab(&self, app: &tauri::AppHandle, tab_id: &str) -> Result<(), AppError> {
        self.pool.remove(tab_id);

        crate::webview2_audio::cleanup_audio_handler(tab_id);

        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        let label = webview_label(tab_id);
        if let Some(webview) = window.get_webview(&label) {
            let _ = webview.close();
        }

        tracing::info!(tab_id = tab_id, "browser webview destroyed for tab");
        Ok(())
    }

    pub fn navigate_tab(
        &self,
        app: &tauri::AppHandle,
        tab_id: &str,
        url: &str,
    ) -> Result<(), AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        let label = webview_label(tab_id);
        let webview = window
            .get_webview(&label)
            .ok_or_else(|| AppError::Internal(format!("webview for tab {tab_id} not found")))?;

        let target = crate::browser_navigation::resolve_url(url)?;
        webview
            .navigate(target)
            .map_err(|e| AppError::Internal(format!("navigate failed for {tab_id}: {e}")))?;

        tracing::info!(tab_id = tab_id, url = url, "browser navigate for tab");
        Ok(())
    }

    pub fn set_tab_bounds(
        &self,
        app: &tauri::AppHandle,
        tab_id: &str,
        bounds: Bounds,
    ) -> Result<(), AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        let label = webview_label(tab_id);
        let webview = window
            .get_webview(&label)
            .ok_or_else(|| AppError::Internal(format!("webview for tab {tab_id} not found")))?;

        let position = tauri::LogicalPosition::new(bounds.x, bounds.y);
        let size = tauri::LogicalSize::new(bounds.width.max(1.0), bounds.height.max(1.0));

        webview
            .set_position(position)
            .map_err(|e| AppError::Internal(format!("set_position failed: {e}")))?;
        webview.set_size(size).map_err(|e| AppError::Internal(format!("set_size failed: {e}")))?;

        Ok(())
    }

    pub fn go_back_tab(&self, app: &tauri::AppHandle, tab_id: &str) -> Result<bool, AppError> {
        let tid = tab_id.to_string();
        tracing::info!(tab_id = &tid, "go_back_tab");
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;
        let label = webview_label(&tid);
        let webview = window
            .get_webview(&label)
            .ok_or_else(|| AppError::Internal(format!("webview for tab {tid} not found")))?;

        // Use eval("history.back()") for SPA-compatible back navigation.
        // Native GoBack() triggers full page reloads which disrupt SPA sites like YouTube.
        match webview.eval("history.back()") {
            Ok(_) => {
                tracing::info!(tab_id = &tid, "go_back_tab: eval history.back() ok");
                Ok(true)
            },
            Err(e) => {
                tracing::error!(tab_id = &tid, "go_back_tab: eval failed: {e}");
                Err(AppError::Internal(format!("go_back_tab eval failed: {e}")))
            },
        }
    }

    pub fn go_forward_tab(&self, app: &tauri::AppHandle, tab_id: &str) -> Result<bool, AppError> {
        let tid = tab_id.to_string();
        tracing::info!(tab_id = &tid, "go_forward_tab");
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;
        let label = webview_label(&tid);
        let webview = window
            .get_webview(&label)
            .ok_or_else(|| AppError::Internal(format!("webview for tab {tid} not found")))?;

        match webview.eval("history.forward()") {
            Ok(_) => {
                tracing::info!(tab_id = &tid, "go_forward_tab: eval history.forward() ok");
                Ok(true)
            },
            Err(e) => {
                tracing::error!(tab_id = &tid, "go_forward_tab: eval failed: {e}");
                Err(AppError::Internal(format!("go_forward_tab eval failed: {e}")))
            },
        }
    }

    pub fn reload_tab(&self, app: &tauri::AppHandle, tab_id: &str) -> Result<(), AppError> {
        tracing::info!(tab_id, "reload_tab");
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        let label = webview_label(tab_id);
        let webview = window
            .get_webview(&label)
            .ok_or_else(|| AppError::Internal(format!("webview for tab {tab_id} not found")))?;

        webview
            .eval("location.reload()")
            .map_err(|e| AppError::Internal(format!("reload eval failed: {e}")))?;

        tracing::info!(tab_id, "reload_tab ok");
        Ok(())
    }

    pub fn eval_tab(
        &self,
        app: &tauri::AppHandle,
        tab_id: &str,
        script: &str,
    ) -> Result<(), AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        let label = webview_label(tab_id);
        let webview = window
            .get_webview(&label)
            .ok_or_else(|| AppError::Internal(format!("webview for tab {tab_id} not found")))?;

        webview.eval(script).map_err(|e| AppError::Internal(format!("eval failed: {e}")))?;

        Ok(())
    }

    pub fn set_color_scheme_for_all(
        &self,
        app: &tauri::AppHandle,
        color_scheme: &str,
    ) -> Result<(), AppError> {
        {
            let mut cs = self.current_color_scheme.lock().unwrap_or_else(|e| {
                tracing::warn!("current_color_scheme mutex was poisoned, recovering");
                e.into_inner()
            });
            *cs = color_scheme.to_string();
        }

        let tab_ids = self.pool.tab_ids();
        tracing::info!(
            tab_count = tab_ids.len(),
            color_scheme,
            "set_color_scheme_for_all starting"
        );

        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        for tab_id in tab_ids {
            let label = webview_label(&tab_id);
            if let Some(webview) = window.get_webview(&label) {
                tracing::info!(
                    tab_id = &tab_id,
                    color_scheme,
                    "calling webview2_set_color_scheme for tab"
                );
                crate::webview2_set_color_scheme(&webview, color_scheme);
            } else {
                tracing::warn!(tab_id = &tab_id, "browser webview not found for set_color_scheme");
            }
        }

        Ok(())
    }

    pub fn has_tab_webview(&self, tab_id: &str) -> bool {
        self.pool.contains(tab_id)
    }

    pub fn mute_tab(
        &self,
        app: &tauri::AppHandle,
        tab_id: &str,
        muted: bool,
    ) -> Result<(), AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;
        let label = webview_label(tab_id);
        let webview = window
            .get_webview(&label)
            .ok_or_else(|| AppError::Internal(format!("webview for tab {tab_id} not found")))?;
        crate::webview2_audio::mute_tab(&webview, muted).map_err(AppError::Internal)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_webview_label_format() {
        let label = webview_label("test-tab-123");
        assert_eq!(label, "adl-browser-view-test-tab-123");
    }
}
