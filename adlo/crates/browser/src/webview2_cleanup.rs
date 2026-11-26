/// 判断某个 cookie 的 `Domain` 是否属于给定 host。
///
/// cookie 的 `Domain` 常以 `.` 开头（父域），而 `url::Url::host_str()` 取到的
/// IPv6 值带方括号，匹配前都先归一化。命中父域时，同父域的兄弟子域会共享该
/// cookie —— 这是 cookie 作用域本身决定的，不是本函数额外放宽。
fn domain_matches(host: &str, cookie_domain: &str) -> bool {
    let host = host.trim().trim_start_matches('[').trim_end_matches(']');
    let domain =
        cookie_domain.trim().trim_start_matches('.').trim_start_matches('[').trim_end_matches(']');
    if host.is_empty() || domain.is_empty() {
        return false;
    }
    host == domain || host.ends_with(&format!(".{domain}")) || domain.ends_with(&format!(".{host}"))
}

#[cfg(windows)]
mod imp {
    use adl_errors::AppError;
    use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
    use webview2_com::GetCookiesCompletedHandler;
    use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2, ICoreWebView2_2};
    use windows::core::{HSTRING, Interface, PWSTR};

    use crate::webview_handle::CleanupDone;

    /// 把「同步派发失败」同时回执给等待方并返回给调用方。
    ///
    /// 命令层会在 `done` 上等结果，所以同步失败也必须 send，否则等待方只能
    /// 等超时；返回 `Err` 让调用方走错误路径（两者幂等，先到者生效）。
    fn fail<T>(done: &CleanupDone, message: String) -> Result<T, AppError> {
        let _ = done.send(Err(message.clone()));
        Err(AppError::Internal(message))
    }

    /// 「清除全部 Cookie」：清空全局 Cookie 罐，**完成后重载一次该 WebView**。
    /// 与「清除全部缓存」保持同一交互：清理与重载是一个语义单元，重载挂在完成
    /// 回调里，只作用于本 WebView 对应的标签页。
    pub fn clear_cookies(core: &ICoreWebView2, done: CleanupDone) -> Result<(), AppError> {
        // SAFETY: 只发起一次 CDP 调用；`core` 生命周期由调用方保证，回调只捕获
        // 克隆的 COM 接口与回执通道。
        unsafe {
            let method = HSTRING::from("Network.clearBrowserCookies");
            let params = HSTRING::from("{}");
            let done_for_cb = done.clone();
            let core_for_cb = core.clone();

            let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                move |error_code, result_json| {
                    tracing::info!(
                        ?error_code,
                        result = %result_json,
                        "cdp: Network.clearBrowserCookies completed"
                    );
                    if let Err(e) = error_code {
                        tracing::warn!("cdp: Network.clearBrowserCookies failed: {e}");
                        let _ = done_for_cb.send(Err(format!("Network.clearBrowserCookies: {e}")));
                        return Ok(());
                    }
                    if let Err(e) = crate::webview2_reload::reload_ignoring_cache(&core_for_cb) {
                        tracing::warn!("reload after cookie clear failed: {e}");
                        let _ = done_for_cb
                            .send(Err(format!("cookies cleared but reload failed: {e}")));
                        return Ok(());
                    }
                    let _ = done_for_cb.send(Ok(()));
                    Ok(())
                },
            ));

            match core.CallDevToolsProtocolMethod(&method, &params, Some(&handler)) {
                Ok(_) => {
                    tracing::info!("cdp: Network.clearBrowserCookies called");
                    Ok(())
                },
                Err(e) => {
                    tracing::warn!("cdp: Network.clearBrowserCookies failed: {e}");
                    fail(&done, format!("Network.clearBrowserCookies: {e}"))
                },
            }
        }
    }

    /// 清除某个 host 的所有 cookie（站点级），**完成后重载一次该 WebView**。
    ///
    /// 「清除本站 Cookie」必须与全局清理真的不同：WebView2 的 cookie 罐由同一
    /// profile 的所有标签共享（`Network.clearBrowserCookies` 是全局的），按站点
    /// 清理只能走原生 `CookieManager`。
    ///
    /// 取快照用**空 URI**（WebView2 语义：空 URI 返回全部 cookie）再按域名过滤，
    /// 而不是用 `GetCookies(origin)`：后者只返回「对该 URI 会发送」的 cookie，
    /// `Path=/api` 这类子路径 cookie 取不到，会漏删登录态。
    ///
    /// 站点口径按域名匹配：删除 `example.com` 及其子域 `a.example.com` 的 cookie
    /// （与浏览器「清除该站点数据」一致）。父域 cookie（`Domain=.example.com`）
    /// 被删后，同父域的兄弟子域也会一起失去它——这是 cookie 共享作用域决定的，
    /// 无法只影响单个 host。
    pub fn clear_site_cookies(
        core: &ICoreWebView2,
        host: &str,
        done: CleanupDone,
    ) -> Result<(), AppError> {
        // SAFETY: 只用 WebView2 COM 接口（QueryInterface + CookieManager + 逐条
        // DeleteCookie）；`core` 由调用方保证在 UI 线程存活，回调内不持有任何
        // Rust 引用。
        unsafe {
            // `CookieManager` 挂在 `ICoreWebView2_2` 上，需先 QueryInterface。
            let core2 = match core.cast::<ICoreWebView2_2>() {
                Ok(core2) => core2,
                Err(e) => {
                    tracing::warn!("cookie manager interface unavailable: {e}");
                    return fail(&done, format!("cookie manager interface: {e}"));
                },
            };
            let manager = match core2.CookieManager() {
                Ok(manager) => manager,
                Err(e) => {
                    tracing::warn!("cookie manager unavailable: {e}");
                    return fail(&done, format!("cookie manager: {e}"));
                },
            };
            let manager_for_cb = manager.clone();
            let core_for_cb = core.clone();
            let host_for_cb = host.to_string();
            let done_for_cb = done.clone();
            let handler = GetCookiesCompletedHandler::create(Box::new(
                move |error_code, cookie_list| {
                    if let Err(e) = error_code {
                        tracing::warn!("cookie manager GetCookies failed: {e}");
                        let _ = done_for_cb.send(Err(format!("GetCookies: {e}")));
                        return Ok(());
                    }
                    let Some(list) = cookie_list else {
                        let _ = done_for_cb.send(Err("GetCookies: empty result".into()));
                        return Ok(());
                    };
                    let mut scanned = 0u32;
                    if list.Count(&mut scanned).is_err() {
                        let _ =
                            done_for_cb.send(Err("GetCookies: cookie count unavailable".into()));
                        return Ok(());
                    }
                    let mut matched = 0u32;
                    let mut removed = 0u32;
                    let mut failed = 0u32;
                    for index in 0..scanned {
                        let Ok(cookie) = list.GetValueAtIndex(index) else {
                            continue;
                        };
                        let mut domain_ptr = PWSTR::null();
                        if cookie.Domain(&mut domain_ptr).is_err() {
                            continue;
                        }
                        let Ok(domain) = domain_ptr.to_string() else {
                            continue;
                        };
                        if !crate::webview2_cleanup::domain_matches(&host_for_cb, &domain) {
                            continue;
                        }
                        matched += 1;
                        if manager_for_cb.DeleteCookie(&cookie).is_ok() {
                            removed += 1;
                        } else {
                            failed += 1;
                        }
                    }
                    tracing::info!(removed, matched, scanned, host = %host_for_cb, "site cookies processed");
                    // 删除失败必须回执错误：否则命令层会把部分删除当成完整成功。
                    // `matched == 0` 是“本站没有 cookie”的正常结果，仍按成功处理。
                    if failed > 0 {
                        let message = format!(
                            "{failed} of {matched} cookies for {host_for_cb} could not be deleted"
                        );
                        tracing::warn!(%message);
                        let _ = done_for_cb.send(Err(message));
                        return Ok(());
                    }
                    // 与「清除本站缓存」对齐：清理完成后重载本 WebView，让页面上
                    // 仍持有的登录态/内存态一起失效。只作用于这个标签。
                    if let Err(e) = crate::webview2_reload::reload_ignoring_cache(&core_for_cb) {
                        tracing::warn!("reload after site cookie clear failed: {e}");
                        let _ = done_for_cb
                            .send(Err(format!("site cookies cleared but reload failed: {e}")));
                        return Ok(());
                    }
                    let _ = done_for_cb.send(Ok(()));
                    Ok(())
                },
            ));
            match manager.GetCookies(&HSTRING::from(""), &handler) {
                Ok(_) => {
                    tracing::info!(host, "cookie manager GetCookies called (all cookies)");
                    Ok(())
                },
                Err(e) => {
                    tracing::warn!("cookie manager GetCookies failed: {e}");
                    fail(&done, format!("GetCookies: {e}"))
                },
            }
        }
    }

    /// 「清除全部缓存」：清空全局 HTTP 缓存，**完成后重载一次该 WebView**。
    ///
    /// 重载挂在 CDP 完成回调里，而不是由调用方在命令返回后另发一次：清理与
    /// 重载是同一个语义单元，必须在缓存真的清完之后才重载，否则页面可能从
    /// 尚未清掉的缓存里读回旧资源。重载只作用于本 WebView（用户当前看到的
    /// 那个标签），不触碰其它标签。
    pub fn clear_cache_and_reload(core: &ICoreWebView2, done: CleanupDone) -> Result<(), AppError> {
        // SAFETY: 只发起一次 CDP 调用；`core` 生命周期由调用方保证，回调只捕获
        // 克隆的 COM 接口与回执通道。
        unsafe {
            let method = HSTRING::from("Network.clearBrowserCache");
            let params = HSTRING::from("{}");
            let core_for_cb = core.clone();
            let done_for_cb = done.clone();

            let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                move |error_code, result_json| {
                    tracing::info!(
                        ?error_code,
                        result = %result_json,
                        "cdp: Network.clearBrowserCache completed"
                    );
                    if let Err(e) = error_code {
                        tracing::warn!("cdp: Network.clearBrowserCache failed: {e}");
                        let _ = done_for_cb.send(Err(format!("Network.clearBrowserCache: {e}")));
                        return Ok(());
                    }
                    if let Err(e) = crate::webview2_reload::reload_ignoring_cache(&core_for_cb) {
                        tracing::warn!("reload after cache clear failed: {e}");
                        let _ =
                            done_for_cb.send(Err(format!("cache cleared but reload failed: {e}")));
                        return Ok(());
                    }
                    let _ = done_for_cb.send(Ok(()));
                    Ok(())
                },
            ));

            match core.CallDevToolsProtocolMethod(&method, &params, Some(&handler)) {
                Ok(_) => {
                    tracing::info!("cdp: Network.clearBrowserCache called");
                    Ok(())
                },
                Err(e) => {
                    tracing::warn!("cdp: Network.clearBrowserCache failed: {e}");
                    fail(&done, format!("Network.clearBrowserCache: {e}"))
                },
            }
        }
    }

    /// 「清除本站缓存」：清掉该 origin 的站点数据（离线包 / Service Worker /
    /// 本地库 / 草稿），**不含 Cookie**，完成后重载一次该 WebView。
    ///
    /// `storageTypes` 显式排除 `cookies`，但**包含** `local_storage` / `indexeddb`
    /// / `service_workers` —— 现代站点常把会话 token 放在这些域里，因此清完之后
    /// 部分站点仍可能要求重新登录，不能对外承诺「不影响登录」。HTTP 缓存不在此列：
    /// CDP 没有按 origin 清 HTTP 缓存的能力（storage type 枚举里就没有）。
    pub fn clear_site_data_and_reload(
        core: &ICoreWebView2,
        origin: &str,
        done: CleanupDone,
    ) -> Result<(), AppError> {
        const SITE_STORAGE_TYPES: &str = "cache_storage,service_workers,indexeddb,local_storage,file_systems,websql,shader_cache";
        // SAFETY: 只发起一次 CDP 调用；`core` 生命周期由调用方保证，回调只捕获克隆的
        // COM 接口、自有字符串与回执通道。
        unsafe {
            let params = serde_json::json!({
                "origin": origin,
                "storageTypes": SITE_STORAGE_TYPES,
            })
            .to_string();
            let method = HSTRING::from("Storage.clearDataForOrigin");
            let params = HSTRING::from(params);
            let core_for_cb = core.clone();
            let origin_for_cb = origin.to_string();
            let done_for_cb = done.clone();

            let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                move |error_code, result_json| {
                    tracing::info!(
                        ?error_code,
                        result = %result_json,
                        origin = %origin_for_cb,
                        "cdp: Storage.clearDataForOrigin completed"
                    );
                    if let Err(e) = error_code {
                        tracing::warn!("cdp: Storage.clearDataForOrigin failed: {e}");
                        let _ = done_for_cb.send(Err(format!("Storage.clearDataForOrigin: {e}")));
                        return Ok(());
                    }
                    if let Err(e) = crate::webview2_reload::reload_ignoring_cache(&core_for_cb) {
                        tracing::warn!("reload after cache clear failed: {e}");
                        let _ =
                            done_for_cb.send(Err(format!("cache cleared but reload failed: {e}")));
                        return Ok(());
                    }
                    let _ = done_for_cb.send(Ok(()));
                    Ok(())
                },
            ));

            match core.CallDevToolsProtocolMethod(&method, &params, Some(&handler)) {
                Ok(_) => {
                    tracing::info!(origin, "cdp: Storage.clearDataForOrigin called");
                    Ok(())
                },
                Err(e) => {
                    tracing::warn!("cdp: Storage.clearDataForOrigin failed: {e}");
                    fail(&done, format!("Storage.clearDataForOrigin: {e}"))
                },
            }
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use adl_errors::AppError;

    /// 非 Windows 没有 WebView2 cookie 罐 / 站点数据域 / HTTP 缓存接口：
    /// 四处入口都返回 `Err`，让上层把「不支持」告诉用户，而不是静默成功。
    fn unsupported(op: &str) -> AppError {
        AppError::InvalidInput(format!("{op}: only supported on the WebView2 (Windows) backend"))
    }

    pub fn clear_cookies() -> Result<(), AppError> {
        Err(unsupported("clear_cookies"))
    }

    pub fn clear_site_cookies() -> Result<(), AppError> {
        Err(unsupported("clear_site_cookies"))
    }

    pub fn clear_cache_and_reload() -> Result<(), AppError> {
        Err(unsupported("clear_cache_and_reload"))
    }

    pub fn clear_site_data_and_reload() -> Result<(), AppError> {
        Err(unsupported("clear_site_data_and_reload"))
    }
}

pub use imp::{
    clear_cache_and_reload, clear_cookies, clear_site_cookies, clear_site_data_and_reload,
};

#[cfg(test)]
mod tests {
    use super::domain_matches;

    #[test]
    fn domain_matches_handles_parent_domain_and_ipv6() {
        assert!(domain_matches("example.com", "example.com"));
        assert!(domain_matches("www.example.com", ".example.com"));
        assert!(domain_matches("a.example.com", "example.com"));
        assert!(domain_matches("[::1]", "::1"));
        assert!(!domain_matches("notexample.com", "example.com"));
        assert!(!domain_matches("", "example.com"));
        assert!(!domain_matches("example.com", ""));
    }
}
