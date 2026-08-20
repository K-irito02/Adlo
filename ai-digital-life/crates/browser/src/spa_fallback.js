// SPA title fallback (Method 5): evaluated 2s after a HistoryChanged event.
//
// Chrome/Edge-aligned contract: a title event must be ATOMIC with its URL —
// WebView2 DocumentTitleChanged and the injected init_script already report
// (title, url) captured at the same instant. This fallback exists ONLY to
// rescue SPA video pages (YouTube /watch, bilibili /video, douyin /video)
// where document.title is pinned to the FIRST video while the URL advances —
// there the SPA-updated h1 (the visible heading) is the current page's title.
//
// It therefore emits ONLY an h1-based title, scoped to recognized video
// pages, and ONLY while the page is still the one whose HistoryChanged
// triggered the fallback (atomic URL pairing). It NEVER falls back to
// og:title / twitter:title / document.title: those are set at document load
// and can be pinned to the first video of a queue (YouTube shorts / radio
// autoplay), so pairing them with a newer URL would corrupt history titles —
// Chrome/Edge never re-pair an old title with a newer URL.

// __ADL_FALLBACK_PURE_START__
// Pure helpers (extracted by frontend tests between the markers).
function __adlFallbackNormalizeForCompare(rawUrl) {
    try {
        var u = new URL(rawUrl);
        u.hash = '';
        if (u.pathname.length > 1 && /\/$/.test(u.pathname)) {
            u.pathname = u.pathname.replace(/\/+$/, '');
        }
        return u.href;
    } catch (e) {
        return null;
    }
}

// True only when the live URL still corresponds to the HistoryChanged URL
// that scheduled this fallback (atomic URL pairing: the title read now is
// only meaningful for the page the fallback was scheduled for).
function __adlFallbackSamePage(locHref, triggerUrl) {
    if (!locHref || !triggerUrl) {
        return false;
    }
    var a = __adlFallbackNormalizeForCompare(locHref);
    var b = __adlFallbackNormalizeForCompare(triggerUrl);
    return a !== null && a === b;
}

// Recognized video pages where an h1 is the SPA-updated current title.
function __adlFallbackIsVideoPage(host, path) {
    return ((host === 'youtube.com' || (host && host.endsWith('.youtube.com'))) &&
            path.indexOf('/watch') === 0) ||
        ((host === 'bilibili.com' || (host && host.endsWith('.bilibili.com'))) &&
            path.indexOf('/video/') === 0) ||
        ((host === 'douyin.com' || (host && host.endsWith('.douyin.com'))) &&
            path.indexOf('/video/') === 0);
}
// __ADL_FALLBACK_PURE_END__

(function() {
    try {
        var host = location.hostname;
        var path = location.pathname;
        var triggerUrl = __ADL_TRIGGER_URL__;
        var locHref = location.href;
        var docTitle = (document.title || '').trim();
        var h1Raw = '';
        var best = '';
        var src = '';
        var skipReason = '';

        if (!__adlFallbackSamePage(locHref, triggerUrl)) {
            skipReason = 'url-advanced';
        } else if (__adlFallbackIsVideoPage(host, path)) {
            var h1El = document.querySelector(
                'h1.ytd-watch-metadata, h1.title, h1[class*="title"]'
            );
            h1Raw = h1El ? (h1El.textContent || h1El.innerText || '').trim() : '';
            if (h1Raw) {
                best = h1Raw;
                src = 'h1';
            } else {
                skipReason = 'no-h1';
            }
        } else {
            // Not a video page: no content-backed title available. Deliberately
            // silent — native DocumentTitleChanged / init_script / server fetch
            // cover these; og/tw/document.title may be pinned (contamination).
            skipReason = 'not-video-page';
        }

        // [ADL-DEBUG] temporary diagnostics (removed in Phase 4).
        try {
            chrome.webview.postMessage(JSON.stringify({
                type: 'adl-fallback-diag',
                triggerUrl: triggerUrl,
                locHref: locHref,
                docTitle: docTitle,
                h1: h1Raw,
                best: best,
                src: src,
                skipReason: skipReason
            }));
        } catch (e) {}

        if (best) {
            try {
                chrome.webview.postMessage(JSON.stringify({
                    type: 'meta',
                    title: best,
                    favicon: '',
                    url: locHref
                }));
            } catch (e) {}
        }
    } catch (err) {}
})();
