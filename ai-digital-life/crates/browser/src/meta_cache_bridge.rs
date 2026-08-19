use tracing::debug;

use crate::webview_handle::WebView2EventBridge;
use tokio::sync::mpsc::UnboundedSender;

/// 静默标签页专用事件桥：把 (tab_id, url, title, favicon) 转发到 channel。
/// 消费方为静默 fetch 循环（tokio await 上下文）。不走前端回传。
pub struct CachedMetaBridge {
    tx: Option<UnboundedSender<(String, String, String, String)>>,
}

impl CachedMetaBridge {
    pub fn new(tx: Option<UnboundedSender<(String, String, String, String)>>) -> Self {
        Self { tx }
    }
}

impl WebView2EventBridge for CachedMetaBridge {
    fn emit_meta_changed(&self, tab_id: &str, title: &str, favicon: &str, url: &str) {
        if url.is_empty() || title.is_empty() {
            return;
        }
        debug!(
            url = url.chars().take(80).collect::<String>(),
            title = title.chars().take(50).collect::<String>(),
            favicon = favicon.chars().take(60).collect::<String>(),
            "CachedMetaBridge: forwarding meta to silent fetch loop"
        );
        if let Some(tx) = &self.tx {
            let _ = tx.send((
                tab_id.to_string(),
                url.to_string(),
                title.to_string(),
                favicon.to_string(),
            ));
        }
    }
    fn emit_url_changed(&self, _tab_id: &str, _url: &str) {}
    fn emit_audio_changed(&self, _tab_id: &str, _is_playing: bool, _is_muted: bool) {}
    fn emit_open_new_tab(&self, _url: &str) {}
    fn spawn_spa_fallback(&self, _label: &str, _url: &str) {}
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::mpsc;

    #[tokio::test]
    async fn cached_bridge_forwards_meta_over_channel() {
        let (tx, mut rx) = mpsc::unbounded_channel::<(String, String, String, String)>();
        let bridge = CachedMetaBridge::new(Some(tx));
        bridge.emit_meta_changed("tab-1", "真实标题", "https://a.com/fav.ico", "https://a.com/");
        let got = rx.try_recv().expect("meta should be queued synchronously");
        assert_eq!(got.0, "tab-1");
        assert_eq!(got.1, "https://a.com/");
        assert_eq!(got.2, "真实标题");
        assert_eq!(got.3, "https://a.com/fav.ico");
    }

    #[tokio::test]
    async fn cached_bridge_skips_empty_title_or_url() {
        let (tx, mut rx) = mpsc::unbounded_channel::<(String, String, String, String)>();
        let bridge = CachedMetaBridge::new(Some(tx));
        bridge.emit_meta_changed("tab-1", "", "https://a.com/fav.ico", "https://a.com/");
        assert!(rx.try_recv().is_err());
        bridge.emit_meta_changed("tab-1", "标题", "", "");
        assert!(rx.try_recv().is_err());
    }
}
