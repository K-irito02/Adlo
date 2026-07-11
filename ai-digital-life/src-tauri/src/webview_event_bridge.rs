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
    fn emit_meta_changed(&self, title: &str, favicon: &str, url: &str) {
        let _ = self.app.emit(
            "digital-life://browser-meta-changed",
            serde_json::json!({
                "title": title,
                "favicon": favicon,
                "url": url,
            }),
        );
    }

    fn emit_url_changed(&self, url: &str) {
        let _ =
            self.app.emit("digital-life://browser-url-changed", serde_json::json!({ "url": url }));
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

    fn spawn_spa_fallback(&self, label: &str, _url: &str) {
        let app = self.app.clone();
        let label = label.to_string();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(2000)).await;
            if let Some(wv) = app.get_webview(&label) {
                let _ = wv.eval(
                    r#"(function(){
                        var t = document.title;
                        if (t && t.trim()) {
                            try {
                                chrome.webview.postMessage(JSON.stringify({
                                    type: 'meta',
                                    title: t,
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
