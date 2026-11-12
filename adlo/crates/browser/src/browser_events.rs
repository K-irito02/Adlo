use std::collections::HashMap;
use std::sync::LazyLock;
use std::sync::Mutex;
use std::time::{Duration, Instant};

fn normalize_url(raw: &str) -> String {
    let mut s = raw.split('#').next().unwrap_or(raw).to_string();
    if s.len() > 8 && s.ends_with('/') {
        let trimmed = s.trim_end_matches('/');
        if !trimmed.is_empty() {
            s = trimmed.to_string();
        }
    }
    s
}

pub(crate) struct LastEmit {
    pub(crate) url: String,
    pub(crate) time: Instant,
}

pub(crate) static LAST_EMIT: Mutex<Option<LastEmit>> = Mutex::new(None);
pub(crate) const EMIT_DEDUP_WINDOW: Duration = Duration::from_secs(4);

/// Per-tab last-seen history URL for HistoryChanged dedup.
///
/// Keyed by `tab_id` so back/forward events on one tab are never suppressed by
/// another tab's activity, and windowed by time so a legitimate back/forward
/// traversal to a previously-visited URL (which always repeats a URL) is not
/// mistaken for a duplicate event. A bare "same URL as last time" check would
/// drop the `url-changed` event on back/forward, desyncing the frontend tab
/// state from the actual WebView navigation.
pub(crate) static LAST_HISTORY_URL: LazyLock<Mutex<HashMap<String, (String, Instant)>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// HistoryChanged dedup window: only a repeated URL within this window is
/// treated as a duplicate (WebView2 can fire HistoryChanged more than once for
/// a single pushState navigation). Longer-lived revisits pass through. Kept
/// short (500ms) so a legitimate quick back/forward to a recently-visited URL
/// is not swallowed: WebView2's duplicate events for one navigation arrive in
/// milliseconds, far inside this window.
const HISTORY_DEDUP_MS: u64 = 500;

/// Returns `true` if the `url-changed` event for this tab/URL should be
/// emitted, `false` if it is a rapid duplicate within `HISTORY_DEDUP_MS`.
pub(crate) fn should_emit_history_changed(tab_id: &str, url: &str) -> bool {
    should_emit_history_changed_at(tab_id, url, Instant::now())
}

fn should_emit_history_changed_at(tab_id: &str, url: &str, now: Instant) -> bool {
    if let Ok(mut map) = LAST_HISTORY_URL.lock() {
        let key = tab_id.to_string();
        if let Some((last_url, last_time)) = map.get(&key) {
            if *last_url == url
                && (now.duration_since(*last_time).as_millis() as u64) < HISTORY_DEDUP_MS
            {
                return false;
            }
        }
        map.insert(key, (url.to_string(), now));
        true
    } else {
        true
    }
}

pub fn navigation_handler<F: Fn(&str)>(url: &url::Url, emit_url: &F) -> bool {
    if url.scheme() != "http" && url.scheme() != "https" && url.scheme() != "file" {
        tracing::debug!(
            scheme = url.scheme(),
            "navigation_handler: non-http(s) scheme, returning false"
        );
        return false;
    }
    let normalized = normalize_url(url.as_str());

    let should_emit = {
        if let Ok(guard) = LAST_EMIT.lock() {
            if let Some(last) = guard.as_ref() {
                let is_dup = last.url == normalized && last.time.elapsed() < EMIT_DEDUP_WINDOW;
                tracing::debug!(
                    normalized = %normalized,
                    last_url = %last.url,
                    elapsed_ms = last.time.elapsed().as_millis(),
                    is_dup,
                    "navigation_handler: dedup check"
                );
                !is_dup
            } else {
                tracing::debug!(normalized = %normalized, "navigation_handler: no previous emit, will emit");
                true
            }
        } else {
            tracing::warn!(normalized = %normalized, "navigation_handler: mutex poisoned, will emit");
            true
        }
    };

    if should_emit {
        if let Ok(mut guard) = LAST_EMIT.lock() {
            *guard = Some(LastEmit { url: normalized.clone(), time: Instant::now() });
        }
        tracing::debug!(normalized = %normalized, "navigation_handler: EMITTING url-changed event");
        emit_url(&normalized);
    } else {
        tracing::debug!(normalized = %normalized, "navigation_handler: SKIPPED emit (dedup)");
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn navigation_handler_allows_file_scheme_for_tauri_local_files() {
        let url = url::Url::parse("file:///D:/Desktop/a.html").expect("file url should parse");
        let allowed = navigation_handler(&url, &|_| {});
        assert!(allowed);
    }

    #[test]
    fn history_dedup_suppresses_rapid_same_url() {
        let t0 = Instant::now();
        assert!(should_emit_history_changed_at("tab-dedup-1", "https://a.com", t0));
        assert!(!should_emit_history_changed_at(
            "tab-dedup-1",
            "https://a.com",
            t0 + Duration::from_millis(300),
        ));
        // after the window expires, the same URL is a legitimate revisit (back/forward)
        assert!(should_emit_history_changed_at(
            "tab-dedup-1",
            "https://a.com",
            t0 + Duration::from_millis(600),
        ));
    }

    #[test]
    fn history_dedup_allows_back_to_previous_url_after_window() {
        let t0 = Instant::now();
        assert!(should_emit_history_changed_at("tab-back-1", "https://a.com", t0));
        assert!(should_emit_history_changed_at(
            "tab-back-1",
            "https://b.com",
            t0 + Duration::from_millis(100),
        ));
        // back to a previously-visited URL after the window must emit, not dedup
        assert!(should_emit_history_changed_at(
            "tab-back-1",
            "https://a.com",
            t0 + Duration::from_millis(600),
        ));
    }

    #[test]
    fn history_dedup_is_isolated_per_tab() {
        let t0 = Instant::now();
        assert!(should_emit_history_changed_at("tab-iso-1", "https://a.com", t0));
        // same URL on a different tab is independent
        assert!(should_emit_history_changed_at("tab-iso-2", "https://a.com", t0));
        // rapid repeat on the first tab is still suppressed
        assert!(!should_emit_history_changed_at(
            "tab-iso-1",
            "https://a.com",
            t0 + Duration::from_millis(50),
        ));
    }
}
