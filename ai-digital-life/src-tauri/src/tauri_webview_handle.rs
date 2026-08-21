use adl_browser::webview_handle::{Bounds, WebViewHandle};
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

    fn hide(&self) -> Result<(), AppError> {
        self.webview()?.hide().map_err(|e| AppError::Internal(e.to_string()))
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

    fn clear_cookies(&self) -> Result<(), AppError> {
        #[cfg(windows)]
        {
            let wv = self.webview()?;
            let _ = wv.with_webview(move |platform_wv| unsafe {
                let controller = platform_wv.controller();
                if let Ok(core) = controller.CoreWebView2() {
                    adl_browser::clear_cookies(&core);
                }
            });
        }
        #[cfg(not(windows))]
        {
            adl_browser::clear_cookies();
        }
        Ok(())
    }

    fn clear_cache(&self) -> Result<(), AppError> {
        #[cfg(windows)]
        {
            let wv = self.webview()?;
            let _ = wv.with_webview(move |platform_wv| unsafe {
                let controller = platform_wv.controller();
                if let Ok(core) = controller.CoreWebView2() {
                    adl_browser::clear_cache(&core);
                }
            });
        }
        #[cfg(not(windows))]
        {
            adl_browser::clear_cache();
        }
        Ok(())
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
