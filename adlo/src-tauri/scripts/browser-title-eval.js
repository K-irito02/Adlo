(function(){
    // wry's IPC handler parses the source URL of each chrome.webview.postMessage;
    // a file:// document with a non-ASCII path produces an invalid URI (the
    // vendored runtime skips these webview labels, but if that patch is lost the
    // process aborts). Keep title backfill limited to http(s) pages as a second
    // layer (file pages already get native DocumentTitleChanged).
    if (location.protocol !== 'http:' && location.protocol !== 'https:') { return; }
    var attempts = 0;
    function tryReport() {
        var t = document.title;
        if (t && t.trim()) {
            try {
                chrome.webview.postMessage(JSON.stringify({
                    type: 'meta',
                    title: t,
                    favicon: '',
                    url: location.href
                }));
            } catch(e) {
                try { window.open('adl-title:' + encodeURIComponent(t.trim()) + '?url=' + encodeURIComponent(location.href), '_blank'); } catch(e2) {}
            }
            return;
        }
        attempts++;
        if (attempts < 10) { setTimeout(tryReport, 1000); }
    }
    setTimeout(tryReport, 200);
})()
