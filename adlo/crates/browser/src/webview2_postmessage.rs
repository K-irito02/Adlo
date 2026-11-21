//! WebView2 chrome.webview.postMessage handler (Method 1).
//!
//! Registers a WebMessageReceived handler on the WebView2 instance,
//! allowing JavaScript to send meta events instantly via
//! `chrome.webview.postMessage(JSON.stringify({type:'meta', ...}))`.
//!
//! Also handles `{type:'open-new-tab', url}` messages sent by the injected
//! `init_script.js` when the page requests a new tab (target="_blank" links
//! and `window.open`), routing them to the platform event bridge.

#[cfg(windows)]
mod imp {
    use std::sync::Arc;
    use std::sync::atomic::Ordering;

    use tracing::{debug, error, warn};
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2_2, ICoreWebView2WebMessageReceivedEventArgs,
    };
    use webview2_com::take_pwstr;
    use windows::core::Interface;

    use crate::WebView2EventBridge;
    use crate::webview2_message::shared::{POSTMESSAGE_RECEIVED_COUNT, should_emit_and_update};

    pub fn setup_webview2_messaging(
        core: &ICoreWebView2,
        tab_id: &str,
        bridge: &Arc<dyn WebView2EventBridge>,
    ) -> Result<(), String> {
        debug!("[ADL-META-RECV] Method 1 (postMessage): setting up handler");
        unsafe {
            let core2: ICoreWebView2_2 = match core.cast() {
                Ok(c) => c,
                Err(e) => {
                    error!(
                        "[ADL-META-RECV] Method 1 (postMessage): FAILED to cast to ICoreWebView2_2: {}",
                        e
                    );
                    return Ok(());
                },
            };

            let bridge_for_handler = bridge.clone();
            let tab_id_for_handler = tab_id.to_string();
            let handler = webview2_com::WebMessageReceivedEventHandler::create(Box::new(
                move |_sender: Option<ICoreWebView2>,
                      args: Option<ICoreWebView2WebMessageReceivedEventArgs>| {
                    let Some(args) = args else {
                        return Ok(());
                    };

                    let mut json = windows::core::PWSTR::null();
                    if let Err(e) = args.TryGetWebMessageAsString(&mut json) {
                        debug!(
                            "[ADL-META-RECV] Method 1 (postMessage): failed to get message: {}",
                            e
                        );
                        return Ok(());
                    }
                    if json.is_null() {
                        return Ok(());
                    }

                    let json_str = take_pwstr(json);
                    if json_str.is_empty() {
                        return Ok(());
                    }

                    if let Ok(meta) = serde_json::from_str::<serde_json::Value>(&json_str) {
                        // Handle download debug logs from init_script.js
                        if meta.get("type").and_then(|t| t.as_str()) == Some("dl-log") {
                            let level =
                                meta.get("level").and_then(|v| v.as_str()).unwrap_or("info");
                            let msg = meta.get("msg").and_then(|v| v.as_str()).unwrap_or("");
                            let data = meta.get("data");
                            match level {
                                "error" => error!("[ADL-DL-JS] {} {:?}", msg, data),
                                "warn" => warn!("[ADL-DL-JS] {} {:?}", msg, data),
                                "debug" => debug!("[ADL-DL-JS] {} {:?}", msg, data),
                                _ => tracing::info!("[ADL-DL-JS] {} {:?}", msg, data),
                            }
                            return Ok(());
                        }

                        if let Some(link) = super::agent_link_from_message(&json_str) {
                            bridge_for_handler.emit_agent_link(
                                &tab_id_for_handler,
                                &link.kind,
                                &link.url,
                            );
                            return Ok(());
                        }

                        if let Some(url) = super::open_new_tab_url_from_message(&json_str) {
                            bridge_for_handler.emit_open_new_tab(&url);
                            return Ok(());
                        }
                        if let Some(state) = super::browser_media_state_from_message(&json_str) {
                            bridge_for_handler.emit_media_state(&tab_id_for_handler, &state);
                            return Ok(());
                        }
                        if meta.get("type").and_then(|t| t.as_str()) == Some("meta") {
                            let title = meta
                                .get("title")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            let favicon = meta
                                .get("favicon")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            let url =
                                meta.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();

                            // Skip stale/duplicate emissions
                            if !should_emit_and_update(&url, &title, &favicon) {
                                debug!(
                                    "[ADL-META-RECV] Method 1 (postMessage): SKIPPED (stale/duplicate) | title: {} | url: {}",
                                    title.chars().take(50).collect::<String>(),
                                    url.chars().take(80).collect::<String>()
                                );
                                return Ok(());
                            }

                            let count =
                                POSTMESSAGE_RECEIVED_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
                            debug!(
                                "[ADL-META-RECV] ◄ Method 1 (postMessage): RECEIVED ✓ (#{}) | title: {} | url: {}",
                                count,
                                title.chars().take(50).collect::<String>(),
                                url.chars().take(80).collect::<String>()
                            );

                            bridge_for_handler.emit_meta_changed(
                                &tab_id_for_handler,
                                &title,
                                &favicon,
                                &url,
                            );
                        }
                    }

                    Ok(())
                },
            ));

            let mut token: i64 = 0;
            match core2.add_WebMessageReceived(&handler, &mut token as *mut _ as *mut _) {
                Ok(_) => {
                    debug!(
                        "[ADL-META-RECV] Method 1 (postMessage): handler REGISTERED ✓ (token={}), REAL-TIME SYNC ENABLED",
                        token
                    );
                },
                Err(e) => {
                    warn!(
                        "[ADL-META-RECV] Method 1 (postMessage): FAILED to register handler: {}, falling back",
                        e
                    );
                },
            }
        }

        Ok(())
    }
}

#[cfg(not(windows))]
mod imp {
    use std::ffi::c_void;
    use std::sync::Arc;
    use tracing::debug;

    use crate::webview_handle::WebView2EventBridge;

    pub fn setup_webview2_messaging(
        _core: &c_void,
        _tab_id: &str,
        _bridge: &Arc<dyn WebView2EventBridge>,
    ) -> Result<(), String> {
        debug!("webview2 messaging not available on this platform (non-Windows), using fallback");
        Ok(())
    }
}

pub use imp::setup_webview2_messaging;

/// Parsed `{type:'adl-agent-link', kind:'url'|'file', url}` postMessage emitted
/// by `init_script.js` when a whitelisted agent-site link is clicked.
pub struct AgentLink {
    pub kind: String,
    pub url: String,
}
/// Whether a `kind:'file'` payload looks like a local file destination:
/// a `file://` URL, a Windows drive path (`C:\` / `C:/`), a POSIX/root-absolute
/// path (leading `/`, but not protocol-relative `//host`), or a UNC path (`\\`).
fn is_file_like_path(url: &str) -> bool {
    if url.to_ascii_lowercase().starts_with("file://") {
        return true;
    }
    if url.starts_with("\\\\") || (url.starts_with('/') && !url.starts_with("//")) {
        return true;
    }
    let bytes = url.as_bytes();
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
}

/// Pure parse of an `{type:'adl-agent-link', kind:'url'|'file', url}` postMessage.
///
/// `kind` only accepts `url`/`file`; `url` must be non-empty **and** pass a
/// scheme backstop mirroring `open_new_tab_url_from_message`: `url` requires an
/// http/https scheme, `file` requires a `file://` prefix or an absolute local
/// path form. The origin whitelist is trusted from the injection side (the
/// injected branch only runs on whitelisted sites), so this is a shape backstop.
pub fn agent_link_from_message(json: &str) -> Option<AgentLink> {
    let value: serde_json::Value = serde_json::from_str(json).ok()?;
    if value.get("type").and_then(|t| t.as_str()) != Some("adl-agent-link") {
        return None;
    }
    let kind = value.get("kind").and_then(|v| v.as_str())?;
    if kind != "url" && kind != "file" {
        return None;
    }
    let url = value.get("url").and_then(|v| v.as_str())?;
    if url.is_empty() {
        return None;
    }
    // kind 已在上方收敛为 url|file，此处 if/else 穷尽，无需兜底分支（R2 清理）。
    let scheme_ok = if kind == "url" {
        let lower = url.to_ascii_lowercase();
        lower.starts_with("http://") || lower.starts_with("https://")
    } else {
        is_file_like_path(url)
    };
    if !scheme_ok {
        return None;
    }
    Some(AgentLink { kind: kind.to_string(), url: url.to_string() })
}

/// Pure parse of an `{type:'open-new-tab', url}` postMessage payload.
///
/// Returns the URL only when the message type matches and the URL uses an
/// http/https scheme. Anything else returns `None` so the message is ignored.
pub fn open_new_tab_url_from_message(json: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(json).ok()?;
    if value.get("type").and_then(|t| t.as_str()) != Some("open-new-tab") {
        return None;
    }
    let url = value.get("url").and_then(|v| v.as_str())?;
    let lower = url.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        Some(url.to_string())
    } else {
        None
    }
}

/// Pure parse of an `{type:'adl-media', ...}` postMessage payload emitted by
/// `init_script.js` (事项 17 路线 A).
///
/// Only the `adl-media` type is accepted; every missing/ill-typed field is
/// normalized (strings → `""`, numbers → `0.0`, `paused` → `true`) so a
/// half-written payload can never flip the system card into a fake "playing"
/// state. Negative/NaN positions are clamped to `0.0`.
pub fn browser_media_state_from_message(
    json: &str,
) -> Option<crate::webview_handle::BrowserMediaState> {
    let value: serde_json::Value = serde_json::from_str(json).ok()?;
    if value.get("type").and_then(|t| t.as_str()) != Some("adl-media") {
        return None;
    }
    let text = |key: &str| value.get(key).and_then(|v| v.as_str()).unwrap_or_default().to_string();
    let seconds = |key: &str| {
        value
            .get(key)
            .and_then(|v| v.as_f64())
            .filter(|v| v.is_finite())
            .map(|v| v.max(0.0))
            .unwrap_or(0.0)
    };
    Some(crate::webview_handle::BrowserMediaState {
        title: text("title"),
        paused: value.get("paused").and_then(|v| v.as_bool()).unwrap_or(true),
        ended: value.get("ended").and_then(|v| v.as_bool()).unwrap_or(false),
        position: seconds("position"),
        duration: seconds("duration"),
    })
}

#[cfg(test)]
mod tests {
    use super::{
        agent_link_from_message, browser_media_state_from_message, open_new_tab_url_from_message,
    };

    #[test]
    fn agent_link_parses_valid_payload() {
        let json = r#"{"type":"adl-agent-link","kind":"url","url":"https://a.com/x"}"#;
        let parsed = agent_link_from_message(json).unwrap();
        assert_eq!(parsed.kind, "url");
        assert_eq!(parsed.url, "https://a.com/x");
    }

    #[test]
    fn agent_link_accepts_file_kind_with_path() {
        let json = r#"{"type":"adl-agent-link","kind":"file","url":"file:///C:/ws/a.md"}"#;
        let parsed = agent_link_from_message(json).unwrap();
        assert_eq!(parsed.kind, "file");
    }

    #[test]
    fn agent_link_rejects_unknown_kind_and_type() {
        assert!(
            agent_link_from_message(r#"{"type":"other","kind":"url","url":"https://a"}"#).is_none()
        );
        assert!(
            agent_link_from_message(r#"{"type":"adl-agent-link","kind":"x","url":"u"}"#).is_none()
        );
    }

    #[test]
    fn agent_link_url_kind_rejects_non_http_scheme() {
        assert!(
            agent_link_from_message(
                r#"{"type":"adl-agent-link","kind":"url","url":"javascript:alert(1)"}"#
            )
            .is_none()
        );
    }

    #[test]
    fn agent_link_file_kind_rejects_non_file_scheme() {
        assert!(
            agent_link_from_message(
                r#"{"type":"adl-agent-link","kind":"file","url":"mailto:a@b"}"#
            )
            .is_none()
        );
    }

    #[test]
    fn agent_link_file_kind_rejects_protocol_relative_url() {
        // `//evil.com/x` 是网络 URL（非本地文件）：Rust 与 init_script.js 的
        // isFileLikeHref 必须同口径拒绝，否则后端会把网络 URL 当文件打开。
        assert!(
            agent_link_from_message(
                r#"{"type":"adl-agent-link","kind":"file","url":"//evil.com/x"}"#
            )
            .is_none()
        );
    }

    #[test]
    fn agent_link_file_kind_still_accepts_root_absolute_path() {
        let parsed = agent_link_from_message(
            r#"{"type":"adl-agent-link","kind":"file","url":"/docs/a.md"}"#,
        )
        .unwrap();
        assert_eq!(parsed.kind, "file");
    }

    #[test]
    fn agent_link_accepts_file_url_and_windows_drive_paths() {
        let file_url = agent_link_from_message(
            r#"{"type":"adl-agent-link","kind":"file","url":"file:///C:/ws/a.md"}"#,
        )
        .unwrap();
        assert_eq!(file_url.kind, "file");

        let drive_back = agent_link_from_message(
            r#"{"type":"adl-agent-link","kind":"file","url":"C:\\ws\\a.md"}"#,
        )
        .unwrap();
        assert_eq!(drive_back.kind, "file");
    }

    #[test]
    fn agent_link_url_kind_accepts_http_and_https() {
        let https =
            agent_link_from_message(r#"{"type":"adl-agent-link","kind":"url","url":"https://x"}"#)
                .unwrap();
        assert_eq!(https.url, "https://x");
        let http =
            agent_link_from_message(r#"{"type":"adl-agent-link","kind":"url","url":"HTTP://x/y"}"#)
                .unwrap();
        assert_eq!(http.url, "HTTP://x/y");
    }

    #[test]
    fn open_new_tab_http_url_returns_some() {
        let json = r#"{"type":"open-new-tab","url":"https://www.bilibili.com/video/BV1eSGP6BEfn"}"#;
        assert_eq!(
            open_new_tab_url_from_message(json),
            Some("https://www.bilibili.com/video/BV1eSGP6BEfn".to_string())
        );
    }

    #[test]
    fn open_new_tab_http_scheme_returns_some() {
        let json = r#"{"type":"open-new-tab","url":"http://example.com/a"}"#;
        assert_eq!(open_new_tab_url_from_message(json), Some("http://example.com/a".to_string()));
    }

    #[test]
    fn open_new_tab_scheme_is_case_insensitive() {
        let json = r#"{"type":"open-new-tab","url":"HTTPS://example.com/a"}"#;
        assert_eq!(open_new_tab_url_from_message(json), Some("HTTPS://example.com/a".to_string()));
    }

    #[test]
    fn open_new_tab_meta_type_returns_none() {
        let json = r#"{"type":"meta","title":"t","url":"https://example.com"}"#;
        assert_eq!(open_new_tab_url_from_message(json), None);
    }

    #[test]
    fn open_new_tab_non_http_url_returns_none() {
        let json = r#"{"type":"open-new-tab","url":"javascript:alert(1)"}"#;
        assert_eq!(open_new_tab_url_from_message(json), None);
    }

    #[test]
    fn open_new_tab_malformed_json_returns_none() {
        assert_eq!(open_new_tab_url_from_message("not json"), None);
    }

    #[test]
    fn open_new_tab_missing_url_returns_none() {
        let json = r#"{"type":"open-new-tab"}"#;
        assert_eq!(open_new_tab_url_from_message(json), None);
    }

    #[test]
    fn media_state_parses_site_metadata_and_progress() {
        let json = r#"{"type":"adl-media","title":"视频标题","paused":false,"ended":false,"position":42.5,"duration":300}"#;
        let state = browser_media_state_from_message(json).unwrap();
        assert_eq!(state.title, "视频标题");
        assert!(!state.paused);
        assert_eq!(state.position, 42.5);
        assert_eq!(state.duration, 300.0);
    }

    #[test]
    fn media_state_ignores_other_message_types() {
        assert!(
            browser_media_state_from_message(
                r#"{"type":"meta","title":"t","url":"https://example.com"}"#
            )
            .is_none()
        );
        assert!(browser_media_state_from_message("not json").is_none());
    }

    #[test]
    fn media_state_defaults_to_paused_and_clamps_bad_numbers() {
        // 半成品载荷：缺 paused 时必须按「暂停」处理，绝不假装正在播放；
        // 负数 / 非法进度归零，避免系统卡片出现负进度。
        let state =
            browser_media_state_from_message(r#"{"type":"adl-media","position":-3}"#).unwrap();
        assert!(state.paused);
        assert_eq!(state.position, 0.0);
        assert_eq!(state.duration, 0.0);
        assert_eq!(state.title, "");
    }
}
