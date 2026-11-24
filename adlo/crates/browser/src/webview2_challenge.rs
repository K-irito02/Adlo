//! Diagnostic challenge-page probe (A/B measurement only).
//!
//! This module runs a **read-only** script after each top-level navigation via
//! `ICoreWebView2::ExecuteScript`. It does not inject a persistent content
//! script, does not click, does not reload, and does not try to solve a
//! challenge.
//!
//! The probe exists to measure how often the embedded browser meets a known
//! human-verification page. It is enabled in debug builds, or when
//! `ADL_CHALLENGE_PROBE` is set. Production builds stay silent.
//!
//! Log contract (grep with `[ADL-CHALLENGE]`):
//! - `[ADL-CHALLENGE] detected=true ...` — a known challenge marker was found.
//! - `[ADL-CHALLENGE] detected=false ...` — page loaded without a marker
//!   (the A/B denominator).
//!
//! The logged URL has query and fragment removed. The probe reads
//! `location.href`, `document.title`, and DOM text; it does not read
//! `document.cookie`.

#[cfg(windows)]
mod imp {
    use tracing::{debug, info};
    use webview2_com::ExecuteScriptCompletedHandler;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2NavigationCompletedEventArgs,
    };
    use webview2_com::NavigationCompletedEventHandler;
    use windows::core::{HSTRING, PWSTR};

    /// Read-only DOM probe. It returns a JSON object; it does not mutate the page.
    const PROBE_JS: &str = r#"(() => {
      try {
        const href = location.href;
        const title = document.title || '';
        const text = (document.body && document.body.innerText ? document.body.innerText : '').slice(0, 4000);
        const strongSelectors = [
          '#cf-challenge-running',
          '#cf-please-wait',
          '#turnstile-wrapper',
          '.lds-ring',
          'input[name="cf-turnstile-response"]'
        ];
        const weakSelectors = [
          'iframe[src*="recaptcha"]',
          'iframe[src*="hcaptcha.com"]'
        ];
        const pick = (list) => list.filter((s) => {
          try { return !!document.querySelector(s); } catch (e) { return false; }
        });
        const strong = pick(strongSelectors);
        const weak = pick(weakSelectors);
        const titleHit = /just a moment|checking your browser|verify you are human|attention required/i.test(title);
        const textHit = /unusual traffic|verify you are human|are you a robot|人机验证|请稍候|access denied|checking your browser/i.test(text);
        const urlHit = /\/sorry(\/|$)/i.test(href);
        return { href, title, strong, weak, titleHit, textHit, urlHit };
      } catch (e) {
        return { error: String(e) };
      }
    })()"#;

    /// Strip query and fragment from a URL. Falls back to a simple split.
    pub(super) fn strip_query(url: &str) -> String {
        match url::Url::parse(url) {
            Ok(mut parsed) => {
                parsed.set_query(None);
                parsed.set_fragment(None);
                parsed.to_string()
            },
            Err(_) => url.split(['?', '#']).next().unwrap_or(url).to_string(),
        }
    }

    pub fn setup_challenge_probe_handler(
        core: &ICoreWebView2,
        tab_id: &str,
        host: &str,
        label: &str,
    ) -> Result<(), String> {
        let enabled = cfg!(debug_assertions) || std::env::var_os("ADL_CHALLENGE_PROBE").is_some();
        if !enabled {
            return Ok(());
        }

        let tab_id = tab_id.to_string();
        let host = host.to_string();
        let label = label.to_string();
        let tab_id_log = tab_id.clone();
        let host_log = host.clone();

        let handler = NavigationCompletedEventHandler::create(Box::new(
            move |sender: Option<ICoreWebView2>,
                  _args: Option<ICoreWebView2NavigationCompletedEventArgs>| {
                let Some(sender) = sender else {
                    return Ok(());
                };

                let mut url_pwstr = PWSTR::null();
                let url =
                    if unsafe { sender.Source(&mut url_pwstr) }.is_ok() && !url_pwstr.is_null() {
                        webview2_com::take_pwstr(url_pwstr)
                    } else {
                        String::new()
                    };
                if !(url.starts_with("http://") || url.starts_with("https://")) {
                    return Ok(());
                }
                let page_url = strip_query(&url);

                let tab_id_inner = tab_id.clone();
                let host_inner = host.clone();
                let label_inner = label.clone();
                let script = HSTRING::from(PROBE_JS);
                unsafe {
                    let _ = sender.ExecuteScript(
                        &script,
                        &ExecuteScriptCompletedHandler::create(Box::new(move |hr, result| {
                            if hr.is_err() {
                                debug!(
                                    tab_id = %tab_id_inner,
                                    host = %host_inner,
                                    url = %page_url,
                                    "[ADL-CHALLENGE] probe-failed"
                                );
                                return Ok(());
                            }
                            let value: serde_json::Value =
                                serde_json::from_str(&result).unwrap_or(serde_json::Value::Null);
                            let title = value
                                .get("title")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .chars()
                                .take(120)
                                .collect::<String>();
                            let strong = value
                                .get("strong")
                                .and_then(|v| v.as_array())
                                .map(|items| {
                                    items
                                        .iter()
                                        .filter_map(|item| item.as_str())
                                        .collect::<Vec<_>>()
                                })
                                .unwrap_or_default();
                            let weak = value
                                .get("weak")
                                .and_then(|v| v.as_array())
                                .map(|items| items.len())
                                .unwrap_or(0);
                            let title_hit =
                                value.get("titleHit").and_then(|v| v.as_bool()).unwrap_or(false);
                            let text_hit =
                                value.get("textHit").and_then(|v| v.as_bool()).unwrap_or(false);
                            let url_hit =
                                value.get("urlHit").and_then(|v| v.as_bool()).unwrap_or(false);
                            let error = value.get("error").and_then(|v| v.as_str()).unwrap_or("");
                            let detected = url_hit || text_hit || title_hit || !strong.is_empty();
                            let rule = strong.join(",");
                            let title_len = title.chars().count();

                            // One line per top-level page load: challenge pages at INFO,
                            // clean pages at INFO too, so the A/B denominator is visible.
                            // The raw title is logged only for challenge pages: a clean
                            // search result title contains the query, which must not be
                            // written to logs.
                            if detected {
                                info!(
                                    tab_id = %tab_id_inner,
                                    host = %host_inner,
                                    label = %label_inner,
                                    detected,
                                    rule = %rule,
                                    weak,
                                    text_hit,
                                    title_hit,
                                    url_hit,
                                    title = %title,
                                    title_len,
                                    url = %page_url,
                                    error = %error,
                                    "[ADL-CHALLENGE]"
                                );
                            } else {
                                info!(
                                    tab_id = %tab_id_inner,
                                    host = %host_inner,
                                    label = %label_inner,
                                    detected,
                                    rule = %rule,
                                    weak,
                                    text_hit,
                                    title_hit,
                                    url_hit,
                                    title_len,
                                    url = %page_url,
                                    error = %error,
                                    "[ADL-CHALLENGE]"
                                );
                            }
                            Ok(())
                        })),
                    );
                }
                Ok(())
            },
        ));

        let mut token: i64 = 0;
        unsafe {
            core.add_NavigationCompleted(&handler, &mut token as *mut _ as *mut _)
                .map_err(|e| e.to_string())?;
        }
        debug!(tab_id = %tab_id_log, host = %host_log, token, "challenge probe handler registered");
        Ok(())
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn setup_challenge_probe_handler(
        _core: *mut std::ffi::c_void,
        _tab_id: &str,
        _host: &str,
        _label: &str,
    ) -> Result<(), String> {
        Ok(())
    }
}

pub use imp::setup_challenge_probe_handler;

#[cfg(all(test, windows))]
mod tests {
    use super::imp::strip_query;

    #[test]
    fn strip_query_removes_query_and_fragment() {
        assert_eq!(
            strip_query("https://www.google.com/search?q=secret#top"),
            "https://www.google.com/search"
        );
        assert_eq!(strip_query("https://example.com/"), "https://example.com/");
    }

    #[test]
    fn strip_query_falls_back_for_invalid_urls() {
        assert_eq!(strip_query("not-a-url?q=1#x"), "not-a-url");
    }
}
