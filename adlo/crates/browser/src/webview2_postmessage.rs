//! WebView2 chrome.webview.postMessage handler (Method 1).
//!
//! Registers a WebMessageReceived handler on the WebView2 instance,
//! allowing JavaScript to send meta events instantly via
//! `chrome.webview.postMessage(JSON.stringify({type:'meta', ...}))`.
//!
//! Also handles `{type:'open-new-tab', url, referrer}` messages sent by the
//! injected `init_script.js` for target="_blank"/`<area>` links and modified
//! clicks, routing them to the platform event bridge. `window.open` on normal
//! sites goes through the native NewWindowRequested path instead.
//!
//! And `{type:'save-blob', fileName, dataBase64}` messages: the browser tab has
//! no Tauri IPC, so blob payloads are persisted by the host.

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

                        if let Some(failed) = super::save_blob_failure_from_message(&json_str) {
                            bridge_for_handler
                                .save_blob_failed(&tab_id_for_handler, &failed.file_name);
                            return Ok(());
                        }

                        if let Some(blob) = super::save_blob_from_message(&json_str) {
                            bridge_for_handler.save_blob(
                                &tab_id_for_handler,
                                &blob.file_name,
                                &blob.data_base64,
                            );
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

                        if let Some(request) = super::open_new_tab_request_from_message(&json_str) {
                            bridge_for_handler.emit_open_new_tab(
                                &tab_id_for_handler,
                                &request.url,
                                request.referrer.as_deref(),
                            );
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
/// scheme backstop mirroring `open_new_tab_request_from_message`: `url` requires an
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

/// Pure parse of an `{type:'open-new-tab', url, referrer?}` postMessage payload.
pub struct OpenNewTabRequest {
    pub url: String,
    /// Requesting document URL for the `Referer` header; empty/absent when the
    /// link opted out with `rel="noreferrer"` or the payload is malformed.
    pub referrer: Option<String>,
}

/// Parse `{type:'open-new-tab', url, referrer?}`.
///
/// `url` must be http(s) (same backstop as before). `referrer` is optional and
/// only accepted when it is an http(s) URL; other values are dropped before the
/// host builds the `Referer` header.
pub fn open_new_tab_request_from_message(json: &str) -> Option<OpenNewTabRequest> {
    let value: serde_json::Value = serde_json::from_str(json).ok()?;
    if value.get("type").and_then(|t| t.as_str()) != Some("open-new-tab") {
        return None;
    }
    let url = value.get("url").and_then(|v| v.as_str())?;
    let lower = url.to_ascii_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://")) {
        return None;
    }
    let referrer = value
        .get("referrer")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|r| {
            let lower = r.to_ascii_lowercase();
            lower.starts_with("http://") || lower.starts_with("https://")
        })
        .map(str::to_string);
    Some(OpenNewTabRequest { url: url.to_string(), referrer })
}

/// Parsed `{type:'save-blob', fileName, dataBase64}` postMessage.
pub struct SaveBlobRequest {
    pub file_name: String,
    pub data_base64: String,
}

/// Base64 payload ceiling for the postMessage hop: 96 MiB bounds the base64
/// string length (≈72 MiB decoded) before base64 decoding allocates. The 64 MiB
/// raw-byte limit is enforced again on the decoded bytes in `save_blob_download`
/// (the single sink fed by the postMessage bridge).
const SAVE_BLOB_MAX_BASE64_LEN: usize = 96 * 1024 * 1024;
const SAVE_BLOB_MAX_FILE_NAME_LEN: usize = 255;

/// Parsed `{type:'save-blob-failed', fileName}` postMessage (page-side failure:
/// oversize blob or fetch error). No payload is transferred; the host only
/// surfaces the failure with the same `fileName` contract as a save reject.
pub struct SaveBlobFailure {
    pub file_name: String,
}

/// Parse `{type:'save-blob-failed', fileName}` with the same name bound as a
/// real save request.
pub fn save_blob_failure_from_message(json: &str) -> Option<SaveBlobFailure> {
    let value: serde_json::Value = serde_json::from_str(json).ok()?;
    if value.get("type").and_then(|t| t.as_str()) != Some("save-blob-failed") {
        return None;
    }
    let file_name = value.get("fileName").and_then(|v| v.as_str())?.trim();
    if file_name.is_empty() || file_name.chars().count() > SAVE_BLOB_MAX_FILE_NAME_LEN {
        return None;
    }
    Some(SaveBlobFailure { file_name: file_name.to_string() })
}

/// Parse `{type:'save-blob', fileName, dataBase64}`.
///
/// Any site may post this message; the host only accepts a bounded payload and
/// a non-empty name. `save_blob_download` performs filename sanitization and
/// writes into the configured download directory.
pub fn save_blob_from_message(json: &str) -> Option<SaveBlobRequest> {
    parse_save_blob(json, SAVE_BLOB_MAX_BASE64_LEN)
}

fn parse_save_blob(json: &str, max_base64_len: usize) -> Option<SaveBlobRequest> {
    let value: serde_json::Value = match serde_json::from_str(json) {
        Ok(value) => value,
        Err(e) => {
            tracing::debug!("[ADL-DL] save-blob ignored: invalid JSON: {e}");
            return None;
        },
    };
    if value.get("type").and_then(|t| t.as_str()) != Some("save-blob") {
        return None;
    }
    let file_name = match value.get("fileName").and_then(|v| v.as_str()) {
        Some(name) => name.trim(),
        None => {
            tracing::debug!("[ADL-DL] save-blob ignored: missing fileName");
            return None;
        },
    };
    if file_name.is_empty() || file_name.chars().count() > SAVE_BLOB_MAX_FILE_NAME_LEN {
        tracing::debug!(
            chars = file_name.chars().count(),
            max = SAVE_BLOB_MAX_FILE_NAME_LEN,
            "[ADL-DL] save-blob ignored: invalid fileName length"
        );
        return None;
    }
    let data_base64 = match value.get("dataBase64").and_then(|v| v.as_str()) {
        Some(data) => data,
        None => {
            tracing::debug!("[ADL-DL] save-blob ignored: missing dataBase64");
            return None;
        },
    };
    if data_base64.len() > max_base64_len {
        tracing::debug!(
            len = data_base64.len(),
            max = max_base64_len,
            "[ADL-DL] save-blob ignored: invalid data length"
        );
        return None;
    }
    Some(SaveBlobRequest { file_name: file_name.to_string(), data_base64: data_base64.to_string() })
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
        agent_link_from_message, browser_media_state_from_message,
        open_new_tab_request_from_message, save_blob_failure_from_message, save_blob_from_message,
    };

    /// URL-only view of the request parser used by the legacy tests below.
    fn open_new_tab_url_from_message(json: &str) -> Option<String> {
        open_new_tab_request_from_message(json).map(|request| request.url)
    }

    #[test]
    fn blob_bridge_passes_requesting_tab_id_through() {
        // The bridge/spawn path needs WebView2 COM objects, so lock the wiring at
        // source level with whitespace-insensitive call shapes: deleting or
        // reordering the tab id argument (or dropping Some(tab_id) downstream)
        // must fail the gate. Strip the test module first: the needle below also
        // appears in this assertion's own literal.
        let src = include_str!("webview2_postmessage.rs");
        let prod = src.split("#[cfg(test)]").next().unwrap_or(src);
        let compact: String = prod.chars().filter(|c| !c.is_whitespace()).collect();
        assert!(compact.contains(
            "bridge_for_handler.save_blob(&tab_id_for_handler,&blob.file_name,&blob.data_base64"
        ));
        let bridge = include_str!("../../../src-tauri/src/webview_event_bridge.rs");
        let bridge_compact: String = bridge.chars().filter(|c| !c.is_whitespace()).collect();
        assert!(
            bridge_compact
                .contains("save_blob_download(&app,&state,file_name,data_base64,Some(tab_id)")
        );
        // Page-side failure path: dispatch + emit keys are locked too.
        assert!(compact.contains(
            "bridge_for_handler.save_blob_failed(&tab_id_for_handler,&failed.file_name)"
        ));
        assert!(bridge_compact.contains("fnsave_blob_failed(&self,tab_id:&str,file_name:&str){"));
        assert!(bridge_compact.contains("\"fileName\":file_name"));
    }

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
    fn open_new_tab_parses_http_referrer() {
        let json = r#"{"type":"open-new-tab","url":"https://a.com/new","referrer":"https://a.com/list?page=2#x"}"#;
        let request = open_new_tab_request_from_message(json).unwrap();
        assert_eq!(request.url, "https://a.com/new");
        assert_eq!(request.referrer.as_deref(), Some("https://a.com/list?page=2#x"));
    }

    #[test]
    fn open_new_tab_drops_non_http_referrer() {
        let json =
            r#"{"type":"open-new-tab","url":"https://a.com/new","referrer":"javascript:alert(1)"}"#;
        assert_eq!(open_new_tab_request_from_message(json).unwrap().referrer, None);
        let empty = r#"{"type":"open-new-tab","url":"https://a.com/new","referrer":""}"#;
        assert_eq!(open_new_tab_request_from_message(empty).unwrap().referrer, None);
    }

    #[test]
    fn save_blob_parses_bounded_payload() {
        let json = r#"{"type":"save-blob","fileName":"report.csv","dataBase64":"YSxi"}"#;
        let blob = save_blob_from_message(json).unwrap();
        assert_eq!(blob.file_name, "report.csv");
        assert_eq!(blob.data_base64, "YSxi");
    }

    #[test]
    fn save_blob_rejects_wrong_type_and_missing_fields() {
        assert!(
            save_blob_from_message(r#"{"type":"meta","fileName":"a","dataBase64":"YQ=="}"#)
                .is_none()
        );
        assert!(
            save_blob_from_message(r#"{"type":"save-blob","fileName":"","dataBase64":"YQ=="}"#)
                .is_none()
        );
        // Empty data is a legitimate zero-byte blob, not a malformed message.
        assert!(
            save_blob_from_message(r#"{"type":"save-blob","fileName":"a.txt","dataBase64":""}"#)
                .is_some()
        );
        assert!(save_blob_from_message(r#"{"type":"save-blob","fileName":"a.txt"}"#).is_none());
        assert!(save_blob_from_message("not json").is_none());
    }

    #[test]
    fn save_blob_name_limit_counts_characters_not_bytes() {
        let ok = "文".repeat(255);
        let json = format!(r#"{{"type":"save-blob","fileName":"{ok}","dataBase64":"YQ=="}}"#);
        assert!(save_blob_from_message(&json).is_some());

        let too_long = "文".repeat(256);
        let json = format!(r#"{{"type":"save-blob","fileName":"{too_long}","dataBase64":"YQ=="}}"#);
        assert!(save_blob_from_message(&json).is_none());
    }

    #[test]
    fn save_blob_failure_parses_name_and_rejects_bad_payloads() {
        let json = r#"{"type":"save-blob-failed","fileName":"x.bin"}"#;
        assert_eq!(save_blob_failure_from_message(json).unwrap().file_name, "x.bin");
        assert!(
            save_blob_failure_from_message(r#"{"type":"save-blob","fileName":"x.bin"}"#).is_none()
        );
        assert!(save_blob_failure_from_message(r#"{"type":"save-blob-failed"}"#).is_none());
        assert!(save_blob_failure_from_message("not json").is_none());
    }

    #[test]
    fn save_blob_rejects_oversized_name_and_payload() {
        let long_name = "a".repeat(256);
        let json =
            format!(r#"{{"type":"save-blob","fileName":"{long_name}","dataBase64":"YQ=="}}"#);
        assert!(save_blob_from_message(&json).is_none());

        assert!(
            super::parse_save_blob(
                r#"{"type":"save-blob","fileName":"a.txt","dataBase64":"YQ=="}"#,
                3
            )
            .is_none()
        );
        assert!(
            super::parse_save_blob(
                r#"{"type":"save-blob","fileName":"a.txt","dataBase64":"YQ=="}"#,
                4
            )
            .is_some()
        );
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
