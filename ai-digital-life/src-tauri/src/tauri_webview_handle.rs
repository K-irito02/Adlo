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
}
