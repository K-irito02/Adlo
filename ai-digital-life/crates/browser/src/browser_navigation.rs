use adl_errors::AppError;
use tauri::Manager;
use url::Url;

/// 初始化脚本：确保所有链接点击都在当前 WebView 中打开
pub(crate) const INIT_SCRIPT: &str = r#"
(function() {
    console.log('[ADL Browser] Initialization script loaded');
    
    // 安全地阻止默认行为和冒泡
    // 注意：不调用 stopImmediatePropagation，以便页面上的其他 capture 监听器（如分析、SPA 路由）仍可观察到点击事件
    function stopAll(event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    // 检查是否是有效的网页 URL
    function isValidWebUrl(href) {
        if (!href || typeof href !== 'string') return false;
        return href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//');
    }
    
    // 处理导航（确保在当前窗口中打开）
    function navigateToUrl(href) {
        console.log('[ADL Browser] Navigating to:', href);
        if (href.startsWith('//')) {
            window.location.href = 'https:' + href;
        } else {
            window.location.href = href;
        }
    }
    
    // 1. 拦截点击事件（捕获阶段，最高优先级）
    document.addEventListener('click', function(event) {
        let target = event.target;
        
        // 向上遍历查找链接
        while (target) {
            // 检查 a 标签
            if (target.tagName === 'A' && target.href) {
                const href = target.href;
                if (isValidWebUrl(href)) {
                    console.log('[ADL Browser] Link intercepted (click <a>):', href);
                    stopAll(event);
                    navigateToUrl(href);
                    return;
                }
            }
            
            // 检查 area 标签（图片映射）
            if (target.tagName === 'AREA' && target.href) {
                const href = target.href;
                if (isValidWebUrl(href)) {
                    console.log('[ADL Browser] Link intercepted (click <area>):', href);
                    stopAll(event);
                    navigateToUrl(href);
                    return;
                }
            }
            
            // 检查 onclick 属性中是否有跳转代码
            if (target.onclick || (typeof target.getAttribute === 'function' && target.getAttribute('onclick'))) {
                const onclickAttr = target.getAttribute('onclick');
                if (onclickAttr && (onclickAttr.includes('location.href') || onclickAttr.includes('window.open'))) {
                    console.log('[ADL Browser] Potential navigation via onclick detected');
                    // 这里不直接阻止，让 window.open/location.href 的拦截器处理
                }
            }
            
            target = target.parentElement;
        }
    }, true);
    
    // 2. 拦截鼠标按下事件（在点击前拦截）
    document.addEventListener('mousedown', function(event) {
        let target = event.target;
        while (target) {
            if (target.tagName === 'A' && target.href) {
                if (isValidWebUrl(target.href)) {
                    console.log('[ADL Browser] Link detected (mousedown):', target.href);
                }
            }
            target = target.parentElement;
        }
    }, true);
    
    // 3. 拦截键盘事件（Enter/Space 激活链接）
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Enter' || event.key === ' ') {
            let target = event.target;
            while (target) {
                if (target.tagName === 'A' && target.href) {
                    const href = target.href;
                    if (isValidWebUrl(href)) {
                        console.log('[ADL Browser] Link intercepted (keyboard):', href);
                        stopAll(event);
                        navigateToUrl(href);
                        return;
                    }
                }
                target = target.parentElement;
            }
        }
    }, true);
    
    // 4. 重写 window.open（最全面的拦截）
    const originalOpen = window.open;
    window.open = function(url, name, features) {
        console.log('[ADL Browser] window.open intercepted:', url);
        if (url && isValidWebUrl(url)) {
            navigateToUrl(url);
            return null;
        }
        return originalOpen.apply(this, arguments);
    };
    
    // 5. 重写 location.assign 和 location.replace
    // 注意：window.location 是只读属性，无法通过 Proxy 拦截 href 赋值
    // 因此主要依赖 click 事件拦截和 window.open 拦截来处理链接导航
    const originalAssign = Location.prototype.assign;
    const originalReplace = Location.prototype.replace;
    
    Location.prototype.assign = function(url) {
        if (url && isValidWebUrl(url)) {
            console.log('[ADL Browser] location.assign intercepted:', url);
            navigateToUrl(url);
            return;
        }
        return originalAssign.apply(this, arguments);
    };
    
    Location.prototype.replace = function(url) {
        if (url && isValidWebUrl(url)) {
            console.log('[ADL Browser] location.replace intercepted:', url);
            navigateToUrl(url);
            return;
        }
        return originalReplace.apply(this, arguments);
    };
    
    // 7. 拦截表单提交
    document.addEventListener('submit', function(event) {
        console.log('[ADL Browser] Form submit event observed');
        // 表单正常提交通常我们希望保留行为
    }, true);
    
    // 8. 拦截 contextmenu 事件，用于调试
    document.addEventListener('contextmenu', function(event) {
        let target = event.target;
        while (target) {
            if (target.tagName === 'A' && target.href) {
                console.log('[ADL Browser] Right-click on link:', target.href);
            }
            target = target.parentElement;
        }
    }, true);
    
    // 9. 监听 DOM 变化（用于未来扩展，当前链接拦截依赖 document 级事件监听已足够）
    try {
        const observer = new MutationObserver(function(mutations) {
            // 动态添加的链接会被 document 级别的 click 事件监听器自动覆盖
            // 此处仅记录日志用于调试
            mutations.forEach(function(mutation) {
                if (mutation.addedNodes && mutation.addedNodes.length > 0) {
                    console.log('[ADL Browser] DOM changed: added nodes');
                }
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    } catch (e) {
        console.warn('[ADL Browser] MutationObserver not available:', e);
    }
    
    // 10. 为所有现有链接添加调试信息
    try {
        const allLinks = document.querySelectorAll('a, area');
        allLinks.forEach(function(link, index) {
            if (link.href) {
                console.log('[ADL Browser] Link found [' + index + ']:', link.href);
            }
        });
        console.log('[ADL Browser] Total links found:', allLinks.length);
    } catch (e) {
        console.warn('[ADL Browser] Error scanning links:', e);
    }
    
    console.log('[ADL Browser] Initialization complete');

    // ---- FAST TITLE REPORTING (via window.open channel) ----
    // Only report from top-level frame to avoid iframe title pollution
    (function() {
        if (window.top !== window.self) return;
        var lastTitle = '';
        function reportTitle() {
            var t = document.title;
            if (t && t.trim() && t !== lastTitle) {
                lastTitle = t.trim();
                try {
                    window.open('adl-title:' + encodeURIComponent(t.trim()) + '?url=' + encodeURIComponent(location.href), '_blank');
                } catch(e) { /* fail silently */ }
            }
        }
        // Report on DOMContentLoaded (faster than window.onload)
        document.addEventListener('DOMContentLoaded', function() { setTimeout(reportTitle, 100); });
        // Report on load (backup)
        window.addEventListener('load', function() { setTimeout(reportTitle, 50); });
        // Watch for <title> changes (SPA dynamic titles)
        var titleEl = document.querySelector('title');
        if (titleEl) {
            var obs = new MutationObserver(function() { reportTitle(); });
            obs.observe(titleEl, { childList: true, characterData: true, subtree: true });
        }
        // Watch for <title> being added dynamically
        var head = document.head || document.documentElement;
        var headObs = new MutationObserver(function(mutations) {
            for (var i = 0; i < mutations.length; i++) {
                for (var j = 0; j < mutations[i].addedNodes.length; j++) {
                    if (mutations[i].addedNodes[j].nodeName === 'TITLE') {
                        titleEl = mutations[i].addedNodes[j];
                        var obs = new MutationObserver(function() { reportTitle(); });
                        obs.observe(titleEl, { childList: true, characterData: true, subtree: true });
                        reportTitle();
                        return;
                    }
                }
            }
        });
        headObs.observe(head, { childList: true, subtree: true });
    })();
})();
"#;

pub(crate) fn resolve_url(raw: &str) -> Result<Url, AppError> {
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

impl crate::browser_webview::BrowserManager {
    pub fn navigate(&self, app: &tauri::AppHandle, url: &str) -> Result<(), AppError> {
        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        let webview = window
            .get_webview(crate::browser_webview::BROWSER_WEBVIEW_LABEL)
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
            .get_webview(crate::browser_webview::BROWSER_WEBVIEW_LABEL)
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
            .get_webview(crate::browser_webview::BROWSER_WEBVIEW_LABEL)
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
            .get_webview(crate::browser_webview::BROWSER_WEBVIEW_LABEL)
            .ok_or_else(|| AppError::Internal("browser webview not found".into()))?;

        webview
            .eval("location.reload()")
            .map_err(|e| AppError::Internal(format!("reload eval failed: {e}")))?;

        Ok(())
    }
}
