use adl_browser::webview_handle::{Bounds, WebViewHandle};
use adl_errors::AppError;
use tauri::{AppHandle, Manager, Webview};

/// 读取 COM `IStream` 的全部字节（favicon 图片流）。循环 Read 直至返回 0 字节。
#[cfg(windows)]
fn read_istream_bytes(stream: &windows::Win32::System::Com::IStream) -> std::io::Result<Vec<u8>> {
    let mut out: Vec<u8> = Vec::new();
    let mut buffer = [0u8; 8192];
    loop {
        let mut bytes_read = 0u32;
        let hr = unsafe {
            stream.Read(
                buffer.as_mut_ptr() as *mut core::ffi::c_void,
                buffer.len() as u32,
                Some(&mut bytes_read),
            )
        };
        if hr.is_ok() {
            if bytes_read == 0 {
                break;
            }
            out.extend_from_slice(&buffer[..bytes_read as usize]);
        } else {
            break;
        }
    }
    Ok(out)
}

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

    fn eval_js_with_result(&self, js: &str) -> Result<String, AppError> {
        #[cfg(windows)]
        {
            use webview2_com::ExecuteScriptCompletedHandler;

            let wv = self.webview()?;
            let (tx, rx) = std::sync::mpsc::channel::<String>();
            let js_owned = js.to_string();
            wv.with_webview(move |platform_wv| unsafe {
                use windows::core::Error as WinError;

                let controller = platform_wv.controller();
                let _ = match controller.CoreWebView2() {
                    Ok(core) => ExecuteScriptCompletedHandler::wait_for_async_operation(
                        Box::new(move |handler| {
                            // **必须用 CoTaskMemAlloc 分配持久 COM 内存**：ExecuteScript
                            // 是异步的，WebView2 在方法返回后仍会读取 JS 字符串。用 Rust
                            // 临时 Vec 的 as_ptr() 会在 handler 触发前释放 → 悬垂指针 →
                            // 读取垃圾内存 → ExecuteScript 返回 null/空（已实测探针
                            // `1+1` 返回空）。`CoTaskMemPWSTR` 分配的 CoTaskMem 内存由
                            // WebView2 负责释放，生命周期覆盖整个异步操作。
                            let js_com = webview2_com::CoTaskMemPWSTR::from(js_owned.as_str());
                            core.ExecuteScript(*js_com.as_ref().as_pcwstr(), &handler)
                                .map_err(webview2_com::Error::WindowsError)
                        }),
                        Box::new(
                            move |error_code, result: String| {
                                error_code?;
                                tx.send(result).map_err(|_| {
                                    WinError::from_hresult(
                                        windows::Win32::Foundation::E_POINTER,
                                    )
                                })?;
                                Ok(())
                            },
                        ),
                    ),
                    Err(e) => {
                        tracing::warn!(error = %e, "eval_js_with_result: CoreWebView2() failed");
                        Ok(())
                    },
                };
            })
            .map_err(|e| AppError::Internal(format!("with_webview failed: {e}")))?;
            Ok(rx.recv_timeout(std::time::Duration::from_millis(15000)).unwrap_or_default())
        }
        #[cfg(not(windows))]
        {
            let _ = self;
            let _ = js;
            Ok(String::new())
        }
    }

    fn get_favicon_data(&self) -> Result<Vec<u8>, AppError> {
        #[cfg(windows)]
        {
            use windows::core::Interface as _;

            let wv = self.webview()?;
            let (tx, rx) = std::sync::mpsc::channel::<Vec<u8>>();
            wv.with_webview(move |platform_wv| unsafe {
                use webview2_com::Microsoft::Web::WebView2::Win32::{
                    COREWEBVIEW2_FAVICON_IMAGE_FORMAT_PNG, ICoreWebView2_15,
                };
                use webview2_com::GetFaviconCompletedHandler;
                use windows::core::Error as WinError;

                let controller = platform_wv.controller();
                let _ = match controller.CoreWebView2() {
                    Ok(core) => match core.cast::<ICoreWebView2_15>() {
                        Ok(core15) => GetFaviconCompletedHandler::wait_for_async_operation(
                            Box::new(move |handler| {
                                core15
                                    .GetFavicon(COREWEBVIEW2_FAVICON_IMAGE_FORMAT_PNG, &handler)
                                    .map_err(webview2_com::Error::WindowsError)
                            }),
                            Box::new(
                                move |error_code, stream: Option<windows::Win32::System::Com::IStream>| {
                                    error_code?;
                                    let bytes = stream
                                        .and_then(|s| read_istream_bytes(&s).ok())
                                        .unwrap_or_default();
                                    tx.send(bytes).map_err(|_| {
                                        WinError::from_hresult(
                                            windows::Win32::Foundation::E_POINTER,
                                        )
                                    })?;
                                    Ok(())
                                },
                            ),
                        ),
                        Err(e) => {
                            tracing::warn!(
                                error = %e,
                                "get_favicon_data: ICoreWebView2_15 cast failed"
                            );
                            Ok(())
                        },
                    },
                    Err(e) => {
                        tracing::warn!(error = %e, "get_favicon_data: CoreWebView2() failed");
                        Ok(())
                    },
                };
            })
            .map_err(|e| AppError::Internal(format!("with_webview failed: {e}")))?;
            Ok(rx.recv_timeout(std::time::Duration::from_millis(5000)).unwrap_or_default())
        }
        #[cfg(not(windows))]
        {
            let _ = self;
            Ok(Vec::new())
        }
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
