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

    fn emit_open_new_tab(&self, tab_id: &str, url: &str, referrer: Option<&str>) {
        let _ = self.app.emit(
            "digital-life://browser-open-new-tab",
            serde_json::json!({ "tabId": tab_id, "url": url, "referrer": referrer }),
        );
    }

    fn save_blob(&self, tab_id: &str, file_name: &str, data_base64: &str) {
        let app = self.app.clone();
        let tab_id = tab_id.to_string();
        let file_name = file_name.to_string();
        let data_base64 = data_base64.to_string();
        tauri::async_runtime::spawn(async move {
            let Some(state) = app.try_state::<crate::state::AppState>() else {
                tracing::warn!("[ADL-DL] save_blob: AppState not found");
                return;
            };
            if let Err(e) = crate::commands::download_commands::save_blob_download(
                &app,
                &state,
                file_name,
                data_base64,
                Some(tab_id),
            )
            .await
            {
                tracing::warn!(error = %e, "[ADL-DL] save_blob failed");
            }
        });
    }

    fn save_blob_failed(&self, tab_id: &str, file_name: &str) {
        let _ = self.app.emit(
            "browser-download-error",
            serde_json::json!({
                "id": "",
                "url": format!("blob://local/{file_name}"),
                "fileName": file_name,
                "reason": "blob download failed in page",
                "canRetry": false,
                "source_tab_id": tab_id,
            }),
        );
    }

    fn emit_agent_link(&self, tab_id: &str, kind: &str, url: &str) {
        let _ = self.app.emit(
            "digital-life://browser-agent-link",
            serde_json::json!({ "tabId": tab_id, "kind": kind, "url": url }),
        );
    }

    fn emit_media_state(
        &self,
        tab_id: &str,
        state: &adl_browser::webview_handle::BrowserMediaState,
    ) {
        // 事项 17 路线 A：标签页的站点媒体快照 → 前端统一定夺归属 → Rust SMTC。
        let _ = self.app.emit(
            "digital-life://browser-media-state",
            serde_json::json!({
                "tabId": tab_id,
                "title": state.title,
                "paused": state.paused,
                "ended": state.ended,
                "position": state.position,
                "duration": state.duration,
            }),
        );
    }

    fn spawn_spa_fallback(&self, label: &str, url: &str) {
        let app = self.app.clone();
        let label = label.to_string();
        let trigger_url = url.to_string();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(2000)).await;
            if let Some(wv) = app.get_webview(&label) {
                // 对齐 Chrome/Edge 语义（详见 crates/browser/src/spa_fallback.js 头部注释）：
                // 仅视频页 h1 内容标题 + 仅限触发页（URL 未前进）+ 永不 og/tw/document.title 兜底。
                let trigger_literal =
                    serde_json::to_string(&trigger_url).unwrap_or_else(|_| String::from("\"\""));
                let script = include_str!("../../crates/browser/src/spa_fallback.js")
                    .replace("__ADL_TRIGGER_URL__", &trigger_literal);
                let _ = wv.eval(&script);
            }
        });
    }
}
