use adl_errors::AppError;
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
    
    // 4. 重写 window.open（阻止所有弹窗，外部HTTP链接在当前WebView导航）
    window.open = function(url, name, features) {
        if (url && isValidWebUrl(url)) {
            console.log('[ADL Browser] window.open intercepted, navigating in-place:', url);
            navigateToUrl(url);
        }
        return null;
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
    
    // 9. 为所有现有链接添加调试信息
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

    // ---- REAL-TIME META REPORTING (title + favicon) ----
    // Method 1: WebView2 postMessage (real-time, initiated by page JS)
    // Method 2: Rust-side active fetch via __adlGetMeta (polling-based, reliable fallback)
    (function() {
        if (window.top !== window.self) return;
        var LOG_PREFIX = '[ADL-META]';
        var lastTitle = '';
        var lastFavicon = '';
        var lastUrl = '';
        var preNavTitle = '';
        var isReporting = false;
        var hasTitle = false;
        var hasFavicon = false;
        var hasPostMessage = !!(typeof chrome !== 'undefined' && chrome.webview);
        var postMessageWorks = hasPostMessage;
        var navPollTimer = null;
        var navPollCount = 0;
        var NAV_POLL_MAX = 30;
        var NAV_POLL_INTERVAL = 100;

        console.log(LOG_PREFIX, '=== Meta reporting initialized ===');
        console.log(LOG_PREFIX, 'Method 1 (postMessage):', hasPostMessage ? 'AVAILABLE' : 'NOT AVAILABLE');
        console.log(LOG_PREFIX, 'Method 2 (Rust active fetch via __adlGetMeta): available');

        function getFavicon() {
            var best = '';
            var bestSize = 0;
            var links = document.querySelectorAll('link[rel*="icon"]');
            for (var i = 0; i < links.length; i++) {
                var link = links[i];
                if (!link.href) continue;
                var rel = (link.getAttribute('rel') || '').toLowerCase();
                if (rel.indexOf('icon') === -1) continue;
                var sizes = link.getAttribute('sizes');
                var size = 0;
                if (sizes) {
                    var match = sizes.match(/(\d+)x\d+/i);
                    if (match) size = parseInt(match[1], 10) || 0;
                }
                if (!best || size > bestSize) {
                    best = link.href;
                    bestSize = size;
                }
            }
            if (!best) {
                var shortcut = document.querySelector('link[rel="shortcut icon"]');
                if (shortcut && shortcut.href) best = shortcut.href;
            }
            return best;
        }

        function getHostname() {
            try {
                return location.hostname;
            } catch(e) {
                return '';
            }
        }

        function isTitleMeaningful(t) {
            if (!t) return false;
            if (t === location.href) return false;
            return true;
        }

        function isNewTitleForPage(t) {
            if (!t || !isTitleMeaningful(t)) return false;
            if (hasTitle) return t !== lastTitle;
            return t !== preNavTitle;
        }

        function isNewFaviconForPage(f) {
            if (!f) return false;
            if (hasFavicon) return f !== lastFavicon;
            return true;
        }

        function sendViaPostMessage(t, f, u) {
            if (!hasPostMessage) return false;
            try {
                chrome.webview.postMessage(JSON.stringify({
                    type: 'meta',
                    title: t,
                    favicon: f,
                    url: u
                }));
                postMessageWorks = true;
                return true;
            } catch(e) {
                postMessageWorks = false;
                console.warn(LOG_PREFIX, 'Method 1 (postMessage): FAILED |', e.message);
                return false;
            }
        }

        function handleUrlChanged(u) {
            preNavTitle = document.title ? document.title.trim() : '';
            lastUrl = u;
            lastTitle = '';
            lastFavicon = '';
            hasTitle = false;
            hasFavicon = false;
            var fNow = getFavicon();
            if (fNow) {
                lastFavicon = fNow;
                hasFavicon = true;
            }
            console.log(LOG_PREFIX, '► URL changed → ' + u.substring(0, 80) +
                ' | favicon:' + (fNow ? '✓(immediate)' : '(waiting)') +
                ' | preNavTitle:' + (preNavTitle ? preNavTitle.substring(0, 40) : '(empty)'));
            startNavPolling();
        }

        function reportMeta(reason) {
            if (isReporting) return;
            var t = document.title ? document.title.trim() : '';
            var f = getFavicon();
            var u = location.href.split('#')[0];

            var urlChanged = u !== lastUrl;
            if (urlChanged) {
                handleUrlChanged(u);
            }

            var titleAccepted = false;
            var faviconAccepted = false;

            if (isNewTitleForPage(t)) {
                lastTitle = t;
                hasTitle = true;
                titleAccepted = true;
            }
            if (isNewFaviconForPage(f)) {
                lastFavicon = f;
                hasFavicon = true;
                faviconAccepted = true;
            }

            if (!titleAccepted && !faviconAccepted) {
                return;
            }

            console.log(LOG_PREFIX, '► reportMeta [' + reason + '] title:' +
                (titleAccepted ? t.substring(0, 50) : '(waiting)') +
                ' | favicon:' + (faviconAccepted ? '✓' : (hasFavicon ? '=' : '(waiting)')));

            isReporting = true;
            var sendTitle = hasTitle ? lastTitle : '';
            var sendFavicon = hasFavicon ? lastFavicon : '';

            if (postMessageWorks && (sendTitle || sendFavicon)) {
                sendViaPostMessage(sendTitle, sendFavicon, u);
            }

            setTimeout(function() { isReporting = false; }, 30);

            if (hasTitle && hasFavicon && navPollTimer) {
                stopNavPolling();
            }
        }

        function startNavPolling() {
            stopNavPolling();
            navPollCount = 0;
            function tick() {
                navPollCount++;
                var t = document.title ? document.title.trim() : '';
                var f = getFavicon();
                var u = location.href.split('#')[0];

                if (u !== lastUrl) {
                    handleUrlChanged(u);
                }

                var titleGood = isNewTitleForPage(t);
                var faviconGood = isNewFaviconForPage(f);

                if (titleGood || faviconGood) {
                    reportMeta('nav-poll-' + navPollCount);
                }

                if (hasTitle && hasFavicon) {
                    stopNavPolling();
                    return;
                }

                if (navPollCount < NAV_POLL_MAX) {
                    navPollTimer = setTimeout(tick, NAV_POLL_INTERVAL);
                } else {
                    navPollTimer = null;
                    if (!hasTitle) hasTitle = true;
                    if (!hasFavicon) hasFavicon = true;
                }
            }
            navPollTimer = setTimeout(tick, NAV_POLL_INTERVAL);
        }

        function stopNavPolling() {
            if (navPollTimer) {
                clearTimeout(navPollTimer);
                navPollTimer = null;
            }
        }

        setTimeout(function() { reportMeta('init'); }, 0);

        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(function() { reportMeta('DOMContentLoaded'); }, 10);
        });
        window.addEventListener('load', function() {
            setTimeout(function() { reportMeta('load'); }, 10);
        });

        function observeTitle(el) {
            if (!el) return;
            try {
                var obs = new MutationObserver(function() { reportMeta('title-mutation'); });
                obs.observe(el, { childList: true, characterData: true, subtree: true });
            } catch(e) {}
        }
        observeTitle(document.querySelector('title'));

        var origTitleDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'title') ||
                            Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'title');
        if (origTitleDesc && origTitleDesc.configurable) {
            var titleEl2 = document.querySelector('title');
            Object.defineProperty(document, 'title', {
                get: function() {
                    return titleEl2 ? titleEl2.textContent : '';
                },
                set: function(v) {
                    if (titleEl2) {
                        titleEl2.textContent = v;
                    } else {
                        var t = document.createElement('title');
                        t.textContent = v;
                        document.head.appendChild(t);
                        titleEl2 = t;
                        observeTitle(t);
                    }
                    setTimeout(function() { reportMeta('title-setter'); }, 0);
                },
                configurable: true
            });
        }

        function observeFaviconLink(linkEl) {
            try {
                var favObs = new MutationObserver(function() { reportMeta('favicon-attr'); });
                favObs.observe(linkEl, { attributes: true, attributeFilter: ['href', 'rel', 'sizes'] });
            } catch(e) {}
        }
        var faviconLinks = document.querySelectorAll('link[rel*="icon"]');
        for (var i = 0; i < faviconLinks.length; i++) {
            observeFaviconLink(faviconLinks[i]);
        }

        var head = document.head || document.documentElement;
        var headObs = new MutationObserver(function(mutations) {
            var shouldReport = false;
            for (var i = 0; i < mutations.length; i++) {
                for (var j = 0; j < mutations[i].addedNodes.length; j++) {
                    var node = mutations[i].addedNodes[j];
                    if (node.nodeName === 'TITLE') {
                        observeTitle(node);
                        shouldReport = true;
                    }
                    if (node.nodeName === 'LINK') {
                        var rel = (node.getAttribute('rel') || '').toLowerCase();
                        if (rel.indexOf('icon') !== -1) {
                            observeFaviconLink(node);
                            shouldReport = true;
                        }
                    }
                }
            }
            if (shouldReport) setTimeout(function() { reportMeta('head-change'); }, 10);
        });
        headObs.observe(head, { childList: true, subtree: true, attributes: false });

        var origPushState = history.pushState;
        var origReplaceState = history.replaceState;
        history.pushState = function() {
            var result = origPushState.apply(this, arguments);
            setTimeout(function() { reportMeta('pushState'); }, 0);
            return result;
        };
        history.replaceState = function() {
            var result = origReplaceState.apply(this, arguments);
            setTimeout(function() { reportMeta('replaceState'); }, 0);
            return result;
        };
        window.addEventListener('popstate', function() {
            setTimeout(function() { reportMeta('popstate'); }, 0);
        });

        window.__adlGetMeta = function() {
            var t = document.title ? document.title.trim() : '';

            // Fallback to og:title if document.title is empty or just hostname
            if (!isTitleMeaningful(t)) {
                var ogMeta = document.querySelector('meta[property="og:title"]');
                if (ogMeta && ogMeta.content) {
                    t = ogMeta.content.trim();
                }
            }

            var f = getFavicon();
            var u = location.href.split('#')[0];

            if (u !== lastUrl) {
                return JSON.stringify({ title: '', favicon: f || '', url: u, pending: true });
            }

            var outTitle = '';
            var outFavicon = '';

            // Branch 1: already have a real title, confirm it matches
            if (hasTitle && lastTitle && isTitleMeaningful(t) && t === lastTitle) {
                outTitle = t;
            }
            // Branch 2: don't have a real title yet, and a meaningful one just appeared
            else if (!hasTitle && isTitleMeaningful(t) && t !== preNavTitle) {
                outTitle = t;
                lastTitle = t;
                hasTitle = true;
            }
            // Branch 3: hasTitle was forced true by nav polling timeout but lastTitle is empty,
            // and a meaningful title just appeared — accept it
            else if (hasTitle && !lastTitle && isTitleMeaningful(t) && t !== preNavTitle) {
                outTitle = t;
                lastTitle = t;
            }

            if (hasFavicon && f) {
                outFavicon = f;
                if (f !== lastFavicon) lastFavicon = f;
            } else if (!hasFavicon && f) {
                outFavicon = f;
                lastFavicon = f;
                hasFavicon = true;
            }

            return JSON.stringify({
                title: outTitle,
                favicon: outFavicon,
                url: u
            });
        };
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
