use adl_errors::AppError;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::browser_pool::BrowserPool;
use crate::download_manager::DownloadManager;
use crate::page_meta_service::PageMetaService;
use crate::site_meta_cache::SiteMetaCacheStore;
use crate::webview_handle::{Bounds, WebView2EventBridge, WebViewHandle};

pub const BROWSER_WEBVIEW_LABEL: &str = "adl-browser-view";

pub fn webview_label(tab_id: &str) -> String {
    format!("adl-browser-view-{tab_id}")
}

#[cfg(windows)]
pub fn setup_webview2_handlers(
    core: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2,
    tab_id: &str,
    label: &str,
    bridge: &Arc<dyn WebView2EventBridge>,
    download_manager: &DownloadManager,
    is_silent: bool,
) {
    if let Err(e) = crate::webview2_message::setup_webview2_messaging(core, tab_id, bridge) {
        tracing::warn!(tab_id = tab_id, error = %e, "webview2 messaging setup failed");
    }
    if let Err(e) = crate::webview2_message::setup_document_title_handler(core, tab_id, bridge) {
        tracing::warn!(tab_id = tab_id, error = %e, "document title handler setup failed");
    }
    if let Err(e) = crate::webview2_message::setup_favicon_changed_handler(core, tab_id, bridge) {
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
    // Capture the native WebView2 download operation so pause/resume/cancel can
    // actually control the engine instead of only flipping a DB flag.
    if let Err(e) = crate::webview2_download::setup_download_operation_capture(
        core,
        download_manager,
        is_silent,
    ) {
        tracing::warn!(tab_id = tab_id, error = %e, "download operation capture setup failed");
    }
}

#[cfg(not(windows))]
pub fn setup_webview2_handlers(
    _tab_id: &str,
    _label: &str,
    _download_manager: &DownloadManager,
    _is_silent: bool,
) {
}

pub struct BrowserManager {
    pool: BrowserPool,
    handles: Mutex<HashMap<String, Arc<dyn WebViewHandle>>>,
    current_color_scheme: Mutex<String>,
    site_meta_cache: Arc<SiteMetaCacheStore>,
    page_meta_service: Arc<PageMetaService>,
}

impl BrowserManager {
    pub fn new(store: Arc<SiteMetaCacheStore>) -> Self {
        Self {
            pool: BrowserPool::new(),
            handles: Mutex::new(HashMap::new()),
            current_color_scheme: Mutex::new("dark".to_string()),
            site_meta_cache: store.clone(),
            page_meta_service: Arc::new(PageMetaService::new(store)),
        }
    }

    pub fn site_meta_cache(&self) -> &Arc<SiteMetaCacheStore> {
        &self.site_meta_cache
    }

    pub fn page_meta_service(&self) -> &Arc<PageMetaService> {
        &self.page_meta_service
    }

    #[cfg(test)]
    pub fn set_site_meta_cache(&mut self, store: Arc<SiteMetaCacheStore>) {
        // 必须同时重建 page_meta_service，否则 service 仍指向旧 store，
        // 后续 get/report/preload 读写全部落到旧库（②）。
        self.site_meta_cache = store.clone();
        self.page_meta_service = Arc::new(PageMetaService::new(store));
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

    /// 锁定 handles 表并克隆目标 tab 的 handle；缺 tab 时返回 `Ok(None)`。
    ///
    /// 与 `with_handle` 的区别：缺 handle **不视为错误** —— `activate_tab` /
    /// `can_go_*_tab` / `set_color_scheme_for_all` 的契约是「WebView 尚未创建时
    /// 保持 Ok（前端会重试/禁用按钮）」，而非报错。
    fn try_handle(&self, tab_id: &str) -> Result<Option<Arc<dyn WebViewHandle>>, AppError> {
        let guard = self
            .handles
            .lock()
            .map_err(|e| AppError::Internal(format!("handles lock poisoned: {e}")))?;
        Ok(guard.get(tab_id).cloned())
    }

    fn with_handle<F, R>(&self, tab_id: &str, f: F) -> Result<R, AppError>
    where
        F: FnOnce(&Arc<dyn WebViewHandle>) -> Result<R, AppError>,
    {
        let handle = self
            .try_handle(tab_id)?
            .ok_or_else(|| AppError::Internal(format!("webview for tab {tab_id} not found")))?;
        f(&handle)
    }

    pub fn create_for_tab(
        &self,
        handle: Arc<dyn WebViewHandle>,
        tab_id: &str,
    ) -> Result<Option<String>, AppError> {
        let evicted = self.pool.register(tab_id.to_string());

        // 锁中毒必须报错而非静默跳过：原生 WebView 已创建但 manager 无记录时，
        // 后续 activate_tab 会 no-op、tab 永久不可见且无任何日志。
        let mut handles = self
            .handles
            .lock()
            .map_err(|e| AppError::Internal(format!("handles lock poisoned: {e}")))?;
        let key = tab_id.to_string();
        if let Some(old) = handles.insert(key, handle) {
            // R-M2：同 tab 已存在旧 handle（重复创建覆盖）时先 close 旧 WebView，
            // 复用 destroy_tab 的 close 语义，防止旧原生资源泄漏。
            let _ = old.close();
        }

        tracing::info!(tab_id = tab_id, "browser webview registered for tab");
        Ok(evicted)
    }

    /// 确保目标 tab 的原生表面处于显示态。
    ///
    /// **只作用于目标 tab**：中心与右侧面板是两个独立宿主，共享同一个 WebView 池。
    /// 历史上这里会先 `touch` 再遍历整个池并隐藏除激活者外的全部 tab —— 那是单宿主
    /// 时代的语义（当时同一时刻只允许一个浏览器 WebView 可见），引入第二宿主后会让
    /// "面板激活自己的标签"顺手隐藏中心正在显示的 WebView，且中心生命周期不会重跑、
    /// 无法自愈。各宿主隐藏自己不再显示的 tab 由前端按 bounds 移出画面负责。
    pub fn activate_tab(&self, tab_id: &str) -> Result<(), AppError> {
        // WebView 尚未创建（前端先 create 后 activate，正常路径下必存在）时保持 Ok：
        // 与旧实现一致 —— 缺 handle 不视为错误，前端会继续走 bounds 同步。
        if let Some(handle) = self.try_handle(tab_id)? {
            handle.show()?;
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
        match self.try_handle(tab_id)? {
            Some(handle) => handle.can_go_back(),
            None => Ok(false),
        }
    }

    /// Whether the tab's WebView has a forward history entry to go forward to.
    pub fn can_go_forward_tab(&self, tab_id: &str) -> Result<bool, AppError> {
        match self.try_handle(tab_id)? {
            Some(handle) => handle.can_go_forward(),
            None => Ok(false),
        }
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
            if let Some(handle) = self.try_handle(tab_id)? {
                tracing::info!(tab_id = tab_id, color_scheme, "calling set_color_scheme for tab");
                handle.set_color_scheme(color_scheme)?;
            } else {
                tracing::warn!(tab_id = tab_id, "browser webview not found for set_color_scheme");
            }
        }

        Ok(())
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
    use crate::meta_merge::META_SOURCE_HTTP;
    use crate::site_meta_cache::SiteMetaCacheEntry;

    #[test]
    fn test_webview_label_format() {
        let label = webview_label("test-tab-123");
        assert_eq!(label, "adl-browser-view-test-tab-123");
    }

    #[tokio::test]
    async fn set_site_meta_cache_rebuilds_page_meta_service() {
        // ② set_site_meta_cache 必须同时重建 page_meta_service（旧实现只换 store，
        // service 仍指向旧 store，交换后读不到新数据）。
        let dir_a =
            std::env::temp_dir().join(format!("adl-bwm-set-cache-a-{}", std::process::id()));
        let dir_b =
            std::env::temp_dir().join(format!("adl-bwm-set-cache-b-{}", std::process::id()));
        for d in [&dir_a, &dir_b] {
            let _ = std::fs::remove_dir_all(d);
            std::fs::create_dir_all(d).unwrap();
        }

        let store_a = crate::site_meta_cache::SiteMetaCacheStore::open(&dir_a).unwrap();
        let mut manager = BrowserManager::new(store_a.clone());

        // 新 store（不同目录，含预置元数据）——旧实现只换 store 不重建 service，
        // service 仍指向 store_a，peek 读不到 x.com 条目。
        let store_b = crate::site_meta_cache::SiteMetaCacheStore::open(&dir_b).unwrap();
        let mut map = HashMap::new();
        map.insert(
            "https://x.com/".to_string(),
            SiteMetaCacheEntry {
                title: "NewTitle".into(),
                title_source: META_SOURCE_HTTP.into(),
                favicon_url: String::new(),
                favicon_data_uri: String::new(),
                fetched_at: 0,
                last_ok_at: 0,
                next_retry_at: 0,
                fail_count: 0,
            },
        );
        store_b.upsert(&map).unwrap();

        manager.set_site_meta_cache(store_b);
        manager.page_meta_service().preload().await.unwrap();

        let e = manager.page_meta_service().peek("https://x.com/");
        assert_eq!(e.unwrap().title, "NewTitle");
        let all = manager.site_meta_cache().get_all().unwrap();
        assert_eq!(all.get("https://x.com/").unwrap().title, "NewTitle");
    }
}
