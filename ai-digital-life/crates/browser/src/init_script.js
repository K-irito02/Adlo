(function() {
    // ---- JS-TO-RUST LOGGING via chrome.webview.postMessage ----
    function __adlSendLog(level, msg, data) {
        try {
            if (typeof chrome !== 'undefined' && chrome.webview && chrome.webview.postMessage) {
                chrome.webview.postMessage(JSON.stringify({
                    type: 'dl-log',
                    level: level,
                    msg: msg,
                    data: data || null
                }));
            }
        } catch(e) {}
    }

    // 检查是否是有效的网页 URL
    function isValidWebUrl(href) {
        if (!href || typeof href !== 'string') return false;
        return href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//');
    }

    function isBlobUrl(href) {
        return typeof href === 'string' && href.indexOf('blob:') === 0;
    }

    // Download-URL extensions shared across the stack. Keep in sync with
    // src-tauri/src/commands/browser_webview_setup.rs (Rust is_download_url) and
    // frontend/src/app/utils/downloadUrl.ts (TS isDownloadUrl).
    var DOWNLOAD_EXTENSIONS = /\.(exe|msi|dmg|pkg|deb|rpm|zip|rar|7z|tar|gz|bz2|xz|pdf|apk|ipa|iso|img|cab|msix|appx|bat|cmd|ps1|scr|com|pif|vbs|wsf|hta|doc|docx|xls|xlsx|ppt|pptx|csv|rtf|odt|ods|odp|key|mp3|mp4|avi|mkv|mov|wmv|flv|webm|ogg|wav|flac|aac|wma|ttf|otf|woff|woff2|eot|svg)$/i;

    function isDownloadUrl(url) {
        if (!url || typeof url !== 'string') return false;
        if (isBlobUrl(url)) {
            console.log('[ADL-DL-JS] isDownloadUrl: blob URL detected');
            __adlSendLog('debug', 'isDownloadUrl: blob URL detected', { url: url });
            return true;
        }
        try {
            var u = new URL(url, location.href);
            var path = u.pathname.toLowerCase();
            if (DOWNLOAD_EXTENSIONS.test(path)) {
                console.log('[ADL-DL-JS] isDownloadUrl: extension match:', { url: url, path: path });
                __adlSendLog('debug', 'isDownloadUrl: extension match', { url: url, path: path });
                return true;
            }
            // Aligned with Rust `query_pairs()` (browser_webview_setup.rs) and TS
            // (downloadUrl.ts): `download` must be a standalone query key (case-insensitive),
            // not a substring inside another value.
            var _hasDownloadKey = false;
            u.searchParams.forEach(function(value, key) {
                if (key.toLowerCase() === 'download') _hasDownloadKey = true;
            });
            if (_hasDownloadKey) {
                console.log('[ADL-DL-JS] isDownloadUrl: download query key match:', { url: url });
                __adlSendLog('debug', 'isDownloadUrl: download query key match', { url: url });
                return true;
            }
            if (/\/download\//i.test(u.pathname)) {
                console.log('[ADL-DL-JS] isDownloadUrl: path match:', { url: url });
                __adlSendLog('debug', 'isDownloadUrl: path match', { url: url });
                return true;
            }
            // Additional patterns: common server-side download paths
            if (/\/(files|attachments|get|export|generate)\//i.test(u.pathname)) {
                __adlSendLog('debug', 'isDownloadUrl: additional path pattern match', { url: url });
                return true;
            }
            // Query params indicating download, combined with download-related path keywords
            if (/[?&](file|attachment)=/i.test(u.search) && /(download|files|export)/i.test(u.pathname)) {
                __adlSendLog('debug', 'isDownloadUrl: file/attachment query with download path', { url: url });
                return true;
            }
        } catch(e) {}
        return false;
    }

    // ---- DOWNLOAD INTERCEPTION HELPERS ----
    function getFilenameFromUrl(url) {
        try {
            var u = new URL(url, location.href);
            var seg = u.pathname.split('/').pop();
            if (seg) return decodeURIComponent(seg);
        } catch(e) {}
        return 'download';
    }

    function __adlArrayBufferToBase64(buffer) {
        var bytes = new Uint8Array(buffer);
        var binary = '';
        var chunkSize = 8192;
        for (var i = 0; i < bytes.length; i += chunkSize) {
            var chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
    }

    function __adlSaveBlobDownload(filename, base64Data) {
        try {
            console.log('[ADL-DL-JS] __adlSaveBlobDownload called:', filename);
            __adlSendLog('info', '__adlSaveBlobDownload called', { filename: filename });
            if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
                console.log('[ADL-DL-JS] IPC available, invoking download_save_blob');
                __adlSendLog('info', 'IPC available, invoking download_save_blob', { filename: filename });
                window.__TAURI__.core.invoke('download_save_blob', {
                    fileName: filename,
                    dataBase64: base64Data,
                }).then(function() {
                    console.log('[ADL-DL-JS] download_save_blob succeeded:', filename);
                }).catch(function(e) {
                    console.error('[ADL-DL-JS] download_save_blob failed:', e);
                });
                return true;
            }
        } catch(e) {}
        return false;
    }

    // Central download handler: fetch URL content and save via Tauri IPC
    window.__adlDownloadUrl = function(url, filename) {
        var fn = filename || getFilenameFromUrl(url);
        console.log('[ADL-DL-JS] __adlDownloadUrl called:', { url: url, filename: fn });
        __adlSendLog('info', '__adlDownloadUrl called', { url: url, filename: fn });
        try {
            fetch(url, { credentials: 'include' }).then(function(r) {
                console.log('[ADL-DL-JS] __adlDownloadUrl fetch response:', { url: url, status: r.status, type: r.type });
                __adlSendLog('info', '__adlDownloadUrl fetch response', { url: url, status: r.status, type: r.type });
                return r.arrayBuffer();
            }).then(function(buf) {
                console.log('[ADL-DL-JS] __adlDownloadUrl bytes received:', buf.byteLength);
                __adlSendLog('info', '__adlDownloadUrl bytes received', { url: url, bytes: buf.byteLength });
                var b64 = __adlArrayBufferToBase64(buf);
                __adlSaveBlobDownload(fn, b64);
                if (isBlobUrl(url)) {
                    try { URL.revokeObjectURL(url); } catch(e) {}
                }
            }).catch(function(e) {
                console.error('[ADL-DL-JS] __adlDownloadUrl fetch failed:', { url: url, error: e });
            });
        } catch(e) {
            console.error('[ADL-DL-JS] __adlDownloadUrl error:', { url: url, error: e });
        }
    };

    // ---- FETCH OVERRIDE (REMOVED) ----
    // The previous fetch override cloned XHR responses with a Content-Disposition
    // header and base64-saved them via download_save_blob. That buffered entire
    // files in memory, showed no progress, and silently failed on large files
    // (Chrome/Edge do NOT auto-download XHR attachment responses — the data
    // belongs to the page). All http(s) downloads now flow through WebView2's
    // native DownloadStarting pipeline instead.

    // 处理导航（确保在当前窗口中打开）
    function navigateToUrl(href) {
        if (href.startsWith('//')) {
            window.location.href = 'https:' + href;
        } else {
            window.location.href = href;
        }
    }

    // Route a new-tab request (target="_blank"/"_new" or modified click) through
    // the WebView2 postMessage channel so Rust can emit the open-new-tab event.
    // Returns true when the message was sent; false in non-WebView2 environments
    // (caller then leaves the native default action untouched so the
    // NewWindowRequested handler can fire instead).
    function __adlTryOpenNewTab(href) {
        try {
            if (typeof chrome !== 'undefined' && chrome.webview && chrome.webview.postMessage) {
                chrome.webview.postMessage(JSON.stringify({ type: 'open-new-tab', url: href }));
                return true;
            }
        } catch (e) {}
        return false;
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
    
    // Click interception: intercept download links, route SPA navigation through
    // nav-guard, and leave non-SPA links alone.
    document.addEventListener('click', function(event) {
        var target = event.target;

        while (target) {
            if (target.tagName === 'A' && target.href) {
                var href = target.href;

                // Only intercept blob URLs via JS fetch+IPC (WebView2 can't handle blob: URLs natively).
                if (isBlobUrl(href)) {
                    var logData = {
                        href: href,
                        isBlob: true,
                        hasDownload: target.hasAttribute('download'),
                        isDownloadExt: isDownloadUrl(href),
                        tagName: target.tagName
                    };
                    console.log('[ADL-DL-JS] click intercepted: blob download detected', logData);
                    __adlSendLog('info', 'click intercepted: blob download detected', logData);
                    var fn = target.getAttribute('download') || '';
                    if (!fn) {
                        try {
                            var seg = new URL(href).pathname.split('/').pop();
                            if (seg) fn = decodeURIComponent(seg);
                        } catch(e) {
                            // Non-parseable blob URL — keep empty name, falls back to 'download'.
                            console.log('[ADL-DL-JS] blob URL parse failed, fallback name:', href, e);
                        }
                    }
                    if (!fn) fn = 'download';
                    event.preventDefault();
                    console.log('[ADL-DL-JS] calling __adlDownloadUrl:', href, fn);
                    window.__adlDownloadUrl(href, fn);
                    return;
                }

                // For <a download> / download-ext http(s) links: align with Chrome/Edge.
                // WebView2 may not fire NewWindowRequested for <a target="_blank"> clicks
                // when the default action is suppressed (e.g. by page JS event handlers).
                // For target="_blank" download links, explicitly call origOpen() to trigger
                // NewWindowRequested → new_window_handler → open new tab → native DownloadStarting.
                // For same-tab links (no target="_blank"), let the default action proceed.
                if ((target.hasAttribute('download') || isDownloadUrl(href)) && isValidWebUrl(href)) {
                    var linkTarget = (target.target || target.getAttribute('target') || '').toLowerCase();
                    var logData = {
                        href: href,
                        hasDownload: target.hasAttribute('download'),
                        isDownloadExt: isDownloadUrl(href),
                        target: linkTarget
                    };
                    if (linkTarget === '_blank') {
                        event.preventDefault();
                        __adlSendLog('info', 'download link target="_blank" → explicit origOpen', logData);
                        origOpen.call(window, href, '_blank');
                    } else {
                        __adlSendLog('info', 'click on download link - NOT intercepting (native DownloadStarting)', logData);
                    }
                    return;
                }

                if (isValidWebUrl(href)) {
                    var forcedNewTab = event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1;
                    if (forcedNewTab) {
                        if (__adlTryOpenNewTab(href)) {
                            event.preventDefault();
                        }
                        return;
                    }
                    event.preventDefault();
                    if (window.__startNavGuard) {
                        window.__startNavGuard(href);
                    }
                    return;
                } else {
                    console.log('[ADL-DL-JS] click on <a> but NOT intercepted (invalid URL):', { href: href, tagName: target.tagName, download: target.hasAttribute('download') });
                }
            } else if (target.tagName === 'BUTTON' || target.tagName === 'INPUT') {
                console.log('[ADL-DL-JS] click on non-<a> element:', { tagName: target.tagName, text: target.textContent?.substring(0, 50) });
            }

            if (target.tagName === 'AREA' && target.href) {
                var href = target.href;
                if (isValidWebUrl(href)) {
                    var areaForcedNewTab = event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1;
                    if (areaForcedNewTab) {
                        if (__adlTryOpenNewTab(href)) {
                            event.preventDefault();
                        }
                        return;
                    }
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
    
    // 1. 重写 window.open：统一走原生管线。
    //    http/https 下载 URL 不再走 JS 拦截（__adlDownloadUrl fetch+base64 IPC），
    //    直接 fallthrough 到原生 origOpen → 触发 NewWindowRequested，由 WebView2
    //    原生 DownloadStarting 接管（含实时进度、默认保存路径、下载记录）。
    //    对齐 Chrome/Edge 方案。
    var origOpen = window.open;
    window.open = function(url, name, features) {
        var rawUrl = url;
        // Resolve relative / protocol-relative URLs against the current document,
        // matching Chrome/Edge (they resolve the URL before opening). This is the
        // root cause of "my website's download does nothing": the site calls
        // window.open('/uploads/.../file.exe', '_blank') with a RELATIVE path,
        // which the old gate below rejected as invalid -> returned null, no download.
        var resolvedUrl = rawUrl;
        if (typeof rawUrl === 'string' && rawUrl) {
            try {
                var parsed = new URL(rawUrl, location.href);
                // Only adopt resolved http(s); keep non-navigable schemes
                // (javascript:, data:, mailto:, ...) untouched so they still return null.
                if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                    resolvedUrl = parsed.href;
                }
            } catch (e) {
                // Invalid/throwaway URL — keep the original value (falls through to null).
                console.log('[ADL-DL-JS] window.open URL parse failed:', rawUrl, e);
                __adlSendLog('debug', 'window.open URL parse failed', { url: rawUrl });
            }
        }
        console.log('[ADL-DL-JS] window.open called:', { url: rawUrl, resolvedUrl: resolvedUrl, name: name });
        __adlSendLog('info', 'window.open called', { url: rawUrl, resolvedUrl: resolvedUrl, name: name });

        if (resolvedUrl && isValidWebUrl(resolvedUrl)) {
            if (isDownloadUrl(resolvedUrl)) {
                // Download URL (incl. the relative-path case above): do NOT open a
                // new window. new_window_handler DENYs new windows for download URLs,
                // and the previous impl proved that cancels the download entirely
                // (no download_started, no record, no file). Instead navigate the
                // CURRENT document to the resolved URL -> WebView2 fires native
                // DownloadStarting (real-time progress + record + default save path),
                // the identical proven path used by <a download> forced to _self.
                console.log('[ADL-DL-JS] window.open: download URL -> same-document native DownloadStarting:', resolvedUrl);
                __adlSendLog('info', 'window.open: download URL routed to same-document native DownloadStarting', { url: resolvedUrl, rawUrl: rawUrl });
                window.location.assign(resolvedUrl);
                return null;
            }
            console.log('[ADL-DL-JS] window.open: non-download URL, delegating to origOpen:', resolvedUrl);
            __adlSendLog('info', 'window.open: non-download URL delegated to origOpen', { url: resolvedUrl });
            return origOpen.call(window, resolvedUrl, name, features);
        }
        console.log('[ADL-DL-JS] window.open: invalid URL, returning null');
        __adlSendLog('info', 'window.open: invalid URL, returning null', { url: rawUrl, resolvedUrl: resolvedUrl });
        return null;
    };
    
    // 2. 重写 location.assign 和 location.replace：统一走原生管线。
    //    http/https 下载 URL 不再走 JS 拦截，直接调原生导航 →
    //    WebView2 原生 DownloadStarting 接管（含实时进度、默认保存路径、下载记录）。
    //    Note: window.location.href assignments by page JS are NOT intercepted here;
    //    they trigger the native navigation_handler which catches all navigations
    const originalAssign = Location.prototype.assign;
    const originalReplace = Location.prototype.replace;

    Location.prototype.assign = function(url) {
        console.log('[ADL-DL-JS] location.assign called:', url);
        __adlSendLog('info', 'location.assign called', { url: url });
        if (url && isValidWebUrl(url)) {
            if (isDownloadUrl(url)) {
                // 统一走原生管线：仅记录，不拦截，交由 WebView2 原生 DownloadStarting 接管
                console.log('[ADL-DL-JS] location.assign: download URL -> native DownloadStarting (no JS interception):', url);
                __adlSendLog('info', 'location.assign: download URL delegated to native DownloadStarting', { url: url });
            }
            originalAssign.call(this, url);
            return;
        }
        return originalAssign.apply(this, arguments);
    };

    Location.prototype.replace = function(url) {
        console.log('[ADL-DL-JS] location.replace called:', url);
        __adlSendLog('info', 'location.replace called', { url: url });
        if (url && isValidWebUrl(url)) {
            if (isDownloadUrl(url)) {
                // 统一走原生管线：仅记录，不拦截，交由 WebView2 原生 DownloadStarting 接管
                console.log('[ADL-DL-JS] location.replace: download URL -> native DownloadStarting (no JS interception):', url);
                __adlSendLog('info', 'location.replace: download URL delegated to native DownloadStarting', { url: url });
            }
            originalReplace.call(this, url);
            return;
        }
        return originalReplace.apply(this, arguments);
    };

    // 3. 拦截 window.location.href 赋值（通过 Object.defineProperty）
    //    注意：直接修改 location.href 无法通过 setter 拦截，但可以拦截通过 Object.defineProperty 定义的 setter
    //    实际上，window.location.href 赋值会触发 navigation，由 WebView2 的 navigation_handler 处理
    //    如果下载 URL 通过 location.href 导航，WebView2 应该会触发 DownloadStarting
    //    但如果不触发，说明下载机制不同

    // 4. 监听表单提交：统一走原生管线。
    //    http/https 下载 URL 的表单提交不再走 JS 拦截（__adlDownloadUrl fetch+base64 IPC），
    //    交原生表单提交 → WebView2 原生 DownloadStarting 接管（含实时进度、默认保存路径、下载记录）。
    //    仅记录日志，不 preventDefault，不触发 JS 下载。对齐 Chrome/Edge 方案。
    document.addEventListener('submit', function(event) {
        var form = event.target;
        var formInfo = {
            action: form.action,
            method: form.method,
            target: form.target
        };
        console.log('[ADL-DL-JS] form submit:', formInfo);
        __adlSendLog('info', 'form submit', formInfo);

        // 表单 action 为下载 URL：交原生 DownloadStarting（不 JS 拦截）。
        // 若 target 非 _self，表单提交会经 new_window_handler 打开新窗口而被 DENY 取消下载，
        // 故对下载表单归一化 target='_self'，确保走同文档原生下载管线。
        if (form.action && isDownloadUrl(form.action)) {
            console.log('[ADL-DL-JS] form submit: action is download URL -> native DownloadStarting (no JS interception):', form.action);
            __adlSendLog('info', 'form submit: action download URL delegated to native', { action: form.action });
            if (form.target && form.target !== '_self') {
                console.log('[ADL-DL-JS] form submit: download form forced in-place (target -> _self):', form.target);
                __adlSendLog('info', 'form submit: download form normalized target', { from: form.target, to: '_self' });
                form.target = '_self';
            }
        }

        // 仅记录表单中隐藏的下载 URL 字段（不拦截，交原生）
        var inputs = form.querySelectorAll('input[type="hidden"], input[name="url"], input[name="download"]');
        for (var i = 0; i < inputs.length; i++) {
            var value = inputs[i].value;
            if (value && isDownloadUrl(value)) {
                console.log('[ADL-DL-JS] form submit: hidden field contains download URL -> native (no JS interception):', value);
                __adlSendLog('info', 'form submit: hidden field download URL delegated to native', { value: value });
            }
        }
    }, true);
    
    // ---- SPA NAVIGATION GUARD ----
    // Wraps the meta IIFE's history patches. When a click is intercepted,
    // __startNavGuard sets a guard. If pushState/replaceState/popstate fires
    // within NAV_GUARD_TIMEOUT_MS, the SPA handled navigation — guard clears
    // and no fallback occurs. Otherwise, the guard falls back to navigateToUrl.
    // This avoids the race condition where a deferred SPA navigation fires
    // AFTER a fixed-delay fallback, causing a double page reload.
    // Isolated in try/catch so an error here cannot abort the outer IIFE and
    // prevent the C1 history wrapper (installed after) from being applied.
    try {
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
    } catch (err) {}

    // ---- REAL-TIME META REPORTING (title + favicon) ----
    // Method 1: WebView2 postMessage (real-time, initiated by page JS)
    // IMPORTANT: this IIFE is isolated in a try/catch. Any error inside (e.g.
    // a page where document.head is not yet available when the init script runs)
    // must NOT abort the outer IIFE — otherwise the C1 history wrapper installed
    // AFTER this block would never be applied, leaving the native history stack
    // full of redundant SPA entries (the multi-click back bug).
    try {
    (function() {
        if (window.top !== window.self) return;
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

        // Extract the *current* page title, preferring a SPA-updated heading over
        // the static document.title. YouTube radio auto-play (watch?v=..&list=RD..
        // &start_radio=1) pins document.title/og:title to the FIRST video while
        // the URL advances through the queue — but the visible h1 (the current
        // video's title) is updated by the SPA. For YouTube watch pages use h1;
        // everywhere else fall back to document.title.
        function getPageTitle() {
            var t = document.title ? document.title.trim() : '';
            try {
                var host = location.hostname;
                var isYouTubeWatch =
                    (host === 'youtube.com' || host.endsWith('.youtube.com')) &&
                    location.pathname.indexOf('/watch') === 0;
                if (isYouTubeWatch) {
                    var h1 = document.querySelector('h1.ytd-watch-metadata, h1.title');
                    if (h1) {
                        var h = (h1.textContent || h1.innerText || '').trim();
                        if (h) return h;
                    }
                }
            } catch (e) {}
            return t;
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
                return false;
            }
        }

        function handleUrlChanged(u) {
            preNavTitle = getPageTitle();
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
            startNavPolling();
        }

        function reportMeta(reason) {
            if (isReporting) return;
            var t = getPageTitle();
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
                var t = getPageTitle();
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
        if (head) {
            headObs.observe(head, { childList: true, subtree: true, attributes: false });
        }

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
    })();
    } catch (err) {}

    // ---- C1: HISTORY URL NORMALIZATION ----
    // Pure helpers (extracted by frontend tests between __ADL_PURE markers).
    // Mirrors the frontend historyDedupKey rules: strip tracking params
    // (vd_source / spm_id_from / trackid / utm_* / gclid / ...), sort the
    // remaining query params, strip the trailing slash. The *compare* key also
    // drops the www hostname prefix; the *returned* URL keeps the page's own
    // origin so it stays pushState-safe (same-origin requirement).
    // __ADL_PURE_START__
    var __adlTrackingParamPattern = /^(vd_source|spm_id_from|trackid|sfrom|ref|referrer|utm_source|utm_medium|utm_campaign|utm_term|utm_content|utm_id|utm_campaign_type|gclid|fbclid|yclid|igshid|igsh)$/i;

    function __adlNormalizeHistoryUrl(rawUrl, baseHref) {
        try {
            var u = new URL(rawUrl, baseHref);
            var sp = u.searchParams;
            var keys = [];
            sp.forEach(function(value, key) { if (keys.indexOf(key) === -1) keys.push(key); });
            // Detect YouTube radio queue (list=RD...) so queue-progress markers
            // (pp/index) can be dropped along with the tracking params.
            var isRadioQueue = false;
            for (var r = 0; r < keys.length; r++) {
                if (keys[r] === 'list' && /^RD/i.test(sp.get('list') || '')) {
                    isRadioQueue = true;
                    break;
                }
            }
            var kept = [];
            for (var i = 0; i < keys.length; i++) {
                var k = keys[i];
                var vals = sp.getAll(k);
                // Strip tracking params plus YouTube radio params (start_radio,
                // auto-generated list=RD... queue, pp/index progress markers) so
                // radio churn does not split a video's native history entry.
                var drop = __adlTrackingParamPattern.test(k) ||
                    k === 'start_radio' ||
                    (k === 'list' && /^RD/i.test(vals[0] || '')) ||
                    (isRadioQueue && (k === 'pp' || k === 'index'));
                if (!drop) {
                    for (var j = 0; j < vals.length; j++) kept.push([k, vals[j]]);
                }
            }
            if (kept.length === 0) {
                u.search = '';
            } else {
                kept.sort(function(a, b) { return a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0); });
                var sp2 = new URLSearchParams();
                for (var m = 0; m < kept.length; m++) sp2.append(kept[m][0], kept[m][1]);
                u.search = sp2.toString();
            }
            if (u.pathname.length > 1 && /\/$/.test(u.pathname)) {
                u.pathname = u.pathname.replace(/\/+$/, '');
            }
            return u.href;
        } catch (e) {
            return null;
        }
    }

    // Compare key: origin (www stripped) + path + sorted non-tracking query +
    // hash. Hash is KEPT so page#a -> page#b stays a distinct history entry.
    function __adlCompareHistoryUrl(rawUrl, baseHref) {
        try {
            var u = new URL(rawUrl, baseHref);
            var host = u.hostname.replace(/^www\./, '');
            u.hostname = host;
            var normalized = __adlNormalizeHistoryUrl(u.href, baseHref);
            if (normalized === null) return null;
            var n = new URL(normalized);
            n.hostname = host;
            return n.href;
        } catch (e) {
            return null;
        }
    }

    function __adlResolveHistoryNavigation(rawUrl, baseHref) {
        var normalized = __adlNormalizeHistoryUrl(rawUrl, baseHref);
        if (normalized === null) {
            return { action: 'push', url: rawUrl };
        }
        var targetKey = __adlCompareHistoryUrl(normalized, baseHref);
        var currentKey = __adlCompareHistoryUrl(baseHref, baseHref);
        if (targetKey !== null && targetKey === currentKey) {
            return { action: 'replace', url: normalized };
        }
        return { action: 'push', url: normalized };
    }
    // __ADL_PURE_END__

    // Outermost pushState/replaceState wrapper (runs after the meta-reporting
    // wrapper): normalize the URL and convert pushState to replaceState when the
    // normalized target equals the current location. This collapses SPA
    // tracking-parameter churn (Bilibili vd_source/spm_id_from/trackid) into a
    // single native history entry, fixing the "two-click back" symptom.
    (function() {
        var origPushState = history.pushState;
        var origReplaceState = history.replaceState;

        history.pushState = function(state, title, url) {
            if (url != null) {
                var resolved = __adlResolveHistoryNavigation(url, location.href);
                if (resolved.action === 'replace') {
                    return origReplaceState.call(this, state, title, resolved.url);
                }
                return origPushState.call(this, state, title, resolved.url);
            }
            return origPushState.apply(this, arguments);
        };
        history.replaceState = function(state, title, url) {
            if (url != null) {
                var resolved = __adlResolveHistoryNavigation(url, location.href);
                return origReplaceState.call(this, state, title, resolved.url);
            }
            return origReplaceState.apply(this, arguments);
        };
    })();
})();
