(function() {
    // 检查是否是有效的网页 URL
    function isValidWebUrl(href) {
        if (!href || typeof href !== 'string') return false;
        return href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//');
    }

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
    
    // Click interception: prevent default <a> navigation, then let SPA handlers
    // observe the event (no stopPropagation). Use event-driven SPA detection:
    // if the SPA calls history.pushState/replaceState or popstate fires within
    // NAV_GUARD_TIMEOUT_MS, we skip the fallback; otherwise, we navigate.
    // Modified clicks (ctrl/meta/shift/middle) are the user's EXPLICIT new-tab
    // intent and are routed to the open-new-tab channel. Plain clicks on
    // in-page links (including target="_blank" links) navigate IN-PLACE in the
    // current tab — single-tab in-page navigation (user decision 2026-08-20),
    // handled by the SPA nav-guard; back/forward stays single-step via the C1
    // pushState normalization + frontend smartGoBack (unchanged).
    document.addEventListener('click', function(event) {
        var target = event.target;
        
        while (target) {
            if (target.tagName === 'A' && target.href) {
                var href = target.href;
                if (isValidWebUrl(href)) {
                    var forcedNewTab = event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1;
                    if (forcedNewTab) {
                        // PostMessage available → Rust opens a new tab. Otherwise
                        // leave the default action so native NewWindowRequested fires.
                        if (__adlTryOpenNewTab(href)) {
                            event.preventDefault();
                        }
                        return;
                    }
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
    
    // 1. 重写 window.open（阻止所有弹窗；http/https 委托原生 NewWindowRequested，
//    由 Rust new_window_handler 发射 open-new-tab 事件；其它 scheme 直接返回 null）
    var origOpen = window.open;
    window.open = function(url, name, features) {
        if (url && isValidWebUrl(url)) {
            return origOpen.call(window, url, name, features);
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
            originalAssign.call(this, url);
            return;
        }
        return originalAssign.apply(this, arguments);
    };

    Location.prototype.replace = function(url) {
        if (url && isValidWebUrl(url)) {
            originalReplace.call(this, url);
            return;
        }
        return originalReplace.apply(this, arguments);
    };
    
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
