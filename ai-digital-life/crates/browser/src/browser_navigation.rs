use adl_errors::AppError;
use url::Url;

/// 初始化脚本：确保所有链接点击都在当前 WebView 中打开
pub const INIT_SCRIPT: &str = r#"
(function() {
    console.log('[ADL Browser] Initialization script loaded');

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
    
    // Compare only origin+pathname (ignore query params & hash) to detect SPA pushState
    function isSamePage(url1, url2) {
        try {
            var u1 = new URL(url1);
            var u2 = new URL(url2);
            return u1.origin + u1.pathname.replace(/\/+$/, '') === u2.origin + u2.pathname.replace(/\/+$/, '');
        } catch(e) {
            return url1 === url2;
        }
    }
    
    // Click interception: prevent default <a> navigation, then let SPA handlers
    // observe the event (no stopPropagation). Use event-driven SPA detection:
    // if the SPA calls history.pushState/replaceState or popstate fires within
    // NAV_GUARD_TIMEOUT_MS, we skip the fallback; otherwise, we navigate.
    document.addEventListener('click', function(event) {
        var target = event.target;
        
        while (target) {
            if (target.tagName === 'A' && target.href) {
                var href = target.href;
                if (isValidWebUrl(href)) {
                    console.log('[ADL Browser] Link intercepted (click <a>):', href);
                    event.preventDefault();
                    // Don't stopPropagation — SPA handlers (Vue/React) need the event
                    if (window.__startNavGuard) {
                        window.__startNavGuard(href);
                    }
                    return;
                }
            }
            
            if (target.tagName === 'AREA' && target.href) {
                var href = target.href;
                if (isValidWebUrl(href)) {
                    console.log('[ADL Browser] Link intercepted (click <area>):', href);
                    event.preventDefault();
                    if (window.__startNavGuard) {
                        window.__startNavGuard(href);
                    }
                    return;
                }
            }
            
            target = target.parentElement;
        }
    }, true);
    
    // 1. 重写 window.open（阻止所有弹窗，外部HTTP链接在当前WebView导航）
    window.open = function(url, name, features) {
        if (url && isValidWebUrl(url)) {
            console.log('[ADL Browser] window.open intercepted, navigating in-place:', url);
            navigateToUrl(url);
        }
        return null;
    };
    
    // 2. 重写 location.assign 和 location.replace
    // Note: window.location.href assignments by page JS are NOT intercepted here;
    // they trigger the native navigation_handler which catches all navigations
    const originalAssign = Location.prototype.assign;
    const originalReplace = Location.prototype.replace;

    Location.prototype.assign = function(url) {
        if (url && isValidWebUrl(url)) {
            console.log('[ADL Browser] location.assign intercepted:', url);
            originalAssign.call(this, url);
            return;
        }
        return originalAssign.apply(this, arguments);
    };

    Location.prototype.replace = function(url) {
        if (url && isValidWebUrl(url)) {
            console.log('[ADL Browser] location.replace intercepted:', url);
            originalReplace.call(this, url);
            return;
        }
        return originalReplace.apply(this, arguments);
    };
    
    // 3. 拦截表单提交
    document.addEventListener('submit', function(event) {
        console.log('[ADL Browser] Form submit event observed');
        // 表单正常提交通常我们希望保留行为
    }, true);
    
    // 4. 拦截 contextmenu 事件，用于调试
    document.addEventListener('contextmenu', function(event) {
        let target = event.target;
        while (target) {
            if (target.tagName === 'A' && target.href) {
                console.log('[ADL Browser] Right-click on link:', target.href);
            }
            target = target.parentElement;
        }
    }, true);
    
    // 5. 为所有现有链接添加调试信息
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

    // ---- SPA NAVIGATION GUARD ----
    // Wraps the meta IIFE's history patches. When a click is intercepted,
    // __startNavGuard sets a guard. If pushState/replaceState/popstate fires
    // within NAV_GUARD_TIMEOUT_MS, the SPA handled navigation — guard clears
    // and no fallback occurs. Otherwise, the guard falls back to navigateToUrl.
    // This avoids the race condition where a deferred SPA navigation fires
    // AFTER a fixed-delay fallback, causing a double page reload.
    (function() {
        var NAV_GUARD_TIMEOUT_MS = 200;
        var guardHref = null;
        var guardTimer = null;

        var origPushState = history.pushState;
        var origReplaceState = history.replaceState;

        function clearGuard() {
            if (guardTimer) { clearTimeout(guardTimer); guardTimer = null; }
            guardHref = null;
        }

        history.pushState = function() {
            if (guardHref) clearGuard();
            return origPushState.apply(this, arguments);
        };
        history.replaceState = function() {
            if (guardHref) clearGuard();
            return origReplaceState.apply(this, arguments);
        };
        window.addEventListener('popstate', function() {
            if (guardHref) clearGuard();
        });

        window.__startNavGuard = function(href) {
            clearGuard();
            guardHref = href;

            // Microtask: handles synchronous pushState (99% of SPAs) and all
            // non-SPA pages — near-instant fallback, no perceptible delay.
            Promise.resolve().then(function() {
                if (guardHref === null) return;
                if (guardHref === href && !isSamePage(location.href, href)) {
                    navigateToUrl(href);
                }
                guardHref = null;
                if (guardTimer) { clearTimeout(guardTimer); guardTimer = null; }
            });

            // Backup setTimeout: handles deferred/async pushState (rare
            // edge case, e.g. SPA router with async route resolution).
            guardTimer = setTimeout(function() {
                if (guardHref === href && !isSamePage(location.href, href)) {
                    navigateToUrl(href);
                }
                guardHref = null;
                guardTimer = null;
            }, NAV_GUARD_TIMEOUT_MS);
        };
    })();

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

/// Generate an initialization script with a hardcoded background color based on
/// the color scheme. This avoids relying on `prefers-color-scheme` media query
/// which may return stale values during the `about:blank` phase (before
/// `SetPreferredColorScheme` is applied via Profile API).
///
/// The background color is set via inline style on `document.documentElement`
/// before the page's CSS loads, preventing theme flash.
pub fn init_script_with_background(color_scheme: &str) -> String {
    // Color values must match `theme_to_rgb` in webview2_background.rs
    let bg = match color_scheme {
        "light" => "#f8f8f8",
        _ => "#141414",
    };
    format!(
        "(function() {{ try {{ document.documentElement.style.backgroundColor = '{bg}'; }} catch(e) {{}} }})();\n{INIT_SCRIPT}"
    )
}

pub fn resolve_url(raw: &str) -> Result<Url, AppError> {
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
