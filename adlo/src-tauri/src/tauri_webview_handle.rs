use adl_browser::webview_handle::{Bounds, CleanupDone, WebViewHandle};
use adl_errors::AppError;
use tauri::{AppHandle, Manager, Webview};

pub struct TauriWebViewHandle {
    label: String,
    app: AppHandle,
}

impl TauriWebViewHandle {
    pub fn new(app: AppHandle, label: String) -> Self {
        Self { app, label }
    }

    fn webview(&self) -> Result<Webview, AppError> {
        self.app
            .get_webview(&self.label)
            .ok_or_else(|| AppError::Internal(format!("webview {} not found", self.label)))
    }

    /// 站点口径取自 WebView 当前文档，而不是前端快照：标签页可能已导航，
    /// 用旧 URL 推出 origin 会清错站点。返回 `scheme://host[:port]`（无尾斜杠），
    /// 由调用方按用途补 `/`（CookieManager 要 URI，CDP 要 origin）。
    #[cfg(windows)]
    fn current_origin(webview: &Webview) -> Result<String, AppError> {
        let url = webview.url().map_err(|e| AppError::Internal(e.to_string()))?;
        let origin = url.origin().ascii_serialization();
        if origin == "null" {
            return Err(AppError::InvalidInput("current page has no http(s) origin".into()));
        }
        Ok(origin)
    }

    /// 站点级 Cookie 清理按 **host** 匹配（cookie 的 `Domain` 可以是父域，也可能是
    /// 子域），因此这里只取主机名，由平台层做域名后缀匹配。
    #[cfg(windows)]
    fn current_host(webview: &Webview) -> Result<String, AppError> {
        let url = webview.url().map_err(|e| AppError::Internal(e.to_string()))?;
        match url.host_str() {
            Some(host) if !host.is_empty() => Ok(host.to_string()),
            _ => Err(AppError::InvalidInput("clear_site_cookies: current page has no host".into())),
        }
    }
}

impl WebViewHandle for TauriWebViewHandle {
    fn navigate(&self, url: &str) -> Result<(), AppError> {
        let parsed = url::Url::parse(url).map_err(|e| AppError::Internal(e.to_string()))?;
        let _ = self.webview()?.navigate(parsed);
        Ok(())
    }

    fn close(&self) -> Result<(), AppError> {
        self.webview()?.close().map_err(|e| AppError::Internal(e.to_string()))
    }

    fn set_bounds(&self, bounds: Bounds) -> Result<(), AppError> {
        let rect = tauri::Rect {
            position: tauri::Position::Physical(tauri::PhysicalPosition::new(
                bounds.x as i32,
                bounds.y as i32,
            )),
            size: tauri::Size::Physical(tauri::PhysicalSize::new(
                bounds.width.max(0.0) as u32,
                bounds.height.max(0.0) as u32,
            )),
        };
        self.webview()?.set_bounds(rect).map_err(|e| AppError::Internal(e.to_string()))
    }

    fn eval_js(&self, js: &str) -> Result<String, AppError> {
        self.webview()?.eval(js).map_err(|e| AppError::Internal(e.to_string()))?;
        Ok(String::new())
    }

    fn set_color_scheme(&self, scheme: &str) -> Result<(), AppError> {
        #[cfg(windows)]
        {
            let wv = self.webview()?;
            let scheme_owned = scheme.to_string();
            let _ = wv.with_webview(move |platform_wv| unsafe {
                let controller = platform_wv.controller();

                // Update the default background color to match the new theme.
                let (r, g, b) = adl_browser::theme_to_rgb(&scheme_owned);
                if let Err(e) = adl_browser::set_default_background_color(&controller, r, g, b) {
                    tracing::warn!(error = %e, scheme = %scheme_owned, "set_color_scheme: failed to update default background color");
                }

                // Set the Profile's PreferredColorScheme — WebView2 native API,
                // synchronous, takes effect before any page load.
                if let Ok(core) = controller.CoreWebView2() {
                    adl_browser::webview2_set_profile_color_scheme(&core, &scheme_owned);
                }
            });
        }
        #[cfg(not(windows))]
        {
            let _ = scheme;
        }
        Ok(())
    }

    fn id(&self) -> &str {
        &self.label
    }

    fn show(&self) -> Result<(), AppError> {
        self.webview()?.show().map_err(|e| AppError::Internal(e.to_string()))
    }

    fn set_zoom(&self, factor: f64) -> Result<(), AppError> {
        self.webview()?.set_zoom(factor).map_err(|e| AppError::Internal(e.to_string()))
    }

    fn mute(&self, muted: bool) -> Result<(), AppError> {
        #[cfg(windows)]
        {
            let wv = self.webview()?;
            wv.with_webview(move |platform_wv| unsafe {
                let controller = platform_wv.controller();
                if let Ok(core) = controller.CoreWebView2() {
                    let _ = adl_browser::mute_tab(&core, muted);
                }
            })
            .map_err(|e| AppError::Internal(format!("with_webview failed: {e}")))?;
        }
        #[cfg(not(windows))]
        {
            let _ = adl_browser::mute_tab(muted);
        }
        Ok(())
    }

    fn clear_cookies(&self, done: CleanupDone) -> Result<(), AppError> {
        #[cfg(windows)]
        {
            let wv = self.webview()?;
            // SAFETY: 平台 WebView 句柄由 `with_webview` 在 UI 线程回调中给出，块内只调用
            // WebView2 COM 接口，不跨线程持有原始指针。
            wv.with_webview(move |platform_wv| unsafe {
                let controller = platform_wv.controller();
                match controller.CoreWebView2() {
                    Ok(core) => {
                        if let Err(e) = adl_browser::clear_cookies(&core, done.clone()) {
                            tracing::warn!("clear_cookies dispatch failed: {e}");
                        }
                    },
                    Err(e) => {
                        tracing::warn!("CoreWebView2 unavailable: {e}");
                        let _ = done.send(Err(format!("CoreWebView2: {e}")));
                    },
                }
            })
            .map_err(|e| AppError::Internal(format!("with_webview failed: {e}")))?;
        }
        #[cfg(not(windows))]
        {
            let _ = done;
            adl_browser::clear_cookies()?;
        }
        Ok(())
    }

    fn clear_cache_and_reload(&self, done: CleanupDone) -> Result<(), AppError> {
        #[cfg(windows)]
        {
            let wv = self.webview()?;
            // SAFETY: 同上，块内只调用 WebView2 COM 接口。
            wv.with_webview(move |platform_wv| unsafe {
                let controller = platform_wv.controller();
                match controller.CoreWebView2() {
                    Ok(core) => {
                        if let Err(e) = adl_browser::clear_cache_and_reload(&core, done.clone()) {
                            tracing::warn!("clear_cache_and_reload dispatch failed: {e}");
                        }
                    },
                    Err(e) => {
                        tracing::warn!("CoreWebView2 unavailable: {e}");
                        let _ = done.send(Err(format!("CoreWebView2: {e}")));
                    },
                }
            })
            .map_err(|e| AppError::Internal(format!("with_webview failed: {e}")))?;
        }
        #[cfg(not(windows))]
        {
            let _ = done;
            adl_browser::clear_cache_and_reload()?;
        }
        Ok(())
    }

    fn clear_site_cache(&self, done: CleanupDone) -> Result<(), AppError> {
        #[cfg(windows)]
        {
            let wv = self.webview()?;
            let origin = Self::current_origin(&wv)?;
            // SAFETY: 同上，句柄在 UI 线程回调内有效；`origin` 已是自有字符串。
            wv.with_webview(move |platform_wv| unsafe {
                let controller = platform_wv.controller();
                match controller.CoreWebView2() {
                    Ok(core) => {
                        if let Err(e) =
                            adl_browser::clear_site_data_and_reload(&core, &origin, done.clone())
                        {
                            tracing::warn!("clear_site_data_and_reload dispatch failed: {e}");
                        }
                    },
                    Err(e) => {
                        tracing::warn!("CoreWebView2 unavailable: {e}");
                        let _ = done.send(Err(format!("CoreWebView2: {e}")));
                    },
                }
            })
            .map_err(|e| AppError::Internal(format!("with_webview failed: {e}")))?;
        }
        #[cfg(not(windows))]
        {
            let _ = done;
            adl_browser::clear_site_data_and_reload()?;
        }
        Ok(())
    }

    fn clear_site_cookies(&self, done: CleanupDone) -> Result<(), AppError> {
        #[cfg(windows)]
        {
            let wv = self.webview()?;
            let host = Self::current_host(&wv)?;
            // SAFETY: 同上，句柄在 UI 线程回调内有效；`host` 已是自有字符串。
            wv.with_webview(move |platform_wv| unsafe {
                let controller = platform_wv.controller();
                match controller.CoreWebView2() {
                    Ok(core) => {
                        if let Err(e) = adl_browser::clear_site_cookies(&core, &host, done.clone())
                        {
                            tracing::warn!("clear_site_cookies dispatch failed: {e}");
                        }
                    },
                    Err(e) => {
                        tracing::warn!("CoreWebView2 unavailable: {e}");
                        let _ = done.send(Err(format!("CoreWebView2: {e}")));
                    },
                }
            })
            .map_err(|e| AppError::Internal(format!("with_webview failed: {e}")))?;
        }
        #[cfg(not(windows))]
        {
            let _ = done;
            adl_browser::clear_site_cookies()?;
        }
        Ok(())
    }

    fn hard_reload(&self) -> Result<(), AppError> {
        #[cfg(windows)]
        {
            let wv = self.webview()?;
            // SAFETY: 同上，只发起一次 CDP 调用，不持有原始指针。
            wv.with_webview(move |platform_wv| unsafe {
                let controller = platform_wv.controller();
                match controller.CoreWebView2() {
                    Ok(core) => {
                        if let Err(e) = adl_browser::reload_ignoring_cache(&core) {
                            // 已派发后的失败在 webview2_reload 里退化为普通刷新并记 warn；
                            // 这里只补一条上下文，调用方拿到的仍是“已请求”。
                            tracing::warn!("hard_reload degraded: {e}");
                        }
                    },
                    Err(e) => tracing::warn!("CoreWebView2 unavailable: {e}"),
                }
            })
            .map_err(|e| AppError::Internal(format!("with_webview failed: {e}")))?;
        }
        #[cfg(not(windows))]
        {
            // 非 WebView2 后端没有忽略缓存的刷新接口：退化为普通刷新并记 warn，
            // 不对外宣称“已忽略缓存”。
            tracing::warn!("hard_reload: cache bypass unsupported on this backend; plain reload");
            self.webview()?
                .eval("location.reload()")
                .map_err(|e| AppError::Internal(e.to_string()))?;
        }
        Ok(())
    }

    #[cfg(any(debug_assertions, feature = "devtools"))]
    fn open_devtools(&self) -> Result<(), AppError> {
        self.webview()?.open_devtools();
        Ok(())
    }

    /// 未启用 `devtools` feature 的发布构建：`tauri::Webview::open_devtools`
    /// 在编译期就不存在，这里返回明确错误，由前端提示，而不是静默无反应。
    #[cfg(not(any(debug_assertions, feature = "devtools")))]
    fn open_devtools(&self) -> Result<(), AppError> {
        Err(AppError::InvalidInput("devtools: this build disabled web inspector".into()))
    }

    fn go_back(&self) -> Result<bool, AppError> {
        #[cfg(windows)]
        {
            let wv = self.webview()?;
            let (tx, rx) = std::sync::mpsc::channel::<bool>();
            wv.with_webview(move |platform_wv| unsafe {
                let controller = platform_wv.controller();
                let mut issued = false;
                if let Ok(core) = controller.CoreWebView2() {
                    // ICoreWebView2::GoBack is a no-op when there is no previous
                    // history entry; it still returns Ok, so `issued` reflects
                    // whether the native call was reachable, not whether a
                    // navigation happened.
                    issued = core.GoBack().is_ok();
                    if !issued {
                        tracing::warn!("go_back: native GoBack failed");
                    }
                }
                let _ = tx.send(issued);
            })
            .map_err(|e| AppError::Internal(format!("with_webview failed: {e}")))?;
            Ok(rx.recv_timeout(std::time::Duration::from_millis(1000)).unwrap_or(false))
        }
        #[cfg(not(windows))]
        {
            let _ = self;
            Ok(false)
        }
    }

    fn go_forward(&self) -> Result<bool, AppError> {
        #[cfg(windows)]
        {
            let wv = self.webview()?;
            let (tx, rx) = std::sync::mpsc::channel::<bool>();
            wv.with_webview(move |platform_wv| unsafe {
                let controller = platform_wv.controller();
                let mut issued = false;
                if let Ok(core) = controller.CoreWebView2() {
                    issued = core.GoForward().is_ok();
                    if !issued {
                        tracing::warn!("go_forward: native GoForward failed");
                    }
                }
                let _ = tx.send(issued);
            })
            .map_err(|e| AppError::Internal(format!("with_webview failed: {e}")))?;
            Ok(rx.recv_timeout(std::time::Duration::from_millis(1000)).unwrap_or(false))
        }
        #[cfg(not(windows))]
        {
            let _ = self;
            Ok(false)
        }
    }

    fn can_go_back(&self) -> Result<bool, AppError> {
        #[cfg(windows)]
        {
            let Ok(wv) = self.webview() else {
                // WebView not yet created for this tab — treat as "cannot go
                // back" so the button stays disabled until a later refresh.
                return Ok(false);
            };
            let (tx, rx) = std::sync::mpsc::channel::<bool>();
            wv.with_webview(move |platform_wv| unsafe {
                let controller = platform_wv.controller();
                let mut result = false;
                if let Ok(core) = controller.CoreWebView2() {
                    result = adl_browser::can_go_back_webview2(&core);
                }
                let _ = tx.send(result);
            })
            .map_err(|e| AppError::Internal(format!("with_webview failed: {e}")))?;
            // with_webview dispatches to the main-thread event loop asynchronously,
            // so block until the callback has actually run and produced a result.
            // On timeout fall back to "cannot go back" (conservative) rather than
            // erroring, so the frontend keeps the button disabled instead of
            // flashing between states.
            Ok(rx.recv_timeout(std::time::Duration::from_millis(1000)).unwrap_or(false))
        }
        #[cfg(not(windows))]
        {
            let _ = self;
            Ok(false)
        }
    }

    fn can_go_forward(&self) -> Result<bool, AppError> {
        #[cfg(windows)]
        {
            let Ok(wv) = self.webview() else {
                return Ok(false);
            };
            let (tx, rx) = std::sync::mpsc::channel::<bool>();
            wv.with_webview(move |platform_wv| unsafe {
                let controller = platform_wv.controller();
                let mut result = false;
                if let Ok(core) = controller.CoreWebView2() {
                    result = adl_browser::can_go_forward_webview2(&core);
                }
                let _ = tx.send(result);
            })
            .map_err(|e| AppError::Internal(format!("with_webview failed: {e}")))?;
            Ok(rx.recv_timeout(std::time::Duration::from_millis(1000)).unwrap_or(false))
        }
        #[cfg(not(windows))]
        {
            let _ = self;
            Ok(false)
        }
    }
}
