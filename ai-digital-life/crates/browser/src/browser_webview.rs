use adl_errors::AppError;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::browser_pool::BrowserPool;
use crate::site_meta_cache::SiteMetaCacheStore;
use crate::webview_handle::{Bounds, WebView2EventBridge, WebViewHandle};

pub const BROWSER_WEBVIEW_LABEL: &str = "adl-browser-view";

const DEFAULT_POOL_SIZE: usize = 6;

pub fn webview_label(tab_id: &str) -> String {
    format!("adl-browser-view-{tab_id}")
}

#[cfg(windows)]
pub fn setup_webview2_handlers(
    core: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2,
    tab_id: &str,
    label: &str,
    bridge: &Arc<dyn WebView2EventBridge>,
) {
    if let Err(e) = crate::webview2_message::setup_webview2_messaging(core, tab_id, bridge) {
        tracing::warn!(tab_id = tab_id, error = %e, "webview2 messaging setup failed");
    }
    if let Err(e) = crate::webview2_message::setup_document_title_handler(core, tab_id, bridge) {
        tracing::warn!(tab_id = tab_id, error = %e, "document title handler setup failed");
    }
    if let Err(e) = crate::webview2_message::setup_favicon_changed_handler(core) {
        tracing::warn!(tab_id = tab_id, error = %e, "favicon changed handler setup failed");
    }
    if let Err(e) =
        crate::webview2_message::setup_history_changed_handler(core, tab_id, label, bridge)
    {
        tracing::warn!(tab_id = tab_id, error = %e, "history changed handler setup failed");
    }
    if let Err(e) = crate::webview2_audio::setup_audio_changed_handler(core, tab_id, bridge) {
        tracing::warn!(tab_id = tab_id, error = %e, "audio handler setup failed");
    }
}

#[cfg(not(windows))]
pub fn setup_webview2_handlers(_tab_id: &str, _label: &str) {}

pub struct BrowserManager {
    pool: BrowserPool,
    handles: Mutex<HashMap<String, Arc<dyn WebViewHandle>>>,
    current_color_scheme: Mutex<String>,
    site_meta_cache: Arc<SiteMetaCacheStore>,
}

impl Default for BrowserManager {
    fn default() -> Self {
        Self {
            pool: BrowserPool::new(DEFAULT_POOL_SIZE),
            handles: Mutex::new(HashMap::new()),
            current_color_scheme: Mutex::new("dark".to_string()),
            site_meta_cache: SiteMetaCacheStore::open(std::env::temp_dir().as_path())
                .expect("in-memory store open"),
        }
    }
}

impl BrowserManager {
    pub fn new(store: Arc<SiteMetaCacheStore>) -> Self {
        Self {
            pool: BrowserPool::new(DEFAULT_POOL_SIZE),
            handles: Mutex::new(HashMap::new()),
            current_color_scheme: Mutex::new("dark".to_string()),
            site_meta_cache: store,
        }
    }

    pub fn site_meta_cache(&self) -> &Arc<SiteMetaCacheStore> {
        &self.site_meta_cache
    }

    pub fn set_site_meta_cache(&mut self, store: Arc<SiteMetaCacheStore>) {
        self.site_meta_cache = store;
    }

    pub fn current_color_scheme(&self) -> String {
        self.current_color_scheme
            .lock()
            .unwrap_or_else(|e| {
                tracing::warn!("current_color_scheme mutex was poisoned, recovering");
                e.into_inner()
            })
            .clone()
    }

    fn with_handle<F, R>(&self, tab_id: &str, f: F) -> Result<R, AppError>
    where
        F: FnOnce(&Arc<dyn WebViewHandle>) -> Result<R, AppError>,
    {
        let handle = self
            .handles
            .lock()
            .map_err(|e| AppError::Internal(format!("handles lock poisoned: {e}")))?
            .get(tab_id)
            .cloned()
            .ok_or_else(|| AppError::Internal(format!("webview for tab {tab_id} not found")))?;
        f(&handle)
    }

    pub fn create_for_tab(
        &self,
        handle: Arc<dyn WebViewHandle>,
        tab_id: &str,
    ) -> Result<Option<String>, AppError> {
        let evicted = self.pool.register(tab_id.to_string());

        if let Some(ref evict_id) = evicted {
            crate::webview2_audio::cleanup_audio_handler(evict_id);
            if let Ok(mut handles) = self.handles.lock() {
                if let Some(evicted_handle) = handles.remove(evict_id) {
                    let _ = evicted_handle.close();
                }
            }
            tracing::info!(tab_id = evict_id, "evicted LRU tab WebView");
        }

        if let Ok(mut handles) = self.handles.lock() {
            handles.insert(tab_id.to_string(), handle);
        }

        tracing::info!(tab_id = tab_id, "browser webview registered for tab");
        Ok(evicted)
    }

    pub fn activate_tab(&self, tab_id: &str) -> Result<(), AppError> {
        self.pool.touch(tab_id);

        let tab_ids = self.pool.tab_ids();

        for entry_id in &tab_ids {
            let handle = {
                let guard = self
                    .handles
                    .lock()
                    .map_err(|e| AppError::Internal(format!("handles lock poisoned: {e}")))?;
                guard.get(entry_id).cloned()
            };
            if let Some(handle) = handle {
                if entry_id == tab_id {
                    handle.show()?;
                } else {
                    let _ = handle.hide();
                }
            }
        }

        Ok(())
    }

    pub fn destroy_tab(&self, tab_id: &str) -> Result<(), AppError> {
        self.pool.remove(tab_id);

        crate::webview2_audio::cleanup_audio_handler(tab_id);

        let mut handles = self
            .handles
            .lock()
            .map_err(|e| AppError::Internal(format!("handles lock poisoned: {e}")))?;
        if let Some(handle) = handles.remove(tab_id) {
            let _ = handle.close();
        }

        tracing::info!(tab_id = tab_id, "browser webview destroyed for tab");
        Ok(())
    }

    pub fn navigate_tab(&self, tab_id: &str, url: &str) -> Result<(), AppError> {
        tracing::debug!(tab_id = tab_id, url = url, "BrowserManager::navigate_tab: ENTER");
        self.with_handle(tab_id, |handle| {
            handle.navigate(url)?;
            tracing::debug!(
                tab_id = tab_id,
                url = url,
                "BrowserManager::navigate_tab: navigate() succeeded"
            );
            Ok(())
        })
    }

    pub fn set_tab_bounds(&self, tab_id: &str, bounds: Bounds) -> Result<(), AppError> {
        self.with_handle(tab_id, |handle| {
            handle.set_bounds(bounds)?;
            Ok(())
        })
    }

    pub fn go_back_tab(&self, tab_id: &str) -> Result<bool, AppError> {
        self.with_handle(tab_id, |handle| handle.go_back())
    }
    pub fn go_forward_tab(&self, tab_id: &str) -> Result<bool, AppError> {
        self.with_handle(tab_id, |handle| handle.go_forward())
    }

    /// Whether the tab's WebView has a previous history entry to go back to.
    /// Returns `Ok(false)` when the WebView is not registered yet (tab exists but
    /// webview still being created) instead of an error — the frontend keeps the
    /// button disabled and re-queries after the webview is ready.
    pub fn can_go_back_tab(&self, tab_id: &str) -> Result<bool, AppError> {
        let Some(handle) = self
            .handles
            .lock()
            .map_err(|e| AppError::Internal(format!("handles lock poisoned: {e}")))?
            .get(tab_id)
            .cloned()
        else {
            return Ok(false);
        };
        handle.can_go_back()
    }

    /// Whether the tab's WebView has a forward history entry to go forward to.
    pub fn can_go_forward_tab(&self, tab_id: &str) -> Result<bool, AppError> {
        let Some(handle) = self
            .handles
            .lock()
            .map_err(|e| AppError::Internal(format!("handles lock poisoned: {e}")))?
            .get(tab_id)
            .cloned()
        else {
            return Ok(false);
        };
        handle.can_go_forward()
    }

    pub fn reload_tab(&self, tab_id: &str) -> Result<(), AppError> {
        tracing::info!(tab_id, "reload_tab");
        self.with_handle(tab_id, |handle| {
            handle.eval_js("location.reload()")?;
            tracing::info!(tab_id, "reload_tab ok");
            Ok(())
        })
    }

    pub fn set_color_scheme_for_all(&self, color_scheme: &str) -> Result<(), AppError> {
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

        for tab_id in &tab_ids {
            let handle = {
                let guard = self
                    .handles
                    .lock()
                    .map_err(|e| AppError::Internal(format!("handles lock poisoned: {e}")))?;
                guard.get(tab_id).cloned()
            };
            if let Some(handle) = handle {
                tracing::info!(tab_id = tab_id, color_scheme, "calling set_color_scheme for tab");
                handle.set_color_scheme(color_scheme)?;
            } else {
                tracing::warn!(tab_id = tab_id, "browser webview not found for set_color_scheme");
            }
        }

        Ok(())
    }

    pub fn has_tab_webview(&self, tab_id: &str) -> bool {
        self.pool.contains(tab_id)
    }

    pub fn mute_tab(&self, tab_id: &str, muted: bool) -> Result<(), AppError> {
        self.with_handle(tab_id, |handle| handle.mute(muted))
    }

    pub fn clear_cookies_for_tab(&self, tab_id: &str) -> Result<(), AppError> {
        self.with_handle(tab_id, |handle| {
            handle.clear_cookies()?;
            tracing::info!(tab_id = tab_id, "cookies cleared for tab");
            Ok(())
        })
    }

    pub fn clear_cache_for_tab(&self, tab_id: &str) -> Result<(), AppError> {
        self.with_handle(tab_id, |handle| {
            handle.clear_cache()?;
            tracing::info!(tab_id = tab_id, "cache cleared for tab");
            Ok(())
        })
    }

    pub fn set_zoom(&self, tab_id: &str, zoom_factor: f64) -> Result<(), AppError> {
        self.with_handle(tab_id, |handle| {
            handle.set_zoom(zoom_factor)?;
            tracing::info!(tab_id = tab_id, zoom_factor = zoom_factor, "webview zoom set");
            Ok(())
        })
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
