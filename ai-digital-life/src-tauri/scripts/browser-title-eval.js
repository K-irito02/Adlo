(function(){
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
