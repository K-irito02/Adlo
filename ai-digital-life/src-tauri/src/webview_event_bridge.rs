use adl_browser::webview_handle::WebView2EventBridge;
use tauri::{AppHandle, Emitter, Manager};

pub struct TauriWebView2EventBridge {
    app: AppHandle,
}

impl TauriWebView2EventBridge {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl WebView2EventBridge for TauriWebView2EventBridge {
    fn emit_meta_changed(&self, tab_id: &str, title: &str, favicon: &str, url: &str) {
        let _ = self.app.emit(
            "digital-life://browser-meta-changed",
            serde_json::json!({
                "tabId": tab_id,
                "title": title,
                "favicon": favicon,
                "url": url,
            }),
        );
    }

    fn emit_url_changed(&self, tab_id: &str, url: &str) {
        let _ = self.app.emit(
            "digital-life://browser-url-changed",
            serde_json::json!({ "tabId": tab_id, "url": url }),
        );
    }

    fn emit_audio_changed(&self, tab_id: &str, is_playing: bool, is_muted: bool) {
        let _ = self.app.emit(
            "digital-life://browser-audio-changed",
            serde_json::json!({
                "tabId": tab_id,
                "isPlaying": is_playing,
                "isMuted": is_muted,
            }),
        );
    }

    fn emit_open_new_tab(&self, url: &str) {
        let _ =
            self.app.emit("digital-life://browser-open-new-tab", serde_json::json!({ "url": url }));
    }

    fn spawn_spa_fallback(&self, label: &str, _url: &str) {
        let app = self.app.clone();
        let label = label.to_string();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(2000)).await;
            if let Some(wv) = app.get_webview(&label) {
                tracing::info!(label = %label, "[ADL-META-RECV] Method 5 SPA fallback: evaluating title extractor");
                let _ = wv.eval(
                    r#"(function(){
                        function pickContent(sel) {
                            var el = document.querySelector(sel);
                            return el ? (el.getAttribute('content') || '').trim() : '';
                        }
                        // SPA video sites (Douyin/Bilibili/YouTube) keep
                        // document.title/og:title pinned to the first video while
                        // the URL advances via pushState/radio queue. The visible
                        // h1 (current video's title) is SPA-updated and is the
                        // most reliable source — but only on video pages where an
                        // h1 is the video title. Everywhere else (homepage,
                        // search, channel) h1 may be a nav/brand heading, so it
                        // must not outrank the meta tags. Match the domain
                        // exactly (endsWith guards against subdomain/typo
                        // spoofing) AND the video path.
                        var h1 = '';
                        var host = location.hostname;
                        var path = location.pathname;
                        var isVideoPage =
                            (host === 'youtube.com' || host.endsWith('.youtube.com')) &&
                            path.indexOf('/watch') === 0 ||
                            (host === 'bilibili.com' || host.endsWith('.bilibili.com')) &&
                            path.indexOf('/video/') === 0 ||
                            (host === 'douyin.com' || host.endsWith('.douyin.com')) &&
                            path.indexOf('/video/') === 0;
                        if (isVideoPage) {
                            var h1El = document.querySelector('h1.ytd-watch-metadata, h1.title, h1');
                            if (h1El) { h1 = (h1El.textContent || h1El.innerText || '').trim(); }
                        }
                        var og = pickContent('meta[property="og:title"]');
                        var tw = pickContent('meta[name="twitter:title"]');
                        var t = (document.title || '').trim();
                        var best = h1 || og || tw || t;
                        if (best) {
                            try {
                                chrome.webview.postMessage(JSON.stringify({
                                    type: 'meta',
                                    title: best,
                                    favicon: '',
                                    url: location.href
                                }));
                            } catch(e) {}
                        }
                    })()"#,
                );
            }
        });
    }
}
